import { Resend } from "resend";
import { render } from "@react-email/components";
import { fmtEt, fmtMoney, fmtPhone, minutesSince } from "@/lib/canes/types";
import type { Estimate, Lead } from "@/lib/canes/types";
import type { Overview } from "@/lib/canes/data";
import { EstimateEmail } from "@/emails/canes/estimate-email";
import { ColdLeadEmail, EscalationEmail, UnconfirmedEmail } from "@/emails/canes/lead-emails";
import { EstimateApprovedEmail, EstimateDeclinedEmail } from "@/emails/canes/estimate-outcome-emails";
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
const TO = (process.env.CANES_NOTIFY_EMAIL ?? "han@urso.ws")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

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
export async function notifyEstimateSent(estimate: Estimate): Promise<void> {
  if (!estimate.customer_email) return;
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
