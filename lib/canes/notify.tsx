import { Resend } from "resend";
import { render } from "@react-email/components";
import { fmtEt, fmtMoney, fmtPhone, invoiceBalanceCents, minutesSince } from "@/lib/canes/types";
import type { Estimate, Invoice, Lead, PaymentMethod } from "@/lib/canes/types";
import type { Overview } from "@/lib/canes/data";
import { EstimateEmail } from "@/emails/canes/estimate-email";
import { ColdLeadEmail, EscalationEmail, UnconfirmedEmail } from "@/emails/canes/lead-emails";
import { DepositPaidOwnerEmail, EstimateApprovedEmail, EstimateDeclinedEmail } from "@/emails/canes/estimate-outcome-emails";
import { InvoiceEmail } from "@/emails/canes/invoice-email";
import { InvoiceReceiptEmail, InvoicePaidOwnerEmail } from "@/emails/canes/invoice-outcome-emails";
import { RewardClaimedEmail } from "@/emails/canes/reward-claimed-email";
import { listInvoiceRewards } from "@/lib/canes/rewards";
import { DigestEmail } from "@/emails/canes/digest-email";

// Email alerts for the Canes funnel (cold leads must never sit silently).
// Best-effort like lib/email.tsx: a mail failure logs and never breaks the
// webhook or cron that triggered it. Uses the shared RESEND_API key and the
// verified urso.ws domain; recipient defaults to Han until Sebastian's email
// is set.
//
// Templates are React Email components under emails/canes/ so they render
// cleanly across Gmail/Apple Mail/Outlook. We render to HTML with the STATIC
// `render` import (not resend's lazy `react` prop) — see lib/email.tsx: passing
// `react` makes resend require @react-email/render at send-time, which Next's
// serverless file-tracing misses in prod ("Failed to render React component").
// Rendering ourselves and sending `html` keeps the dependency static.

const FROM = process.env.CANES_EMAIL_FROM ?? "Canes Platform <server@urso.ws>";

// The business owner. Every owner-facing alert reaches him, always.
// CANES_NOTIFY_EMAIL used to REPLACE this address, which is how every alert —
// new leads, deposits, payments, the 7am digest — ended up going only to Urso
// and never to Sebastian. It now only ADDS recipients, so a stale env var can
// never silence him again.
const OWNER_EMAIL = "canespressurewashing@gmail.com";
const TO = [
  ...new Set([
    OWNER_EMAIL,
    ...(process.env.CANES_NOTIFY_EMAIL ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ]),
];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export type CustomerEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped?: string; error?: string };

function resendErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "Email provider rejected the message.";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Email provider rejected the message.";
}

function shouldRetryResend(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { statusCode?: unknown; name?: unknown };
  const status = typeof candidate.statusCode === "number" ? candidate.statusCode : null;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  return status === 429 || (status !== null && status >= 500) || name === "rate_limit_exceeded" || name === "internal_server_error";
}

async function sendCustomerEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  documentType: "estimate" | "invoice";
  documentId: string;
}): Promise<CustomerEmailResult> {
  const key = process.env.RESEND_API;
  if (!key) return { ok: false, skipped: "Email delivery is not configured." };

  const resend = new Resend(key);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data, error } = await resend.emails.send(
        {
          from: FROM,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          tags: [
            { name: "document_type", value: input.documentType },
            { name: "document_id", value: input.documentId },
          ],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (!error && data?.id) return { ok: true, id: data.id };
      lastError = error;
      if (!shouldRetryResend(error) || attempt === 2) break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  const message = resendErrorMessage(lastError);
  console.error(`[canes/notify] ${input.documentType} email failed:`, message);
  return { ok: false, error: message };
}

// Owner-facing send: subject + pre-rendered HTML to the notify list. Best-effort
// — skips without a key, swallows every error, never throws into the caller.
async function send(subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API;
  if (!key) {
    console.warn("[canes/notify] RESEND_API not set — skipping email:", subject);
    return;
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from: FROM, to: TO, subject, html });
    if (error) console.error("[canes/notify] resend error:", error);
  } catch (err) {
    console.error("[canes/notify] send failed:", err);
  }
}

