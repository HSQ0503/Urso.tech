import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Twilio helpers — raw REST + TwiML, no SDK (mirrors the QuickBooks routes and
// keeps deps minimal). Account-level credentials live in the environment;
// per-store config lives in the twilio_numbers table.

const messagesUrl = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

// Built-in text-back copy. Formal, branded, opt-out included (A2P requires the
// sample message to carry STOP language). Stores can override via text_template.
const DEFAULT_TEMPLATE =
  "Hello — this is Woof Gang Bakery {store}. Sorry we missed your call. " +
  "To book a grooming appointment, visit {link}. Reply STOP to opt out.";

export function renderTextBack(template: string | null, store: string, link: string): string {
  return (template ?? DEFAULT_TEMPLATE).replaceAll("{store}", store).replaceAll("{link}", link);
}

// Validate the X-Twilio-Signature header: HMAC-SHA1 over the full request URL
// plus every POST param sorted by key (key+value concatenated), base64.
// https://www.twilio.com/docs/usage/security#validating-requests
export function validateSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data, "utf-8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendSms(opts: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  statusCallback?: string; // Twilio POSTs delivery-status updates here
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const basic = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");
  const params = new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.body });
  if (opts.statusCallback) params.set("StatusCallback", opts.statusCallback);
  const res = await fetch(messagesUrl(opts.accountSid), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) return { ok: false, error: `Twilio responded ${res.status}` };
  const json = (await res.json()) as { sid?: string };
  return { ok: true, sid: json.sid };
}

// Reconstruct the externally visible URL Twilio signed. Vercel terminates TLS
// and proxies, so trust the forwarded headers over req.nextUrl.
export function publicUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

export function xmlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

// A call is "after hours" when the store's local time is before open or at/after
// close. Null hours → always open (never after hours).
export function isAfterHours(
  at: Date,
  openTime: string | null,
  closeTime: string | null,
  timezone: string,
): boolean {
  if (!openTime || !closeTime) return false;
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(at)
    .replace(/^24/, "00"); // some runtimes render midnight as "24:00"
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const now = toMinutes(local);
  return now < toMinutes(openTime) || now >= toMinutes(closeTime);
}
