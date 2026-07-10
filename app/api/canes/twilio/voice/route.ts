import type { NextRequest } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings } from "@/lib/canes/data";
import { fillTemplate, sendCanesSms } from "@/lib/canes/twilio";
import { createOrganicLead, findLeadByPhone, verifyTwilioRequest } from "@/lib/canes/inbound";
import { findCustomerByPhone } from "@/lib/canes/customers";
import { toE164 } from "@/lib/canes/types";
import { escapeXml, xmlResponse } from "@/lib/twilio";

// Twilio Voice webhook: a small state machine keyed on ?step. Step one (no
// ?step) optionally greets the caller and rings Sebastian's cell. The owner
// leg gets a whisper (?step=whisper) that announces who is calling (new vs
// existing customer, by name) before the caller is bridged, so Sebastian knows
// what he is answering. If he does not answer, the outer <Dial> posts back to
// ?step=after as a miss (voicemail + text-back + cold lead).
export const runtime = "nodejs";

const VOICEMAIL_TWIML =
  `<Response>` +
  `<Say voice="alice">Hi, you have reached Canes Pressure Washing. Sorry we missed you. ` +
  `Please leave your name and address after the tone and we will call you back shortly.</Say>` +
  `<Record maxLength="120" playBeep="true" recordingStatusCallback="/api/canes/twilio/status?type=recording" method="POST"/>` +
  `</Response>`;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!verifyTwilioRequest(req, params)) {
    console.warn("[canes] voice webhook rejected: bad signature");
    return new Response("Invalid signature", { status: 403 });
  }

  try {
    const step = req.nextUrl.searchParams.get("step");
    if (step === "whisper") return await whisper(params);
    if (step === "after") return await afterDial(params);
    return await firstRing(params);
  } catch (err) {
    // Never leave a caller hanging on an application error.
    console.error("[canes] voice webhook failed:", err);
    return xmlResponse(VOICEMAIL_TWIML);
  }
}

async function firstRing(params: Record<string, string>): Promise<Response> {
  console.log(`[canes] inbound call from ${params.From ?? "unknown"} (${params.CallSid ?? "no sid"})`);

  const owner = process.env.CANES_OWNER_PHONE;
  if (owner) {
    const settings = await getSettings();
    // Optional caller greeting, played to the caller before the phone rings.
    const greeting =
      settings.call_greeting_enabled && settings.call_greeting_text
        ? `<Say voice="alice">${escapeXml(settings.call_greeting_text)}</Say>`
        : "";
    // With the whisper on, dial the owner as a <Number url=...> so the "who is
    // calling" announcement plays only to Sebastian's leg, and answerOnBridge
    // keeps the caller on ringback (not silence) until the bridge. With it off,
    // this is a plain <Dial>{owner}</Dial> — byte-identical to the original when
    // the greeting is off too. No callerId either way: Sebastian sees the
    // customer's real number and can call back natively.
    const dialTarget = settings.call_whisper_enabled
      ? `<Number url="/api/canes/twilio/voice?step=whisper" method="POST">${escapeXml(owner)}</Number>`
      : escapeXml(owner);
    const answerOnBridge = settings.call_whisper_enabled ? ` answerOnBridge="true"` : "";
    return xmlResponse(
      `<Response>${greeting}<Dial timeout="20"${answerOnBridge} action="/api/canes/twilio/voice?step=after" method="POST">${dialTarget}</Dial></Response>`,
    );
  }

  // Nowhere to forward: take a message. Insert the call row now so the
  // recording status callback has a row to attach the voicemail URL to.
  if (canesConfigured() && params.From) {
    const phone = toE164(params.From) ?? params.From;
    const lead = await findLeadByPhone(phone);
    await canesDb().from("calls").insert({
      lead_id: lead?.id ?? null,
      peer_phone: phone,
      direction: "in",
      status: "no-answer",
      twilio_sid: params.CallSid ?? null,
    });
  }
  return xmlResponse(VOICEMAIL_TWIML);
}

// Whisper played only to Sebastian's leg once he answers, before the caller is
// bridged: it announces who is calling, then the leg completes and Twilio
// bridges the caller automatically. (A press-to-accept / decline-to-voicemail
// gate is intentionally NOT used here: a rejected whisper still reports
// DialCallStatus="completed" to the outer <Dial>, so the caller would be
// dropped instead of sent to voicemail. That needs the enqueue-based screen
// pattern plus a live two-phone test; tracked as a follow-up.)
async function whisper(params: Record<string, string>): Promise<Response> {
  const line = await whisperText(params.From);
  return xmlResponse(`<Response><Say voice="alice">${escapeXml(line)}</Say></Response>`);
}

// Build the "who is calling" line from the caller's number. A blocked/unknown
// caller ID (toE164 returns null) or a DB error both degrade to a safe generic
// line so the whisper never leaves Sebastian hanging.
async function whisperText(from: string | undefined): Promise<string> {
  const e164 = from ? toE164(from) : null;
  if (!e164) return "New Canes call, caller ID hidden.";
  try {
    const contact = await findCustomerByPhone(e164);
    if (contact?.name) return `Canes customer, ${firstName(contact.name)}, calling.`;
    const lead = await findLeadByPhone(e164);
    if (lead?.name) return `Canes lead, ${firstName(lead.name)}, calling.`;
    return "New Canes lead calling.";
  } catch (err) {
    console.error("[canes] whisper lookup failed:", err);
    return "New Canes call.";
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

async function afterDial(params: Record<string, string>): Promise<Response> {
  const answered = params.DialCallStatus === "completed";
  const phone = params.From ? (toE164(params.From) ?? params.From) : "";
  const configured = canesConfigured();
  let lead = configured && phone ? await findLeadByPhone(phone) : null;

  if (answered) {
    if (configured && phone) {
      await canesDb().from("calls").insert({
        lead_id: lead?.id ?? null,
        peer_phone: phone,
        direction: "in",
        status: "completed",
        duration_seconds: Number(params.DialCallDuration) || null,
        twilio_sid: params.CallSid ?? null,
      });
    }
    return xmlResponse("<Response/>");
  }

  // Missed: log it, make sure an unknown caller becomes a cold lead exactly
  // like an organic text would, and text the caller back right away.
  if (configured && phone) {
    if (!lead) lead = await createOrganicLead(phone, { via: "call" });
    await canesDb().from("calls").insert({
      lead_id: lead?.id ?? null,
      peer_phone: phone,
      direction: "in",
      status: "no-answer",
      duration_seconds: Number(params.DialCallDuration) || null,
      twilio_sid: params.CallSid ?? null,
    });
    if (!lead?.opted_out) {
      const settings = await getSettings();
      await sendCanesSms({
        to: phone,
        body: fillTemplate(settings.templates.missed_call, { name: lead?.name }),
        leadId: lead?.id ?? null,
        automated: true,
        force: true,
      });
    }
  }
  return xmlResponse(VOICEMAIL_TWIML);
}
