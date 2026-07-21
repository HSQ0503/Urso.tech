import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";

// Quick-PIN re-lock for the Canes surfaces (owner console + crew portal).
// The full session (30-day admin magic-link cookie / Supabase crew session)
// stays untouched — this is a light second gate: after PIN_TTL a tab must
// re-enter a 4-digit PIN the person set on their first login. Design mirrors
// the house auth style: HMAC-signed stateless cookie for the unlock window,
// server-side state (settings KV, like tour_done:<email>) for the PIN hash
// and the attempt lockout — the counter lives in the DB, not a client cookie,
// so clearing cookies never resets brute-force attempts.
//
// Never active in demo/unconfigured deploys (no DB to hold the hash) — the
// layouts skip the gate when !canesConfigured().

export const PIN_TTL_MS = 30 * 60 * 1000; // relock a tab after 30 minutes
const MAX_TRIES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const COOKIE_NAME = "canes_pin";

// ── Identity keys ────────────────────────────────────────────────────────────
// One PIN per person, keyed by who the SESSION says they are (never the
// client): admins by provisioned email, technicians by crew_accounts id.

export const adminPinKey = (email: string) => `pin:admin:${email.trim().toLowerCase()}`;
export const crewPinKey = (accountId: string) => `pin:crew:${accountId}`;

// ── Signing (same secret + shape as lib/urso-auth.ts, PIN-scoped kind) ───────

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

// ── Unlock cookie ────────────────────────────────────────────────────────────

