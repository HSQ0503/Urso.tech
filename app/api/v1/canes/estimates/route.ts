import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listEstimates } from "@/lib/canes/estimates";

// GET /api/v1/canes/estimates — the estimate list, exactly as the owner
// console's /CanesPressure/estimates page reads it. That page gates on
// requirePagePermission("estimates"), so this gates on the same key.
//
// listEstimates() accepts an optional { leadId, status } filter; nothing is
// passed through here. The web page reads unfiltered and narrows in the UI, and
// deciding what to filter by would be logic this layer must not own.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;

  const estimates = await listEstimates();
  return apiOk(estimates);
});
