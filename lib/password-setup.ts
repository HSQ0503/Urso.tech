// Password self-service for provisioned dashboard accounts. Mints a one-time
// Supabase recovery link with the service key and mails it through Resend —
// the same pattern the Canes crew portal uses for technician sign-in, so no
// Supabase SMTP configuration is involved and the email stays Urso-branded.
//
// Deliberately silent: every path returns void and logs server-side, because
// the caller must give an identical answer whether or not the address has an
// account. Provisioning is still the only way an account exists at all
// (scripts/provision-users.mjs) — this only lets an existing person choose
// their own password instead of keeping the generated one.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPasswordSetup } from "@/lib/email";

// Matches Supabase Auth → Email → "Email OTP Expiration" (default 3600s). Copy
// only; the real expiry lives in the project settings.
const EXPIRES_IN = "1 hour";

// Per-instance flood guard. Serverless means this is best-effort — a burst
// spread across instances slips through — but it blunts the common case of one
// client hammering the button, which is what would actually fill an inbox.
const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

export async function sendPasswordSetupLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;

  const previous = lastSent.get(email);
  if (previous && Date.now() - previous < COOLDOWN_MS) return;

  const admin = createAdminClient();

  // Only provisioned people get a link. A Supabase auth user with no app_users
  // row can't reach the dashboard anyway (lib/auth.ts), so there is nothing to
  // set a password for.
  const { data: member, error: memberError } = await admin
    .from("app_users")
    .select("name")
    .eq("email", email)
    .maybeSingle();
  if (memberError) {
    console.warn(`[password-setup] membership lookup failed: ${memberError.message}`);
    return;
  }
  if (!member) return;

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties) {
    console.warn(`[password-setup] generateLink failed: ${error?.message ?? "no properties returned"}`);
    return;
  }

  // Send them to our own callback rather than data.properties.action_link —
  // that one points at Supabase's verify endpoint and would land them on the
  // project URL. Ours exchanges the token and routes into the app.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("token_hash", data.properties.hashed_token);
  callback.searchParams.set("type", "recovery");

  lastSent.set(email, Date.now());
  await sendPasswordSetup({ to: email, name: member.name, url: callback.toString(), expiresIn: EXPIRES_IN });
}
