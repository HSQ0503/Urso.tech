import type { NextRequest } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings } from "@/lib/canes/data";
import { fillTemplate, sendCanesSms } from "@/lib/canes/twilio";
import { createOrganicLead, findLeadByPhone, verifyTwilioRequest } from "@/lib/canes/inbound";
import { toE164 } from "@/lib/canes/types";
import { escapeXml, xmlResponse } from "@/lib/twilio";

// Twilio Voice webhook: two-step state machine. Step one (no ?step) rings
// Sebastian's cell; when that dial finishes Twilio posts back with
// ?step=after and the outcome, where we log the call and, on a miss, text
// the caller back and fall to voicemail.
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
    if (req.nextUrl.searchParams.get("step") === "after") return await afterDial(params);
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
    // No callerId on the Dial: Sebastian sees the customer's real number and
    // can call back natively from his phone.
    return xmlResponse(
      `<Response><Dial timeout="20" action="/api/canes/twilio/voice?step=after" method="POST">${escapeXml(owner)}</Dial></Response>`,
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
