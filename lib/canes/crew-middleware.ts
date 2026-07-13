import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  CANES_CREW_AUTH_COOKIE,
  getCanesAuthServerEnv,
} from "@/lib/canes/crew-auth-client";

export async function updateCanesCrewSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getCanesAuthServerEnv();
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      name: CANES_CREW_AUTH_COOKIE,
      path: "/CanesPressure",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedCrewRoute =
    path.startsWith("/CanesPressure/crew") &&
    path !== "/CanesPressure/crew/login";

  if (!user && protectedCrewRoute) {
    const login = request.nextUrl.clone();
    login.pathname = "/CanesPressure/crew/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  return response;
}
