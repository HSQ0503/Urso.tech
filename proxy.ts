import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16: proxy.ts replaces middleware.ts. Session refresh + auth gating live
// in lib/supabase/middleware.ts; the matcher keeps this off the public
// marketing pages and the API routes (cron + webhooks carry their own secrets).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/console/:path*", "/login"],
};
