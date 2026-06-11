import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAfterHours,
  publicUrl,
  renderTextBack,
  sendSms,
  validateSignature,
  xmlResponse,
} from "@/lib/twilio";

// Step 2 of the missed-call flow. Twilio calls this once the bridged dial ends,
// with DialCallStatus telling us whether the store answered. We record the call
// (total + missed counters via record_call) and, on a miss, instantly text the
// caller a booking link. The TwiML we return is what the caller hears next.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return new Response("Twilio not configured", { status: 500 });

  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  if (!validateSignature(authToken, req.headers.get("x-twilio-signature"), publicUrl(req), params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const answered = params.DialCallStatus === "completed";
  const calledNumber = params.To; // backend Twilio number → also the SMS sender
  const caller = params.From; // the customer to text back
  const durationS = Number(params.DialCallDuration) || null;

  const supabase = createAdminClient();
  const { data: cfg } = await supabase
    .from("twilio_numbers")
    .select("store_id, booking_url, text_template, timezone, open_time, close_time, stores(name)")
    .eq("twilio_number", calledNumber)
    .maybeSingle();

  if (!cfg) return xmlResponse(`<Response><Hangup/></Response>`);

  const store = cfg as unknown as {
    store_id: string;
    booking_url: string;
    text_template: string | null;
    timezone: string;
    open_time: string | null;
    close_time: string | null;
    stores: { name: string } | { name: string }[] | null;
  };
  const storeName = (Array.isArray(store.stores) ? store.stores[0]?.name : store.stores?.name) ?? "";

  const occurredAt = new Date();
  const afterHours = isAfterHours(occurredAt, store.open_time, store.close_time, store.timezone);

  let textedBack = false;
  if (!answered && caller) {
    const sms = await sendSms({
      accountSid,
      authToken,
      from: calledNumber,
      to: caller,
      body: renderTextBack(store.text_template, storeName, store.booking_url),
    });
    textedBack = sms.ok;
  }

  await supabase.rpc("record_call", {
    p_store_id: store.store_id,
    p_occurred_at: occurredAt.toISOString(),
    p_timezone: store.timezone,
    p_answered: answered,
    p_after_hours: afterHours,
    p_duration_s: durationS,
    p_texted_back: textedBack,
  });

  if (answered) return xmlResponse(`<Response><Hangup/></Response>`);
  return xmlResponse(
    `<Response><Say voice="alice">Sorry we missed you. We've just texted you a link to book online. Goodbye.</Say><Hangup/></Response>`,
  );
}
