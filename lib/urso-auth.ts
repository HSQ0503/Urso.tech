import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { Resend } from "resend";

// Admin magic-link auth — a self-contained layer beside the Supabase password
// login (which is untouched). A short list of provisioned admin emails sign in
// with a Resend magic link instead of a password; a first-time device also
// clears a shared passcode. On success we set a signed session cookie that the
// Canes app's gate honors (lib/canes/gate.ts), so Sebastian reaches his
// dashboard and Han can support it. Everything here is stateless (HMAC-signed
// tokens + cookies) — no DB, no dependency on Supabase Auth.

export type AdminScope = "canes" | "admin";
type Admin = { name: string; scope: AdminScope };

// Provisioned admins. Emails match case-insensitively. Not secret (they are just
// identifiers); can move to an env list later without touching the flow.
const ADMINS: Record<string, Admin> = {
  "canespressurewashing@gmail.com": { name: "Sebastian", scope: "canes" },
  "han@urso.ws": { name: "Han", scope: "admin" },
};

export function getAdmin(email: string): Admin | null {
  return ADMINS[email.trim().toLowerCase()] ?? null;
}
export function isAdminEmail(email: string): boolean {
  return getAdmin(email) !== null;
}

// Where an admin lands after login. Both current scopes reach the Canes
// dashboard; branch here when a wider-scope admin needs a different home.
export function adminHome(): string {
  return "/CanesPressure";
}

// ── Signing (HMAC-SHA256 over a base64url JSON payload) ───────────────────────

