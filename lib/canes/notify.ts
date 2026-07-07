import { Resend } from "resend";
import { fmtMoney, fmtPhone } from "@/lib/canes/types";
import type { Estimate, Lead } from "@/lib/canes/types";

// Email alerts for the Canes funnel (cold leads must never sit silently).
// Best-effort like lib/email.tsx: a mail failure logs and never breaks the
// webhook or cron that triggered it. Uses the shared RESEND_API key and the
// verified urso.ws domain; recipient defaults to Han until Sebastian's email
// is set.

const FROM = process.env.CANES_EMAIL_FROM ?? "Canes Platform <server@urso.ws>";
const TO = (process.env.CANES_NOTIFY_EMAIL ?? "han@urso.ws")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

// Lead fields come straight from SMS bodies (vendor texts, unknown numbers) —
// escape everything before it lands in email HTML.
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function leadHtml(lead: Lead, headline: string, urgency: string): string {
  const row = (k: string, v: string | null) =>
    v ? `<tr><td style="padding:4px 12px 4px 0;color:#5B6673;font-size:13px">${k}</td><td style="padding:4px 0;font-size:14px;color:#131B23"><b>${esc(v)}</b></td></tr>` : "";
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px">
    <div style="border-left:4px solid #E8590C;padding:2px 0 2px 14px;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#E8590C;font-weight:700">${esc(urgency)}</div>
      <div style="font-size:19px;font-weight:700;color:#131B23;margin-top:2px">${esc(headline)}</div>
    </div>
    <table cellpadding="0" cellspacing="0">
      ${row("Name", lead.name)}
      ${row("Phone", fmtPhone(lead.phone))}
      ${row("Service", lead.service)}
      ${row("Address", lead.address)}
      ${row("Original text", lead.raw_message)}
    </table>
    <div style="margin-top:18px">
      <a href="${APP_URL}/CanesPressure/leads/${esc(lead.id)}"
         style="background:#0E7490;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;display:inline-block">
        Open lead</a>
      ${lead.phone ? `<a href="tel:${esc(lead.phone)}" style="margin-left:10px;color:#0E7490;font-size:14px;font-weight:600">Call ${esc(fmtPhone(lead.phone))}</a>` : ""}
    </div>
  </div>`;
}

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

export async function notifyColdLead(lead: Lead): Promise<void> {
  await send(
    `📞 Call now — new virtual quote: ${lead.name ?? fmtPhone(lead.phone)}`,
    leadHtml(lead, `${lead.name ?? "New lead"} wants a quote — call while they're shopping`, "Cold lead · call asap"),
  );
}

export async function notifyColdEscalation(lead: Lead, minutes: number): Promise<void> {
  await send(
    `⏰ Still waiting ${minutes}m — ${lead.name ?? fmtPhone(lead.phone)}`,
    leadHtml(lead, `This virtual quote has waited ${minutes} minutes without a call`, "Escalation"),
  );
}

export async function notifyUnconfirmed(lead: Lead, when: string): Promise<void> {
  await send(
    `⚠️ Unconfirmed appointment ${when} — ${lead.name ?? fmtPhone(lead.phone)}`,
    leadHtml(lead, `No YES yet for the ${when} estimate visit — worth a call before driving out`, "Confirmation pending"),
  );
}

export async function sendDigestEmail(subject: string, html: string): Promise<void> {
  await send(subject, html);
}

// ── Estimate emails (Phase 2) ────────────────────────────────────────────────

function estimateRows(e: Estimate): string {
  const row = (k: string, v: string | null) =>
    v ? `<tr><td style="padding:4px 12px 4px 0;color:#5B6673;font-size:13px">${k}</td><td style="padding:4px 0;font-size:14px;color:#131B23"><b>${esc(v)}</b></td></tr>` : "";
  return `
    <table cellpadding="0" cellspacing="0">
      ${row("Estimate", e.number)}
      ${row("Customer", e.customer_name)}
      ${row("Phone", e.customer_phone ? fmtPhone(e.customer_phone) : null)}
      ${row("Address", e.job_address)}
      ${row("Job", e.job_name)}
      ${row("Total", fmtMoney(e.total_cents))}
      ${e.deposit_cents > 0 ? row("Deposit", fmtMoney(e.deposit_cents)) : ""}
    </table>`;
}

