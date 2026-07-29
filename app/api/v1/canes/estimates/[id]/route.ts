import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getEstimateWithItems } from "@/lib/canes/estimates";

// GET /api/v1/canes/estimates/:id — one estimate with its line items, matching
// /CanesPressure/estimates/[id], which gates on requirePagePermission
// ("estimates").
//
// A missing estimate answers 404 with the same notice any other unreadable id
// would get, so the endpoint cannot be used to probe for valid ids.
//
// Totals stay in integer cents exactly as the domain read returns them.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;

  const estimate = await getEstimateWithItems(params.id);
  if (!estimate) return apiFail("Not found.", 404);

  return apiOk(estimate);
});
