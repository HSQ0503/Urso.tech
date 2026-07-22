import { sendSms as twilioSend, validateSignature } from "@/lib/twilio";
import { canesDb, canesConfigured, twilioConfigured } from "@/lib/canes/supabase";
import { getSettings } from "@/lib/canes/data";
import type { CanesSettings } from "@/lib/canes/types";

// Canes-scoped Twilio helpers layered on the shared raw-REST lib. All sends go
// through sendCanesSms so quiet hours, opt-outs, and message logging are never
// bypassed. Credentials are the CANES_* env vars (separate Twilio account or
// subaccount from anything Woof Gang does later).

export { validateSignature };

export function canesTwilioCreds() {
  return {
    accountSid: process.env.CANES_TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.CANES_TWILIO_AUTH_TOKEN ?? "",
    from: process.env.CANES_TWILIO_NUMBER ?? "",
  };
}

// Twilio POSTs queued→sent→delivered/undelivered transitions here, and the
// status route stamps them onto the message row — so a carrier-filtered text
// (e.g. pre-A2P error 30034) shows "Not delivered" in the inbox instead of
// silently looking sent.
function statusCallbackUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws").replace(/\/$/, "");
  return `${base}/api/canes/twilio/status`;
}

// Quiet hours run in ET: no automated customer texts late at night. Returns
// null if sending is fine now, else the next allowed Date.
export function nextAllowedSendTime(settings: CanesSettings, now = new Date()): Date | null {
  const { start, end, timezone } = settings.quiet_hours; // e.g. 21 → 8
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(now),
  );
  const inQuiet = start > end ? hour >= start || hour < end : hour >= start && hour < end;
  if (!inQuiet) return null;
  const next = new Date(now);
  // Walk forward hour by hour until we exit the quiet window (max 24 steps).
  for (let i = 0; i < 24; i++) {
    next.setTime(next.getTime() + 3_600_000);
    const h = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(next),
    );
    const stillQuiet = start > end ? h >= start || h < end : h >= start && h < end;
    if (!stillQuiet) {
      next.setMinutes(2, 0, 0); // top of the allowed hour, +2min of slack
      return next;
    }
  }
  return null;
}

export function fillTemplate(
  template: string,
  vars: { name?: string | null; when?: string; address?: string | null },
): string {
  return template
    .replaceAll("{name}", vars.name ? ` ${vars.name.split(" ")[0]}` : "")
    .replaceAll("{when}", vars.when ?? "as scheduled")
    .replaceAll("{address}", vars.address ?? "your property");
}

export type SendResult = { ok: boolean; sid?: string; skipped?: string; error?: string };

// The one true send path. `automated` messages respect quiet hours (unless
// force), human replies from the inbox always send. Logs to `messages`.
export async function sendCanesSms(opts: {
  to: string;
  body: string;
  leadId?: string | null;
  automated?: boolean;
  force?: boolean;
}): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { ok: false, skipped: "Twilio is not configured yet (CANES_TWILIO_* env vars missing)." };
  }
  if (opts.automated && !opts.force) {
    const settings = await getSettings();
    if (nextAllowedSendTime(settings)) {
      return { ok: false, skipped: "quiet_hours" };
    }
  }
  const creds = canesTwilioCreds();
  const res = await twilioSend({
    accountSid: creds.accountSid,
    authToken: creds.authToken,
    from: creds.from,
    to: opts.to,
    body: opts.body,
    statusCallback: statusCallbackUrl(),
  });
  if (canesConfigured()) {
    const row = {
      lead_id: opts.leadId ?? null,
      peer_phone: opts.to,
      direction: "out",
      body: opts.body,
      automated: opts.automated ?? false,
      twilio_sid: res.sid ?? null,
      delivery_status: res.ok ? "queued" : "failed",
    };
    const { error } = await canesDb().from("messages").insert(row);
    // A lead deleted mid-send leaves a dangling lead_id (FK) — keep the
    // outbound record rather than losing it with the lead.
    if (error && row.lead_id) {
      await canesDb().from("messages").insert({ ...row, lead_id: null });
    }
  }
  return res.ok ? { ok: true, sid: res.sid } : { ok: false, error: res.error };
}

// Owner alerts (escalations, digests) go to Sebastian's own phone and are
// exempt from quiet-hours logic — he asked to be woken up by leads, not
// protected from them. No-op when unconfigured.
export async function alertOwner(body: string): Promise<SendResult> {
  const to = process.env.CANES_OWNER_PHONE;
  if (!to) return { ok: false, skipped: "CANES_OWNER_PHONE not set" };
  if (!twilioConfigured()) return { ok: false, skipped: "Twilio not configured" };
  const creds = canesTwilioCreds();
  return twilioSend({ ...creds, from: creds.from, to, body });
}

const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
export function isOptOut(body: string): boolean {
  return STOP_WORDS.test(body);
}

const YES_WORDS = /^\s*(yes|y|yeah|yep|si|sí|confirm|confirmed|ok|okay)\b/i;
export function isConfirmation(body: string): boolean {
  return YES_WORDS.test(body);
}
