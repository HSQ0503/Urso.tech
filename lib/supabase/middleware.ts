import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on each request and forwards the updated
// cookies. This helper is ready but DORMANT until real auth (Phase 1): the
// dashboard is still gated by the mock `urso_session` cookie via lib/auth.ts,
// so there is no root middleware.ts wiring this up yet. Add the redirect/gating
// logic here when we swap getSession() over to Supabase Auth.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Touch the user so the session token stays fresh. No redirects here yet —
  // mock auth still owns route gating until Phase 1.
  await supabase.auth.getUser();

  return response;
}