// URSO_AUTH_SECRET (a long random string) signs every magic link, session,
// pending, and passcode-confirmed cookie. Production THROWS if it's unset —
// fail closed, so no one can forge an admin session with a known fallback key.
// Only a local dev build may use the throwaway. Rotating it invalidates every
// outstanding link, session, and confirmed device at once.
function secret(): string {
  const s = process.env.URSO_AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("URSO_AUTH_SECRET is required in production — set a long random string.");
  }
  return "urso-admin-dev-only-secret";
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function encode(payload: Record<string, unknown>): string {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${p}.${sign(p)}`;
}

function decode<T>(token: string | undefined, kind: string): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const p = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(p))) return null;
  let payload: { exp?: number; k?: string; email?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.k !== kind) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  // Every payload carries an email that must STILL be a provisioned admin — so
  // removing someone from ADMINS revokes their outstanding tokens immediately.
  if (typeof payload.email !== "string" || !isAdminEmail(payload.email)) return null;
  return payload as unknown as T;
}

const MAGIC_TTL_MS = 15 * 60 * 1000; // link is short-lived
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000; // window to enter the passcode
const PC_TTL_MS = 180 * 24 * 60 * 60 * 1000; // remember a passcode-cleared device
const MAX_PASSCODE_TRIES = 5;

const COOKIE = { session: "urso_admin", pending: "urso_pending", pc: "urso_pc" } as const;

function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

// ── Magic link ───────────────────────────────────────────────────────────────

export function makeMagicToken(email: string): string {
  return encode({ email: email.trim().toLowerCase(), exp: Date.now() + MAGIC_TTL_MS, k: "magic" });
}

// Returns the admin email if the token is valid + unexpired + still an admin.
export function readMagicToken(token: string): string | null {
  const p = decode<{ email: string }>(token, "magic");
  return p ? p.email : null;
}

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const admin = getAdmin(email);
  if (!admin) return { ok: false, error: "not an admin" };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const url = `${base}/login/verify?token=${encodeURIComponent(makeMagicToken(email))}`;

  const key = process.env.RESEND_API;
  if (!key) {
    console.warn("[urso-auth] RESEND_API not set — magic link not sent");
    return { ok: false, error: "email not configured" };
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: process.env.URSO_LOGIN_FROM ?? "Urso <hello@urso.ws>",
      to: admin ? email.trim().toLowerCase() : email,
      subject: "Your Urso sign-in link",
      html: magicLinkHtml(admin.name, url),
    });
    if (error) {
      const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? "send failed";
      console.warn(`[urso-auth] magic link send failed: ${msg}`);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[urso-auth] magic link threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

function magicLinkHtml(name: string, url: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#141416;border:1px solid #24242a;border-radius:14px;padding:32px;">
      <tr><td style="font-size:20px;font-weight:600;color:#f4f5f6;letter-spacing:-0.02em;">Urso <span style="color:#fe5100;">&bull;</span></td></tr>
      <tr><td style="padding-top:20px;font-size:16px;font-weight:600;color:#f4f5f6;">Sign in${name ? `, ${escapeHtml(name)}` : ""}</td></tr>
      <tr><td style="padding-top:8px;font-size:13.5px;line-height:1.55;color:#a2a3a8;">Click the button below to sign in to your Urso dashboard. This link expires in 15 minutes. If you did not request it, you can ignore this email.</td></tr>
      <tr><td style="padding-top:24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#fe5100;color:#000;text-decoration:none;font-size:14px;font-weight:600;padding:13px 22px;border-radius:11px;">Sign in &rarr;</a></td></tr>
      <tr><td style="padding-top:24px;font-size:11px;line-height:1.5;color:#6b6c72;font-family:ui-monospace,Menlo,monospace;">If the button does not work, paste this link into your browser:<br>${escapeHtml(url)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ── Passcode ─────────────────────────────────────────────────────────────────

export function checkPasscode(input: string): boolean {
  const expected = process.env.URSO_ADMIN_PASSCODE ?? "790108";
  return safeEqual(input.trim(), expected);
}

// ── Session cookie (the thing the Canes gate reads) ──────────────────────────

export async function setAdminSession(email: string, scope: AdminScope): Promise<void> {
  const token = encode({ email: email.trim().toLowerCase(), scope, exp: Date.now() + SESSION_TTL_MS, k: "session" });
  (await cookies()).set(COOKIE.session, token, cookieOpts(SESSION_TTL_MS));
}

export const getAdminSession = cache(async (): Promise<{ email: string; scope: AdminScope } | null> => {
  const raw = (await cookies()).get(COOKIE.session)?.value;
  const p = decode<{ email: string; scope: AdminScope }>(raw, "session");
  if (!p) return null;
  // Re-derive scope from the live ADMINS map, never the token — so changing or
  // removing an admin takes effect immediately, not after the 30-day expiry.
  const admin = getAdmin(p.email);
  return admin ? { email: p.email, scope: admin.scope } : null;
});

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE.session);
}

// ── Pending (post-magic-link, awaiting the first-device passcode) ─────────────

export async function setPending(email: string): Promise<void> {
  const token = encode({ email: email.trim().toLowerCase(), tries: 0, exp: Date.now() + PENDING_TTL_MS, k: "pending" });
  (await cookies()).set(COOKIE.pending, token, cookieOpts(PENDING_TTL_MS));
}

export async function getPending(): Promise<{ email: string; tries: number } | null> {
  const raw = (await cookies()).get(COOKIE.pending)?.value;
  const p = decode<{ email: string; tries: number }>(raw, "pending");
  return p ? { email: p.email, tries: p.tries } : null;
}

export async function clearPending(): Promise<void> {
  (await cookies()).delete(COOKIE.pending);
}

// Record a wrong passcode attempt. Returns the new count, or null once the cap
// is hit (pending is cleared → the user must request a fresh link). This caps
// brute-forcing the passcode within a single short-lived link.
export async function bumpPendingTries(): Promise<number | null> {
  const cur = await getPending();
  if (!cur) return null;
  const tries = cur.tries + 1;
  if (tries >= MAX_PASSCODE_TRIES) {
    await clearPending();
    return null;
  }
  const store = await cookies();
  const token = encode({ email: cur.email, tries, exp: Date.now() + PENDING_TTL_MS, k: "pending" });
  store.set(COOKIE.pending, token, cookieOpts(PENDING_TTL_MS));
  return tries;
}

// ── Passcode-confirmed device memory ─────────────────────────────────────────

export async function setPasscodeConfirmed(email: string): Promise<void> {
  const token = encode({ email: email.trim().toLowerCase(), exp: Date.now() + PC_TTL_MS, k: "pc" });
  (await cookies()).set(COOKIE.pc, token, cookieOpts(PC_TTL_MS));
}

// True only if THIS device previously cleared the passcode for THIS email.
export async function hasPasscodeConfirmed(email: string): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE.pc)?.value;
  const p = decode<{ email: string }>(raw, "pc");
  return !!p && p.email === email.trim().toLowerCase();
}
