import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Canes Pressure Washing runs on its OWN Supabase project — never the Woof
// Gang database. Server-only client with the secret key (RLS is deny-all; the
// publishable key exists for future client-side needs, not data access).

export function canesConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CANES_SUPABASE_URL && process.env.CANES_SUPABASE_SECRET_KEY);
}

let cached: SupabaseClient | null = null;

export function canesDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_CANES_SUPABASE_URL;
  const key = process.env.CANES_SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Canes Supabase is not configured — set NEXT_PUBLIC_CANES_SUPABASE_URL and CANES_SUPABASE_SECRET_KEY.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.CANES_TWILIO_ACCOUNT_SID &&
      process.env.CANES_TWILIO_AUTH_TOKEN &&
      process.env.CANES_TWILIO_NUMBER,
  );
}
