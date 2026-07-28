import { apiResult, crewRoute } from "@/lib/api/v1";
import { listJobPhotos } from "@/app/CanesPressure/crew-actions";

// GET /api/v1/canes/crew/jobs/:id/photos — the job's photos with signed read
// URLs. The action resolves the technician from the bearer token, scopes the
// job to that technician's crews, and applies the technician visibility filter,
// so this handler only forwards the id.

export const dynamic = "force-dynamic";

export const GET = crewRoute<{ id: string }>(async ({ params }) => {
  return apiResult(await listJobPhotos(params.id));
});
