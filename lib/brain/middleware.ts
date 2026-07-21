// Session refresh + edge gating for the brain surface, against the URSO HQ
// project (not Woof Gang). Wired by proxy.ts for /brain paths. Mirrors
// lib/supabase/middleware.ts; the authoritative check stays getBrainUser().

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { URSO_AUTH_COOKIE } from "./supabase";

export async function updateBrainSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response; // env absent — pages render their own notice

  const supabase = createServerClient(url, key, {
    cookieOptions: {
      name: URSO_AUTH_COOKIE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
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
  });

  // IMPORTANT: getUser() also refreshes an expired token — keep this call even
  // if the gating below changes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && path.startsWith("/brain") && path !== "/brain/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/brain/login";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  if (user && path === "/brain/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/brain";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
