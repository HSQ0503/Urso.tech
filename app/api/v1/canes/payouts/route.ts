import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { computePayouts, parsePayoutRange } from "@/lib/canes/payouts";

// GET /api/v1/canes/payouts?range=day|week|month|year — the payout waterfall
// and per-person cut, exactly as /CanesPressure/payouts computes it.
//
// OWNER ONLY, matching requireOwnerPage() on that page. This is the single most
// sensitive read in the app — it names every person's take-home — so it gates
// on denyUnlessOwner and never on a permission key.
//
// parsePayoutRange is the domain's own parser (default "month"), so the ET
// calendar period mobile sees is identical to the web's. Integer cents
// throughout, passed through untouched.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  const rangeKey = parsePayoutRange(req.nextUrl.searchParams.get("range") ?? undefined);
  return apiOk(await computePayouts(rangeKey));
});
