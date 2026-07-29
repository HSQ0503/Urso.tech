import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getLead } from "@/lib/canes/data";

// GET /api/v1/canes/leads/:id — one lead. Same "leads" gate as the web detail
// page (requirePagePermission("leads")).
//
// A missing lead and a lead the caller may not see answer identically, so the
// endpoint cannot be used to probe for valid ids.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const lead = await getLead(params.id);
  if (!lead) return apiFail("Not found.", 404);

  return apiOk(lead);
});
