import { apiOk, apiRoute, denyUnlessConsole } from "@/lib/api/v1";
import { getTodayReport } from "@/lib/canes/data";

// GET /api/v1/canes/today-report — the six ET-calendar-day figures behind the
// mobile Dashboard's report grid.
//
// Guarded with denyUnlessConsole, exactly like /canes/overview and for exactly
// the same reason: this is the owner's book — today's revenue, what was sold,
// what tomorrow is worth. The web equivalent is protected by the (app) LAYOUT,
// and /api/v1 has no layout, so the guard has to be stated here or any active
// crew account could read it. Owner or ops-manager, not owner-only, because DJ
// genuinely has the console.
//
// Money stays in integer cents, untouched.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessConsole(actor);
  if (denied) return denied;

  const report = await getTodayReport();
  return apiOk(report);
});
