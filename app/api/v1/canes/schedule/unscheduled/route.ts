import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getUnscheduledJobs } from "@/lib/canes/estimates";

// GET /api/v1/canes/schedule/unscheduled — the approved-but-unplaced jobs in
// the schedule tray. Gated on `schedule`, matching
// requirePagePermission("schedule") on app/CanesPressure/(app)/schedule/page.tsx.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  return apiOk(await getUnscheduledJobs());
});
