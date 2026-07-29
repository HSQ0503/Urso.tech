import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listVisitsInRange } from "@/lib/canes/data";

// GET /api/v1/canes/visits?from=<iso>&days=<n> — estimate visits inside an
// arbitrary window.
//
// Gated on `schedule` with the page-parity guard: the only web caller of
// listVisitsInRange is the schedule board, which uses
// requirePagePermission("schedule"). The action-shaped guard would additionally
// admit a flagged plain technician, who is redirected on web.
//
// The window is `from` + a day count because that is the domain signature —
// listVisitsInRange(startIso, days). Deriving a count from a `to` timestamp
// would mean owning DST and ET-midnight semantics here, which belong to the
// domain layer.
//
// VALIDATION IS THIS LAYER'S JOB, not the domain's. An earlier version passed
// both values straight through, assuming the domain checked them. It does not:
// listVisitsInRange does `new Date(startIso).getTime()`, which is NaN for a
// malformed instant, and every comparison after that is false — so a bad request
// answered 200 with an empty array, indistinguishable from a genuinely empty
// schedule. A client with a date-format bug would show "no visits" to someone
// standing in a yard with work booked, and nothing would report an error
// anywhere. Bad input has to fail loudly.

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const from = req.nextUrl.searchParams.get("from");
  const days = req.nextUrl.searchParams.get("days");
  if (!from || !days) return apiFail("Pass `from` (ISO instant) and `days`.", 422);

  if (!Number.isFinite(Date.parse(from))) {
    return apiFail("`from` must be an ISO instant.", 422);
  }
  const dayCount = Number(days);
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_DAYS) {
    return apiFail(`\`days\` must be a whole number between 1 and ${MAX_DAYS}.`, 422);
  }

  const visits = await listVisitsInRange(from, dayCount);
  return apiOk(visits);
});
