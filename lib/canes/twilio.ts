import { randomUUID } from "node:crypto";
import { isOptIn, isOptOut, sendSms as twilioSend, validateSignature } from "@/lib/twilio";
import { canesDb, canesConfigured, twilioConfigured } from "@/lib/canes/supabase";
import { ownerHasPushDevice, sendCanesPush, type CanesPush } from "@/lib/canes/push";
import { getSettings } from "@/lib/canes/data";
import { toE164, type CanesSettings } from "@/lib/canes/types";

// Canes-scoped Twilio helpers layered on the shared raw-REST lib. All sends go
// through sendCanesSms so quiet hours, opt-outs, and message logging are never
// bypassed. Credentials are the CANES_* env vars (separate Twilio account or
// subaccount from anything Woof Gang does later).

export { isOptIn, isOptOut, validateSignature };

export function canesTwilioCreds() {
  return {
    accountSid: process.env.CANES_TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.CANES_TWILIO_AUTH_TOKEN ?? "",
    from: process.env.CANES_TWILIO_NUMBER ?? "",
  };
}

export function canesVoiceNumber(): string {
  return process.env.CANES_TWILIO_VOICE_NUMBER ?? process.env.CANES_TWILIO_NUMBER ?? "";
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

async function checkSmsConsent(to: string): Promise<SendResult | null> {
  if (!canesConfigured()) {
    return { ok: false, error: "SMS blocked because customer consent could not be verified." };
  }

  const phone = toE164(to) ?? to.trim();
  const { data, error } = await canesDb()
    .from("leads")
    .select("opted_out")
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error(`[canes] SMS consent lookup failed for ${phone}: ${error.message}`);
    return { ok: false, error: "SMS blocked because customer consent could not be verified." };
  }
  if (data?.opted_out === true) {
    return { ok: false, skipped: "This customer opted out of texts." };
  }
  return null;
}

// The one true send path. `automated` messages respect quiet hours (unless
// force), human replies from the inbox always send. Logs to `messages`.
export async function sendCanesSms(opts: {
  to: string;
  body: string;
  mediaUrls?: string[];
  storedMediaUrls?: string[];
  leadId?: string | null;
  automated?: boolean;
  force?: boolean;
  beforeSend?: () => Promise<boolean>;
}): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { ok: false, skipped: "Twilio is not configured yet (CANES_TWILIO_* env vars missing)." };
  }
  const consentRefusal = await checkSmsConsent(opts.to);
  if (consentRefusal) return consentRefusal;
  if (opts.automated && !opts.force) {
    const settings = await getSettings();
    if (nextAllowedSendTime(settings)) {
      return { ok: false, skipped: "quiet_hours" };
    }
  }
  // Appointment tasks can be canceled while consent/settings are being read.
  if (opts.beforeSend && !(await opts.beforeSend())) {
    return { ok: false, skipped: "superseded" };
  }
  const creds = canesTwilioCreds();
  const to = toE164(opts.to) ?? opts.to.trim();
  const res = await twilioSend({
    accountSid: creds.accountSid,
    authToken: creds.authToken,
    from: creds.from,
    to,
    body: opts.body,
    mediaUrls: opts.mediaUrls,
    statusCallback: statusCallbackUrl(),
  });
  if (canesConfigured()) {
    const row = {
      lead_id: opts.leadId ?? null,
      peer_phone: to,
      direction: "out",
      body: opts.body,
      media_urls: opts.storedMediaUrls ?? [],
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

// Owner alerts (escalations, digests, Square warnings) reach Sebastian by PUSH
// first and by SMS only when no owner device is registered.
//
// Why: the business line is now the A2P-registered sender for customer texts.
// Dozens of self-addressed alerts a day carrying urso.ws links and urgency
// wording were the spammiest traffic on that number — exactly what handset
// filters learn on — so they leave the SMS channel. Exempt from quiet hours
// either way: he asked to be woken up by leads, not protected from them.
//
// `alreadyPushed`: the caller sent its own richer push for this event (the
// Square paths do). Then this is fallback-only — SMS if push can't reach him,
// nothing otherwise, so he never gets the same warning twice.
export type OwnerAlertOptions = { alreadyPushed?: boolean };

export async function alertOwner(body: string, opts: OwnerAlertOptions = {}): Promise<SendResult> {
  let reachable = false;
  try {
    reachable = await ownerHasPushDevice();
  } catch (error) {
    console.error("[canes] owner push device lookup failed:", error);
  }

  if (reachable) {
    if (opts.alreadyPushed) return { ok: true, skipped: "push covers it" };
    try {
      const push = await sendCanesPush(ownerAlertPush(body));
      if (push.accepted > 0 || push.skipped === "duplicate" || push.skipped === "no enabled devices") {
        // "no enabled devices" here means the category is switched off on
        // every device — a preference, honoured rather than routed around.
        return { ok: true, skipped: push.accepted > 0 ? undefined : push.skipped };
      }
      console.error(`[canes] owner alert push failed (${push.skipped ?? "provider"}), falling back to SMS`);
    } catch (error) {
      console.error("[canes] owner alert push threw, falling back to SMS:", error);
    }
  }

  const to = process.env.CANES_OWNER_PHONE;
  if (!to) return { ok: false, skipped: "CANES_OWNER_PHONE not set" };
  if (!twilioConfigured()) return { ok: false, skipped: "Twilio not configured" };
  const creds = canesTwilioCreds();
  return twilioSend({ ...creds, from: creds.from, to, body });
}

// Console links in the SMS text map onto the app's own screens; the URL itself
// is dropped from the push body (the notification IS the link).
const CONSOLE_LINK = /\s*Open:\s*https?:\/\/\S+\/CanesPressure(\/[\w\-/]*)?\S*/i;
const APP_ROUTES: Array<[RegExp, (id: string) => string]> = [
  [/^\/leads\/([0-9a-f-]{36})/i, (id) => `/(owner)/lead/${id}`],
  [/^\/invoices\/([0-9a-f-]{36})/i, (id) => `/(owner)/invoice/${id}`],
  [/^\/estimates\/([0-9a-f-]{36})/i, (id) => `/(owner)/estimate/${id}`],
  [/^\/schedule/i, () => "/(owner)/schedule"],
  [/^\/inbox/i, () => "/(owner)/inbox"],
];

function ownerAlertPush(body: string): CanesPush {
  const link = body.match(CONSOLE_LINK);
  let href = "/(owner)/dashboard";
  for (const [pattern, route] of APP_ROUTES) {
    const m = link?.[1]?.match(pattern);
    if (m) {
      href = route(m[1]);
      break;
    }
  }
  const text = body.replace(CONSOLE_LINK, "").trim();
  const title = text.startsWith("⚠️")
    ? "Needs attention"
    : text.startsWith("💰")
      ? "Money in"
      : text.startsWith("↩️")
        ? "Refund"
        : "Canes";
  return {
    dedupeKey: `owner_alert:${randomUUID()}`,
    audience: { kind: "owner" },
    eventType: "owner_alert",
    urgency: "time_sensitive",
    title,
    body: text.replace(/^(⚠️|💰|↩️)\s*/, ""),
    href,
  };
}

const YES_WORDS = /^\s*(yes|y|yeah|yep|si|sí|confirm|confirmed|ok|okay)\b/i;
export function isConfirmation(body: string): boolean {
  return YES_WORDS.test(body);
}
