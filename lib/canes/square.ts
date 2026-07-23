import { createHmac, timingSafeEqual } from "node:crypto";
import { squareConfigured, canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getInvoiceByJob, getInvoiceBySquareId, getInvoiceItems, getInvoicePayments } from "@/lib/canes/invoices";
import { fmtMoney, invoiceBalanceCents } from "@/lib/canes/types";
import type { Estimate, Invoice, InvoiceItem } from "@/lib/canes/types";

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

// ── Deposit Payment Links — the booking deposit at estimate approval ──────────
// A one-off Checkout **Payment Link** (quick-pay: fixed amount, Square-hosted
// PCI page, NO Invoices Plus subscription needed) for the job the approval just
// minted. The link + its order id + its link id land on the job row BEFORE the
// URL is handed out — the webhook reconciles the payment by
// payment.order_id → jobs.deposit_order_id, so an unstored link could take
// money we can't match. Idempotent twice over: Square dedupes on
// `deposit:<jobId>` and we re-serve a stored link instead of minting another.

export type DepositLinkResult = { url: string | null; skipped?: string; error?: string };

export async function createDepositLink(
  estimate: Estimate,
  jobId: string | null,
): Promise<DepositLinkResult> {
  if (!squareConfigured() || !canesConfigured()) {
    return { url: null, skipped: "Square not connected yet" };
  }
  if (!jobId) return { url: null, skipped: "No job to take a deposit for" };

  const db = canesDb();
  const { data: jobRow } = await db
    .from("jobs")
    .select("id, job_name, deposit_cents, deposit_order_id, deposit_link_url, deposit_paid_at")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobRow as {
    id: string;
    job_name: string | null;
    deposit_cents: number;
    deposit_order_id: string | null;
    deposit_link_url: string | null;
    deposit_paid_at: string | null;
  } | null;
  if (!job) return { url: null, skipped: "Job not found" };
  if (job.deposit_paid_at) return { url: null, skipped: "Deposit already paid" };
  if (job.deposit_link_url) return { url: job.deposit_link_url };
  const amount = Math.round(job.deposit_cents);
  if (amount <= 0) return { url: null, skipped: "No deposit on this estimate" };

  const headers = {
    Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
  try {
    const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotency_key: `deposit:${job.id}`,
        quick_pay: {
          name: `Deposit — ${(job.job_name ?? estimate.job_name ?? "Pressure washing").slice(0, 200)}`,
          price_money: { amount, currency: "USD" },
          location_id: process.env.CANES_SQUARE_LOCATION_ID as string,
        },
        checkout_options: {
          // Back to the approved estimate page, which reads ?deposit=paid as
          // the optimistic thank-you (the webhook stamp lands seconds later).
          redirect_url: `${APP_URL}/CanesPressure/e/${estimate.public_token}?deposit=paid`,
          ask_for_shipping_address: false,
        },
        // Prefill the hosted page so the customer just enters a card.
        pre_populated_data: {
          ...(estimate.customer_email ? { buyer_email: estimate.customer_email } : {}),
          ...(estimate.customer_phone ? { buyer_phone_number: estimate.customer_phone } : {}),
        },
        payment_note: `Deposit for ${estimate.number}`,
      }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { url: null, error: squareErr(json, res.status) };
    const link = (json.payment_link ?? {}) as Record<string, unknown>;
    const url = typeof link.url === "string" ? link.url : null;
    const orderId = typeof link.order_id === "string" ? link.order_id : null;
    const linkId = typeof link.id === "string" ? link.id : null;
    if (!url || !orderId) return { url: null, error: "Square payment link missing url/order id" };

    // Store before handing out; the null-guard keeps a racing approve from
    // overwriting (Square's idempotency returns the same link to both anyway).
    const { error: saveErr } = await db
      .from("jobs")
      .update({ deposit_order_id: orderId, deposit_link_id: linkId, deposit_link_url: url })
      .eq("id", job.id)
      .is("deposit_order_id", null);
    if (saveErr) {
      console.error(`[canes] deposit link save failed for job ${job.id}: ${saveErr.message}`);
      return { url: null, error: saveErr.message };
    }
    return { url };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// Delete a paid quick-pay link so the same URL can never charge twice (Square
// keeps payment links chargeable after a payment). Best-effort — a failure
// only means the double-payment alert is the backstop. Exported so a deposit
// recorded manually (cash in hand) can kill its outstanding online link too.
export async function deleteDepositLink(linkId: string): Promise<void> {
  if (!squareConfigured()) return;
  try {
    const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links/${linkId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
        "Square-Version": SQUARE_VERSION,
      },
    });
    if (!res.ok) {
      console.error(`[canes] deposit link delete rejected for ${linkId}: ${res.status}`);
    }
  } catch (err) {
    console.error(`[canes] deposit link delete failed for ${linkId}:`, err);
  }
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
  squareOrderId: string | null; // deposit reconciliation key (Payment Links carry no invoice id)
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
      squareOrderId: typeof payment.order_id === "string" ? payment.order_id : null,
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
      // Square's live webhooks deliver `total_completed_amount_money` (verified
      // against a real invoice.payment_made payload 2026-07-18); some docs show
      // `total_completed_money`. Read both — first present name wins.
      const m = (r.total_completed_amount_money ??
        r.total_completed_money ??
        {}) as Record<string, unknown>;
      if (typeof m.amount === "number") completed += m.amount;
      if (typeof m.currency === "string") currency = m.currency;
    }
    return {
      eventId,
      eventType,
      squareInvoiceId: typeof invoice.id === "string" ? invoice.id : null,
      squarePaymentId: null,
      squareOrderId: null,
      amountCents: completed || null,
      currency,
      // Require real completed money — a bare status:"PAID" with no
      // total_completed_money must NOT be treated as a payment (it would settle
      // with a fabricated amount and bypass amount verification).
      paid: status === "PAID" && completed > 0,
    };
  }

  return { eventId, eventType, squareInvoiceId: null, squarePaymentId: null, squareOrderId: null, amountCents: null, currency: null, paid: false };
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
    // The order must collect EXACTLY the balance due — total_cents already
    // carries adjustments and approved review rewards, and amount_paid_cents
    // carries the booking deposit (0013). Line items alone know none of that,
    // so the difference becomes an order-scope discount (a shortfall — shows
    // as "Deposit received" on the hosted page) or an extra "Adjustment" line
    // (an excess). The hosted invoice can never re-charge the deposit or bill
    // around a reward.
    const targetCents = invoiceBalanceCents(invoice);
    const squareLineSum =
      lineItems.length > 0
        ? lineItems.reduce(
            (sum, it) => sum + Math.round(Math.round(it.unit_price_cents) * (it.quantity || 1)),
            0,
          )
        : targetCents;
    const creditCents = Math.max(0, squareLineSum - targetCents);
    const surchargeCents = Math.max(0, targetCents - squareLineSum);
    let creditLabel = "Payments & credits";
    if (creditCents > 0) {
      const completed = (await getInvoicePayments(invoice.id)).filter((p) => p.status === "completed");
      if (completed.some((p) => p.kind === "deposit")) creditLabel = "Deposit received";
    }
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
          line_items: [
            ...(lineItems.length > 0
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
                    base_price_money: { amount: targetCents, currency: "USD" },
                  },
                ]),
            ...(surchargeCents > 0
              ? [
                  {
                    name: "Adjustment",
                    quantity: "1",
                    base_price_money: { amount: surchargeCents, currency: "USD" },
                  },
                ]
              : []),
          ],
          ...(creditCents > 0
            ? {
                discounts: [
                  {
                    uid: "balance-credit",
                    name: creditLabel,
                    amount_money: { amount: creditCents, currency: "USD" },
                    scope: "ORDER",
                  },
                ],
              }
            : {}),
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
  // Set when the event settled a booking DEPOSIT (0013) instead of an invoice.
  depositJobId?: string;
  amountCents?: number;
};

