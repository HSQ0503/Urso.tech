import type { NextRequest } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { verifyTwilioRequest } from "@/lib/canes/inbound";
import { canesVoiceNumber } from "@/lib/canes/twilio";
import { toE164 } from "@/lib/canes/types";
import { escapeXml, xmlResponse } from "@/lib/twilio";

// Second leg of click-to-call (see bridgeCall in app/CanesPressure/actions.ts):
// Twilio rings Sebastian first, then fetches this TwiML to dial the lead with
// the business number as caller ID. Twilio may fetch with GET or POST.
//
// ?step=after is the <Dial> action: Twilio posts the CUSTOMER leg's outcome
// (DialCallStatus / DialCallDuration) the moment that leg ends. That is the
// figure the Call Logs should show — "You called · 43s" is the conversation,
// not the 75s the owner leg was open including the customer's ringing — and it
// is what lets the status callback tell "the customer didn't answer" apart
// from "Sebastian never picked up his own phone" (the row is still
// `initiated` in the second case because this TwiML never ran).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUSTOMER_LEG_STATUSES = new Set(["completed", "no-answer", "busy", "failed", "canceled"]);

function bridge(req: NextRequest): Response {
  const to = toE164(req.nextUrl.searchParams.get("to") ?? "");
  if (!to) return new Response("Invalid `to` number", { status: 400 });
  const from = canesVoiceNumber();
  const callerId = from ? ` callerId="${escapeXml(from)}"` : "";
  return xmlResponse(
    `<Response><Dial${callerId} action="/api/canes/twilio/bridge?step=after#rc=5&amp;rp=ct,rt,5xx" method="POST">${escapeXml(to)}</Dial></Response>`,
  );
}

async function afterCustomerLeg(req: NextRequest): Promise<Response> {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!verifyTwilioRequest(req, params)) {
    console.warn("[canes] bridge action rejected: bad signature");
    return new Response("Invalid signature", { status: 403 });
  }
  const status = params.DialCallStatus;
  if (canesConfigured() && params.CallSid && status && CUSTOMER_LEG_STATUSES.has(status)) {
    const duration = Number.parseInt(params.DialCallDuration ?? "", 10);
    // Only the row this bridge created, and only while it is still open. The
    // parent's status callback arrives after this and skips terminal rows, so
    // whichever posts first wins and the later one cannot overwrite it.
    const { error } = await canesDb()
      .from("calls")
      .update({ status, ...(Number.isFinite(duration) ? { duration_seconds: duration } : {}) })
      .eq("twilio_sid", params.CallSid)
      .eq("direction", "out")
      .eq("status", "initiated");
    if (error) console.error(`[canes] bridge outcome write failed for ${params.CallSid}:`, error.message);
  }
  // Nothing more to say to Sebastian's leg; the customer has hung up or never
  // answered. An empty response ends the call.
  return xmlResponse("<Response/>");
}

export async function GET(req: NextRequest) {
  return bridge(req);
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("step") === "after") return afterCustomerLeg(req);
  return bridge(req);
}
