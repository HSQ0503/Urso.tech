// Resend transport for the cron health emails. Sent after every scheduled run
// so the server is never a black box. Best-effort by design: a mail failure is
// logged and swallowed — it must never break the cron that triggered it.
//
// Env: RESEND_API (the key — note: not RESEND_API_KEY), optional CRON_EMAIL_FROM
// (must be a domain verified in Resend) and CRON_EMAIL_TO (comma-separated).

import { Resend } from "resend";
import { render } from "@react-email/components";
import { CronReportEmail, type CronReportProps } from "@/emails/cron-report";
import { DiscoverySubmissionEmail, type DiscoverySubmission } from "@/emails/discovery-submission";

const FROM = process.env.CRON_EMAIL_FROM ?? "Urso Server <server@urso.ws>";
const TO = (process.env.CRON_EMAIL_TO ?? "han@urso.ws,guga@urso.ws")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Discovery-form lead notifications go to the founders, independent of cron
// routing (so rerouting server-health alerts never redirects leads). Same
// verified domain (urso.ws), brand sender name, reply-to set to the submitter.
const DISCOVERY_FROM = process.env.DISCOVERY_EMAIL_FROM ?? "Urso <hello@urso.ws>";
const DISCOVERY_TO = (process.env.DISCOVERY_EMAIL_TO ?? "han@urso.ws,guga@urso.ws")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nyStamp = () =>
  `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }).format(new Date())} ET`;

export async function sendCronReport(input: Omit<CronReportProps, "ranAt">): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API;
  if (!key) {
    console.warn("[email] RESEND_API not set — skipping cron report");
    return { sent: false, error: "RESEND_API not set" };
  }
  try {
    const resend = new Resend(key);
    const props: CronReportProps = { ...input, ranAt: nyStamp() };
    // Render to HTML here with a STATIC import. Passing resend the `react` prop
    // makes it lazily require @react-email/render at send-time, which Next's
    // serverless file-tracing misses → "Failed to render React component" in
    // prod (the renderer isn't in the function bundle). Rendering ourselves and
    // sending `html` keeps the dependency static and traceable.
    const html = await render(<CronReportEmail {...props} />);
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject: `Urso · ${input.job} · ${input.status === "success" ? "OK" : "FAILED"}`,
      html,
    });
    if (error) {
      const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? JSON.stringify(error);
      console.warn(`[email] cron report send failed: ${msg}`);
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[email] cron report threw: ${msg}`);
    return { sent: false, error: msg };
  }
}

// Notification email for a new discovery-form submission, sent to the founders
// (DISCOVERY_TO) from the brand sender (DISCOVERY_FROM), reply-to the submitter.
// Best-effort: the Supabase row is the source of truth, so a mail failure is
// logged and swallowed — it must never lose the prospect's answers.
export async function sendDiscoverySubmission(input: Omit<DiscoverySubmission, "submittedAt">): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API;
  if (!key) {
    console.warn("[email] RESEND_API not set — skipping discovery notification");
    return { sent: false, error: "RESEND_API not set" };
  }
  try {
    const resend = new Resend(key);
    const props: DiscoverySubmission = { ...input, submittedAt: nyStamp() };
    const subject = `New discovery form — ${input.name}${input.businessName ? ` · ${input.businessName}` : ""}`;
    // Render to HTML with the static `render` import (not resend's `react` prop),
    // which Next's serverless file-tracing misses in prod — see sendCronReport.
    const html = await render(<DiscoverySubmissionEmail {...props} />);
    const { error } = await resend.emails.send({
      from: DISCOVERY_FROM,
      to: DISCOVERY_TO,
      replyTo: input.email,
      subject,
      html,
    });
    if (error) {
      const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? JSON.stringify(error);
      console.warn(`[email] discovery notification send failed: ${msg}`);
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[email] discovery notification threw: ${msg}`);
    return { sent: false, error: msg };
  }
}
