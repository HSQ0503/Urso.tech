import { apiOk, apiRoute, denyUnlessConsole } from "@/lib/api/v1";
import { getOverview } from "@/lib/canes/data";

// GET /api/v1/canes/overview — the Today surface, exactly as the owner console's
// /CanesPressure page reads it.
//
// The Today PAGE carries no requirePagePermission, and an earlier version of
// this route read that as "no guard needed". That was wrong, and it opened the
// worst hole of this build: the protection lives in the (app) LAYOUT, which
// redirects a plain technician to /CanesPressure/crew before the page ever
// renders. /api/v1 has no layout, so any active crew account could read the
// owner's collected revenue, booked pipeline and entire lead book.
//
// denyUnlessConsole is that layout guard expressed for the API — owner or
// ops-manager, not owner-only, because DJ genuinely has Today on the web.
// Money stays in integer cents, untouched.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessConsole(actor);
  if (denied) return denied;

  const overview = await getOverview();
  return apiOk(overview);
});
