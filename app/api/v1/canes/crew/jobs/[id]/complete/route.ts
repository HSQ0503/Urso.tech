import { apiResult, crewRoute } from "@/lib/api/v1";
import { completeTechnicianJob } from "@/app/CanesPressure/crew-actions";

// POST /api/v1/canes/crew/jobs/:id/complete — the technician marks the job done.
//
// The action holds every precondition (photos, checklist, status, crew scope)
// and resolves the technician from the bearer token itself, so this handler
// only forwards the id. Unmet preconditions arrive as ok:false → 409.

export const dynamic = "force-dynamic";

export const POST = crewRoute<{ id: string }>(async ({ params }) => {
  return apiResult(await completeTechnicianJob(params.id));
});
