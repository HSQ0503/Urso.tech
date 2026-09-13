import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { getRevenueSummary } from "@/lib/canes/revenue";

// GET /api/v1/canes/revenue — collected money for today / this week / this
// month / this year, plus recurring revenue by month and the year's ARR. The
// whole content of the mobile Dashboard as of the 2026-09-13 redesign.
//
// Owner-only, like Payouts and Insights: a year of collected revenue is the
// business's book, and no ops flag opens it. (The Today report is console-wide
// because DJ dispatches from it; this is not that.)
//
// Money stays in integer cents, untouched.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  return apiOk(await getRevenueSummary());
});
