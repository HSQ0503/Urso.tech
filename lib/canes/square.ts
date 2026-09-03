import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { squareConfigured, squarePaymentsReady, canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getInvoice, getInvoiceBySquareId, getInvoiceItems, getInvoicePayments } from "@/lib/canes/invoices";
import { pushDepositReceived, pushInvoicePaid, pushPaymentIssue } from "@/lib/canes/push-events";
import {
  enqueueDepositPaymentEmail,
  enqueueInvoicePaymentEmails,
} from "@/lib/canes/payment-notifications";
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
const SQUARE_VERSION = "2026-07-15";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws").replace(/\/$/, "");
const POSTGRES_INT_MAX = 2_147_483_647;

function validPaymentCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= POSTGRES_INT_MAX;
}

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
  if (!squarePaymentsReady() || !canesConfigured()) {
    return {
      url: null,
      error: "Square payments are not ready. Configure the API credentials, webhook signature key, and canonical HTTPS app URL before collecting money.",
    };
  }
  if (!jobId) return { url: null, skipped: "No job to take a deposit for" };

  const db = canesDb();
  const { data: jobRow, error: jobError } = await db
    .from("jobs")
    .select("id, status, job_name, deposit_cents, deposit_collected_cents, deposit_order_id, deposit_link_url, deposit_link_retired_at, deposit_paid_at, deposit_link_operation_id, deposit_link_operation_started_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return { url: null, error: jobError.message };
  const job = jobRow as {
    id: string;
    status: string;
    job_name: string | null;
    deposit_cents: number;
    deposit_collected_cents: number;
    deposit_order_id: string | null;
    deposit_link_url: string | null;
    deposit_link_retired_at: string | null;
    deposit_paid_at: string | null;
    deposit_link_operation_id: string | null;
    deposit_link_operation_started_at: string | null;
  } | null;
  if (!job) return { url: null, skipped: "Job not found" };
  if (["completed", "invoiced", "paid", "canceled"].includes(job.status)) {
    return { url: null, skipped: `Job is ${job.status}` };
  }
  if (job.deposit_paid_at || job.deposit_collected_cents > 0) {
    return { url: null, skipped: "Deposit already paid" };
  }
  if (job.deposit_link_url) return { url: job.deposit_link_url };
  const amount = Math.round(job.deposit_cents);
  if (amount <= 0) return { url: null, skipped: "No deposit on this estimate" };

  // A stale operation is an ambiguous Square request, not permission to mint a
  // fresh idempotency key. Reuse its key until we either reconcile the link or
  // confirm that the remote resource was deleted.
  const operationId = job.deposit_link_operation_id ?? randomUUID();
  const { data: operationClaimed, error: operationError } = await db.rpc(
    "claim_job_deposit_link_operation",
    { p_job_id: job.id, p_operation_id: operationId },
  );
  if (operationError) return { url: null, error: operationError.message };
  if (operationClaimed !== true) {
    const { data: current, error: currentError } = await db
      .from("jobs")
      .select("deposit_link_url, deposit_paid_at, deposit_collected_cents")
      .eq("id", job.id)
      .maybeSingle();
    if (currentError) return { url: null, error: currentError.message };
    const latest = current as {
      deposit_link_url: string | null;
      deposit_paid_at: string | null;
      deposit_collected_cents: number;
    } | null;
    if (latest?.deposit_link_url) return { url: latest.deposit_link_url };
    if (latest?.deposit_paid_at || (latest?.deposit_collected_cents ?? 0) > 0) {
      return { url: null, skipped: "Deposit already paid" };
    }
    return { url: null, skipped: "Deposit link is already being prepared" };
  }

  const headers = {
    Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
  let saved = false;
  let safeToRotate = false;
  try {
    const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotency_key: `deposit:${job.id}:${operationId}`,
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
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      safeToRotate = true;
      return { url: null, error: squareErr(json, res.status) };
    }
    const link = (json.payment_link ?? {}) as Record<string, unknown>;
    const url = typeof link.url === "string" ? link.url : null;
    const orderId = typeof link.order_id === "string" ? link.order_id : null;
    const linkId = typeof link.id === "string" ? link.id : null;
    if (!url || !orderId || !linkId) {
      safeToRotate = linkId ? await deleteDepositLink(linkId) : false;
      return { url: null, error: "Square payment link missing id, url, or order id" };
    }

    // Store before handing out; the null-guard keeps a racing approve from
    // overwriting (Square's idempotency returns the same link to both anyway).
    const { data: savedRows, error: saveErr } = await db
      .from("jobs")
      .update({
        deposit_order_id: orderId,
        deposit_link_id: linkId,
        deposit_link_url: url,
        deposit_link_retired_at: null,
        deposit_link_operation_id: null,
        deposit_link_operation_started_at: null,
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .eq("deposit_link_operation_id", operationId)
      .is("deposit_paid_at", null)
      .eq("deposit_collected_cents", 0)
      .is("deposit_order_id", null)
      .select("id");
    if (saveErr || !savedRows?.length) {
      const { data: current } = await db
        .from("jobs")
        .select("deposit_order_id, deposit_link_id, deposit_link_url, deposit_paid_at, deposit_collected_cents")
        .eq("id", job.id)
        .maybeSingle();
      if (
        current?.deposit_order_id === orderId &&
        current.deposit_link_id === linkId &&
        current.deposit_link_url === url
      ) {
        saved = true;
        return current.deposit_paid_at || (current.deposit_collected_cents ?? 0) > 0
          ? { url: null, skipped: "Deposit already paid" }
          : { url };
      }
      safeToRotate = await deleteDepositLink(linkId);
      const detail = saveErr?.message ?? "the deposit state changed while Square created the link";
      console.error(`[canes] deposit link save failed for job ${job.id}: ${detail}`);
      return { url: null, error: detail };
    }
    saved = true;
    return { url };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!saved && safeToRotate) {
      const { error } = await db.rpc("release_job_deposit_link_operation", {
        p_job_id: job.id,
        p_operation_id: operationId,
      });
      if (error) console.error(`[canes] deposit link lease release failed for ${job.id}: ${error.message}`);
    }
  }
}

// Delete a paid quick-pay link so the same URL can never charge twice (Square
// keeps payment links chargeable after a payment). Best-effort — a failure
// only means the double-payment alert is the backstop. Exported so a deposit
// recorded manually (cash in hand) can kill its outstanding online link too.
export async function deleteDepositLink(linkId: string): Promise<boolean> {
  if (!squareConfigured()) return false;
  try {
    const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links/${linkId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
        "Square-Version": SQUARE_VERSION,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok && res.status !== 404) {
      console.error(`[canes] deposit link delete rejected for ${linkId}: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[canes] deposit link delete failed for ${linkId}:`, err);
    return false;
  }
}

async function ensureJobDepositLinkRetired(jobId: string): Promise<boolean> {
  const db = canesDb();
  const { data: job, error } = await db
    .from("jobs")
    .select("deposit_link_id, deposit_link_url, deposit_order_id, deposit_link_retired_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) {
    if (error) console.error(`[canes] deposit link retirement lookup failed for ${jobId}: ${error.message}`);
    return false;
  }
  if (job.deposit_link_retired_at) return true;
  if (!job.deposit_link_id) {
    // A URL/order without its provider link id is an unverified legacy
    // charging surface. Fail closed and surface it for manual Square review.
    return !job.deposit_link_url && !job.deposit_order_id;
  }
  if (!await deleteDepositLink(job.deposit_link_id)) return false;

  const retiredAt = new Date().toISOString();
  const { data: retired, error: retireError } = await db
    .from("jobs")
    .update({
      deposit_link_url: null,
      deposit_link_retired_at: retiredAt,
    })
    .eq("id", jobId)
    .eq("deposit_link_id", job.deposit_link_id)
    .is("deposit_link_retired_at", null)
    .select("id");
  if (retireError) {
    console.error(`[canes] deposit link retirement save failed for ${jobId}: ${retireError.message}`);
    return false;
  }
  if (retired?.length) return true;
  const { data: current } = await db
    .from("jobs")
    .select("deposit_link_retired_at")
    .eq("id", jobId)
    .maybeSingle();
  return Boolean(current?.deposit_link_retired_at);
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
  status: string | null; // Square's payment/invoice/refund status, preserved for failure handling
  paid: boolean; // true when this event represents a completed payment
  // Set ONLY by refund.* events. Kept as its own object rather than folded into
  // the flat fields above because a refund is not a payment with a sign — it
  // points AT a payment we already recorded, and every other consumer of this
  // type must keep ignoring it.
  refund: {
    refundId: string;
    paymentId: string | null; // Square payment being refunded — our ledger key
    amountCents: number | null;
    completed: boolean; // money actually left the account
  } | null;
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

  // Refund-shaped event (refund.created / refund.updated). FIRST, because a
  // refund payload carries no `payment` key and would otherwise fall all the
  // way through to the inert tail return — which is exactly what made
  // subscribing to refund.* a silent no-op before this branch existed.
  const refund = object.refund as Record<string, unknown> | undefined;
  if (refund) {
    const money = (refund.amount_money ?? {}) as Record<string, unknown>;
    const status = typeof refund.status === "string" ? refund.status : "";
    return {
      eventId,
      eventType,
      squareInvoiceId: null,
      squarePaymentId: null,
      squareOrderId: typeof refund.order_id === "string" ? refund.order_id : null,
      amountCents: null,
      currency: typeof money.currency === "string" ? money.currency : null,
      status: status || null,
      paid: false,
      refund: {
        refundId: typeof refund.id === "string" ? refund.id : eventId,
        paymentId: typeof refund.payment_id === "string" ? refund.payment_id : null,
        amountCents: typeof money.amount === "number" ? money.amount : null,
        // PENDING refunds are an intent, not money movement, and REJECTED /
        // FAILED are the opposite of one. Only COMPLETED touches the ledger.
        completed: status === "COMPLETED",
      },
    };
  }

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
      status: status || null,
      paid: status === "COMPLETED" || status === "CAPTURED",
      refund: null,
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
      status: status || null,
      // invoice.payment_made can carry a cumulative partial while the invoice
      // itself is not PAID yet. Completed money, not the document status, is
      // what makes the event eligible for incremental reconciliation.
      paid: completed > 0,
      refund: null,
    };
  }

  return {
    eventId,
    eventType,
    squareInvoiceId: null,
    squarePaymentId: null,
    squareOrderId: null,
    amountCents: null,
    currency: null,
    status: null,
    paid: false,
    refund: null,
  };
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
  attemptId = invoice.id,
): Promise<SquareInvoiceResult> {
  if (!squarePaymentsReady()) {
    return {
      hostedUrl: null,
      squareInvoiceId: null,
      squareOrderId: null,
      error: "Square payments are not ready. Configure the webhook signature key and canonical HTTPS app URL before publishing a charge page.",
    };
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
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        idempotency_key: `customer:${invoice.id}:${attemptId}`,
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
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        idempotency_key: `order:${invoice.id}:${attemptId}`,
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
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        idempotency_key: `invoice:${invoice.id}:${attemptId}`,
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
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ idempotency_key: `publish:${invoice.id}:${attemptId}`, version: version ?? 0 }),
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