export async function mintPinCookie(identityKey: string): Promise<void> {
  const exp = Date.now() + PIN_TTL_MS;
  const p = Buffer.from(JSON.stringify({ k: "pin", id: identityKey, exp })).toString("base64url");
  (await cookies()).set(COOKIE_NAME, `${p}.${sign(p)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/CanesPressure",
    maxAge: Math.floor(PIN_TTL_MS / 1000),
  });
}

export async function clearPinCookie(): Promise<void> {
  // Must match mintPinCookie's path — cookies().delete() defaults to path "/",
  // which would leave the path-scoped "/CanesPressure" cookie in place, so a
  // forgot/sign-out would not actually revoke the current unlock window.
  (await cookies()).delete({ name: COOKIE_NAME, path: "/CanesPressure" });
}

// Valid-and-mine → the unlock's absolute expiry (ms); otherwise null. The
// identity match matters: an unlock minted for one person must not open a
// different account's surface in the same browser.
export async function pinCookieExpiry(identityKey: string): Promise<number | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const p = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), sign(p))) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as {
      k?: string;
      id?: string;
      exp?: number;
    };
    if (payload.k !== "pin" || payload.id !== identityKey) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload.exp;
  } catch {
    return null;
  }
}

// ── PIN records (settings KV) ────────────────────────────────────────────────

type PinRecord = {
  salt: string;
  hash: string;
  tries: number;
  locked_until: string | null;
  created_at: string;
};

const hashPin = (pin: string, salt: string) =>
  scryptSync(pin, Buffer.from(salt, "base64url"), 32).toString("base64url");

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

async function readRecord(identityKey: string): Promise<PinRecord | null> {
  const { data, error } = await canesDb()
    .from("settings")
    .select("value")
    .eq("key", identityKey)
    .maybeSingle();
  if (error) throw new Error(`[canes] pin read failed: ${error.message}`);
  return (data?.value as PinRecord | undefined) ?? null;
}

async function writeRecord(identityKey: string, record: PinRecord): Promise<void> {
  const { error } = await canesDb()
    .from("settings")
    .upsert(
      { key: identityKey, value: record, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`[canes] pin write failed: ${error.message}`);
}

// Compare-and-swap on the attempt counter: the write lands ONLY if the row's
// current tries still equals `expectedTries`. This serializes concurrent wrong
// guesses so N parallel attempts produce N increments (not 1) — without it the
// read-modify-write lockout is defeated by racing requests and a 4-digit PIN is
// trivially brute-forceable. Returns whether this write won the race.
async function casTries(
  identityKey: string,
  expectedTries: number,
  next: PinRecord,
): Promise<boolean> {
  const { data, error } = await canesDb()
    .from("settings")
    .update({ value: next, updated_at: new Date().toISOString() })
    .eq("key", identityKey)
    .eq("value->>tries", String(expectedTries))
    .select("key");
  if (error) throw new Error(`[canes] pin cas failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function hasPin(identityKey: string): Promise<boolean> {
  return (await readRecord(identityKey)) !== null;
}

// First-time setup only — an existing PIN can never be silently overwritten
// from here (changing it means the forgot-PIN path: full re-auth first).
export async function setPin(
  identityKey: string,
  pin: string,
): Promise<{ ok: boolean; notice?: string }> {
  if (!isValidPin(pin)) return { ok: false, notice: "PIN must be exactly 4 digits." };
  if (await hasPin(identityKey)) {
    return { ok: false, notice: "A PIN is already set — unlock with it instead." };
  }
  const salt = randomBytes(16).toString("base64url");
  await writeRecord(identityKey, {
    salt,
    hash: hashPin(pin, salt),
    tries: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
  });
  return { ok: true };
}

export type PinVerify =
  | { ok: true }
  | { ok: false; notice: string; lockedForMs?: number };

// Server-side attempt counter with a hard lockout. Wrong tries persist in the
// DB row (so clearing cookies / switching browsers never resets the count) and
// increment via compare-and-swap (so parallel guesses can't defeat the lock).
// Under heavy contention a request may lose every CAS round within the retry
// budget — it fails CLOSED ("try again"), never granting access.
export async function verifyPin(identityKey: string, pin: string): Promise<PinVerify> {
  for (let round = 0; round < 8; round++) {
    const record = await readRecord(identityKey);
    if (!record) return { ok: false, notice: "No PIN is set yet." };

    const lockedUntil = record.locked_until ? Date.parse(record.locked_until) : 0;
    if (lockedUntil > Date.now()) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      return {
        ok: false,
        notice: `Too many wrong tries — locked for ${mins} more minute${mins === 1 ? "" : "s"}.`,
        lockedForMs: lockedUntil - Date.now(),
      };
    }

    // scryptSync is intentionally kept synchronous: it also naturally throttles
    // a brute-force burst on this single-operator app's one thread.
    if (isValidPin(pin) && safeEqual(hashPin(pin, record.salt), record.hash)) {
      // Correct — reset the counter (best-effort; a lost CAS here is harmless
      // since the PIN was right and access is granted either way).
      if (record.tries > 0 || record.locked_until) {
        await casTries(identityKey, record.tries, { ...record, tries: 0, locked_until: null });
      }
      return { ok: true };
    }

    const tries = record.tries + 1;
    const lockNow = tries >= MAX_TRIES;
    const won = await casTries(identityKey, record.tries, {
      ...record,
      tries: lockNow ? 0 : tries,
      locked_until: lockNow ? new Date(Date.now() + LOCKOUT_MS).toISOString() : record.locked_until,
    });
    if (!won) continue; // another request incremented first — re-read and re-count
    return lockNow
      ? { ok: false, notice: "Too many wrong tries — locked for 5 minutes.", lockedForMs: LOCKOUT_MS }
      : { ok: false, notice: `Wrong PIN — ${MAX_TRIES - tries} tr${MAX_TRIES - tries === 1 ? "y" : "ies"} left.` };
  }
  // Never won a consistent write — refuse rather than risk an uncounted guess.
  return { ok: false, notice: "Too many attempts at once — wait a moment and try again." };
}

// Forgot-PIN: wipe the record. Callers MUST pair this with a full sign-out —
// re-authenticating with the stronger factor (magic link / crew email link) is
// what earns the right to set a fresh PIN.
export async function deletePin(identityKey: string): Promise<void> {
  const { error } = await canesDb().from("settings").delete().eq("key", identityKey);
  if (error) throw new Error(`[canes] pin delete failed: ${error.message}`);
}

// ── The layout gate ──────────────────────────────────────────────────────────

export type PinGate =
  | { status: "ok"; relockInMs: number }
  | { status: "setup" }
  | { status: "locked" };

// What a gated layout does with an authenticated identity: let them through
// (valid unlock cookie), send them to first-time setup (no PIN on record), or
// send them to the lock screen. Never called in demo — the caller checks.
// Returns relockInMs (a DURATION) rather than an absolute expiry so the layout
// never has to call Date.now() during render — the watchdog needs a duration
// anyway, and computing it here keeps that clock read out of a component.
export async function pinGate(identityKey: string): Promise<PinGate> {
  if (!canesConfigured()) return { status: "ok", relockInMs: PIN_TTL_MS };
  const exp = await pinCookieExpiry(identityKey);
  if (exp !== null) return { status: "ok", relockInMs: Math.max(0, exp - Date.now()) };
  return (await hasPin(identityKey)) ? { status: "locked" } : { status: "setup" };
}
