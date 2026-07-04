import type { NextRequest } from "next/server";
import { processInboundSms, verifyTwilioRequest } from "@/lib/canes/inbound";
import { xmlResponse } from "@/lib/twilio";

// Twilio SMS webhook for the Canes business number. All routing logic lives in
// processInboundSms; this route just parses, verifies, and always answers 200
// with empty TwiML so Twilio never retries or reads an error to the sender.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!verifyTwilioRequest(req, params)) {
    console.warn("[canes] sms webhook rejected: bad signature");
    return new Response("Invalid signature", { status: 403 });
  }

  const mediaUrls: string[] = [];
  const numMedia = Number(params.NumMedia) || 0;
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }

  try {
    const outcome = await processInboundSms({
      from: params.From ?? "",
      body: params.Body ?? "",
      messageSid: params.MessageSid,
      mediaUrls,
    });
    console.log(`[canes] inbound sms from ${params.From}: ${outcome.handled}`);
  } catch (err) {
    console.error("[canes] inbound sms pipeline failed:", err);
  }

  return xmlResponse("<Response/>");
}