const leadUrl = (lead: Lead) => `${APP_URL}/CanesPressure/leads/${lead.id}`;
const estimateUrl = (e: Estimate) => `${APP_URL}/CanesPressure/estimates/${e.id}`;
const invoiceUrl = (i: Invoice) => `${APP_URL}/CanesPressure/invoices/${i.id}`;
const invoicePayUrl = (i: Invoice) => `${APP_URL}/CanesPressure/i/${i.public_token}`;

export async function notifyColdLead(lead: Lead): Promise<void> {
  const html = await render(
    <ColdLeadEmail
      name={lead.name}
      phone={lead.phone ? fmtPhone(lead.phone) : null}
      service={lead.service}
      address={lead.address}
      rawMessage={lead.raw_message}
      openUrl={leadUrl(lead)}
    />,
  );
  await send(`📞 Call now — new virtual quote: ${lead.name ?? fmtPhone(lead.phone)}`, html);
}

export async function notifyColdEscalation(lead: Lead, minutes: number): Promise<void> {
  const html = await render(
    <EscalationEmail
      name={lead.name}
      phone={lead.phone ? fmtPhone(lead.phone) : null}
      service={lead.service}
      address={lead.address}
      rawMessage={lead.raw_message}
      openUrl={leadUrl(lead)}
      minutes={minutes}
    />,
  );
  await send(`⏰ Still waiting ${minutes}m — ${lead.name ?? fmtPhone(lead.phone)}`, html);
}

export async function notifyUnconfirmed(lead: Lead, when: string): Promise<void> {
  const html = await render(
    <UnconfirmedEmail
      name={lead.name}
      phone={lead.phone ? fmtPhone(lead.phone) : null}
      service={lead.service}
      address={lead.address}
      rawMessage={lead.raw_message}
      openUrl={leadUrl(lead)}
      when={when}
    />,
  );
  await send(`⚠️ Unconfirmed appointment ${when} — ${lead.name ?? fmtPhone(lead.phone)}`, html);
}

// ── Daily digest ─────────────────────────────────────────────────────────────

// Render the morning DigestEmail to HTML. Kept here (not in the cron) so all
// Canes email presentation lives with the templates; the cron passes the same
// overview/appts/dayLabel it already computes. `sendDigestEmail` below stays a
// plain subject+html passthrough so its caller signature is unchanged.
export async function renderDigestHtml(o: Overview, appts: Lead[], dayLabel: string): Promise<string> {
  return render(
    <DigestEmail
      dayLabel={dayLabel}
      counts={o.counts}
      dashboardUrl={`${APP_URL}/CanesPressure`}
      appointments={appts.map((l) => ({
        time: fmtEt(l.appointment_at, { hour: "numeric", minute: "2-digit" }),
        who: l.name ?? fmtPhone(l.phone),
        address: l.address,
        confirmed: l.status === "confirmed",
        href: leadUrl(l),
      }))}
      cold={o.coldNeedingCall.map((l) => ({
        who: l.name ?? fmtPhone(l.phone),
        service: l.service,
        phone: fmtPhone(l.phone),
        waiting: `waiting ${minutesSince(l.created_at)}m`,
        href: leadUrl(l),
      }))}
      followUps={o.followUpsDue.map((l) => ({
        who: l.name ?? fmtPhone(l.phone),
        service: l.service,
        lastActivity: `last activity ${fmtEt(l.last_activity_at)}`,
        href: leadUrl(l),
      }))}
    />,
  );
}

export async function sendDigestEmail(subject: string, html: string): Promise<void> {
  await send(subject, html);
}

// ── Estimate emails (Phase 2) ────────────────────────────────────────────────