async function retrieveSquarePaymentOrder(paymentId: string): Promise<{
  orderId: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string | null;
  error?: string;
}> {
  if (!squareConfigured()) {
    return { orderId: null, amountCents: null, currency: null, status: null, error: "Square is not configured." };
  }
  try {
    const response = await fetch(`${SQUARE_API_BASE}/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
        "Square-Version": SQUARE_VERSION,
      },
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return {
        orderId: null,
        amountCents: null,
        currency: null,
        status: null,
        error: squareErr(json, response.status),
      };
    }
    const payment = (json.payment ?? {}) as Record<string, unknown>;
    const amountMoney = (payment.amount_money ?? {}) as Record<string, unknown>;
    return {
      orderId: typeof payment.order_id === "string" ? payment.order_id : null,
      amountCents: typeof amountMoney.amount === "number" && Number.isSafeInteger(amountMoney.amount)
        ? amountMoney.amount
        : null,
      currency: typeof amountMoney.currency === "string" ? amountMoney.currency : null,
      status: typeof payment.status === "string" ? payment.status : null,
    };
  } catch (error) {
    return {
      orderId: null,
      amountCents: null,
      currency: null,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type SquareOrderPayment = {
  paymentId: string;
  amountCents: number;
  currency: string;
};

async function retrieveSquareOrderPayments(orderId: string): Promise<{
  payments: SquareOrderPayment[];
  error?: string;
}> {
  if (!squareConfigured()) return { payments: [], error: "Square is not configured." };
  try {
    const response = await fetch(`${SQUARE_API_BASE}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
        "Square-Version": SQUARE_VERSION,
      },
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) return { payments: [], error: squareErr(json, response.status) };
    const order = (json.order ?? {}) as Record<string, unknown>;
    const tenders = Array.isArray(order.tenders)
      ? order.tenders as Array<Record<string, unknown>>
      : [];
    const unique = new Map<string, SquareOrderPayment>();
    for (const tender of tenders) {
      const paymentId = typeof tender.payment_id === "string"
        ? tender.payment_id
        : typeof tender.id === "string" ? tender.id : null;
      const money = (tender.amount_money ?? {}) as Record<string, unknown>;
      const amountCents = typeof money.amount === "number" ? money.amount : null;
      const currency = typeof money.currency === "string" ? money.currency : null;
      if (
        paymentId &&
        amountCents !== null &&
        validPaymentCents(amountCents) &&
        currency
      ) {
        unique.set(paymentId, { paymentId, amountCents, currency });
      }
    }
    return { payments: [...unique.values()] };
  } catch (error) {
    return {
      payments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Repair invoices written by the legacy cumulative invoice.payment_made
// handler. The database claim prevents old failures from starving later rows,
// and a terminal review state keeps the same owner alert from repeating.
export async function reconcileLegacySquarePaymentHistory(limit = 5): Promise<{
  checked: number;
  repaired: number;
  flagged: number;
}> {
  if (!squareConfigured() || !canesConfigured()) return { checked: 0, repaired: 0, flagged: 0 };
  const db = canesDb();
  const { data: invoices, error: claimError } = await db.rpc(
    "claim_legacy_square_repair_candidates",
    { p_limit: Math.max(1, Math.min(limit, 25)) },
  );
  if (claimError) throw new Error(`legacy Square history claim: ${claimError.message}`);
  let repaired = 0;
  let flagged = 0;
  const { alertOwner } = await import("@/lib/canes/twilio");
  for (const invoice of (invoices ?? []) as Array<{
    id: string;
    number: string;
    job_id: string | null;
    square_order_id: string | null;
    attempt_count: number;
  }>) {
    let reason: string | null = null;
    let structuralFailure = false;
    if (!invoice.square_order_id) {
      reason = "missing Square order ID";
      structuralFailure = true;
    } else {
      const order = await retrieveSquareOrderPayments(invoice.square_order_id);
      if (order.error || order.payments.length === 0) {
        reason = order.error ?? "Square order has no tenders yet";
      } else {
        const { data: rows, error } = await db.rpc(
          "reconcile_legacy_square_invoice_payments_locked",
          {
            p_invoice_id: invoice.id,
            p_job_id: invoice.job_id,
            p_tenders: order.payments.map((squarePayment) => ({
              payment_id: squarePayment.paymentId,
              amount_cents: squarePayment.amountCents,
              currency: squarePayment.currency,
            })),
            p_event_id: `legacy-backfill:${invoice.id}:${invoice.square_order_id}`,
          },
        );
        const result = (rows?.[0] ?? null) as {
          had_legacy: boolean;
          reconciled: boolean;
          reason: string | null;
        } | null;
        if (error || !result?.reconciled) {
          reason = error?.message ?? result?.reason ?? "unknown reconciliation failure";
          structuralFailure = Boolean(result && !result.reconciled && !error);
        } else {
          await recomputeInvoicePaid(invoice.id);
          repaired += result.had_legacy ? 1 : 0;
          await db
            .from("invoices")
            .update({
              legacy_square_repair_status: "repaired",
              legacy_square_repair_error: null,
              legacy_square_repair_checked_at: new Date().toISOString(),
            })
            .eq("id", invoice.id)
            .eq("legacy_square_repair_status", "checking");
        }
      }
    }
    if (reason) {
      const needsReview = structuralFailure || Number(invoice.attempt_count) >= 3;
      const { data: transitioned, error: stateError } = await db
        .from("invoices")
        .update({
          legacy_square_repair_status: needsReview ? "needs_review" : "pending",
          legacy_square_repair_error: reason,
          legacy_square_repair_checked_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("legacy_square_repair_status", "checking")
        .select("id");
      if (stateError) throw new Error(`legacy Square repair state: ${stateError.message}`);
      if (needsReview && transitioned?.length) {
        flagged += 1;
        const detail = `Legacy Square payments on ${invoice.number} need review (${reason}). Automated repair has stopped for this invoice.`;
        await Promise.all([
          alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
          pushPaymentIssue({
            eventId: `square-legacy-history:${invoice.id}`,
            invoiceId: invoice.id,
            title: "Legacy payment ledger needs review",
            detail,
          }),
        ]);
      }
    }
  }
  return { checked: invoices?.length ?? 0, repaired, flagged };
}

// ── Webhook reconciliation — record the payment, settle the invoice ──────────
// Called by the webhook route AFTER the signature is verified. Idempotent and
// TOCTOU-safe. Never throws into the route.

export type ReconcileOutcome = {
  handled: "duplicate" | "unmatched" | "amount_mismatch" | "recorded" | "refunded" | "ignored" | "unconfigured" | "retryable_error";
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
  const claimStartedAt = new Date().toISOString();

  // Dedupe the whole event first (Square delivers at-least-once). Store the
  // REAL payload — an empty {} here made the 2026-07-18 field-name bug
  // undebuggable from the database.
  const { data: seen, error: eventInsertError } = await db
    .from("square_webhook_events")
    .upsert(
      {
        event_id: event.eventId,
        event_type: event.eventType,
        processed: false,
        processing_started_at: claimStartedAt,
        payload: rawPayload ?? {},
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("event_id");
  if (eventInsertError) {
    console.error(`[canes] square event log failed for ${event.eventId}: ${eventInsertError.message}`);
    return { handled: "retryable_error" };
  }
  if (!seen || seen.length === 0) {
    // A previous delivery can have inserted the event and then failed before
    // setting processed=true. Square retries those notifications; only a row
    // that is actually processed is a duplicate. An unfinished one must run
    // again or a transient database failure permanently loses real money.
    const { data: prior, error: priorError } = await db
      .from("square_webhook_events")
      .select("processed, processing_started_at")
      .eq("event_id", event.eventId)
      .maybeSingle();
    if (priorError) {
      console.error(`[canes] square event lookup failed for ${event.eventId}: ${priorError.message}`);
      return { handled: "retryable_error" };
    }
    const priorEvent = prior as {
      processed: boolean;
      processing_started_at: string | null;
    } | null;
    if (!priorEvent || priorEvent.processed) return { handled: "duplicate" };

    const leaseStarted = priorEvent.processing_started_at
      ? new Date(priorEvent.processing_started_at).getTime()
      : 0;
    if (leaseStarted > Date.now() - 10 * 60_000) {
      // The first delivery is still reconciling. A 503 asks Square to retry;
      // acknowledging here could lose the event if that first worker crashes.
      return { handled: "retryable_error" };
    }

    let claim = db
      .from("square_webhook_events")
      .update({ processing_started_at: claimStartedAt })
      .eq("event_id", event.eventId)
      .eq("processed", false);
    claim = priorEvent.processing_started_at
      ? claim.eq("processing_started_at", priorEvent.processing_started_at)
      : claim.is("processing_started_at", null);
    const { data: claimed, error: claimError } = await claim.select("event_id");
    if (claimError) {
      console.error(`[canes] square event claim failed for ${event.eventId}: ${claimError.message}`);
      return { handled: "retryable_error" };
    }
    if (!claimed?.length) return { handled: "retryable_error" };
  }

  // Refund path. Runs before everything below because a refund event carries no
  // invoice id and no payment object, so every gate further down would read it
  // as noise and drop it. Sebastian refunds from the Square Dashboard — that is
  // the documented v1 procedure and what our own overpay alert tells him to do —
  // so this is the only way the money leaving ever reaches our books.
  if (event.refund) {
    const refunded = await recordRefund(event);
    if (refunded) return refunded;
  }

  // A failed/canceled payment is not ledger activity, but it is actionable
  // when Square gives us enough ids to match it to one of our invoices or
  // deposit links. Preserve and inspect the real Square status instead of
  // folding every non-completed payment into silent "noise".
  if (
    (event.eventType.startsWith("payment.") &&
      (event.status === "FAILED" || event.status === "CANCELED")) ||
    event.eventType === "invoice.scheduled_charge_failed"
  ) {
    const failed = await notifyFailedSquarePayment(event);
    if (failed) return failed;
  }

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

  const invoiceEvent = event.eventType === "invoice.payment_made" && Boolean(event.squareInvoiceId);
  const directPaymentEvent = event.eventType.startsWith("payment.") &&
    event.paid &&
    Boolean(event.squarePaymentId) &&
    Boolean(event.squareOrderId || event.squareInvoiceId);
  if (!invoiceEvent && !directPaymentEvent) {
    await markEventProcessed(event.eventId);
    return { handled: "ignored" };
  }

  let invoice = event.squareInvoiceId
    ? await getInvoiceBySquareId(event.squareInvoiceId)
    : null;
  if (!invoice && event.squareOrderId) {
    const { data: invoiceRef, error: invoiceRefError } = await db
      .from("invoices")
      .select("id")
      .eq("square_order_id", event.squareOrderId)
      .maybeSingle();
    if (invoiceRefError) return { handled: "retryable_error" };
    if (typeof invoiceRef?.id === "string") invoice = await getInvoice(invoiceRef.id);
  }
  if (!invoice) {
    await markEventProcessed(event.eventId);
    return { handled: "unmatched" };
  }

  let squarePayments: SquareOrderPayment[];
  let completeOrderSnapshot = false;
  if (directPaymentEvent) {
    const amountCents = event.amountCents ?? 0;
    if (!validPaymentCents(amountCents) || event.currency !== "USD") {
      const issue = !validPaymentCents(amountCents)
        ? "no valid amount"
        : event.currency ? `currency ${event.currency}` : "no currency";
      const detail = `Card payment event on ${invoice.number} had ${issue}. Review it before treating the invoice as paid.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-invoice-invalid:${event.squarePaymentId ?? event.eventId}`,
          invoiceId: invoice.id,
          title: "Invalid card payment",
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return { handled: "amount_mismatch", invoiceId: invoice.id };
    }
    squarePayments = [{
      paymentId: event.squarePaymentId as string,
      amountCents,
      currency: event.currency,
    }];
    const orderId = invoice.square_order_id ?? event.squareOrderId;
    if (orderId) {
      const orderPayments = await retrieveSquareOrderPayments(orderId);
      if (!orderPayments.error && orderPayments.payments.length > 0) {
        squarePayments = orderPayments.payments;
        completeOrderSnapshot = true;
      }
    }
  } else {
    if (!invoice.square_order_id) return { handled: "retryable_error", invoiceId: invoice.id };
    const orderPayments = await retrieveSquareOrderPayments(invoice.square_order_id);
    if (orderPayments.error) {
      console.error(`[canes] invoice order payment lookup failed for ${invoice.id}: ${orderPayments.error}`);
      return { handled: "retryable_error", invoiceId: invoice.id };
    }
    squarePayments = orderPayments.payments;
    completeOrderSnapshot = true;
    if (squarePayments.length === 0) {
      // RetrieveOrder is eventually consistent immediately after payment.
      return { handled: "retryable_error", invoiceId: invoice.id };
    }
  }

  if (completeOrderSnapshot) {
    const { data: legacyRows, error: legacyError } = await db.rpc(
      "reconcile_legacy_square_invoice_payments_locked",
      {
        p_invoice_id: invoice.id,
        p_job_id: invoice.job_id,
        p_tenders: squarePayments.map((payment) => ({
          payment_id: payment.paymentId,
          amount_cents: payment.amountCents,
          currency: payment.currency,
        })),
        p_event_id: event.eventId,
      },
    );
    if (legacyError) {
      console.error(`[canes] legacy Square ledger reconciliation failed for ${invoice.id}: ${legacyError.message}`);
      return { handled: "retryable_error", invoiceId: invoice.id };
    }
    const legacy = (legacyRows?.[0] ?? null) as {
      had_legacy: boolean;
      reconciled: boolean;
      inserted_cents: number;
      reason: string | null;
    } | null;
    if (!legacy) return { handled: "retryable_error", invoiceId: invoice.id };
    if (legacy.had_legacy && !legacy.reconciled) {
      const detail = `Legacy Square payments on ${invoice.number} could not be matched safely (${legacy.reason ?? "unknown mismatch"}). Review the payment ledger before collecting or refunding more money.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-legacy-ledger:${invoice.id}:${event.eventId}`,
          invoiceId: invoice.id,
          title: "Payment ledger needs review",
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return { handled: "amount_mismatch", invoiceId: invoice.id };
    }
  }

  let insertedAmount = 0;
  let resumedAmount = 0;
  let resumedOwnAttempt = false;
  for (const squarePayment of squarePayments) {
    if (squarePayment.currency !== "USD" || !validPaymentCents(squarePayment.amountCents)) {
      const detail = `Square returned an invalid tender on ${invoice.number}. Review the payment before treating the invoice as paid.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-invoice-invalid-tender:${squarePayment.paymentId}`,
          invoiceId: invoice.id,
          title: "Invalid card payment",
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return { handled: "amount_mismatch", invoiceId: invoice.id };
    }
    const { data: claimRows, error: claimError } = await db.rpc(
      "record_square_invoice_payment_locked",
      {
        p_invoice_id: invoice.id,
        p_job_id: invoice.job_id,
        p_amount_cents: squarePayment.amountCents,
        p_currency: squarePayment.currency,
        p_square_payment_id: squarePayment.paymentId,
        p_event_id: event.eventId,
      },
    );
    if (claimError) {
      console.error(`[canes] Square payment claim failed for invoice ${invoice.id}: ${claimError.message}`);
      return { handled: "retryable_error", invoiceId: invoice.id };
    }
    const claim = (claimRows?.[0] ?? null) as {
      payment_id: string | null;
      amount_cents: number;
      inserted: boolean;
      owned_event: boolean;
      same_event: boolean;
      payment_status: string;
    } | null;
    if (!claim) return { handled: "retryable_error", invoiceId: invoice.id };
    if (!claim.owned_event) {
      const detail = `Square payment ${squarePayment.paymentId} conflicts with another ledger record. Review ${invoice.number} before issuing any refund.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-invoice-collision:${squarePayment.paymentId}`,
          invoiceId: invoice.id,
          title: "Payment ledger conflict",
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return { handled: "amount_mismatch", invoiceId: invoice.id };
    }
    if (claim.inserted) insertedAmount += Number(claim.amount_cents);
    else if (claim.same_event && claim.payment_status === "completed") {
      resumedOwnAttempt = true;
      resumedAmount += Number(claim.amount_cents);
    }
  }

  const settlement = await recomputeInvoicePaid(invoice.id);
  if (!settlement) return { handled: "retryable_error", invoiceId: invoice.id };
  const eventAmount = insertedAmount + resumedAmount;
  if (settlement.invoiceStatus === "void" && eventAmount > 0) {
    const detail = `${fmtMoney(eventAmount)} reached void invoice ${invoice.number}. The payment was recorded, but the void invoice was not reopened; review the ledger and refund or carry the credit forward.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `void-invoice-payment:${invoice.id}:${settlement.paidCents}`,
        invoiceId: invoice.id,
        title: "Payment hit a void invoice",
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", invoiceId: invoice.id, amountCents: eventAmount };
  }
  if (settlement.overpaidCents > 0) {
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }
  if (settlement.newlySettled || (settlement.fullyPaid && resumedOwnAttempt)) {
    const settlementEventId = `invoice-settled:${invoice.id}:${settlement.settlementGeneration}`;
    await cancelPendingInvoiceTasks(invoice.id);
    await pushInvoicePaid({
      eventId: settlementEventId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerName: invoice.customer_name,
      amountCents: eventAmount || settlement.paidCents,
    });
    await enqueueInvoicePaymentEmails({
      eventId: settlementEventId,
      invoiceId: invoice.id,
      method: "card",
    });
    await markEventProcessed(event.eventId);
    return { handled: "recorded", invoiceId: invoice.id };
  }
  if (settlement.fullyPaid) {
    await markEventProcessed(event.eventId);
    return { handled: "duplicate", invoiceId: invoice.id };
  }
  if (eventAmount > 0) {
    const remaining = Math.max(0, settlement.totalCents - settlement.paidCents);
    const detail = `Partial card payment ${fmtMoney(eventAmount)} on ${invoice.number}; ${fmtMoney(remaining)} remains due on the ${fmtMoney(settlement.totalCents)} invoice.`;
    await Promise.all([
      alertOwner(detail, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-invoice-partial:${event.eventId}`,
        invoiceId: invoice.id,
        title: "Partial card payment",
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }
  await markEventProcessed(event.eventId);
  return { handled: "duplicate", invoiceId: invoice.id };
}

async function notifyFailedSquarePayment(
  event: NormalizedPaymentEvent,
): Promise<ReconcileOutcome | null> {
  const status = event.status;
  const scheduledChargeFailed = event.eventType === "invoice.scheduled_charge_failed";
  if (!scheduledChargeFailed && status !== "FAILED" && status !== "CANCELED") return null;
  const { alertOwner } = await import("@/lib/canes/twilio");
  const statusLabel = status === "CANCELED" ? "was canceled" : "failed";
  const title = status === "CANCELED" ? "Card payment canceled" : "Card payment failed";
  const stablePaymentKey = event.squarePaymentId ?? event.eventId;

  let invoice: Pick<Invoice, "id" | "number"> | null = event.squareInvoiceId
    ? await getInvoiceBySquareId(event.squareInvoiceId)
    : null;
  // Some payment.* payloads identify a hosted invoice only through the order.
  // Fall back to the Square order id before trying the deposit-link namespace.
  if (!invoice && event.squareOrderId) {
    const { data: invoiceRow, error } = await canesDb()
      .from("invoices")
      .select("id, number")
      .eq("square_order_id", event.squareOrderId)
      .maybeSingle();
    if (error) {
      console.error(
        `[canes] failed invoice payment lookup failed for order ${event.squareOrderId}: ${error.message}`,
      );
      return { handled: "retryable_error" };
    }
    invoice = invoiceRow as Pick<Invoice, "id" | "number"> | null;
  }
  if (invoice) {
    const detail = `A card payment on ${invoice.number} ${statusLabel} in Square. No money was recorded.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-status:${stablePaymentKey}:${status}`,
        invoiceId: invoice.id,
        title,
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", invoiceId: invoice.id };
  }

  if (event.squareOrderId) {
    const { data: jobRow, error } = await canesDb()
      .from("jobs")
      .select("id, customer_name, job_name")
      .eq("deposit_order_id", event.squareOrderId)
      .maybeSingle();
    if (error) {
      console.error(
        `[canes] failed deposit payment lookup failed for order ${event.squareOrderId}: ${error.message}`,
      );
      return { handled: "retryable_error" };
    }
    if (jobRow) {
      const job = jobRow as {
        id: string;
        customer_name: string | null;
        job_name: string | null;
      };
      const label = job.customer_name ?? job.job_name ?? "a job";
      const detail = `A deposit payment for ${label} ${statusLabel} in Square. No money was recorded.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-status:${stablePaymentKey}:${status}`,
          jobId: job.id,
          title,
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return { handled: "amount_mismatch", depositJobId: job.id };
    }
  }

  return null;
}

async function cancelPendingInvoiceTasks(invoiceId: string): Promise<void> {
  const { error } = await canesDb()
    .from("tasks")
    .update({ status: "canceled" })
    .in("kind", ["invoice_send", "invoice_reminder", "invoice_customer_email"])
    .eq("status", "pending")
    .contains("payload", { invoice_id: invoiceId });
  if (error) {
    console.error(`[canes] invoice task cancellation failed for ${invoiceId}: ${error.message}`);
  }
}

type SquareFinancialOperation = {
  outcome: "new" | "resume" | "resume_effects" | "duplicate" | "busy" | "invalid";
  operationKey: string;
  jobId: string | null;
  invoiceId: string | null;
  squareInvoiceId: string | null;
};

async function prepareSquareFinancialOperation(input: {
  kind: "deposit" | "refund";
  sourceId: string;
  eventId: string;
  jobId?: string | null;
  paymentId?: string | null;
}): Promise<SquareFinancialOperation | null> {
  const { data, error } = await canesDb().rpc("prepare_square_financial_operation", {
    p_kind: input.kind,
    p_source_id: input.sourceId,
    p_event_id: input.eventId,
    p_job_id: input.jobId ?? null,
    p_payment_id: input.paymentId ?? null,
  });
  if (error) {
    console.error(`[canes] Square ${input.kind} operation prepare failed: ${error.message}`);
    return null;
  }
  const row = (data?.[0] ?? null) as {
    outcome: SquareFinancialOperation["outcome"];
    operation_key: string | null;
    job_id: string | null;
    invoice_id: string | null;
    square_invoice_id: string | null;
  } | null;
  if (!row?.operation_key) return null;
  return {
    outcome: row.outcome,
    operationKey: row.operation_key,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    squareInvoiceId: row.square_invoice_id,
  };
}

async function finalizeSquareFinancialOperation(
  operationKey: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await canesDb().rpc("finalize_square_financial_operation", {
    p_operation_key: operationKey,
    p_event_id: eventId,
  });
  if (error) {
    console.error(`[canes] Square financial operation finalize failed: ${error.message}`);
    return false;
  }
  return data === true;
}

async function completeSquareFinancialOperation(
  operationKey: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await canesDb().rpc("complete_square_financial_operation", {
    p_operation_key: operationKey,
    p_event_id: eventId,
  });
  if (error) {
    console.error(`[canes] Square financial effects completion failed: ${error.message}`);
    return false;
  }
  return data === true;
}

async function finishSquareOperationAndEvent(
  operation: SquareFinancialOperation,
  eventId: string,
): Promise<boolean> {
  if (!await completeSquareFinancialOperation(operation.operationKey, eventId)) return false;
  await markEventProcessed(eventId);
  return true;
}

async function requireDepositLinkRetired(input: {
  jobId: string;
  paymentId: string;
  invoiceId?: string | null;
  customerLabel: string;
}): Promise<boolean> {
  if (await ensureJobDepositLinkRetired(input.jobId)) return true;
  const detail = `The paid deposit link for ${input.customerLabel} could not be disabled. Do not resend it; retirement will retry automatically.`;
  const pushed = await pushPaymentIssue({
    eventId: `deposit-link-retirement:${input.paymentId}`,
    jobId: input.jobId,
    invoiceId: input.invoiceId,
    title: "Deposit link still active",
    detail,
  });
  if (pushed.skipped !== "duplicate") {
    const { alertOwner } = await import("@/lib/canes/twilio");
    await alertOwner(`⚠️ ${detail}`, { alreadyPushed: true });
  }
  return false;
}

async function resumeFinalizedRefundEffects(
  event: NormalizedPaymentEvent,
  operation: SquareFinancialOperation,
): Promise<ReconcileOutcome> {
  const refund = event.refund;
  if (!refund) return { handled: "retryable_error" };
  const db = canesDb();
  const { data: refundRow, error } = await db
    .from("payment_refunds")
    .select("amount_cents, payment_id")
    .eq("square_refund_id", refund.refundId)
    .maybeSingle();
  if (error || !refundRow) return { handled: "retryable_error" };
  const invoice = operation.invoiceId ? await getInvoice(operation.invoiceId) : null;
  const amount = Number(refundRow.amount_cents);
  const detail = invoice && invoice.amount_paid_cents < invoice.total_cents
    ? `Refund of ${fmtMoney(amount)} recorded. The old Square invoice was retired; create a replacement invoice for the remaining balance.`
    : `Refund of ${fmtMoney(amount)} recorded from Square. The books have been corrected.`;
  const { alertOwner } = await import("@/lib/canes/twilio");
  await Promise.all([
    alertOwner(`↩️ ${detail}`, { alreadyPushed: true }),
    invoice && invoice.amount_paid_cents < invoice.total_cents
      ? pushPaymentIssue({
          eventId: `square-refund-reissue:${refund.refundId}`,
          invoiceId: invoice.id,
          jobId: operation.jobId,
          title: "Refund recorded — reissue invoice",
          detail,
        })
      : Promise.resolve(null),
  ]);
  if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
    return { handled: "retryable_error", invoiceId: invoice?.id, depositJobId: operation.jobId ?? undefined };
  }
  return {
    handled: "refunded",
    invoiceId: invoice?.id,
    depositJobId: operation.jobId ?? undefined,
    amountCents: amount,
  };
}

async function resumeFinalizedDepositEffects(
  event: NormalizedPaymentEvent,
  operation: SquareFinancialOperation,
): Promise<ReconcileOutcome> {
  const paymentId = event.squarePaymentId as string;
  const db = canesDb();
  const { data: payment, error: paymentError } = await db
    .from("payments")
    .select("id, job_id, invoice_id, amount_cents")
    .eq("square_payment_id", paymentId)
    .maybeSingle();
  if (paymentError || !payment || !payment.job_id) return { handled: "retryable_error" };
  const { data: job, error: jobError } = await db
    .from("jobs")
    .select("id, estimate_id, lead_id, status, customer_name, job_name, deposit_cents")
    .eq("id", payment.job_id)
    .maybeSingle();
  if (jobError || !job) return { handled: "retryable_error", depositJobId: payment.job_id };
  const { data: depositRows, error: depositsError } = await db
    .from("payments")
    .select("id, amount_cents, refunded_cents, status")
    .eq("job_id", job.id)
    .eq("kind", "deposit");
  if (depositsError) return { handled: "retryable_error", depositJobId: job.id };
  const amount = Number(payment.amount_cents);
  const otherNetDeposits = (depositRows ?? []).some((row) =>
    row.id !== payment.id && row.status !== "refunded" &&
    Number(row.amount_cents) - Number(row.refunded_cents ?? 0) > 0,
  );
  const label = job.customer_name ?? job.job_name ?? "a job";
  const { alertOwner } = await import("@/lib/canes/twilio");

  if (!await requireDepositLinkRetired({
    jobId: job.id,
    paymentId,
    invoiceId: payment.invoice_id,
    customerLabel: label,
  })) {
    return { handled: "retryable_error", depositJobId: job.id, invoiceId: payment.invoice_id ?? undefined };
  }

  if (job.status === "canceled") {
    const detail = `A deposit of ${fmtMoney(amount)} arrived after ${label}'s job was canceled. The payment is recorded, but it needs a refund review in Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-canceled-job:${paymentId}`,
        jobId: job.id,
        invoiceId: payment.invoice_id,
        title: "Payment on canceled job",
        detail,
      }),
    ]);
  } else if (otherNetDeposits) {
    const detail = `A second deposit payment of ${fmtMoney(amount)} arrived for ${label}. Likely a double charge — refund it from Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-second:${paymentId}`,
        jobId: job.id,
        title: "Possible double deposit",
        detail,
      }),
    ]);
  } else if (amount !== Math.round(Number(job.deposit_cents))) {
    const detail = `Deposit of ${fmtMoney(amount)} for ${label} doesn't match the ${fmtMoney(Number(job.deposit_cents))} requested. Review it in Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-amount:${paymentId}`,
        jobId: job.id,
        title: "Deposit amount mismatch",
        detail,
      }),
    ]);
  } else {
    await Promise.all([
      alertOwner(`💰 Deposit ${fmtMoney(amount)} received from ${label}. The job is ready to schedule.`, { alreadyPushed: true }),
      pushDepositReceived({
        eventId: `square:${paymentId}`,
        estimateId: job.estimate_id,
        jobId: job.id,
        customerName: job.customer_name,
        amountCents: amount,
      }),
    ]);
  }
  if (job.estimate_id) {
    await enqueueDepositPaymentEmail({
      eventId: `square:${event.eventId}`,
      estimateId: job.estimate_id,
      amountCents: amount,
    });
  }
  if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
    return { handled: "retryable_error", depositJobId: job.id, invoiceId: payment.invoice_id ?? undefined };
  }
  return {
    handled: job.status === "canceled" || otherNetDeposits || amount !== Math.round(Number(job.deposit_cents))
      ? "amount_mismatch"
      : "recorded",
    depositJobId: job.id,
    invoiceId: payment.invoice_id ?? undefined,
    amountCents: amount,
  };
}

