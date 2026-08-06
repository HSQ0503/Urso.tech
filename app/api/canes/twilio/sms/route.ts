import type { NextRequest } from "next/server";
import { processInboundSms, verifyTwilioRequest } from "@/lib/canes/inbound";
import { xmlResponse } from "@/lib/twilio";

// Twilio SMS webhook for the Canes business number. All routing logic lives in
// processInboundSms. Retryable failures intentionally return 503; the Twilio
// webhook URL includes a 5xx retry override so a transient database outage
// cannot silently lose a customer text.
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
    if (outcome.handled === "in_progress") {
      return xmlResponse("<Response/>", 503);
    }
    if (outcome.handled === "conflict") {
      console.error(`[canes] MessageSid payload conflict for ${params.MessageSid ?? "unknown"}`);
      // A conflict is terminal: retrying the same provider id with a different
      // payload can never be made safe. Ack without running either payload.
      return xmlResponse("<Response/>");
    }
  } catch (err) {
    console.error("[canes] inbound sms pipeline failed:", err);
    return xmlResponse("<Response/>", 503);
  }

  return xmlResponse("<Response/>");
}