// Customer-facing: the estimate is ready to review + approve at its token link.
export async function notifyEstimateSent(estimate: Estimate, deliveryId = estimate.id): Promise<CustomerEmailResult> {
  if (!estimate.customer_email) return { ok: false, skipped: "No email address is on file." };
  try {
    const html = await render(
      <EstimateEmail
        number={estimate.number}
        customerName={estimate.customer_name}
        customerPhone={estimate.customer_phone ? fmtPhone(estimate.customer_phone) : null}
        jobAddress={estimate.job_address}
        jobName={estimate.job_name}
        total={fmtMoney(estimate.total_cents)}
        deposit={estimate.deposit_cents > 0 ? fmtMoney(estimate.deposit_cents) : null}
        message={estimate.message_to_customer}
        reviewUrl={`${APP_URL}/CanesPressure/e/${estimate.public_token}`}
      />,
    );
    return sendCustomerEmail({
      to: estimate.customer_email,
      subject: `Your estimate from Canes Pressure Washing — ${estimate.number}`,
      html,
      idempotencyKey: `estimate-send/${estimate.id}/${deliveryId}`,
      documentType: "estimate",
      documentId: estimate.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[canes/notify] estimate render failed:", message);
    return { ok: false, error: message };
  }
}

// Owner-facing: a customer approved their estimate — job created, get scheduling.
export async function notifyEstimateApproved(estimate: Estimate): Promise<void> {
  const html = await render(
    <EstimateApprovedEmail
      number={estimate.number}
      customerName={estimate.customer_name}
      customerPhone={estimate.customer_phone ? fmtPhone(estimate.customer_phone) : null}
      jobAddress={estimate.job_address}
      jobName={estimate.job_name}
      total={fmtMoney(estimate.total_cents)}
      deposit={estimate.deposit_cents > 0 ? fmtMoney(estimate.deposit_cents) : null}
      openUrl={estimateUrl(estimate)}
      signatureName={estimate.signature_name}
    />,
  );
  await send(`✅ Approved — ${estimate.customer_name ?? estimate.number} (${fmtMoney(estimate.total_cents)})`, html);
}

// Owner-facing: the booking deposit landed (0013). Fired by the Square webhook
// when a deposit Payment Link payment reconciles; `amountCents` is the amount
// actually paid, which the email shows as the deposit figure.
export async function notifyDepositPaid(estimate: Estimate, amountCents: number): Promise<void> {
  const html = await render(
    <DepositPaidOwnerEmail
      number={estimate.number}
      customerName={estimate.customer_name}
      customerPhone={estimate.customer_phone ? fmtPhone(estimate.customer_phone) : null}
      jobAddress={estimate.job_address}
      jobName={estimate.job_name}
      total={fmtMoney(estimate.total_cents)}
      deposit={fmtMoney(amountCents)}
      openUrl={estimateUrl(estimate)}
    />,
  );
  await send(`💰 Deposit paid — ${estimate.customer_name ?? estimate.number} (${fmtMoney(amountCents)})`, html);
}

// Owner-facing: a customer declined; no job is created.
export async function notifyEstimateDeclined(estimate: Estimate): Promise<void> {
  const html = await render(
    <EstimateDeclinedEmail
      number={estimate.number}
      customerName={estimate.customer_name}
      customerPhone={estimate.customer_phone ? fmtPhone(estimate.customer_phone) : null}
      jobAddress={estimate.job_address}
      jobName={estimate.job_name}
      total={fmtMoney(estimate.total_cents)}
      deposit={estimate.deposit_cents > 0 ? fmtMoney(estimate.deposit_cents) : null}
      openUrl={estimateUrl(estimate)}
      declineReason={estimate.decline_reason}
    />,
  );
  await send(`❌ Declined — ${estimate.customer_name ?? estimate.number}`, html);
}

// ── Invoice emails (Phase 2.5) ────────────────────────────────────────────────

// Customer-facing: the invoice is ready to view + pay at its token link.
export async function notifyInvoiceSent(invoice: Invoice, deliveryId = invoice.id): Promise<CustomerEmailResult> {
  if (!invoice.customer_email) return { ok: false, skipped: "No email address is on file." };
  try {
    const balance = invoiceBalanceCents(invoice);
    let rewardLines: string[] = [];
    try {
      rewardLines = (await listInvoiceRewards(invoice.id))
        .filter((reward) => reward.status === "offered" || reward.status === "claimed")
        .map((reward) => `${fmtMoney(reward.amount_cents)} off — ${reward.label}`);
    } catch (error) {
      console.error("[canes/notify] reward lines failed:", error);
    }
    const html = await render(
      <InvoiceEmail
        number={invoice.number}
        customerName={invoice.customer_name}
        customerPhone={invoice.customer_phone ? fmtPhone(invoice.customer_phone) : null}
        jobAddress={invoice.job_address}
        jobName={invoice.job_name}
        total={fmtMoney(invoice.total_cents)}
        balance={balance > 0 ? fmtMoney(balance) : null}
        message={invoice.message_to_customer}
        payUrl={invoicePayUrl(invoice)}
        rewardLines={rewardLines}
      />,
    );
    return sendCustomerEmail({
      to: invoice.customer_email,
      subject: `Your invoice from Canes Pressure Washing — ${invoice.number}`,
      html,
      idempotencyKey: `invoice-send/${invoice.id}/${deliveryId}`,
      documentType: "invoice",
      documentId: invoice.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[canes/notify] invoice render failed:", message);
    return { ok: false, error: message };
  }
}

// Customer-facing receipt when an invoice is paid (card or cash). No-ops without
// an email on file.
export async function notifyInvoiceReceipt(invoice: Invoice, method: PaymentMethod): Promise<void> {
  if (!invoice.customer_email) return;
  const html = await render(
    <InvoiceReceiptEmail
      number={invoice.number}
      customerName={invoice.customer_name}
      jobName={invoice.job_name}
      jobAddress={invoice.job_address}
      total={fmtMoney(invoice.total_cents)}
      method={method}
      paidOn={invoice.paid_at ? fmtEt(invoice.paid_at, { month: "short", day: "numeric", year: "numeric" }) : null}
    />,
  );
  const key = process.env.RESEND_API;
  if (!key) return;
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [invoice.customer_email],
      subject: `Payment received — ${invoice.number}`,
      html,
    });
    if (error) console.error("[canes/notify] resend error:", error);
  } catch (err) {
    console.error("[canes/notify] invoice receipt failed:", err);
  }
}

// Owner-facing: money in.
export async function notifyInvoicePaid(invoice: Invoice, method: PaymentMethod): Promise<void> {
  const html = await render(
    <InvoicePaidOwnerEmail
      number={invoice.number}
      customerName={invoice.customer_name}
      jobName={invoice.job_name}
      total={fmtMoney(invoice.total_cents)}
      method={method}
      openUrl={invoiceUrl(invoice)}
    />,
  );
  await send(
    `💵 Paid (${method}) — ${invoice.customer_name ?? invoice.number} (${fmtMoney(invoice.total_cents)})`,
    html,
  );
}

// Owner alert when a customer claims a review reward (0012) — the "go verify
// the review exists, then approve or decline" prompt. Nothing is discounted
// until the owner approves on the invoice page.
export async function notifyRewardClaimed(
  invoice: Invoice,
  rewardLabel: string,
  amountCents: number,
): Promise<void> {
  const html = await render(
    <RewardClaimedEmail
      customerName={invoice.customer_name}
      invoiceNumber={invoice.number}
      rewardLabel={rewardLabel}
      amount={fmtMoney(amountCents)}
      openUrl={invoiceUrl(invoice)}
    />,
  );
  await send(
    `⭐ Verify review — ${invoice.customer_name ?? invoice.number} claims ${rewardLabel} (−${fmtMoney(amountCents)})`,
    html,
  );
}