// ── Refund reconciliation — money leaving, recorded where money arrived ──────
// The ledger is append-only for INSERTS, but a refunded row is not a deleted
// row: `payments.status` has carried a 'refunded' value since 0005 and
// recomputeInvoicePaid has always summed only 'completed' rows. Every piece of
// this was in place except the writer, so a Square-side refund silently left
// revenue overstated forever. This is the writer.
//
// Returns null only when the refund is not ours to record, so the caller falls
// through to the ordinary gates.
async function recordRefund(event: NormalizedPaymentEvent): Promise<ReconcileOutcome | null> {
  const refund = event.refund;
  if (!refund) return null;
  const db = canesDb();
  const { alertOwner } = await import("@/lib/canes/twilio");

  // An intent to refund is not a refund. Ack and wait for the COMPLETED event.
  if (!refund.completed || !refund.paymentId) {
    await markEventProcessed(event.eventId);
    return { handled: "ignored" };
  }

  type PaymentRow = {
    id: string;
    invoice_id: string | null;
    job_id: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    kind: string;
    square_payment_id: string | null;
  };
  const COLS = "id, invoice_id, job_id, amount_cents, currency, status, kind, square_payment_id";
  let knownInvoiceId: string | null = null;
  let knownDepositJobId: string | null = null;

  const { data: ownedRefundRef, error: ownedRefundRefError } = await db
    .from("payment_refunds")
    .select("payment_id")
    .eq("square_refund_id", refund.refundId)
    .maybeSingle();
  if (ownedRefundRefError) {
    console.error(`[canes] refund recovery reference failed: ${ownedRefundRefError.message}`);
    return { handled: "retryable_error" };
  }
  const ownedPaymentId = typeof ownedRefundRef?.payment_id === "string"
    ? ownedRefundRef.payment_id
    : null;
  const { data: ownedRefund, error: ownedRefundError } = ownedPaymentId
    ? await db.from("payments").select(COLS).eq("id", ownedPaymentId).maybeSingle()
    : await db.from("payments").select(COLS).eq("square_refund_id", refund.refundId).maybeSingle();
  if (ownedRefundError) {
    console.error(`[canes] refund recovery lookup failed: ${ownedRefundError.message}`);
    return { handled: "retryable_error" };
  }
  let payment = ownedRefund as PaymentRow | null;

  // Current invoice and deposit rows store Square's real payment id. The
  // fallback below remains for rows created by the older cumulative-invoice
  // reconciler, which used a synthetic key and therefore cannot be found by a
  // refund's payment_id.
  if (!payment) {
    const { data: byPaymentId, error: paymentLookupError } = await db
      .from("payments")
      .select(COLS)
      .eq("square_payment_id", refund.paymentId)
      .maybeSingle();
    if (paymentLookupError) {
      console.error(`[canes] refund payment lookup failed: ${paymentLookupError.message}`);
      return { handled: "retryable_error" };
    }
    payment = byPaymentId as PaymentRow | null;
  }

  // A refund's order_id is a NEW return order, not the invoice's original
  // order. Retrieve the source payment and use its order_id to reach the
  // hosted invoice. Treat Square/API failures as retryable: acknowledging an
  // unmatched refund would permanently strand the books.
  if (!payment) {
    const source = await retrieveSquarePaymentOrder(refund.paymentId);
    if (source.error) {
      console.error(`[canes] refund source payment lookup failed: ${source.error}`);
      return { handled: "retryable_error" };
    }
    const [invoiceLookup, depositLookup] = await Promise.all([
      db
        .from("invoices")
        .select("id")
        .eq("square_order_id", source.orderId ?? "")
        .maybeSingle(),
      db
        .from("jobs")
        .select("id")
        .eq("deposit_order_id", source.orderId ?? "")
        .maybeSingle(),
    ]);
    const { data: invoiceRow, error: invoiceLookupError } = invoiceLookup;
    if (invoiceLookupError) {
      console.error(`[canes] refund invoice lookup failed: ${invoiceLookupError.message}`);
      return { handled: "retryable_error" };
    }
    if (depositLookup.error) {
      console.error(`[canes] refund deposit lookup failed: ${depositLookup.error.message}`);
      return { handled: "retryable_error" };
    }
    knownInvoiceId = typeof invoiceRow?.id === "string" ? invoiceRow.id : null;
    knownDepositJobId = typeof depositLookup.data?.id === "string" ? depositLookup.data.id : null;

    if (source.currency !== null && event.currency !== source.currency) {
      const detail = `Square refund ${refund.refundId} has currency ${event.currency ?? "missing"}, but its source payment is ${source.currency}. Review it manually.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `square-refund-currency:${refund.refundId}`,
          invoiceId: knownInvoiceId,
          jobId: knownDepositJobId,
          title: "Refund currency mismatch",
          detail,
        }),
      ]);
      await markEventProcessed(event.eventId);
      return {
        handled: "amount_mismatch",
        invoiceId: knownInvoiceId ?? undefined,
        depositJobId: knownDepositJobId ?? undefined,
      };
    }
    if (invoiceRow) {
      const { data: candidates, error: candidatesError } = await db
        .from("payments")
        .select(COLS)
        .eq("invoice_id", (invoiceRow as { id: string }).id)
        .eq("status", "completed")
        .eq("source", "square_webhook")
        .eq("kind", "balance");
      if (candidatesError) {
        console.error(`[canes] refund ledger lookup failed: ${candidatesError.message}`);
        return { handled: "retryable_error" };
      }
      // Only the old reconciler's synthetic evt:* rows are eligible for this
      // fallback. A real Square tender with another payment id is a different
      // payment even when its amount happens to match. Treating it as the
      // source lets an out-of-order refund debit an unrelated customer tender.
      const rows = ((candidates ?? []) as PaymentRow[]).filter(
        (row) => row.square_payment_id?.startsWith("evt:") === true,
      );
      // A partial refund names the refund amount, not the original tender
      // amount. Match legacy synthetic rows to the source payment fetched from
      // Square; otherwise a $20 refund of a $100 payment can never reconcile.
      const exact = source.amountCents === null
        ? []
        : rows.filter((row) => row.amount_cents === source.amountCents);
      if (exact.length === 1) payment = exact[0];
      else if (exact.length > 1) {
        // A bill can carry a deposit AND a balance. The refund alone cannot say
        // which came back, so fall to the amount — and if that is still
        // ambiguous, refuse rather than refund the wrong row.
        const detail = `Square refund ${refund.refundId} matches multiple legacy payments on this invoice. Review the payment ledger before assigning it.`;
        await Promise.all([
          alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
          pushPaymentIssue({
            eventId: `square-refund-ambiguous:${refund.refundId}`,
            invoiceId: knownInvoiceId,
            title: "Ambiguous Square refund",
            detail,
          }),
        ]);
        await markEventProcessed(event.eventId);
        return { handled: "amount_mismatch", invoiceId: knownInvoiceId ?? undefined };
      }
      else if (rows.length > 0) {
        // This is a structural legacy mismatch, not webhook ordering. Retrying
        // forever cannot create a matching row, so surface it once and leave
        // the ledger unchanged for deliberate manual resolution.
        const detail = `Square refund ${refund.refundId} did not match the original amount of any legacy payment on this invoice. Review the payment ledger.`;
        await Promise.all([
          alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
          pushPaymentIssue({
            eventId: `square-refund-legacy-mismatch:${refund.refundId}`,
            invoiceId: knownInvoiceId,
            title: "Refund needs review",
            detail,
          }),
        ]);
        await markEventProcessed(event.eventId);
        return { handled: "amount_mismatch", invoiceId: knownInvoiceId ?? undefined };
      }
    }
  }

  // Square does not guarantee webhook ordering. A completed refund can arrive
  // before the matching invoice.payment_made/payment.updated event has created
  // our ledger row. Keep a known invoice/deposit refund unprocessed so Square
  // retries it after the payment event instead of permanently overstating cash.
  if (!payment && (knownInvoiceId || knownDepositJobId)) {
    return {
      handled: "retryable_error",
      invoiceId: knownInvoiceId ?? undefined,
      depositJobId: knownDepositJobId ?? undefined,
    };
  }

  // A refund against something we never recorded — a POS sale, or a deposit
  // taken before the payment.* events were subscribed. SAY SO: money left the
  // account and nothing here can account for it, and silence on exactly this
  // path is what let the ledger drift in the first place.
  if (!payment) {
    const detail = `A Square refund of ${fmtMoney(refund.amountCents ?? 0)} did not match any payment on record. Check the books.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-refund-unmatched:${refund.refundId}`,
        title: "Unmatched Square refund",
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "unmatched" };
  }

  if (!validPaymentCents(refund.amountCents ?? 0) || event.currency !== payment.currency) {
    const detail = `Square refund ${refund.refundId} has an invalid amount or currency. Review it manually before changing the ledger.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-refund-invalid:${refund.refundId}`,
        invoiceId: payment.invoice_id,
        jobId: payment.job_id,
        title: "Invalid Square refund",
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", invoiceId: payment.invoice_id ?? undefined };
  }

  const refundOperation = await prepareSquareFinancialOperation({
    kind: "refund",
    sourceId: refund.refundId,
    eventId: event.eventId,
    paymentId: payment.id,
  });
  if (!refundOperation || refundOperation.outcome === "busy" || refundOperation.outcome === "invalid") {
    return {
      handled: "retryable_error",
      invoiceId: payment.invoice_id ?? undefined,
      depositJobId: payment.job_id ?? undefined,
    };
  }
  if (refundOperation.outcome === "duplicate") {
    await markEventProcessed(event.eventId);
    return {
      handled: "duplicate",
      invoiceId: refundOperation.invoiceId ?? undefined,
      depositJobId: refundOperation.jobId ?? undefined,
    };
  }
  if (refundOperation.outcome === "resume_effects") {
    return resumeFinalizedRefundEffects(event, refundOperation);
  }
  const { data: pinnedPayment, error: pinnedPaymentError } = await db
      .from("payments")
      .select("invoice_id, job_id")
      .eq("id", payment.id)
      .maybeSingle();
  if (
    pinnedPaymentError ||
    !pinnedPayment ||
    pinnedPayment.invoice_id !== refundOperation.invoiceId ||
    (pinnedPayment.job_id ?? refundOperation.jobId) !== refundOperation.jobId
  ) {
    return {
      handled: "retryable_error",
      invoiceId: refundOperation.invoiceId ?? undefined,
      depositJobId: refundOperation.jobId ?? undefined,
    };
  }
  if (refundOperation.invoiceId) {
    const pinnedInvoice = await getInvoice(refundOperation.invoiceId);
    if (!pinnedInvoice || pinnedInvoice.square_invoice_id !== refundOperation.squareInvoiceId) {
      return {
        handled: "retryable_error",
        invoiceId: refundOperation.invoiceId,
        depositJobId: refundOperation.jobId ?? undefined,
      };
    }
  }
  if (refundOperation.squareInvoiceId) {
    const attachedInvoice = refundOperation.invoiceId
      ? await getInvoice(refundOperation.invoiceId)
      : null;
    if (attachedInvoice) {
      // Any refund can raise the true balance below the amount represented by
      // the already-published page. Retire that exact pinned provider invoice
      // before the local ledger accepts the refund.
      const retirement = await retireSquareInvoice(
        refundOperation.squareInvoiceId,
        { reconcileMoney: true },
      );
      if (retirement === "error") {
        const detail = `A refund affects ${attachedInvoice.number}, but its old Square payment page could not be disabled. Do not use that link; reconciliation will retry automatically.`;
        await Promise.all([
          alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
          pushPaymentIssue({
            eventId: `deposit-refund-square-live:${refund.refundId}`,
            invoiceId: attachedInvoice.id,
            jobId: payment.job_id,
            title: "Refund changed an active invoice",
            detail,
          }),
        ]);
        return {
          handled: "retryable_error",
          invoiceId: attachedInvoice.id,
          depositJobId: payment.job_id ?? undefined,
        };
      }
    }
  }
  if (payment.kind === "deposit" && payment.job_id && !await requireDepositLinkRetired({
    jobId: payment.job_id,
    paymentId: payment.square_payment_id ?? refund.paymentId,
    invoiceId: payment.invoice_id,
    customerLabel: "this job",
  })) {
    return {
      handled: "retryable_error",
      invoiceId: payment.invoice_id ?? undefined,
      depositJobId: payment.job_id,
    };
  }

  const { data: refundRows, error: refundError } = await db.rpc(
    "refund_square_payment_locked",
    {
      p_payment_id: payment.id,
      p_refund_id: refund.refundId,
      p_amount_cents: refund.amountCents,
      p_currency: event.currency,
      p_event_id: event.eventId,
    },
  );
  if (refundError) {
    console.error(`[canes] refund ledger claim failed: ${refundError.message}`);
    return {
      handled: "retryable_error",
      invoiceId: payment.invoice_id ?? undefined,
      depositJobId: payment.job_id ?? undefined,
    };
  }
  const refundClaim = (refundRows?.[0] ?? null) as {
    claimed: boolean;
    owned_event: boolean;
    same_event: boolean;
    fully_refunded: boolean;
    refunded_cents: number;
    invoice_id: string | null;
    job_id: string | null;
  } | null;
  if (!refundClaim) {
    return {
      handled: "retryable_error",
      invoiceId: payment.invoice_id ?? undefined,
      depositJobId: payment.job_id ?? undefined,
    };
  }
  const refundedInvoiceId = refundClaim.invoice_id;
  const refundedJobId = refundClaim.job_id;
  if (!refundClaim?.owned_event) {
    if (!await finalizeSquareFinancialOperation(refundOperation.operationKey, event.eventId)) {
      return { handled: "retryable_error", invoiceId: refundedInvoiceId ?? undefined, depositJobId: refundedJobId ?? undefined };
    }
    const detail = `Square refund ${refund.refundId} exceeds or conflicts with its recorded payment. Review the payment ledger.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-refund-conflict:${refund.refundId}`,
        invoiceId: refundedInvoiceId,
        jobId: refundedJobId,
        title: "Refund ledger conflict",
        detail,
      }),
    ]);
    if (!await finishSquareOperationAndEvent(refundOperation, event.eventId)) {
      return { handled: "retryable_error", invoiceId: refundedInvoiceId ?? undefined, depositJobId: refundedJobId ?? undefined };
    }
    return {
      handled: "amount_mismatch",
      invoiceId: refundedInvoiceId ?? undefined,
      depositJobId: refundedJobId ?? undefined,
    };
  }

  let recomputed: InvoicePaidRecomputeResult | null = null;
  if (refundedInvoiceId) {
    recomputed = await recomputeInvoicePaid(refundedInvoiceId);
    if (!recomputed) {
      return { handled: "retryable_error", invoiceId: refundedInvoiceId };
    }
  }

  if (!await finalizeSquareFinancialOperation(refundOperation.operationKey, event.eventId)) {
    return {
      handled: "retryable_error",
      invoiceId: refundedInvoiceId ?? payment.invoice_id ?? undefined,
      depositJobId: refundedJobId ?? payment.job_id ?? undefined,
    };
  }

  // A process can commit the refund and crash before the alert/outbox work.
  // The same Square webhook must resume those effects; a different duplicate
  // event for an already-recorded refund is safe to acknowledge quietly.
  if (
    !refundClaim.claimed &&
    !refundClaim.same_event &&
    refundOperation.outcome !== "resume"
  ) {
    if (!await finishSquareOperationAndEvent(refundOperation, event.eventId)) {
      return { handled: "retryable_error", invoiceId: refundedInvoiceId ?? undefined, depositJobId: refundedJobId ?? undefined };
    }
    return {
      handled: "ignored",
      invoiceId: refundedInvoiceId ?? undefined,
      depositJobId: refundedJobId ?? undefined,
    };
  }

  const refundedAmount = refund.amountCents as number;
  const refundDetail = refundedInvoiceId && recomputed && !recomputed.fullyPaid
    ? `Refund of ${fmtMoney(refundedAmount)} recorded. The old Square invoice was retired; create a replacement invoice for the remaining balance.`
    : `Refund of ${fmtMoney(refundedAmount)} recorded from Square. The books have been corrected.`;
  await Promise.all([
    alertOwner(`↩️ ${refundDetail}`, { alreadyPushed: true }),
    refundedInvoiceId && recomputed && !recomputed.fullyPaid
      ? pushPaymentIssue({
          eventId: `square-refund-reissue:${refund.refundId}`,
          invoiceId: refundedInvoiceId,
          title: "Refund recorded — reissue invoice",
          detail: refundDetail,
        })
      : Promise.resolve(null),
  ]);
  if (!await finishSquareOperationAndEvent(refundOperation, event.eventId)) {
    return { handled: "retryable_error", invoiceId: refundedInvoiceId ?? undefined, depositJobId: refundedJobId ?? undefined };
  }
  return {
    handled: "refunded",
    invoiceId: refundedInvoiceId ?? undefined,
    depositJobId: refundedJobId ?? undefined,
    amountCents: refundedAmount,
  };
}

// ── Deposit reconciliation — record the booking deposit, mark the job ─────────
// Mirrors the invoice path's invariants: idempotent on the Square payment id,
// records the REAL paid amount, verifies currency, alerts on any anomaly
// instead of guessing. Returns null when the order matches no job — the caller
// falls through and the event is ignored (e.g. a POS sale).
async function recordDepositPayment(event: NormalizedPaymentEvent): Promise<ReconcileOutcome | null> {
  const db = canesDb();
  const { data: jobRow, error: jobLookupError } = await db
    .from("jobs")
    .select(
      "id, estimate_id, lead_id, status, job_name, customer_name, deposit_cents, deposit_link_id, deposit_paid_at, deposit_square_payment_id",
    )
    .eq("deposit_order_id", event.squareOrderId as string)
    .maybeSingle();
  if (jobLookupError) {
    console.error(
      `[canes] deposit job lookup failed for order ${event.squareOrderId}: ${jobLookupError.message}`,
    );
    return { handled: "retryable_error" };
  }
  if (!jobRow) return null;
  const job = jobRow as {
    id: string;
    estimate_id: string | null;
    lead_id: string | null;
    status: string;
    job_name: string | null;
    customer_name: string | null;
    deposit_cents: number;
    deposit_link_id: string | null;
    deposit_paid_at: string | null;
    deposit_square_payment_id: string | null;
  };
  const { alertOwner } = await import("@/lib/canes/twilio");
  const label = job.customer_name ?? job.job_name ?? "a job";

  // Amount + currency verification BEFORE any money is recorded — same rule as
  // invoices: a non-positive amount or non-USD currency never touches the
  // ledger.
  const amount = event.amountCents ?? 0;
  const amountOk = validPaymentCents(amount);
  const currencyOk = event.currency === "USD";
  if (!amountOk || !currencyOk) {
    const issue = !amountOk
      ? "no valid amount"
      : event.currency ? `currency ${event.currency}` : "no currency";
    const detail = `Deposit payment event for ${label} had ${issue}. Review it in Square before treating the deposit as paid.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-invalid:${event.squarePaymentId ?? event.eventId}`,
        jobId: job.id,
        title: "Invalid deposit payment",
        detail,
      }),
    ]);
    await markEventProcessed(event.eventId);
    return { handled: "amount_mismatch", depositJobId: job.id };
  }

  const paymentId = event.squarePaymentId as string;
  // Attach to the job's live invoice when one already exists (a deposit paid
  // after completion) so the bill's paid cache credits it immediately.
  const operation = await prepareSquareFinancialOperation({
    kind: "deposit",
    sourceId: paymentId,
    eventId: event.eventId,
    jobId: job.id,
  });
  if (!operation || operation.outcome === "busy" || operation.outcome === "invalid") {
    return { handled: "retryable_error", depositJobId: job.id };
  }
  if (operation.outcome === "duplicate") {
    await markEventProcessed(event.eventId);
    return {
      handled: "duplicate",
      depositJobId: operation.jobId ?? job.id,
      invoiceId: operation.invoiceId ?? undefined,
      amountCents: amount,
    };
  }
  if (operation.outcome === "resume_effects") {
    return resumeFinalizedDepositEffects(event, operation);
  }
  const { data: liveInvoice, error: liveInvoiceError } = await db
      .from("invoices")
      .select("id")
      .eq("job_id", job.id)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (liveInvoiceError || (liveInvoice?.id ?? null) !== operation.invoiceId) {
    return { handled: "retryable_error", depositJobId: job.id };
  }
  const invoice = operation.invoiceId ? await getInvoice(operation.invoiceId) : null;
  if (
    operation.invoiceId &&
    (!invoice || invoice.square_invoice_id !== operation.squareInvoiceId)
  ) {
    return { handled: "retryable_error", depositJobId: job.id, invoiceId: operation.invoiceId };
  }
  const publishedInvoiceId = operation.squareInvoiceId;
  if (publishedInvoiceId) {
    // The hosted Square invoice was priced before this late booking deposit.
    // Retire it before changing the local balance; otherwise its old URL can
    // still collect the pre-deposit total and overcharge the customer.
    const retirement = await retireSquareInvoice(
      publishedInvoiceId,
      { reconcileMoney: true },
    );
    if (retirement === "error") {
      const detail = `A late deposit reached ${invoice?.number ?? "an invoice"}, but its old Square payment page could not be disabled. Do not resend that invoice link; reconciliation will retry automatically.`;
      await Promise.all([
        alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
        pushPaymentIssue({
          eventId: `late-deposit-square-live:${paymentId}`,
          invoiceId: invoice?.id ?? operation.invoiceId,
          jobId: job.id,
          title: "Old invoice link may still charge",
          detail,
        }),
      ]);
      return { handled: "retryable_error", depositJobId: job.id, invoiceId: invoice?.id };
    }
  }
  if (!await requireDepositLinkRetired({
    jobId: job.id,
    paymentId,
    invoiceId: operation.invoiceId,
    customerLabel: label,
  })) {
    return { handled: "retryable_error", depositJobId: job.id, invoiceId: operation.invoiceId ?? undefined };
  }
  const { data: depositRows, error: depositError } = await db.rpc(
    "record_square_deposit_payment_locked",
    {
      p_job_id: job.id,
      p_invoice_id: operation.invoiceId,
      p_amount_cents: amount,
      p_currency: event.currency,
      p_square_payment_id: paymentId,
      p_square_order_id: event.squareOrderId,
      p_event_id: event.eventId,
    },
  );
  if (depositError) {
    console.error(`[canes] deposit payment claim failed for job ${job.id}: ${depositError.message}`);
    return { handled: "retryable_error", depositJobId: job.id };
  }
  const depositClaim = (depositRows?.[0] ?? null) as {
    payment_id: string | null;
    inserted: boolean;
    first_payment: boolean;
    owned_event: boolean;
    same_event: boolean;
    invoice_id: string | null;
  } | null;
  if (!depositClaim) {
    return { handled: "retryable_error", depositJobId: job.id };
  }
  if (!depositClaim.owned_event) {
    if (!await finalizeSquareFinancialOperation(operation.operationKey, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    const detail = `Square reused payment ${paymentId} against a different ledger record while processing ${label}. Review the payment ledger before changing the job.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-collision:${paymentId}:${event.eventId}`,
        jobId: job.id,
        title: "Deposit payment conflict",
        detail,
      }),
    ]);
    if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    return { handled: "amount_mismatch", depositJobId: job.id };
  }

  const settledInvoice = depositClaim.invoice_id
    ? invoice?.id === depositClaim.invoice_id
      ? invoice
      : await getInvoice(depositClaim.invoice_id)
    : null;
  if (depositClaim.invoice_id && !settledInvoice) {
    return {
      handled: "retryable_error",
      depositJobId: job.id,
      invoiceId: depositClaim.invoice_id,
    };
  }

  const secondPayment = !depositClaim.first_payment;
  let invoiceSettlement: InvoicePaidRecomputeResult | null = null;
  let invoiceSettledByThisEvent = false;
  let replacementInvoiceRequired = false;
  if (settledInvoice) {
    invoiceSettlement = await recomputeInvoicePaid(settledInvoice.id);
    if (!invoiceSettlement) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    invoiceSettledByThisEvent = invoiceSettlement.fullyPaid &&
      invoiceSettlement.overpaidCents === 0 &&
      (depositClaim.inserted || depositClaim.same_event || operation.outcome === "resume");
    if (invoiceSettledByThisEvent) {
      const settlementEventId = `invoice-settled:${settledInvoice.id}:${invoiceSettlement.settlementGeneration}`;
      await cancelPendingInvoiceTasks(settledInvoice.id);
      await pushInvoicePaid({
        eventId: settlementEventId,
        invoiceId: settledInvoice.id,
        invoiceNumber: settledInvoice.number,
        customerName: settledInvoice.customer_name,
        amountCents: amount,
      });
      await enqueueInvoicePaymentEmails({
        eventId: settlementEventId,
        invoiceId: settledInvoice.id,
        method: "card",
      });
    }
    if (publishedInvoiceId) {
      if (invoiceSettlement.fullyPaid && invoiceSettlement.overpaidCents === 0) {
        await db
          .from("invoices")
          .update({ hosted_payment_url: null, updated_at: new Date().toISOString() })
          .eq("id", settledInvoice.id);
      } else {
        const retiredAt = new Date().toISOString();
        const { error: retireError } = await db
          .from("invoices")
          .update({
            status: "void",
            hosted_payment_url: null,
            paid_at: null,
            voided_at: retiredAt,
            billing_operation_id: null,
            billing_operation_started_at: null,
            updated_at: retiredAt,
          })
          .eq("id", settledInvoice.id)
          .neq("status", "paid");
        if (retireError) {
          console.error(`[canes] late-deposit invoice retirement failed for ${settledInvoice.id}: ${retireError.message}`);
          return { handled: "retryable_error", depositJobId: job.id, invoiceId: settledInvoice.id };
        }
        if (settledInvoice.job_id) {
          await db
            .from("jobs")
            .update({ status: "completed" })
            .eq("id", settledInvoice.job_id)
            .in("status", ["invoiced", "paid"]);
        }
        await cancelPendingInvoiceTasks(settledInvoice.id);
        replacementInvoiceRequired = true;
      }
    }
  }
  if (
    !depositClaim.inserted &&
    !depositClaim.same_event &&
    operation.outcome !== "resume"
  ) {
    if (!await finalizeSquareFinancialOperation(operation.operationKey, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    return {
      handled: "duplicate",
      depositJobId: job.id,
      invoiceId: invoiceSettledByThisEvent ? settledInvoice?.id : undefined,
      amountCents: amount,
    };
  }
  if (!await finalizeSquareFinancialOperation(operation.operationKey, event.eventId)) {
    return {
      handled: "retryable_error",
      depositJobId: job.id,
      invoiceId: depositClaim.invoice_id ?? undefined,
    };
  }

  const { data: currentJob } = await db
    .from("jobs")
    .select("status")
    .eq("id", job.id)
    .maybeSingle();
  if (currentJob?.status === "canceled" || job.status === "canceled") {
    const detail = `A deposit of ${fmtMoney(amount)} arrived after ${label}'s job was canceled. The payment is recorded, but it needs a refund review in Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-canceled-job:${paymentId}`,
        jobId: job.id,
        invoiceId: settledInvoice?.id,
        title: "Payment on canceled job",
        detail,
      }),
    ]);
    if (job.estimate_id) {
      await enqueueDepositPaymentEmail({
        eventId: `square:${event.eventId}`,
        estimateId: job.estimate_id,
        amountCents: amount,
      });
    }
    if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id, invoiceId: settledInvoice?.id };
    }
    return {
      handled: "amount_mismatch",
      depositJobId: job.id,
      invoiceId: settledInvoice?.id,
      amountCents: amount,
    };
  }

  if (secondPayment) {
    const detail = `A second deposit payment of ${fmtMoney(amount)} arrived for ${label}. Likely a double charge — refund it from Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-second:${paymentId}`,
        jobId: job.id,
        title: "Possible double deposit",
        detail,
      }),
    ]);
    if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    return { handled: "amount_mismatch", depositJobId: job.id, amountCents: amount };
  }
  if (amount !== Math.round(job.deposit_cents)) {
    const detail = `Deposit of ${fmtMoney(amount)} for ${label} doesn't match the ${fmtMoney(job.deposit_cents)} requested. Review it in Square.`;
    await Promise.all([
      alertOwner(`⚠️ ${detail}`, { alreadyPushed: true }),
      pushPaymentIssue({
        eventId: `square-deposit-amount:${paymentId}`,
        jobId: job.id,
        title: "Deposit amount mismatch",
        detail,
      }),
    ]);
    if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
      return { handled: "retryable_error", depositJobId: job.id };
    }
    return { handled: "amount_mismatch", depositJobId: job.id, amountCents: amount };
  }
  await Promise.all([
    alertOwner(`💰 Deposit ${fmtMoney(amount)} received from ${label}. The job is ready to schedule.`, { alreadyPushed: true }),
    pushDepositReceived({
      eventId: `square:${paymentId}`,
      estimateId: job.estimate_id,
      jobId: job.id,
      customerName: job.customer_name,
      amountCents: amount,
    }),
  ]);
  if (replacementInvoiceRequired && settledInvoice) {
    const detail = `The late deposit was recorded and ${settledInvoice.number}'s old Square page was canceled. Create a replacement invoice for the corrected remaining balance.`;
    await pushPaymentIssue({
      eventId: `late-deposit-reissue:${paymentId}`,
      invoiceId: settledInvoice.id,
      jobId: job.id,
      title: "Deposit recorded — reissue invoice",
      detail,
    });
  }
  if (job.lead_id) {
    await db
      .from("events")
      .insert({ lead_id: job.lead_id, kind: "invoice", detail: `Deposit ${fmtMoney(amount)} paid (card)` });
  }
  if (job.estimate_id) {
    await enqueueDepositPaymentEmail({
      eventId: `square:${event.eventId}`,
      estimateId: job.estimate_id,
      amountCents: amount,
    });
  }
  if (!await finishSquareOperationAndEvent(operation, event.eventId)) {
    return { handled: "retryable_error", depositJobId: job.id, invoiceId: settledInvoice?.id };
  }
  return {
    handled: replacementInvoiceRequired ? "amount_mismatch" : "recorded",
    depositJobId: job.id,
    invoiceId: invoiceSettledByThisEvent ? invoice?.id : undefined,
    amountCents: amount,
  };
}