export async function handleSquarePaymentEvent(
  event: NormalizedPaymentEvent,
  rawPayload?: Record<string, unknown>,
): Promise<ReconcileOutcome> {
  if (!canesConfigured()) return { handled: "unconfigured" };
  const db = canesDb();
  const { alertOwner } = await import("@/lib/canes/twilio");

  // Dedupe the whole event first (Square delivers at-least-once). Store the
  // REAL payload — an empty {} here made the 2026-07-18 field-name bug
  // undebuggable from the database.
  const { data: seen } = await db
    .from("square_webhook_events")
    .upsert(
      { event_id: event.eventId, event_type: event.eventType, processed: false, payload: rawPayload ?? {} },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("event_id");
  if (!seen || seen.length === 0) return { handled: "duplicate" };

  // Deposit path (0013): a Payment Link (quick-pay) payment NEVER fires
  // invoice.* events — its only signal is payment.created/updated carrying the
  // link's order id. Runs before the invoice gate below. Matching is strict:
  // payment.order_id → jobs.deposit_order_id (stored when the link was
  // minted). An invoice-page card payment can't land here because its
  // payment.* echo carries an invoice_id; a POS sale matches no job and falls
  // through to "ignored" like before.
  if (event.squarePaymentId && event.squareOrderId && !event.squareInvoiceId && event.paid) {
    const deposit = await recordDepositPayment(event);
    if (deposit) return deposit;
  }

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

  // Idempotent ledger insert. Key on the real Square payment id when present,
  // else the unique event id — two DISTINCT payments never collapse and a
  // redelivery never duplicates. NOTE: this must be check-then-insert, NOT an
  // upsert — the unique index on square_payment_id is PARTIAL (where not null)
  // and Postgres refuses a bare-column ON CONFLICT against a partial index
  // (42P10; found via the first live settle, 2026-07-18). The event-level
  // dedupe above already serializes deliveries; the index stays as the hard
  // backstop — a raced duplicate fails the insert and lands in insErr.
  const paymentId = event.squarePaymentId ?? `evt:${event.eventId}`;
  const { data: existingPayment } = await db
    .from("payments")
    .select("id")
    .eq("square_payment_id", paymentId)
    .maybeSingle();
  if (existingPayment) {
    await markEventProcessed(event.eventId);
    return { handled: "duplicate", invoiceId: invoice.id };
  }
  const { error: insErr } = await db.from("payments").insert({
    invoice_id: invoice.id,
    job_id: invoice.job_id,
    amount_cents: amount, // the REAL paid amount — never the fabricated total
    currency: event.currency ?? "USD",
    method: "card",
    source: "square_webhook",
    status: "completed",
    kind: "balance",
    square_payment_id: paymentId,
    external_event_id: event.eventId,
    recorded_by: "square",
  });
  if (insErr) {
    // Left unprocessed on purpose — the event stays retryable.
    console.error(`[canes] square payment insert failed for invoice ${invoice.id}: ${insErr.message}`);
    return { handled: "unmatched", invoiceId: invoice.id };
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
  // Compare against the balance that was DUE, not the face total — a
  // deposit-credited invoice (0013) legitimately collects total minus deposit,
  // and flagging that as partial would false-alarm every deposit job.
  if (amount < invoiceBalanceCents(invoice)) {
    // Recorded as a partial; recompute left it unsettled.
    await alertOwner(
      `Partial card payment ${fmtMoney(amount)} on ${invoice.number} (balance was ${fmtMoney(invoiceBalanceCents(invoice))}, total ${fmtMoney(invoice.total_cents)}).`,
    );
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }
  return { handled: "recorded", invoiceId: invoice.id };
}

// ── Deposit reconciliation — record the booking deposit, mark the job ─────────
// Mirrors the invoice path's invariants: idempotent on the Square payment id,
// records the REAL paid amount, verifies currency, alerts on any anomaly
// instead of guessing. Returns null when the order matches no job — the caller
// falls through and the event is ignored (e.g. a POS sale).
async function recordDepositPayment(event: NormalizedPaymentEvent): Promise<ReconcileOutcome | null> {
  const db = canesDb();
  const { data: jobRow } = await db
    .from("jobs")
    .select("id, lead_id, job_name, customer_name, deposit_cents, deposit_link_id, deposit_paid_at")
    .eq("deposit_order_id", event.squareOrderId as string)
    .maybeSingle();
  if (!jobRow) return null;
  const job = jobRow as {
    id: string;
    lead_id: string | null;
    job_name: string | null;
    customer_name: string | null;
    deposit_cents: number;
    deposit_link_id: string | null;
    deposit_paid_at: string | null;
  };
  const { alertOwner } = await import("@/lib/canes/twilio");
  const label = job.customer_name ?? job.job_name ?? "a job";

  // Amount + currency verification BEFORE any money is recorded — same rule as
  // invoices: a non-positive amount or non-USD currency never touches the
  // ledger.
  const amount = event.amountCents ?? 0;
  const currencyOk = !event.currency || event.currency === "USD";
  if (amount <= 0 || !currencyOk) {
    await markEventProcessed(event.eventId);
    await alertOwner(
      `⚠️ Deposit payment event for ${label} had ${amount <= 0 ? "no amount" : `currency ${event.currency}`}. Review in Square before treating it as paid.`,
    );
    return { handled: "amount_mismatch", depositJobId: job.id };
  }

  // Idempotent ledger insert — same check-then-insert as the invoice path (the
  // partial unique index on square_payment_id refuses ON CONFLICT inference).
  const paymentId = event.squarePaymentId as string;
  const { data: existingPayment } = await db
    .from("payments")
    .select("id")
    .eq("square_payment_id", paymentId)
    .maybeSingle();
  if (existingPayment) {
    await markEventProcessed(event.eventId);
    return { handled: "duplicate", depositJobId: job.id };
  }

  // Attach to the job's live invoice when one already exists (a deposit paid
  // after completion) so the bill's paid cache credits it immediately.
  const invoice = await getInvoiceByJob(job.id);
  const { error: insErr } = await db.from("payments").insert({
    invoice_id: invoice?.id ?? null,
    job_id: job.id,
    amount_cents: amount,
    currency: event.currency ?? "USD",
    method: "card",
    source: "square_webhook",
    status: "completed",
    kind: "deposit",
    square_payment_id: paymentId,
    square_order_id: event.squareOrderId,
    external_event_id: event.eventId,
    recorded_by: "square",
  });
  if (insErr) {
    // Left unprocessed on purpose — the event stays retryable.
    console.error(`[canes] deposit payment insert failed for job ${job.id}: ${insErr.message}`);
    return { handled: "unmatched", depositJobId: job.id };
  }

  const secondPayment = Boolean(job.deposit_paid_at);
  if (!secondPayment) {
    await db
      .from("jobs")
      .update({ deposit_paid_at: new Date().toISOString() })
      .eq("id", job.id)
      .is("deposit_paid_at", null);
  }
  if (invoice) await recomputeInvoicePaid(invoice.id);
  await markEventProcessed(event.eventId);

  // A paid quick-pay link stays chargeable — delete it so the same URL can't
  // take a second payment. Best-effort; the second-payment alert below is the
  // backstop.
  if (job.deposit_link_id) await deleteDepositLink(job.deposit_link_id);

  if (secondPayment) {
    await alertOwner(
      `⚠️ A second deposit payment of ${fmtMoney(amount)} arrived for ${label}. Likely a double charge — refund it from Square.`,
    );
    return { handled: "amount_mismatch", depositJobId: job.id, amountCents: amount };
  }
  if (amount !== Math.round(job.deposit_cents)) {
    await alertOwner(
      `⚠️ Deposit of ${fmtMoney(amount)} for ${label} doesn't match the ${fmtMoney(job.deposit_cents)} requested. Review in Square.`,
    );
    return { handled: "amount_mismatch", depositJobId: job.id, amountCents: amount };
  }
  await alertOwner(`💰 Deposit ${fmtMoney(amount)} received from ${label}. The job is ready to schedule.`);
  if (job.lead_id) {
    await db
      .from("events")
      .insert({ lead_id: job.lead_id, kind: "invoice", detail: `Deposit ${fmtMoney(amount)} paid (card)` });
  }
  return { handled: "recorded", depositJobId: job.id, amountCents: amount };
}

// Cancel a published Square invoice so its hosted pay link can no longer take a
// (duplicate) card payment after we've collected cash. Best-effort, gated.
// Returns true ONLY when Square confirmed the invoice is canceled (or already
// was) — callers that want to sever their link to this id (clearing
// square_invoice_id would break webhook matching for any in-flight payment)
// must require a true here. A false means the link may still be live: keep the
// ids so a late payment still matches and raises the double-payment alert.
export async function cancelSquareInvoice(squareInvoiceId: string): Promise<boolean> {
  if (!squareConfigured()) return false;
  const accessToken = process.env.CANES_SQUARE_ACCESS_TOKEN as string;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
  try {
    const getRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}`, { headers });
    const getJson = (await getRes.json()) as Record<string, unknown>;
    const sqInvoice = (getJson.invoice ?? {}) as Record<string, unknown>;
    if (!getRes.ok) return false;
    if (sqInvoice.status === "CANCELED") return true; // already dead — safe
    const version = sqInvoice.version;
    if (typeof version !== "number") return false;
    const cancelRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version }),
    });
    if (!cancelRes.ok) {
      console.error(
        `[canes] square invoice cancel rejected for ${squareInvoiceId}: ${cancelRes.status} ${await cancelRes.text().catch(() => "")}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[canes] square invoice cancel failed for ${squareInvoiceId}:`, err);
    return false;
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

  // Overpayment flag: the ledger holds more than the bill (e.g. a card payment
  // made from a stale link after a review-reward discount lowered the total).
  // The money IS recorded — this is the human signal that a refund is owed.
  // Dynamic import mirrors handleSquarePaymentEvent (avoids a static cycle).
  if (paid > invoice.total_cents && invoice.total_cents > 0) {
    const { alertOwner } = await import("@/lib/canes/twilio");
    await alertOwner(
      `⚠️ Overpaid: ${fmtMoney(paid)} collected on an invoice billed at ${fmtMoney(invoice.total_cents)}. A refund of ${fmtMoney(paid - invoice.total_cents)} may be owed.`,
    );
  }

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
