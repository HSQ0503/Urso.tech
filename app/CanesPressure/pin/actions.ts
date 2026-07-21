"use server";

import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/urso-auth";
import { createCanesAuthClient } from "@/lib/canes/crew-auth-client";
import { canesConfigured } from "@/lib/canes/supabase";
import { resolvePinIdentity } from "@/lib/canes/pin-identity";
import { clearPinCookie, deletePin, isValidPin, mintPinCookie, setPin, verifyPin } from "@/lib/canes/pin";

// Server actions for the quick-PIN gate. Identity ALWAYS derives from the live
// session cookies via resolvePinIdentity(returnTo) — the client only sends
// digits + a return path. DB-touching calls are wrapped so a hiccup returns a
// friendly notice instead of crashing to Next's error page; redirect() (which
// signals by throwing NEXT_REDIRECT) is always called OUTSIDE the try.

export type PinActionResult = { ok: boolean; notice?: string };

// Same-app paths only — a tampered returnTo must never bounce to an external
// site (or a protocol-relative "//evil.com") after unlocking.
function sanitizeReturnTo(to: string | undefined, home: string): string {
  if (!to || !to.startsWith("/CanesPressure") || to.startsWith("//")) return home;
  return to;
}

const pinUrl = (dest: string) => `/CanesPressure/pin?to=${encodeURIComponent(dest)}`;
const DEMO: PinActionResult = { ok: false, notice: "Demo mode — the PIN gate is off without a database." };

export async function setupCanesPin(
  pin: string,
  confirm: string,
  returnTo?: string,
): Promise<PinActionResult> {
  if (!canesConfigured()) return DEMO;
  const identity = await resolvePinIdentity(returnTo);
  if (!identity) redirect("/login");
  const dest = sanitizeReturnTo(returnTo, identity.home);
  if (!isValidPin(pin)) return { ok: false, notice: "PIN must be exactly 4 digits." };
  if (pin !== confirm) return { ok: false, notice: "PINs don't match — try again." };

  let alreadySet = false;
  try {
    const res = await setPin(identity.key, pin);
    // The only non-ok path here (format was validated above) is a PIN set by a
    // racing tab — send them to unlock instead of stranding them in setup.
    if (!res.ok) alreadySet = true;
    else await mintPinCookie(identity.key);
  } catch (err) {
    console.error("[canes] pin setup error", err);
    return { ok: false, notice: "Something went wrong — please try again." };
  }
  redirect(alreadySet ? pinUrl(dest) : dest);
}

export async function unlockCanesPin(
  pin: string,
  returnTo?: string,
): Promise<PinActionResult> {
  if (!canesConfigured()) return DEMO;
  const identity = await resolvePinIdentity(returnTo);
  if (!identity) redirect("/login");
  const dest = sanitizeReturnTo(returnTo, identity.home);

  try {
    const res = await verifyPin(identity.key, pin);
    if (!res.ok) return { ok: false, notice: res.notice };
    await mintPinCookie(identity.key);
  } catch (err) {
    console.error("[canes] pin unlock error", err);
    return { ok: false, notice: "Something went wrong — please try again." };
  }
  redirect(dest);
}

// Forgot-PIN = full sign-out + PIN wipe; re-authenticating with the stronger
// factor (magic link / crew email link) is what earns setting a fresh PIN.
// NOTE (admin): the Urso admin session is a stateless 30-day cookie with no
// server-side revocation, so this protects against a shoulder-surfer at an
// idle-but-relocked tab (the intended threat) but NOT against someone who has
// already exfiltrated the raw session cookie — that attacker already holds full
// access. Crew sign-out revokes server-side via Supabase. Documented, accepted.
export async function forgotCanesPin(returnTo?: string): Promise<void> {
  const identity = await resolvePinIdentity(returnTo);
  if (!identity) redirect("/login");
  try {
    if (canesConfigured()) await deletePin(identity.key);
  } catch (err) {
    console.error("[canes] pin delete error", err); // still sign out below
  }
  await clearPinCookie();
  if (identity.kind === "admin") {
    await clearAdminSession();
    redirect("/login");
  }
  const auth = await createCanesAuthClient();
  await auth.auth.signOut();
  redirect("/CanesPressure/crew/login");
}
