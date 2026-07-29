import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listCatalog } from "@/lib/canes/estimates";

// GET /api/v1/canes/catalog — the service catalog behind the estimate builder.
// Its web page, /CanesPressure/estimates/items, gates on
// requirePagePermission("estimates"), so this gates on the same key.
//
// listCatalog(activeOnly = false) is called with its default: the app gets the
// full catalog including inactive rows, the same list the web page renders, and
// decides for itself what to show.
//
// Prices stay in integer cents exactly as the domain read returns them.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;

  const catalog = await listCatalog();
  return apiOk(catalog);
});
