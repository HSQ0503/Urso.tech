import { NextResponse } from "next/server";
import {
  handleSquarePaymentEvent,
  parseSquareEvent,
  squareWebhookUrl,
  verifySquareSignature,
} from "@/lib/canes/square";
import { drainPaymentEmailTasks } from "@/lib/canes/payment-notifications";

// Square webhook — the authoritative "an invoice got paid" signal. Verify-first,
// idempotent, and non-2xx on transient processing failures so Square retries.
// Card data
// never arrives here; Square hosts the pay page (PCI SAQ-A). Mirrors the Twilio
// webhook's verify-then-answer shape.
//
// SECURITY: the signature is HMAC-SHA256 over (notificationUrl + RAW body) with
// the webhook Signature Key. We must read the raw bytes with req.text() BEFORE
// any JSON.parse — a re-serialized body breaks the HMAC. Fails closed: no key or
// a bad signature → 401, nothing written.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text(); // exact signed bytes — never parse-then-restringify
  const signature = req.headers.get("x-square-hmacsha256-signature");

  if (!verifySquareSignature(signature, squareWebhookUrl(), rawBody)) {
    console.warn("[canes] square webhook rejected: bad signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  try {
    const event = parseSquareEvent(payload);
    if (!event) return NextResponse.json({ ok: true, skipped: "unparseable" });

    const outcome = await handleSquarePaymentEvent(event, payload);
    if (outcome.handled === "retryable_error") {
      return NextResponse.json({ ok: false, retry: true }, { status: 503 });
    }

    // The reconciler inserts email effects before acknowledging the event.
    // Try them immediately for prompt receipts; cron owns provider retries.
    try {
      await drainPaymentEmailTasks({ limit: 10 });
    } catch (error) {
      // Reconciliation already committed the durable email tasks. A provider
      // backlog must not make Square retry a completed money event; cron owns
      // the independent delivery retry.
      console.error("[canes] payment email outbox drain failed:", error);
    }
    console.log(`[canes] square webhook ${event.eventType}: ${outcome.handled}`);
  } catch (err) {
    // A verified event that failed internally must be retried. The event log
    // distinguishes processed duplicates from unfinished deliveries and the
    // payments ledger has its own uniqueness backstop.
    console.error("[canes] square webhook processing failed:", err);
    return NextResponse.json({ ok: false, retry: true }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
