"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession, homePathFor } from "@/lib/auth";
import { sendPasswordSetupLink } from "@/lib/password-setup";
import {
  isAdminEmail,
  sendMagicLink,
  getPending,
  checkPasscode,
  bumpPendingTries,
  getAdmin,
  setAdminSession,
  setPasscodeConfirmed,
  clearPending,
  clearAdminSession,
  adminHome,
} from "@/lib/urso-auth";

// Real sign-in: validate the password against Supabase Auth, then require a
// provisioned app_users membership before letting anyone through. Accounts are
// created by Urso (scripts/provision-users.mjs) — there is no self-signup.
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Provisioned admins (Sebastian, Han) sign in with a Resend magic link, not a
  // password — the password field is optional for them and ignored here.
  if (isAdminEmail(email)) {
    await sendMagicLink(email);
    redirect("/login?sent=1");
  }

  if (!email || !password) redirect("/login?error=missing");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid");

  const session = await getSession();
  if (!session) {
    // Valid Supabase login but no membership row — not one of ours. Drop the
    // session so the cookie doesn't linger half-authenticated.
    await supabase.auth.signOut();
    redirect("/login?error=unprovisioned");
  }
  redirect(homePathFor(session.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// "Set or reset my password" on the sign-in form. Mails a one-time link to
// provisioned accounts only — but the answer is identical either way, so this
// page can't be used to discover which addresses have dashboards. Failures are
// logged server-side (see lib/password-setup.ts), never shown here.
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=missing");

  await sendPasswordSetupLink(email);
  redirect("/login?sent=reset");
}

// The other end of that link: the recovery token already became a session at
// /auth/callback, so this only has to validate the new password and write it.
// Also reachable by anyone already signed in who wants to change theirs.
const MIN_PASSWORD = 10;

export async function setPassword(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?error=expired");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) redirect("/login/set-password?error=short");
  if (password !== confirm) redirect("/login/set-password?error=match");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/login/set-password?error=failed");

  redirect(homePathFor(session.role));
}

// First-device passcode confirmation after a magic link. Requires a valid
// pending cookie; a wrong code counts against a small cap, after which the
// pending state is dropped and a fresh link is required.
export async function confirmPasscode(formData: FormData) {
  const pending = await getPending();
  if (!pending) redirect("/login?error=expired");

  const code = String(formData.get("passcode") ?? "");
  if (!checkPasscode(code)) {
    const tries = await bumpPendingTries();
    if (tries === null) redirect("/login?error=tries");
    redirect("/login/passcode?error=1");
  }

  const admin = getAdmin(pending.email);
  if (!admin) redirect("/login?error=link");

  await setAdminSession(pending.email, admin.scope);
  await setPasscodeConfirmed(pending.email);
  await clearPending();
  redirect(adminHome());
}

// Sign an admin out of the magic-link session (separate from the Supabase
// password session).
export async function signOutAdmin() {
  await clearAdminSession();
  // Also drop the legacy shared-passcode cookie so one sign-out revokes both gates.
  (await cookies()).delete("canes_access");
  redirect("/login");
}
