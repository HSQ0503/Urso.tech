import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { readMobileToken } from "@/lib/urso-auth";

// Server-side Supabase client — for Server Components, Server Actions and Route
// Handlers. Reads the auth session from cookies so Row-Level Security sees the
// signed-in user. `cookies()` is async in Next 16, so this is async too:
//   const supabase = await createClient();
export async function createClient() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const authorization = requestHeaders.get("authorization");

  // The Expo client presents a Supabase access token as Bearer auth. Forward
  // it to PostgREST so its RLS policies see the same auth.uid() as the web
  // cookie path. We deliberately do not decode the token here: auth.getUser()
  // remains the verification step at the API boundary.
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    // An Urso mobile token is not a Supabase JWT. It can use the service client
    // only after its HMAC has been checked and its *current* configured scope
    // is admin. This keeps support access explicit while regular Bearer JWTs
    // remain constrained by RLS.
    try {
      const token = authorization.slice(7).trim();
      if (readMobileToken(token)?.scope === "admin") return createAdminClient();
    } catch {
      // A missing production signing key fails closed below as an ordinary
      // Supabase bearer instead of turning a malformed request into a 500.
    }
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore — the middleware refreshes the session instead.
          }
        },
      },
      global: authorization ? { headers: { Authorization: authorization } } : undefined,
    },
  );
}
