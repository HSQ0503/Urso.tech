import { NextResponse } from "next/server";
import {
  handleSquarePaymentEvent,
  parseSquareEvent,
  squareWebhookUrl,
  verifySquareSignature,
} from "@/lib/canes/square";
import { getInvoice } from "@/lib/canes/invoices";
import { notifyInvoicePaid, notifyInvoiceReceipt } from "@/lib/canes/notify";

// Square webhook — the authoritative "an invoice got paid" signal. Verify-first,
// always-200 (so Square stops retrying a handled event), idempotent. Card data
// never arrives here; Square hosts the pay page (PCI SAQ-A). Mirrors the Twilio
// webhook's verify-then-answer shape.
//
// SECURITY: the signature is HMAC-SHA256 over (notificationUrl + RAW body) with
// the webhook Signature Key. We must read the raw bytes with req.text() BEFORE
// any JSON.parse — a re-serialized body breaks the HMAC. Fails closed: no key or
// a bad signature → 401, nothing written.
export const runtime = "nodejs";

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

    const outcome = await handleSquarePaymentEvent(event);

    // On a first confirmed, amount-matched card payment, fire the notifications
    // (best-effort). Duplicates/mismatches/ignored events don't notify.
    if (outcome.handled === "recorded" && outcome.invoiceId) {
      const invoice = await getInvoice(outcome.invoiceId);
      if (invoice) {
        await notifyInvoicePaid(invoice, "card");
        await notifyInvoiceReceipt(invoice, "card");
      }
    }
    console.log(`[canes] square webhook ${event.eventType}: ${outcome.handled}`);
  } catch (err) {
    // Never make Square retry on our own processing error — log + ack.
    console.error("[canes] square webhook processing failed:", err);
  }

  return NextResponse.json({ ok: true });
}
