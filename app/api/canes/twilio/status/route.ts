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
      }
    }
  } catch (err) {
    console.error("[canes] status callback failed:", err);
  }

  return xmlResponse("<Response/>");
}
