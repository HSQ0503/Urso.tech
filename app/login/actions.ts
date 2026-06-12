"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, homePathFor } from "@/lib/auth";

// Real sign-in: validate the password against Supabase Auth, then require a
// provisioned app_users membership before letting anyone through. Accounts are
// created by Urso (scripts/provision-users.mjs) — there is no self-signup.
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
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
