import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on each request, forwards the updated
// cookies, and gates the authed surfaces: /dashboard and /console require a
// signed-in user. Wired up by proxy.ts at the repo root (Next 16's rename of
// middleware.ts). This is the optimistic edge check — the authoritative check
// is getSession() in lib/auth.ts, which also requires an app_users membership
// row, so an unprovisioned login still can't see anything.
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

  // IMPORTANT: getUser() also refreshes an expired token — keep this call even
  // if the gating below changes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = path.startsWith("/dashboard") || path.startsWith("/console");
  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Signed-in visitors to /login are routed home by the login page itself —
  // it knows the role (and membership), the edge doesn't.

  return response;
}
