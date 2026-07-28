import { apiOk, crewRoute } from "@/lib/api/v1";
import { getTechnicianWeek } from "@/lib/canes/crew-data";

// GET /api/v1/canes/crew/week — the authenticated technician's current week:
// the jobs scheduled to their crews plus their own minutes worked. The week
// bounds are computed server-side from the business calendar, so there is
// deliberately no date parameter — the app always sees the same week the web
// console does.

export const dynamic = "force-dynamic";

export const GET = crewRoute(async ({ technician }) => {
  const week = await getTechnicianWeek(technician);
  return apiOk(week);
});
