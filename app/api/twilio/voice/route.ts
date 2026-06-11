import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeXml, publicUrl, validateSignature, xmlResponse } from "@/lib/twilio";

// Step 1 of the missed-call flow. The store's published number forwards every
// inbound call to its backend Twilio number, whose Voice webhook points here.
// We bridge the call to the store's real line with a timeout; when that dial
// finishes, Twilio calls /voice/status with the outcome (answered vs missed).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return new Response("Twilio not configured", { status: 500 });

  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!validateSignature(authToken, req.headers.get("x-twilio-signature"), publicUrl(req), params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const calledNumber = params.To; // the backend Twilio number that was dialed
  const supabase = createAdminClient();
  const { data: cfg } = await supabase
    .from("twilio_numbers")
    .select("forward_to, ring_timeout, active")
    .eq("twilio_number", calledNumber)
    .maybeSingle();

  // Unknown / paused number: take a message rather than dropping the caller.
  if (!cfg || !cfg.active || !cfg.forward_to) {
    return xmlResponse(
      `<Response><Say voice="alice">Thank you for calling Woof Gang Bakery. Please leave a message after the tone.</Say><Record maxLength="120"/></Response>`,
    );
  }

  const action = new URL("/api/twilio/voice/status", publicUrl(req)).toString();
  return xmlResponse(
    `<Response><Dial timeout="${cfg.ring_timeout}" action="${escapeXml(action)}" method="POST" answerOnBridge="true"><Number>${escapeXml(cfg.forward_to)}</Number></Dial></Response>`,
  );
}
