// Resend transport for the cron health emails. Sent after every scheduled run
// so the server is never a black box. Best-effort by design: a mail failure is
// logged and swallowed — it must never break the cron that triggered it.
//
// Env: RESEND_API (the key — note: not RESEND_API_KEY), optional CRON_EMAIL_FROM
// (must be a domain verified in Resend) and CRON_EMAIL_TO (comma-separated).

import { Resend } from "resend";
import { CronReportEmail, type CronReportProps } from "@/emails/cron-report";

const FROM = process.env.CRON_EMAIL_FROM ?? "Urso Server <server@urso.ws>";
const TO = (process.env.CRON_EMAIL_TO ?? "han@urso.ws,guga@urso.ws")
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
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject: `Urso · ${input.job} · ${input.status === "success" ? "OK" : "FAILED"}`,
      react: <CronReportEmail {...props} />,
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
