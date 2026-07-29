import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listLeads } from "@/lib/canes/data";

// GET /api/v1/canes/leads — the lead list, exactly as the owner console's
// /CanesPressure/leads page reads it. That page gates on requirePagePermission
// ("leads"), so this gates on the same key.
//
// No filter is passed through: the web page also calls listLeads() unfiltered
// and narrows in the UI, and filtering here would be logic this layer must not
// own.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const leads = await listLeads();
  return apiOk(leads);
});