// Cancel a published Square invoice so its hosted pay link can no longer take a
// (duplicate) card payment after we've collected cash. Best-effort, gated.
// Returns true ONLY when Square confirmed the invoice is canceled (or already
// was) — callers that want to sever their link to this id (clearing
// square_invoice_id would break webhook matching for any in-flight payment)
// must require a true here. A false means the link may still be live: keep the
// ids so a late payment still matches and raises the double-payment alert.
export type SquareInvoiceRetirement =
  | "canceled"
  | "canceled_money_bearing"
  | "failed"
  | "paid"
  | "refunded"
  | "payment_pending"
  | "error";

export async function retireSquareInvoice(
  squareInvoiceId: string,
  options?: { reconcileMoney?: boolean },
): Promise<SquareInvoiceRetirement> {
  if (!squareConfigured()) return "error";
  const accessToken = process.env.CANES_SQUARE_ACCESS_TOKEN as string;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
  try {
    const getRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    const getJson = (await getRes.json()) as Record<string, unknown>;
    const sqInvoice = (getJson.invoice ?? {}) as Record<string, unknown>;
    if (!getRes.ok) return "error";
    // These terminal states are confirmed non-chargeable. Square rejects a
    // cancel request for them, but the safety property callers need is that
    // the hosted page cannot collect another payment.
    if (String(sqInvoice.status) === "CANCELED") return "canceled";
    if (String(sqInvoice.status) === "FAILED") return "failed";
    // PAID/REFUNDED means money moved. Until its webhook is reconciled, local
    // cash/void/refund workflows must stop instead of treating it as canceled.
    if (String(sqInvoice.status) === "PAID") return "paid";
    if (String(sqInvoice.status) === "REFUNDED") return "refunded";
    const moneyBearing = ["PARTIALLY_PAID", "PARTIALLY_REFUNDED", "PAYMENT_PENDING"]
      .includes(String(sqInvoice.status));
    if (moneyBearing && !options?.reconcileMoney) return "payment_pending";
    const version = sqInvoice.version;
    if (typeof version !== "number") return "error";
    const cancelRes = await fetch(`${SQUARE_API_BASE}/v2/invoices/${squareInvoiceId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!cancelRes.ok) {
      console.error(
        `[canes] square invoice cancel rejected for ${squareInvoiceId}: ${cancelRes.status} ${await cancelRes.text().catch(() => "")}`,
      );
      return "error";
    }
    return moneyBearing ? "canceled_money_bearing" : "canceled";
  } catch (err) {
    console.error(`[canes] square invoice cancel failed for ${squareInvoiceId}:`, err);
    return "error";
  }
}

// Manual cash/void/reward operations require a true cancellation state. A
// remote PAID/REFUNDED invoice is non-chargeable, but money moved and must be
// reconciled before another local financial mutation is allowed.
export async function cancelSquareInvoice(squareInvoiceId: string): Promise<boolean> {
  const outcome = await retireSquareInvoice(squareInvoiceId);
  return outcome === "canceled" || outcome === "failed";
}

async function markEventProcessed(eventId: string): Promise<void> {
  const { error } = await canesDb()
    .from("square_webhook_events")
    .update({ processed: true, processing_started_at: null })
    .eq("event_id", eventId);
  if (error) throw new Error(`square event completion failed for ${eventId}: ${error.message}`);
}

export type InvoicePaidRecomputeResult = {
  paidCents: number;
  totalCents: number;
  fullyPaid: boolean;
  newlySettled: boolean;
  newlyUnsettled: boolean;
  overpaidCents: number;
  settlementGeneration: number;
  invoiceStatus: string;
};

// Recompute an invoice's paid cache from the ledger, and settle it (invoice +
// job → paid) under the same advisory lock as cumulative Square writes. Shared
// by cash + card paths. The claim result lets webhook callers notify only the
// one delivery that actually changed the invoice to paid.
export async function recomputeInvoicePaid(
  invoiceId: string,
): Promise<InvoicePaidRecomputeResult | null> {
  const { data, error } = await canesDb().rpc("recompute_invoice_paid_locked", {
    p_invoice_id: invoiceId,
  });
  if (error) {
    console.error(`[canes] invoice payment recompute failed for ${invoiceId}: ${error.message}`);
    return null;
  }
  const row = (data?.[0] ?? null) as {
    paid_cents: number;
    total_cents: number;
    fully_paid: boolean;
    newly_settled: boolean;
    newly_unsettled: boolean;
    overpaid_cents: number;
    settlement_generation: number;
    invoice_status: string;
    invoice_number: string;
    customer_name: string | null;
  } | null;
  if (!row) return null;
  const result: InvoicePaidRecomputeResult = {
    paidCents: Number(row.paid_cents),
    totalCents: Number(row.total_cents),
    fullyPaid: Boolean(row.fully_paid),
    newlySettled: Boolean(row.newly_settled),
    newlyUnsettled: Boolean(row.newly_unsettled),
    overpaidCents: Number(row.total_cents) > 0 ? Number(row.overpaid_cents) : 0,
    settlementGeneration: Number(row.settlement_generation ?? 0),
    invoiceStatus: row.invoice_status,
  };

  // Overpayment flag: the ledger holds more than the bill (e.g. a card payment
  // made from a stale link after a review-reward discount lowered the total).
  // The push key derives from the locked ledger state, not the webhook event,
  // so every recompute of the same overpayment is deduped while a larger
  // overpay creates a new alert.
  if (result.overpaidCents > 0) {
    const { alertOwner } = await import("@/lib/canes/twilio");
    const detail = `${row.invoice_number} has ${fmtMoney(result.paidCents)} collected against ${fmtMoney(result.totalCents)} billed. A refund of ${fmtMoney(result.overpaidCents)} may be owed.`;
    const pushed = await pushPaymentIssue({
      eventId: `invoice-overpay:${invoiceId}:${result.paidCents}:${result.totalCents}`,
      invoiceId,
      title: "Invoice overpaid",
      detail,
    });
    // The push event row is also the durable owner-SMS dedupe claim. Even when
    // no device is enabled, the first call records a skipped event; later
    // recomputes then return "duplicate" and cannot text the same warning again.
    if (pushed.skipped !== "duplicate") {
      await alertOwner(
        `⚠️ Overpaid: ${fmtMoney(result.paidCents)} collected on an invoice billed at ${fmtMoney(result.totalCents)}. A refund of ${fmtMoney(result.overpaidCents)} may be owed.`,
        { alreadyPushed: true },
      );
    }
  }
  return result;
}
