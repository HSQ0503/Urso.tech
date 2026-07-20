import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const CANES_CREW_AUTH_COOKIE = "canes_crew_auth";

function canesAuthEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_CANES_SUPABASE_URL;
  // The publishable key is preferred. The existing server-only secret fallback
  // lets the passwordless Server Action work before that optional env is added;
  // this module is never imported by a Client Component.
  const key =
    process.env.NEXT_PUBLIC_CANES_SUPABASE_PUBLISHABLE_KEY ??
    process.env.CANES_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Canes Supabase Auth is not configured.");
  return { url, key };
}

export async function createCanesAuthClient() {
  // cookies() first: during build-time prerender it signals Next to treat the
  // route as dynamic and skip it. With the env check first, a machine without
  // CANES_* vars (e.g. local dev on another client's work) fails the whole
  // build on /CanesPressure/crew/login instead.
  const cookieStore = await cookies();
  const { url, key } = canesAuthEnv();
  return createServerClient(url, key, {
    cookieOptions: {
      name: CANES_CREW_AUTH_COOKIE,
      path: "/CanesPressure",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes the
          // technician session before protected pages render.
        }
      },
    },
  });
}

export function getCanesAuthServerEnv(): { url: string; key: string } {
  return canesAuthEnv();
}
