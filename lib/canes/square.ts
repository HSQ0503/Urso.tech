import { createHmac, timingSafeEqual } from "node:crypto";
import { squareConfigured, canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getInvoiceBySquareId, getInvoiceItems } from "@/lib/canes/invoices";
import { fmtMoney } from "@/lib/canes/types";
import type { Estimate, Invoice, InvoiceItem } from "@/lib/canes/types";

// Square deposit links — stubbed until Square is connected. approveEstimate
// calls this to offer a deposit checkout; while Square is not configured it
// returns { url: null, skipped } and the UI just omits the button. Deposits at
// approval time are a later phase than the completion-invoice pipeline below.
export async function createDepositLink(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  estimate: Estimate,
): Promise<{ url: string | null; skipped?: string }> {
  if (!squareConfigured()) return { url: null, skipped: "Square not connected yet" };
  return { url: null, skipped: "Square deposit links not implemented yet" };
}

// Square payments — the card side of the money pipeline. Built as a real-but-
// flagged stub: squareConfigured() gates the live API so the whole invoice +
// webhook + ledger pipeline is correct today and goes live the moment the four
// CANES_SQUARE_* env vars are set. NO card data ever touches this file or our
// DB — Square hosts the payment page (PCI SAQ-A). We store only Square ids,
// amounts in cents, and the hosted URL.
//
// Security invariants enforced here:
//   • webhook signature verified (HMAC-SHA256 over notificationUrl + raw body)
//     with a constant-time compare — the same idiom as lib/twilio.ts
//   • webhook processing is idempotent: dedupe on event_id AND square_payment_id
//   • a payment only settles an invoice when its amount + currency match our
//     server-computed total; a mismatch is recorded but flagged, never auto-paid
//   • status flips are TOCTOU-safe (conditional claim on the prior status)

const SQUARE_ENV = process.env.CANES_SQUARE_ENV ?? "production";
const SQUARE_API_BASE =
  SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
// Pin the API version Square evaluates the request against.
const SQUARE_VERSION = "2025-01-23";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws").replace(/\/$/, "");

export function squareEnvLabel(): string {
  return SQUARE_ENV;
}

