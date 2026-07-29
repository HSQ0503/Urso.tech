import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getJobWithItems } from "@/lib/canes/estimates";

// GET /api/v1/canes/jobs/:id — the OWNER surface for one job, with its sold
// line items joined. The technician equivalent lives at
// /api/v1/canes/crew/jobs/:id and scopes the read to the caller's crews; this
// one is unscoped, so it carries the same `schedule` permission the web
// schedule page gates on (requirePagePermission("schedule")).
//
// A missing job and a job the caller shouldn't see answer identically (404,
// same notice) so the endpoint can't be used to probe for job ids.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const job = await getJobWithItems(params.id);
  if (!job) return apiFail("Not found.", 404);

  return apiOk(job);
});
