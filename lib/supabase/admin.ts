import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client for server-side ingestion (writing OAuth tokens,
// running syncs). Uses the SECRET key and bypasses RLS, so it must NEVER be
// imported into a client component or exposed to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