// ── Webhook signature verification ───────────────────────────────────────────
// Square signs each webhook: base64(HMAC-SHA256(signatureKey, notificationURL +
// rawRequestBody)) delivered in the `x-square-hmacsha256-signature` header. The
// HMAC is over the RAW body bytes — the route must pass req.text(), never a
// re-serialized JSON string. Fails closed: no key set in production → reject.
// https://developer.squareup.com/docs/webhooks/step3validate
export function verifySquareSignature(
  signatureHeader: string | null,
  notificationUrl: string,
  rawBody: string,
): boolean {
  const key = process.env.CANES_SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signatureHeader) return false;
  const expected = createHmac("sha256", key)
    .update(notificationUrl + rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The exact externally visible URL Square signed against. Must match the
// notification URL registered on the webhook subscription byte-for-byte.
export function squareWebhookUrl(): string {
  return `${APP_URL}/api/canes/square/webhook`;
}

// ── Normalized event shape ───────────────────────────────────────────────────
// Square nests the interesting fields under data.object.{invoice|payment}. We
// flatten to just what the reconciler needs so the DB logic never reaches into
// Square's payload shape directly. `parseSquareEvent` is the one place that
// knows Square's field paths (finalized against current docs by research).

export type NormalizedPaymentEvent = {
  eventId: string;
  eventType: string;
  squareInvoiceId: string | null;
  squarePaymentId: string | null;
  amountCents: number | null; // amount actually paid, in cents
  currency: string | null;
  paid: boolean; // true when this event represents a completed payment
};

// Square invoice-paid events carry the invoice under data.object.invoice with a
// payment_requests[].total_completed_money; payment events carry data.object.
// payment with amount_money + status COMPLETED. We read whichever is present.
export function parseSquareEvent(payload: Record<string, unknown>): NormalizedPaymentEvent | null {
  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (!eventId) return null;

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const object = (data.object ?? {}) as Record<string, unknown>;

  // Payment-shaped event (payment.updated / payment.created).
  const payment = object.payment as Record<string, unknown> | undefined;
  if (payment) {
    const money = (payment.amount_money ?? {}) as Record<string, unknown>;
    const status = typeof payment.status === "string" ? payment.status : "";
    return {
      eventId,
      eventType,
      squareInvoiceId: typeof payment.invoice_id === "string" ? payment.invoice_id : null,
      squarePaymentId: typeof payment.id === "string" ? payment.id : null,
      amountCents: typeof money.amount === "number" ? money.amount : null,
      currency: typeof money.currency === "string" ? money.currency : null,
      paid: status === "COMPLETED" || status === "CAPTURED",
    };
  }

  // Invoice-shaped event (invoice.payment_made / invoice.updated).
  const invoice = object.invoice as Record<string, unknown> | undefined;
  if (invoice) {
    const status = typeof invoice.status === "string" ? invoice.status : "";
    const requests = Array.isArray(invoice.payment_requests)
      ? (invoice.payment_requests as Array<Record<string, unknown>>)
      : [];
    let completed = 0;
    let currency: string | null = null;
    for (const r of requests) {
      const m = (r.total_completed_money ?? {}) as Record<string, unknown>;
      if (typeof m.amount === "number") completed += m.amount;
      if (typeof m.currency === "string") currency = m.currency;
    }
    return {
      eventId,
      eventType,
      squareInvoiceId: typeof invoice.id === "string" ? invoice.id : null,
      squarePaymentId: null,
      amountCents: completed || null,
      currency,
      // Require real completed money — a bare status:"PAID" with no
      // total_completed_money must NOT be treated as a payment (it would settle
      // with a fabricated amount and bypass amount verification).
      paid: status === "PAID" && completed > 0,
    };
  }

  return { eventId, eventType, squareInvoiceId: null, squarePaymentId: null, amountCents: null, currency: null, paid: false };
}

// ── Create + publish a Square invoice ────────────────────────────────────────
// Returns the hosted pay URL + Square ids, or a skip when Square isn't wired up
// yet. The caller (sendInvoice) stores these and falls back to our own branded
// public page. Idempotency key = our invoice id, so a retried send never
// double-creates on Square's side.

export type SquareInvoiceResult = {
  hostedUrl: string | null;
  squareInvoiceId: string | null;
  squareOrderId: string | null;
  skipped?: string;
  error?: string;
};

export async function createSquareInvoice(
  invoice: Invoice,
  items?: InvoiceItem[],
): Promise<SquareInvoiceResult> {
  if (!squareConfigured()) {
    return { hostedUrl: null, squareInvoiceId: null, squareOrderId: null, skipped: "Square not connected yet" };
  }
  const accessToken = process.env.CANES_SQUARE_ACCESS_TOKEN as string;
  const locationId = process.env.CANES_SQUARE_LOCATION_ID as string;
  const lineItems = items ?? (await getInvoiceItems(invoice.id));

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };

  try {
    // 0. Customer profile — Square requires primary_recipient.customer_id (a
    // real customer id, not a bare email) before an invoice can be published.
    const [firstName, ...restName] = (invoice.customer_name ?? "").trim().split(/\s+/);
    const custRes = await fetch(`${SQUARE_API_BASE}/v2/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotency_key: `customer:${invoice.id}`,
        given_name: firstName || "Customer",
        family_name: restName.join(" ") || undefined,
        email_address: invoice.customer_email ?? undefined,
        phone_number: invoice.customer_phone ?? undefined,
        reference_id: invoice.contact_id ?? invoice.lead_id ?? undefined,
      }),
    });
    const custJson = (await custRes.json()) as Record<string, unknown>;
    if (!custRes.ok) {
      return { hostedUrl: null, squareInvoiceId: null, squareOrderId: null, error: squareErr(custJson, custRes.status) };
    }
    const customerId = ((custJson.customer ?? {}) as Record<string, unknown>).id as string | undefined;

    // 1. Order with the billed line items. Square Money = amount in cents.
    const orderRes = await fetch(`${SQUARE_API_BASE}/v2/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotency_key: `order:${invoice.id}`,
        order: {
          location_id: locationId,
          customer_id: customerId,
          reference_id: invoice.number.slice(0, 40), // reconciliation echo (max 40 chars)
          metadata: { db_invoice_id: invoice.id },
          line_items:
            lineItems.length > 0
              ? lineItems.map((it) => ({
                  name: it.name,
                  quantity: String(it.quantity || 1),
                  base_price_money: {
                    amount: Math.round(it.unit_price_cents),
                    currency: "USD",
                  },
                }))
              : [
                  {
                    name: invoice.job_name ?? "Pressure washing service",
                    quantity: "1",
                    base_price_money: { amount: Math.round(invoice.total_cents), currency: "USD" },
                  },
                ],
        },
      }),
    });
    const orderJson = (await orderRes.json()) as Record<string, unknown>;
    if (!orderRes.ok) {
      return { hostedUrl: null, squareInvoiceId: null, squareOrderId: null, error: squareErr(orderJson, orderRes.status) };
    }
    const order = (orderJson.order ?? {}) as Record<string, unknown>;
    const orderId = order.id as string | undefined;
    if (!orderId) {
      return { hostedUrl: null, squareInvoiceId: null, squareOrderId: null, error: "Square order missing id" };
    }

    // 2. Draft invoice on the order — card payment on receipt, due today (Square
    // requires a today-or-future due date), delivered by us (SHARE_MANUALLY).
    const dueDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const draftRes = await fetch(`${SQUARE_API_BASE}/v2/invoices`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotency_key: `invoice:${invoice.id}`,
        invoice: {
          location_id: locationId,
          order_id: orderId,
          invoice_number: invoice.number,
          delivery_method: "SHARE_MANUALLY", // we deliver the link via our own SMS/email
          accepted_payment_methods: { card: true },
          payment_requests: [
            {
              request_type: "BALANCE",
              due_date: dueDate,
              tipping_enabled: false,
              automatic_payment_source: "NONE",
            },
          ],
          ...(customerId ? { primary_recipient: { customer_id: customerId } } : {}),
        },
      }),
    });
    const draftJson = (await draftRes.json()) as Record<string, unknown>;
    if (!draftRes.ok) {
      return { hostedUrl: null, squareInvoiceId: null, squareOrderId: orderId, error: squareErr(draftJson, draftRes.status) };
    }
    const draft = (draftJson.invoice ?? {}) as Record<string, unknown>;
    const squareInvoiceId = draft.id as string | undefined;
    const version = draft.version as number | undefined;
    if (!squareInvoiceId) {
      return { hostedUrl: null, squareInvoiceId: null, squareOrderId: orderId, error: "Square invoice missing id" };
    }

    // 3. Publish so the customer gets the PCI-compliant hosted pay page.
    const pubRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ idempotency_key: `publish:${invoice.id}`, version: version ?? 0 }),
    });
    const pubJson = (await pubRes.json()) as Record<string, unknown>;
    if (!pubRes.ok) {
      return { hostedUrl: null, squareInvoiceId, squareOrderId: orderId, error: squareErr(pubJson, pubRes.status) };
    }
    const published = (pubJson.invoice ?? {}) as Record<string, unknown>;
    const hostedUrl = typeof published.public_url === "string" ? published.public_url : null;

    return { hostedUrl, squareInvoiceId, squareOrderId: orderId };
  } catch (err) {
    return {
      hostedUrl: null,
      squareInvoiceId: null,
      squareOrderId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function squareErr(json: Record<string, unknown>, status: number): string {
  const errors = json.errors as Array<{ detail?: string }> | undefined;
  return errors?.[0]?.detail ?? `Square responded ${status}`;
}

// ── Webhook reconciliation — record the payment, settle the invoice ──────────
// Called by the webhook route AFTER the signature is verified. Idempotent and
// TOCTOU-safe. Never throws into the route.

export type ReconcileOutcome = {
  handled: "duplicate" | "unmatched" | "amount_mismatch" | "recorded" | "ignored" | "unconfigured";
  invoiceId?: string;
};

export async function handleSquarePaymentEvent(
  event: NormalizedPaymentEvent,
): Promise<ReconcileOutcome> {
  if (!canesConfigured()) return { handled: "unconfigured" };
  const db = canesDb();
  const { alertOwner } = await import("@/lib/canes/twilio");

  // Dedupe the whole event first (Square delivers at-least-once).
  const { data: seen } = await db
    .from("square_webhook_events")
    .upsert(
      { event_id: event.eventId, event_type: event.eventType, processed: false, payload: {} },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("event_id");
  if (!seen || seen.length === 0) return { handled: "duplicate" };

  // ONLY the authoritative invoice event settles money. A single hosted-invoice
  // card payment fires BOTH payment.updated AND invoice.payment_made; if we
  // processed both we'd insert two ledger rows and double amount_paid. So
  // payment.* (and everything else) is corroborating noise — dedupe + ignore.
  const settling = event.eventType === "invoice.payment_made" || event.eventType === "invoice.updated";
  if (!settling || !event.paid || !event.squareInvoiceId) {
    await markEventProcessed(event.eventId);
    return { handled: "ignored" };
  }

  const invoice = await getInvoiceBySquareId(event.squareInvoiceId);
  if (!invoice) {
    await markEventProcessed(event.eventId);
    return { handled: "unmatched" };
  }

  // Amount + currency verification BEFORE any money is recorded. A non-positive
  // amount or a non-USD currency never touches the ledger — flag and stop. We
  // never fabricate the amount from our own total.
  const amount = event.amountCents ?? 0;
  const currencyOk = !event.currency || event.currency === "USD";
  if (amount <= 0 || !currencyOk) {
    await markEventProcessed(event.eventId);
    await alertOwner(
      `⚠️ Card payment event on ${invoice.number} had ${amount <= 0 ? "no amount" : `currency ${event.currency}`}. Review before treating it as paid.`,
    );
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }

  const alreadyPaid = invoice.status === "paid";

  // Idempotent ledger insert (partial-unique on square_payment_id). Key on the
  // real Square payment id when present, else the unique event id — so two
  // DISTINCT payments never collapse and a redelivery never duplicates.
  const paymentId = event.squarePaymentId ?? `evt:${event.eventId}`;
  const { data: inserted, error: insErr } = await db
    .from("payments")
    .upsert(
      {
        invoice_id: invoice.id,
        job_id: invoice.job_id,
        amount_cents: amount, // the REAL paid amount — never the fabricated total
        currency: event.currency ?? "USD",
        method: "card",
        source: "square_webhook",
        status: "completed",
        square_payment_id: paymentId,
        external_event_id: event.eventId,
        recorded_by: "square",
      },
      { onConflict: "square_payment_id", ignoreDuplicates: true },
    )
    .select("id");
  if (insErr) {
    console.error(`[canes] square payment insert failed for invoice ${invoice.id}: ${insErr.message}`);
    return { handled: "unmatched", invoiceId: invoice.id };
  }
  if (!inserted || inserted.length === 0) {
    await markEventProcessed(event.eventId);
    return { handled: "duplicate", invoiceId: invoice.id };
  }

  // recomputeInvoicePaid re-reads the ledger and settles ONLY when the summed
  // completed payments reach the total (TOCTOU-safe). A partial stays open.
  await recomputeInvoicePaid(invoice.id);
  await markEventProcessed(event.eventId);

  if (alreadyPaid) {
    // Cash (or another card payment) already settled this — this is an overpay.
    await alertOwner(
      `⚠️ Card payment ${fmtMoney(amount)} arrived on ${invoice.number}, already marked paid. Possible double payment — a refund may be needed.`,
    );
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }
  if (amount < invoice.total_cents) {
    // Recorded as a partial; recompute left it unsettled.
    await alertOwner(
      `Partial card payment ${fmtMoney(amount)} on ${invoice.number} (total ${fmtMoney(invoice.total_cents)}).`,
    );
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }
  return { handled: "recorded", invoiceId: invoice.id };
}

// Cancel a published Square invoice so its hosted pay link can no longer take a
// (duplicate) card payment after we've collected cash. Best-effort, gated. The
// hook is wired now; the live cancel runs once Square is connected.
export async function cancelSquareInvoice(squareInvoiceId: string): Promise<void> {
  if (!squareConfigured()) return;
  const accessToken = process.env.CANES_SQUARE_ACCESS_TOKEN as string;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
  try {
    const getRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}`, { headers });
    const getJson = (await getRes.json()) as Record<string, unknown>;
    const version = ((getJson.invoice ?? {}) as Record<string, unknown>).version;
    if (!getRes.ok || typeof version !== "number") return;
    await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version }),
    });
  } catch (err) {
    console.error(`[canes] square invoice cancel failed for ${squareInvoiceId}:`, err);
  }
}

async function markEventProcessed(eventId: string): Promise<void> {
  await canesDb().from("square_webhook_events").update({ processed: true }).eq("event_id", eventId);
}

// Recompute an invoice's paid cache from the ledger, and settle it (invoice +
// job → paid) TOCTOU-safely when fully covered. Shared by cash + card paths.
export async function recomputeInvoicePaid(invoiceId: string): Promise<void> {
  const db = canesDb();
  const { data: rows } = await db
    .from("payments")
    .select("amount_cents, status")
    .eq("invoice_id", invoiceId);
  const paid = (rows ?? [])
    .filter((r) => (r as { status: string }).status === "completed")
    .reduce((sum, r) => sum + Number((r as { amount_cents: number }).amount_cents), 0);

  const { data: inv } = await db
    .from("invoices")
    .select("id, total_cents, status, job_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return;
  const invoice = inv as { id: string; total_cents: number; status: string; job_id: string | null };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { amount_paid_cents: paid, updated_at: now };
  const fullyPaid = paid >= invoice.total_cents && invoice.total_cents > 0;

  if (fullyPaid && invoice.status !== "paid" && invoice.status !== "void") {
    // Claim the settle: only a non-paid, non-void invoice flips to paid.
    const { data: claimed } = await db
      .from("invoices")
      .update({ ...patch, status: "paid", paid_at: now })
      .eq("id", invoiceId)
      .in("status", ["draft", "sent", "viewed"])
      .select("id");
    if (claimed && claimed.length > 0 && invoice.job_id) {
      await db.from("jobs").update({ status: "paid" }).eq("id", invoice.job_id).neq("status", "canceled");
    }
    return;
  }
  // Not fully paid (or already settled): just refresh the paid cache.
  await db.from("invoices").update(patch).eq("id", invoiceId);
}
