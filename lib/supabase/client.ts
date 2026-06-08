import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — for Client Components that read/write directly
// (most data access stays on the server; use this only when a client component
// genuinely needs Supabase).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
