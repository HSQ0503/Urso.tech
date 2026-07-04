import { Resend } from "resend";
import { fmtPhone } from "@/lib/canes/types";
import type { Lead } from "@/lib/canes/types";

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.tech";

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
