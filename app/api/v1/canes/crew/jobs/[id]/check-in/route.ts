import { apiResult, crewRoute } from "@/lib/api/v1";
import { checkInToJob } from "@/app/CanesPressure/crew-actions";

// POST /api/v1/canes/crew/jobs/:id/check-in — the technician arrives on site.
//
// No body, and no checks here: the action resolves the technician itself
// (requireTechnicianActor reads the bearer token as well as the cookie), scopes
// the job to that technician's crews, and owns the status and claim rules. A
// refusal comes back as ok:false and apiResult turns it into a 409 the client
// shows verbatim.

export const dynamic = "force-dynamic";

export const POST = crewRoute<{ id: string }>(async ({ params }) => {
  return apiResult(await checkInToJob(params.id));
});
