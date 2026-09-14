import type { NextRequest } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { findLeadByPhone, verifyTwilioRequest } from "@/lib/canes/inbound";
import { getLead } from "@/lib/canes/data";
import { findCustomerByPhone } from "@/lib/canes/customers";
import { pushMissedCallback } from "@/lib/canes/push-events";
import { CALL_OWNER_MISSED_STATUS, toE164 } from "@/lib/canes/types";
import { xmlResponse } from "@/lib/twilio";

// Twilio status callbacks. ?type=recording attaches a voicemail recording to
// its call row; everything else is an SMS delivery-status update. Always 200
// so Twilio does not retry forever over rows we simply do not have.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!verifyTwilioRequest(req, params)) {
    console.warn("[canes] status callback rejected: bad signature");
    return new Response("Invalid signature", { status: 403 });
  }

  try {
    if (canesConfigured()) {
      const db = canesDb();
      if (req.nextUrl.searchParams.get("type") === "recording") {
        if (params.CallSid && params.RecordingUrl) {
          await db
            .from("calls")
            .update({ recording_url: params.RecordingUrl })
            .eq("twilio_sid", params.CallSid);
          console.log(`[canes] recording attached to call ${params.CallSid}`);
        }
      } else if (params.MessageSid && params.MessageStatus) {
        await db
          .from("messages")
          .update({ delivery_status: params.MessageStatus })
          .eq("twilio_sid", params.MessageSid);
      } else if (params.CallSid && params.CallStatus) {
        await settleOwnerLeg(params.CallSid, params.CallStatus, params.CallDuration);
      }
    }
  } catch (err) {
    console.error("[canes] status callback failed:", err);
  }

  return xmlResponse("<Response/>");
}

// The bridged click-to-call's OWNER leg finishing. Only calls that asked for a
// status callback arrive here (bridgeCall does; the inbound <Dial> does not, and
// writes its own row from ?step=after), so this cannot touch an inbound call.
//
// By the time this fires, the bridge's own <Dial> action has normally already
// written the customer leg's outcome and the row is terminal — nothing to do.
// A row STILL `initiated` means the bridge TwiML never ran: Sebastian did not
// answer his own phone (no-answer / busy / canceled), or the leg connected and
// died before dialing (completed with ~0s, failed). That is the case he could
// not read from his iPhone — it showed a missed call from his own business
// number, and redialing it forwarded to himself. So it gets its own status
// value for the Call Logs, and a push that names who the callback was for and
// opens their record.
async function settleOwnerLeg(callSid: string, callStatus: string, callDuration: string | undefined): Promise<void> {
  const db = canesDb();
  const { data: row, error } = await db
    .from("calls")
    .select("id, lead_id, peer_phone, status")
    .eq("twilio_sid", callSid)
    .eq("direction", "out")
    .maybeSingle();
  if (error) throw new Error(`owner leg lookup failed: ${error.message}`);
  if (!row || row.status !== "initiated") return;

  const duration = Number.parseInt(callDuration ?? "", 10);
  const connected = callStatus === "completed" && Number.isFinite(duration) && duration > 1;
  const status = connected
    ? "completed" // answered, but the bridge action never posted — record what Twilio said
    : callStatus === "failed" || callStatus === "completed"
      ? "failed"
      : CALL_OWNER_MISSED_STATUS;
  const { data: claimed, error: writeError } = await db
    .from("calls")
    .update({ status, ...(Number.isFinite(duration) ? { duration_seconds: duration } : {}) })
    .eq("id", row.id)
    .eq("status", "initiated")
    .select("id");
  if (writeError) throw new Error(`owner leg write failed: ${writeError.message}`);
  // Lost the race to the bridge action — it knows more than we do.
  if (!claimed || claimed.length === 0 || connected) return;

  const phone = toE164(row.peer_phone) ?? row.peer_phone;
  const lead = row.lead_id ? await getLead(row.lead_id) : await findLeadByPhone(phone);
  const contact = lead?.name ? null : await findCustomerByPhone(phone);
  await pushMissedCallback({
    callSid,
    leadId: lead?.id ?? row.lead_id ?? null,
    peerPhone: phone,
    name: lead?.name ?? contact?.name ?? null,
    reason: status === "failed" ? "failed" : "owner_missed",
  });
}
