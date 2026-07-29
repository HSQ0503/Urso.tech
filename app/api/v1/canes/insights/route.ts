import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { getInsights, parseRange } from "@/lib/canes/analytics";

// GET /api/v1/canes/insights?range=7d|30d|90d|12m — the metric engine behind
// the owner console's /CanesPressure/insights page.
//
// OWNER ONLY. That page guards with requireOwnerPage(), so this uses
// denyUnlessOwner and never a permission key: no crew flag, however the owner
// sets it, may open a surface that reports collected revenue and margin.
//
// The range comes from the domain's own parseRange, which is what the web page
// calls on its searchParams — so an unknown or missing value falls back to the
// same default ("30d") on mobile as on web. Money stays in integer cents.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  const rangeKey = parseRange(req.nextUrl.searchParams.get("range") ?? undefined);
  return apiOk(await getInsights(rangeKey));
});
