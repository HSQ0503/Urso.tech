import { cache } from "react";
import { cookies } from "next/headers";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";

// First-login onboarding tour state. One settings row per admin email
// (key `tour_done:<email>`) so "already saw it" follows the person across
// devices — the whole point of "trigger on the first login". getSettings()
// only picks its known keys, so these rows never leak into CanesSettings.
// Demo/unconfigured deploys fall back to a browser cookie so the tour is
// still dismissible without a database.

const COOKIE = "canes_tour_done";

// The tour's practice sandbox phone number — the reserved fictional range, so
// no automation can ever text a real person and no real customer can own it.
// Lives here (not in the tour module) so the app spine and the cron can guard
// against practice data without importing wizard code.
export const PRACTICE_PHONE = "+15615550188";

const keyFor = (email: string) => `tour_done:${email.trim().toLowerCase()}`;

export const getTourDone = cache(async (email: string | null): Promise<boolean> => {
  if (!canesConfigured()) {
    const store = await cookies();
    return store.get(COOKIE)?.value === "1";
  }
  // No admin email (legacy passcode gate) — never auto-open; the Settings
  // replay button still works client-side.
  if (!email) return true;
  const { data, error } = await canesDb()
    .from("settings")
    .select("key")
    .eq("key", keyFor(email))
    .maybeSingle();
  if (error) {
    // Fail toward "seen" — a DB hiccup must never re-run the tour on every load.
    console.error(`[canes] tour state read failed: ${error.message}`);
    return true;
  }
  return Boolean(data);
});

export async function markTourDone(email: string | null): Promise<void> {
  if (!canesConfigured()) {
    const store = await cookies();
    store.set(COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/CanesPressure",
    });
    return;
  }
  // Configured deploy without an admin email (expired session, passcode gate):
  // nothing auto-opens for them, so there is nothing to persist — and writing
  // the never-read-when-configured cookie would only mask the miss.
  if (!email) return;
  const { error } = await canesDb()
    .from("settings")
    .upsert(
      { key: keyFor(email), value: { done_at: new Date().toISOString() }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  // Throw so the caller knows completion did NOT persist — the shell keeps its
  // resume position instead of silently looping the tour on every login.
  if (error) throw new Error(`[canes] tour state write failed: ${error.message}`);
}
