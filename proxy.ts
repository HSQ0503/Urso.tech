import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { updateCanesCrewSession } from "@/lib/canes/crew-middleware";

// Next 16: proxy.ts replaces middleware.ts. Session refresh + auth gating live
// in lib/supabase/middleware.ts; the matcher keeps this off the public
// marketing pages and the API routes (cron + webhooks carry their own secrets).
export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/CanesPressure/crew") ||
    request.nextUrl.pathname === "/CanesPressure/auth/callback"
  ) {
    return updateCanesCrewSession(request);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/console/:path*",
    "/login",
    "/CanesPressure/crew/:path*",
    "/CanesPressure/auth/callback",
  ],
};
