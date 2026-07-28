import { apiResult, crewRoute } from "@/lib/api/v1";
import { checkOutFromJob } from "@/app/CanesPressure/crew-actions";

// POST /api/v1/canes/crew/jobs/:id/check-out — the technician leaves the site.
//
// Same shape as check-in: no body, no local checks. The action authenticates,
// scopes the job to the technician's crews and decides whether the current
// status permits a check-out; a refusal maps to 409 with its own notice.

export const dynamic = "force-dynamic";

export const POST = crewRoute<{ id: string }>(async ({ params }) => {
  return apiResult(await checkOutFromJob(params.id));
});
