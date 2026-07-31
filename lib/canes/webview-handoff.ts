import { createHash, randomBytes } from "node:crypto";
import { canesDb } from "@/lib/canes/supabase";
import { isAdminEmail } from "@/lib/urso-auth";

// The bearer → cookie bridge for the app's WebView surfaces (O3).
//
// THE PROBLEM. The owner console authenticates with the httpOnly `urso_admin`
// session cookie; the Expo app holds a `k:"mobile"` bearer token. A WebView
// pointed at /CanesPressure/insights sends neither — React Native has no cookie
// jar tied to that origin and cannot attach an Authorization header to a
// top-level navigation. So the six web-only surfaces (Insights, Payouts,
// Expenses, Settings, the estimate builder, catalog) are unreachable from the
// app without a deliberate handoff.
//
// WHAT THIS IS NOT. It is not a second authorization path: the ticket proves
// nothing on its own and grants nothing new. It converts a credential the
// caller ALREADY holds (a valid mobile bearer, checked by the minting route's
// apiRoute wrapper) into the credential the web surface already understands.
// No guard is widened, no surface flag is trusted from the caller — the
// recurring bug shape this project has now hit three times.
//
// WHY A SERVER-SIDE TICKET AND NOT A SIGNED TOKEN. A ticket travels in a URL,
// where it is far more exposed than a header: it lands in the WebView's history
// and could reach a referrer or a log. The magic link is stateless and
// therefore replayable inside its whole TTL — a known limitation recorded in
// the System Map. This one is SINGLE-USE, which needs server state, so it lives
// in the `settings` KV under `wvticket:<sha256>`, the same trick as
// pin.ts / mobilecode: / tour_done: — NO MIGRATION, and getSettings() only
// picks its known keys so these rows never leak into CanesSettings.
//
// Only the HASH of the ticket is stored. A leaked settings row is then useless
// on its own: it cannot be replayed into a session.

const TICKET_TTL_MS = 60 * 1000; // seconds, not minutes — it is redeemed immediately

const keyFor = (ticket: string) =>
  `wvticket:${createHash("sha256").update(ticket).digest("hex")}`;

type TicketRecord = { email: string; expires_at: string };

// Mints a one-time ticket for an already-authenticated admin. The caller is
// authenticated by the ROUTE (apiRoute + denyUnlessConsole); this function
// re-checks membership so a removed admin cannot mint even if a route ever
// forgets to.
export async function mintHandoffTicket(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!isAdminEmail(normalized)) return null;

  const ticket = randomBytes(32).toString("base64url");
  const record: TicketRecord = {
    email: normalized,
    expires_at: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
  };

  const { error } = await canesDb()
    .from("settings")
    .upsert(
      { key: keyFor(ticket), value: record, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`[canes] handoff ticket write failed: ${error.message}`);
  return ticket;
}

// Redeems a ticket, returning the admin's email exactly once.
//
// The DELETE is the atomicity primitive, not a read-then-write: `.select("key")`
// returns the rows the delete actually removed, so of two concurrent redemptions
// exactly one gets a row back and the other gets none. RLS is deny-all and
// canesDb() uses the secret key, so a successful delete always reports its rows
// — the same property the §7e claimed-write audit turns on. Expiry is checked
// AFTER the claim: an expired ticket is consumed either way, so a stale one can
// never sit around waiting to be tried again.
export async function consumeHandoffTicket(ticket: string): Promise<string | null> {
  if (typeof ticket !== "string" || ticket.length < 32) return null;

  const { data, error } = await canesDb()
    .from("settings")
    .delete()
    .eq("key", keyFor(ticket))
    .select("key, value");
  if (error) throw new Error(`[canes] handoff ticket redeem failed: ${error.message}`);

  const row = data?.[0];
  if (!row) return null;

  const record = row.value as TicketRecord | undefined;
  if (!record?.email || !record.expires_at) return null;
  if (Date.parse(record.expires_at) < Date.now()) return null;
  // Membership is re-derived at redemption, never trusted from the record —
  // removing someone from ADMINS takes effect between mint and redeem.
  if (!isAdminEmail(record.email)) return null;

  return record.email;
}

// Where a handoff is allowed to land.
//
// An open redirect here would be a genuine hole: the endpoint SETS A SESSION
// COOKIE and then sends the browser onward, so an attacker-chosen destination
// would be visited by a freshly-authenticated agent. Only same-origin console
// paths are permitted, and the check is a whitelist of prefixes rather than a
// "does not start with //" style blacklist — protocol-relative URLs, backslash
// variants and encoded forms have defeated every blacklist ever written.
const ALLOWED_PREFIXES = [
  "/CanesPressure/insights",
  "/CanesPressure/payouts",
  "/CanesPressure/expenses",
  "/CanesPressure/settings",
  "/CanesPressure/estimates",
  "/CanesPressure/invoices",
  "/CanesPressure/customers",
] as const;

export function isAllowedHandoffPath(to: unknown): to is string {
  if (typeof to !== "string" || to.length > 300) return false;
  // Must be a plain absolute path on this origin: one leading slash, no scheme,
  // no host, no backslashes (IE/Edge treat "\" as "/"), no control characters.
  if (!to.startsWith("/") || to.startsWith("//") || to.includes("\\")) return false;
  // Control characters and whitespace, written as ESCAPES: an earlier draft
  // carried these as raw bytes in the source, which is invisible in a diff
  // and does not survive an editor that normalises them.
  if (/[\x00-\x20\x7f]/.test(to)) return false;
  const path = to.split("?")[0].split("#")[0];
  // A dot-segment defeats a prefix whitelist outright: the redirect resolves
  // "/CanesPressure/insights/../../../anything" against the origin and lands on
  // "/anything", which passes startsWith() and is not where this was allowed to
  // go. It stays same-origin so it is not a classic open redirect, but the
  // whole point of the list is to bound where a session-minting redirect can
  // put someone. Both the raw and percent-encoded forms are refused.
  const decoded = (() => {
    try {
      return decodeURIComponent(path);
    } catch {
      return null; // malformed escapes — refuse rather than guess
    }
  })();
  if (decoded === null) return false;
  if (decoded.split("/").includes("..")) return false;
  return ALLOWED_PREFIXES.some((p) => decoded === p || decoded.startsWith(`${p}/`));
}
