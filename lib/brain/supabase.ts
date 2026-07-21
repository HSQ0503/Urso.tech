// Urso Brain runs on its OWN Supabase project ("Urso HQ") — completely separate
// from the Woof Gang dashboard project AND the Canes project. Brain users are
// provisioned in the Urso project's Auth dashboard (no self-signup); brain_*
// tables live there too (supabase/urso/0001_brain.sql).
//
// Two clients, Canes-style:
//   ursoAuthClient()  cookie-bound, publishable key — sessions/sign-in state.
//   ursoDb()          secret key, server-only — all brain_* data access
//                     (tables are RLS-on with no policies; ownership is
//                     enforced in the calling code).

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const URSO_AUTH_COOKIE = "urso-brain-auth";

export function ursoAuthEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Urso Supabase auth is not configured — set NEXT_PUBLIC_URSO_SUPABASE_URL and NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY.");
  return { url, key };
}

export async function ursoAuthClient() {
  // cookies() first: during build-time prerender it signals Next to treat the
  // route as dynamic and skip it, so machines without URSO_* env still build.
  const cookieStore = await cookies();
  const { url, key } = ursoAuthEnv();
  return createServerClient(url, key, {
    cookieOptions: {
      name: URSO_AUTH_COOKIE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the
          // session before protected pages render.
        }
      },
    },
  });
}

let cached: SupabaseClient | null = null;

export function ursoDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
  const key = process.env.URSO_SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Urso Supabase is not configured — set NEXT_PUBLIC_URSO_SUPABASE_URL and URSO_SUPABASE_SECRET_KEY.");
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

// Null instead of throw when the secret key is absent. Pages and routes use
// this so a half-configured deploy (auth env present, secret key forgotten —
// sign-in works, data can't) degrades to the setup notice instead of a 500.
export function ursoDbSafe(): SupabaseClient | null {
  try {
    return ursoDb();
  } catch {
    return null;
  }
}

// The one message every API route returns for that state.
export const URSO_DB_MISSING = "The Urso data store isn't configured — set URSO_SUPABASE_SECRET_KEY (see /brain settings notes).";
