import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getLead, getSettings } from "@/lib/canes/data";
import { canesVoiceNumber, fillTemplate, sendCanesSms } from "@/lib/canes/twilio";
import { createOrganicLead, findLeadByPhone, verifyTwilioRequest } from "@/lib/canes/inbound";
import { findCustomerByPhone } from "@/lib/canes/customers";
import { toE164 } from "@/lib/canes/types";
import { escapeXml, xmlResponse } from "@/lib/twilio";
import { pushNewLead } from "@/lib/canes/push-events";

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
  `<Record maxLength="120" playBeep="true" recordingStatusCallback="/api/canes/twilio/status?type=recording#rc=5&amp;rp=ct,rt,5xx" method="POST"/>` +
  `</Response>`;

type CallClaim = {
  state: "acquired" | "in_progress" | "completed" | "conflict";
  outcome?: { body?: string; status?: number } | null;
};

function callPayloadHash(step: string, params: Record<string, string>): string {
  const ordered = Object.fromEntries(Object.entries(params).sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256").update(JSON.stringify({ step, params: ordered })).digest("hex");
}

async function finishCallClaim(
  eventKey: string,
  payloadHash: string,
  outcome: { body?: string; status?: number },
  error?: string,
): Promise<void> {
  const { error: finishError } = await canesDb().rpc("finish_inbound_call", {
    p_event_key: eventKey,
    p_payload_hash: payloadHash,
    p_outcome: outcome,
    p_error: error ?? null,
  });
  if (finishError) throw new Error(`voice claim completion failed: ${finishError.message}`);
}

// Write one calls row, idempotent on inbound_dedupe_key.
//
// This used to be `.upsert(row, { onConflict: "inbound_dedupe_key", ignoreDuplicates })`
// and it FAILED ON EVERY INBOUND CALL from 2026-08-21 to 2026-09-13:
// calls_inbound_dedupe_key_uidx (0019) is a PARTIAL unique index
// (`where inbound_dedupe_key is not null`), and Postgres refuses to infer a
// partial index from a bare `ON CONFLICT (column)` — the same 42P10 that hit
// the payments ledger on the first live Square payment (995cdfe). Every
// ?step=after threw, Twilio retried five times, the caller heard an error
// instead of voicemail, no missed-call text went out, and no inbound call has
// been logged since July 21. The partial index still ENFORCES uniqueness, so a
// plain insert that treats 23505 as "already recorded" is the whole fix.
async function recordCall(
  row: {
    lead_id: string | null;
    peer_phone: string;
    direction: "in" | "out";
    status: string;
    duration_seconds?: number | null;
    twilio_sid: string | null;
    inbound_dedupe_key: string;
  },
  what: string,
): Promise<void> {
  const { error } = await canesDb().from("calls").insert(row);
  if (error && error.code !== "23505") throw new Error(`${what}: ${error.message}`);
}

async function runCallEffect(eventKey: string, effectKey: string, effect: () => Promise<void>): Promise<void> {
  const { data: claimed, error } = await canesDb().rpc("claim_inbound_call_effect", {
    p_event_key: eventKey,
    p_effect_key: effectKey,
  });
  if (error) throw new Error(`voice effect claim failed: ${error.message}`);
  if (claimed !== true) return;
  try {
    await effect();
    const { error: finishError } = await canesDb().rpc("finish_inbound_call_effect", {
      p_event_key: eventKey,
      p_effect_key: effectKey,
      p_error: null,
    });
    if (finishError) throw new Error(finishError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await canesDb().rpc("finish_inbound_call_effect", {
      p_event_key: eventKey,
      p_effect_key: effectKey,
      p_error: message,
    });
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!verifyTwilioRequest(req, params)) {
    console.warn("[canes] voice webhook rejected: bad signature");
    return new Response("Invalid signature", { status: 403 });
  }

  let activeClaim: { eventKey: string; payloadHash: string } | null = null;
  try {
    const step = req.nextUrl.searchParams.get("step") ?? "incoming";
    const callSid = params.CallSid?.trim();
    if (!callSid) return xmlResponse(VOICEMAIL_TWIML, 400);
    const eventKey = `${callSid}:${step}`;
    const payloadHash = callPayloadHash(step, params);
    const { data, error } = await canesDb().rpc("claim_inbound_call", {
      p_event_key: eventKey,
      p_payload_hash: payloadHash,
      p_lease_seconds: 600,
    });
    if (error) throw new Error(`voice claim failed: ${error.message}`);
    const claim = data as CallClaim | null;
    if (claim?.state === "in_progress") return xmlResponse(VOICEMAIL_TWIML, 503);
    if (claim?.state === "conflict") {
      console.error(`[canes] CallSid payload conflict for ${eventKey}`);
      return xmlResponse("<Response/>", 409);
    }
    if (claim?.state === "completed") {
      const body = claim.outcome?.body;
      if (typeof body !== "string") return xmlResponse("<Response/>");
      return new Response(body, {
        status: claim.outcome?.status ?? 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    if (claim?.state !== "acquired") throw new Error("voice claim returned no state");
    activeClaim = { eventKey, payloadHash };

    let response: Response;
    if (step === "whisper") response = await whisper(params);
    else if (step === "after") response = await afterDial(params, eventKey);
    else if (step === "callback") response = await ownerCallback(params, eventKey, req.nextUrl.searchParams.get("to"));
    else if (step === "callback-after") response = await afterOwnerCallback(params);
    else response = await firstRing(params, eventKey);
    const body = await response.clone().text();
    await finishCallClaim(eventKey, payloadHash, { body, status: response.status });
    activeClaim = null;
    return response;
  } catch (err) {
    console.error("[canes] voice webhook failed:", err);
    if (activeClaim) {
      try {
        await finishCallClaim(
          activeClaim.eventKey,
          activeClaim.payloadHash,
          {},
          err instanceof Error ? err.message : String(err),
        );
      } catch (finishError) {
        console.error("[canes] voice failure claim could not be released:", finishError);
      }
    }
    // 503 activates the configured Twilio retry policy. The voicemail TwiML is
    // included only as a provider-safe fallback; persistence failures are not
    // acknowledged as success.
    return xmlResponse(VOICEMAIL_TWIML, 503);
  }
}

async function firstRing(params: Record<string, string>, eventKey: string): Promise<Response> {
  console.log(`[canes] inbound call from ${params.From ?? "unknown"} (${params.CallSid ?? "no sid"})`);

  const owner = process.env.CANES_OWNER_PHONE;
  // Sebastian dialing his own business line. Forwarding it to himself is
  // useless (busy signal or his own voicemail); what he actually wants — every
  // time this has happened — is to reach whoever he just missed. Offer that.
  if (owner && params.From && toE164(params.From) && toE164(params.From) === toE164(owner)) {
    return ownerMenu();
  }
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
      ? `<Number url="/api/canes/twilio/voice?step=whisper#rc=5&amp;rp=ct,rt,5xx" method="POST">${escapeXml(owner)}</Number>`
      : escapeXml(owner);
    const answerOnBridge = settings.call_whisper_enabled ? ` answerOnBridge="true"` : "";
    return xmlResponse(
      `<Response>${greeting}<Dial timeout="20"${answerOnBridge} action="/api/canes/twilio/voice?step=after#rc=5&amp;rp=ct,rt,5xx" method="POST">${dialTarget}</Dial></Response>`,
    );
  }

  // Nowhere to forward: take a message. Insert the call row now so the
  // recording status callback has a row to attach the voicemail URL to.
  if (canesConfigured() && params.From) {
    const phone = toE164(params.From) ?? params.From;
    const { lead, created } = await missedCallLead(phone, params.CallSid);
    await recordCall({
      lead_id: lead?.id ?? null,
      peer_phone: phone,
      direction: "in",
      status: "no-answer",
      twilio_sid: params.CallSid ?? null,
      inbound_dedupe_key: `${eventKey}:call`,
    }, "inbound call insert failed");
    if (lead && !created) {
      await pushNewLead(lead, "missed_call", params.CallSid);
    }
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

async function afterDial(params: Record<string, string>, eventKey: string): Promise<Response> {
  const answered = params.DialCallStatus === "completed";
  const phone = params.From ? (toE164(params.From) ?? params.From) : "";
  const configured = canesConfigured();
  let lead = configured && phone ? await findLeadByPhone(phone) : null;

  if (answered) {
    if (configured && phone) {
      await recordCall({
        lead_id: lead?.id ?? null,
        peer_phone: phone,
        direction: "in",
        status: "completed",
        duration_seconds: Number(params.DialCallDuration) || null,
        twilio_sid: params.CallSid ?? null,
        inbound_dedupe_key: `${eventKey}:call`,
      }, "answered call insert failed");
    }
    return xmlResponse("<Response/>");
  }

  // Missed: log it, make sure an unknown caller becomes a cold lead exactly
  // like an organic text would, and text the caller back right away.
  if (configured && phone) {
    let created = false;
    if (!lead) {
      const resolved = await missedCallLead(phone, params.CallSid);
      lead = resolved.lead;
      created = resolved.created;
    }
    await recordCall({
      lead_id: lead?.id ?? null,
      peer_phone: phone,
      direction: "in",
      status: "no-answer",
      duration_seconds: Number(params.DialCallDuration) || null,
      twilio_sid: params.CallSid ?? null,
      inbound_dedupe_key: `${eventKey}:call`,
    }, "missed call insert failed");
    if (lead && !created) {
      await pushNewLead(lead, "missed_call", params.CallSid);
    }
    if (!lead?.opted_out) {
      const settings = await getSettings();
      await runCallEffect(eventKey, "missed-call-text", async () => {
        const sent = await sendCanesSms({
          to: phone,
          body: fillTemplate(settings.templates.missed_call, { name: lead?.name }),
          leadId: lead?.id ?? null,
          automated: true,
          force: true,
        });
        if (!sent.ok) throw new Error(sent.error ?? sent.skipped ?? "missed-call text failed");
      });
    }
  }
  return xmlResponse(VOICEMAIL_TWIML);
}

// ── Owner calling the business line ──────────────────────────────────────────
//
// Read the most recent call with anyone, say who it was, and offer to connect
// from the business number with one key press. The callee is chosen by the
// SERVER from the call log; nothing the caller sends picks a number, so a
// spoofed owner caller ID could at most ring the last customer as Canes.
// Reads and the TwiML are all that happen before the key press; the calls row
// is written only when Sebastian presses 1.

const NO_RECENT_CALLS = `<Response><Say voice="alice">Canes line. There is no recent call to return. Goodbye.</Say></Response>`;

async function ownerMenu(): Promise<Response> {
  if (!canesConfigured()) return xmlResponse(NO_RECENT_CALLS);
  const { data: last, error } = await canesDb()
    .from("calls")
    .select("peer_phone, lead_id, direction, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`owner menu lookup failed: ${error.message}`);
  const to = last ? toE164(last.peer_phone) : null;
  if (!last || !to) return xmlResponse(NO_RECENT_CALLS);

  const name = await peerName(to, last.lead_id);
  const what = last.direction === "in"
    ? (last.status === "completed" ? "Your last call was from" : "You missed a call from")
    : "You last called";
  const action = `/api/canes/twilio/voice?step=callback&amp;to=${encodeURIComponent(to)}#rc=5&amp;rp=ct,rt,5xx`;
  return xmlResponse(
    `<Response>` +
    `<Gather numDigits="1" timeout="8" action="${action}" method="POST">` +
    `<Say voice="alice">Canes line. ${escapeXml(what)} ${escapeXml(name ?? "")}${name ? ", " : ""}${spokenPhone(to)}. ` +
    `Press 1 to call them back from the business number.</Say>` +
    `</Gather>` +
    `<Say voice="alice">Okay. Goodbye.</Say>` +
    `</Response>`,
  );
}

async function ownerCallback(params: Record<string, string>, eventKey: string, rawTo: string | null): Promise<Response> {
  const to = rawTo ? toE164(rawTo) : null;
  if (params.Digits !== "1" || !to) {
    return xmlResponse(`<Response><Say voice="alice">Okay. Goodbye.</Say></Response>`);
  }
  const businessNumber = canesVoiceNumber();
  const lead = canesConfigured() ? await findLeadByPhone(to) : null;
  if (canesConfigured()) {
    // The same shape bridgeCall writes, keyed on THIS inbound call's SID so the
    // <Dial> action below can settle it. The Call Logs then show it as an
    // outbound call, which is what it is.
    await recordCall({
      lead_id: lead?.id ?? null,
      peer_phone: to,
      direction: "out",
      status: "initiated",
      twilio_sid: params.CallSid ?? null,
      inbound_dedupe_key: `${eventKey}:call`,
    }, "owner callback insert failed");
  }
  const name = await peerName(to, lead?.id ?? null);
  const callerId = businessNumber ? ` callerId="${escapeXml(businessNumber)}"` : "";
  return xmlResponse(
    `<Response>` +
    `<Say voice="alice">Connecting you to ${escapeXml(name ?? spokenPhone(to))}.</Say>` +
    `<Dial${callerId} timeout="30" action="/api/canes/twilio/voice?step=callback-after#rc=5&amp;rp=ct,rt,5xx" method="POST">${escapeXml(to)}</Dial>` +
    `</Response>`,
  );
}

async function afterOwnerCallback(params: Record<string, string>): Promise<Response> {
  const status = params.DialCallStatus;
  if (canesConfigured() && params.CallSid && status) {
    const duration = Number.parseInt(params.DialCallDuration ?? "", 10);
    const { error } = await canesDb()
      .from("calls")
      .update({ status, ...(Number.isFinite(duration) ? { duration_seconds: duration } : {}) })
      .eq("twilio_sid", params.CallSid)
      .eq("direction", "out")
      .eq("status", "initiated");
    if (error) throw new Error(`owner callback outcome write failed: ${error.message}`);
  }
  return xmlResponse("<Response/>");
}

async function peerName(phone: string, leadId: string | null): Promise<string | null> {
  try {
    const contact = await findCustomerByPhone(phone);
    if (contact?.name?.trim()) return contact.name.trim();
    const lead = leadId ? await getLead(leadId) : await findLeadByPhone(phone);
    return lead?.name?.trim() || null;
  } catch (err) {
    console.error("[canes] owner menu name lookup failed:", err);
    return null;
  }
}

// "+15614013522" → "5 6 1, 4 0 1, 3 5 2 2" so the voice reads it as a phone
// number rather than five billion.
function spokenPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return ten.split("").join(" ");
  return [ten.slice(0, 3), ten.slice(3, 6), ten.slice(6)].map((part) => part.split("").join(" ")).join(", ");
}

async function missedCallLead(
  phone: string,
  callSid: string | undefined,
): Promise<{ lead: Awaited<ReturnType<typeof findLeadByPhone>>; created: boolean }> {
  const existing = await findLeadByPhone(phone);
  if (existing) return { lead: existing, created: false };
  const created = await createOrganicLead(phone, {
    via: "call",
    eventId: callSid,
    throwOnError: true,
  });
  if (created) return { lead: created, created: true };
  // A different simultaneous call from the same new number may have won the
  // phone uniqueness race. Reuse that lead instead of dropping this call.
  return { lead: await findLeadByPhone(phone), created: false };
}