// Customer-facing: the estimate is ready to review + approve at its token link.
export async function notifyEstimateSent(estimate: Estimate): Promise<void> {
  if (!estimate.customer_email) return;
  const link = `${APP_URL}/CanesPressure/e/${esc(estimate.public_token)}`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px">
    <div style="border-left:4px solid #0E7490;padding:2px 0 2px 14px;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0E7490;font-weight:700">Your estimate</div>
      <div style="font-size:19px;font-weight:700;color:#131B23;margin-top:2px">Canes Pressure Washing · ${esc(estimate.number)}</div>
    </div>
    <p style="font-size:14px;color:#131B23;margin:0 0 14px">${esc(estimate.message_to_customer)}</p>
    ${estimateRows(estimate)}
    <div style="margin-top:18px">
      <a href="${link}"
         style="background:#0E7490;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;display:inline-block">
        Review &amp; approve</a>
    </div>
  </div>`;
  const key = process.env.RESEND_API;
  if (!key) {
    console.warn("[canes/notify] RESEND_API not set — skipping estimate email:", estimate.number);
    return;
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [estimate.customer_email],
      subject: `Your estimate from Canes Pressure Washing — ${estimate.number}`,
      html,
    });
    if (error) console.error("[canes/notify] resend error:", error);
  } catch (err) {
    console.error("[canes/notify] estimate send failed:", err);
  }
}

// Owner-facing: a customer approved their estimate — job created, get scheduling.
export async function notifyEstimateApproved(estimate: Estimate): Promise<void> {
  const link = `${APP_URL}/CanesPressure/estimates/${esc(estimate.id)}`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px">
    <div style="border-left:4px solid #2F9E44;padding:2px 0 2px 14px;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2F9E44;font-weight:700">Estimate approved</div>
      <div style="font-size:19px;font-weight:700;color:#131B23;margin-top:2px">${esc(estimate.customer_name ?? "Customer")} approved ${esc(estimate.number)}</div>
    </div>
    ${estimateRows(estimate)}
    ${estimate.signature_name ? `<p style="font-size:13px;color:#5B6673;margin:12px 0 0">Signed by <b style="color:#131B23">${esc(estimate.signature_name)}</b></p>` : ""}
    <div style="margin-top:18px">
      <a href="${link}"
         style="background:#0E7490;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;display:inline-block">
        Open estimate</a>
    </div>
  </div>`;
  await send(`✅ Approved — ${estimate.customer_name ?? estimate.number} (${fmtMoney(estimate.total_cents)})`, html);
}

// Owner-facing: a customer declined; no job is created.
export async function notifyEstimateDeclined(estimate: Estimate): Promise<void> {
  const link = `${APP_URL}/CanesPressure/estimates/${esc(estimate.id)}`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px">
    <div style="border-left:4px solid #E8590C;padding:2px 0 2px 14px;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#E8590C;font-weight:700">Estimate declined</div>
      <div style="font-size:19px;font-weight:700;color:#131B23;margin-top:2px">${esc(estimate.customer_name ?? "Customer")} declined ${esc(estimate.number)}</div>
    </div>
    ${estimateRows(estimate)}
    ${estimate.decline_reason ? `<p style="font-size:13px;color:#5B6673;margin:12px 0 0">Reason: <b style="color:#131B23">${esc(estimate.decline_reason)}</b></p>` : ""}
    <div style="margin-top:18px">
      <a href="${link}"
         style="background:#0E7490;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;display:inline-block">
        Open estimate</a>
    </div>
  </div>`;
  await send(`❌ Declined — ${estimate.customer_name ?? estimate.number}`, html);
}
