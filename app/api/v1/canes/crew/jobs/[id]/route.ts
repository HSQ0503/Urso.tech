import { apiFail, apiOk, crewRoute } from "@/lib/api/v1";
import { getTechnicianJob } from "@/lib/canes/crew-data";

// GET /api/v1/canes/crew/jobs/:id — one job's full detail, scoped to the
// technician's crews by the read itself.
//
// A job outside that scope and a job that does not exist both come back as
// null, and both answer 404 with the same notice. Distinguishing them would
// turn this endpoint into an oracle for enumerating job ids.

export const dynamic = "force-dynamic";

export const GET = crewRoute<{ id: string }>(async ({ technician, params }) => {
  const job = await getTechnicianJob(technician, params.id);
  if (!job) return apiFail("Job not found.", 404);

  return apiOk(job);
});
