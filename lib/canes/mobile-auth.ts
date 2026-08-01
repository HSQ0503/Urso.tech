import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { canesDb } from "@/lib/canes/supabase";
import { getAdmin, isAdminEmail } from "@/lib/urso-auth";

// Admin sign-in for the mobile app (M6a).
//
// The crew reuses Supabase Auth; admins do not exist there — they are the small
// provisioned ADMINS map in lib/urso-auth.ts, authenticated on the web by a
// Resend magic link. A link is the wrong shape on a phone: it has to survive the
// mail app, Safari and a universal-link association, and every break in that
// chain strands the person outside the app. The crew flow already proved a typed
// code works, so admins get the same.
//
// State lives in the `settings` KV under `mobilecode:<email>`, the same trick
// pin.ts and tour_done:<email> use — so this needs NO MIGRATION, and because
// getSettings() only picks its known keys these rows never leak into
// CanesSettings.
//
// What this is NOT: a way to become an admin. Provisioning stays the ADMINS map;
// a code is only ever issued to an address already on it.

const CODE_TTL_MS = 10 * 60 * 1000; // long enough to switch to a mail app
const MAX_TRIES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const CODE_DIGITS = 6;

export const mobileCodeKey = (email: string) => `mobilecode:${email.trim().toLowerCase()}`;

type CodeRecord = {
  salt: string;
  hash: string;
  tries: number;
  expires_at: string;
  locked_until: string | null;
  created_at: string;
};

// scrypt, not a bare digest: a 6-digit space is only a million values, so a
// leaked settings row must not be brute-forceable offline in seconds.
const hashCode = (code: string, salt: string) =>
  scryptSync(code, Buffer.from(salt, "base64url"), 32).toString("base64url");

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function readRecord(key: string): Promise<CodeRecord | null> {
  const { data, error } = await canesDb()
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`[canes] mobile code read failed: ${error.message}`);
  return (data?.value as CodeRecord | undefined) ?? null;
}

async function writeRecord(key: string, record: CodeRecord): Promise<void> {
  const { error } = await canesDb()
    .from("settings")
    .upsert(
      { key, value: record, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`[canes] mobile code write failed: ${error.message}`);
}

async function clearRecord(key: string): Promise<void> {
  await canesDb().from("settings").delete().eq("key", key);
}

// Compare-and-swap on the attempt counter, mirroring pin.ts: the write lands
// only if `tries` is still what we read. Without it, parallel guesses collapse
// into one increment and the lockout never fires — which for a six-digit code
// is the difference between five attempts and unlimited ones.
async function casTries(key: string, expectedTries: number, next: CodeRecord): Promise<boolean> {
  const { data, error } = await canesDb()
    .from("settings")
    .update({ value: next, updated_at: new Date().toISOString() })
    .eq("key", key)
    .eq("value->>tries", String(expectedTries))
    .select("key");
  if (error) throw new Error(`[canes] mobile code cas failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export type IssueResult =
  | { ok: true; code: string; name: string; scope: "canes" | "admin" }
  | { ok: false; notice: string };

// Mint a code for a provisioned admin. Returns the plaintext ONCE, for the
// caller to email — it is never stored or logged in the clear.
export async function issueMobileCode(email: string): Promise<IssueResult> {
  const address = email.trim().toLowerCase();
  const admin = getAdmin(address);
  // Deliberately the same refusal whether the address is unknown or simply not
  // an admin: this endpoint must not become a way to enumerate who is one.
  if (!admin) return { ok: false, notice: "That email isn’t set up for the app." };

  const key = mobileCodeKey(address);
  const existing = await readRecord(key);
  if (existing?.locked_until && Date.parse(existing.locked_until) > Date.now()) {
    return { ok: false, notice: "Too many tries. Wait a few minutes and try again." };
  }

  // randomInt is CSPRNG-backed; Math.random would be guessable.
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
  // randomBytes, not randomInt: node's randomInt caps at 2^48-1, and an earlier
  // version called randomInt(0, 2**48) — one past the limit. It threw on EVERY
  // request, so no admin could ever receive a code, and because the throw only
  // happened after the ADMINS lookup a real address answered 500 while an
  // unknown one answered 200 — resurrecting the enumeration leak this file had
  // just been fixed for. Caught by the acceptance suite.
  const salt = randomBytes(16).toString("base64url");

  await writeRecord(key, {
    salt,
    hash: hashCode(code, salt),
    tries: 0,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    locked_until: null,
    created_at: new Date().toISOString(),
  });

  return { ok: true, code, name: admin.name, scope: admin.scope };
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; notice: string };

export async function verifyMobileCode(email: string, attempt: string): Promise<VerifyResult> {
  const address = email.trim().toLowerCase();
  if (!isAdminEmail(address)) return { ok: false, notice: "That code didn’t work." };

  const key = mobileCodeKey(address);
  const record = await readRecord(key);
  // NOTE: identical to the non-admin refusal above, deliberately. An earlier
  // version said "Ask for a new one" here, which distinguished a provisioned
  // admin with no outstanding code from an address that is not an admin at all
  // — an enumeration oracle for who has owner access to a client's business.
  // Every failure on this endpoint reads the same.
  if (!record) return { ok: false, notice: "That code didn’t work." };

  if (record.locked_until && Date.parse(record.locked_until) > Date.now()) {
    return { ok: false, notice: "Too many tries. Wait a few minutes and try again." };
  }
  if (Date.parse(record.expires_at) < Date.now()) {
    await clearRecord(key);
    return { ok: false, notice: "That code expired. Ask for a new one." };
  }

  const supplied = attempt.trim();
  if (safeEqual(hashCode(supplied, record.salt), record.hash)) {
    // Single use: consume it so a shoulder-surfed code cannot be replayed.
    await clearRecord(key);
    return { ok: true, email: address };
  }

  const tries = record.tries + 1;
  const locked = tries >= MAX_TRIES;
  const won = await casTries(key, record.tries, {
    ...record,
    tries,
    locked_until: locked ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
  });
  // Losing the CAS means a concurrent attempt already counted; fail closed
  // rather than letting racing guesses slip past the cap.
  if (!won) return { ok: false, notice: "That code didn’t work." };

  return {
    ok: false,
    notice: locked
      ? "Too many tries. Wait a few minutes and try again."
      : "That code didn’t work.",
  };
}
