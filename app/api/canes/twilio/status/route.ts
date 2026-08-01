import type { NextRequest } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { verifyTwilioRequest } from "@/lib/canes/inbound";
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
        // A bridged outbound call finishing. Only calls that ASKED for a status
        // callback arrive here (bridgeCall does; the inbound <Dial> does not,
        // and writes its own row from ?step=after), so this cannot overwrite an
        // inbound call's outcome.
        //
        // Twilio's CallStatus vocabulary — completed / busy / no-answer /
        // failed / canceled — is already the vocabulary the calls.status column
        // documents, so it is stored verbatim rather than remapped. The inbox
        // treats anything other than "completed" on an outbound row as an
        // unanswered call, which is exactly right.
        const duration = Number.parseInt(params.CallDuration ?? "", 10);
        await db
          .from("calls")
          .update({
            status: params.CallStatus,
            // Absent on every event but the last one; never write a null over a
            // duration Twilio already reported.
            ...(Number.isFinite(duration) ? { duration_seconds: duration } : {}),
          })
          .eq("twilio_sid", params.CallSid);
      }
    }
  } catch (err) {
    console.error("[canes] status callback failed:", err);
  }

  return xmlResponse("<Response/>");
}
