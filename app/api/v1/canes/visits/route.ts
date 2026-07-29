import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted, isIsoInstant } from "@/lib/api/v1";
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
//
// And `Number.isFinite(Date.parse(from))` was not enough to make it fail loudly.
// V8 falls back to a legacy parser, so "3" and "tomorrow at 3" are both
// 2001-03-01 rather than NaN: they cleared that check, produced a window
// twenty-five years wide of the mark, and returned the same empty array with the
// same 200. isIsoInstant also REQUIRES an offset, which matters more here than
// anywhere else in this layer — the window is ET wall time, so a naive
// "2026-08-01T00:00" would be read in the server's zone (UTC in production) and
// silently shift the day boundary by four or five hours. Every real caller
// already sends a resolved instant: the web page and the app both compose it
// with etLocalToIso, which ends in toISOString().

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const from = req.nextUrl.searchParams.get("from");
  const days = req.nextUrl.searchParams.get("days");
  if (!from || !days) return apiFail("Pass `from` (ISO instant) and `days`.", 422);

  if (!isIsoInstant(from)) {
    return apiFail("`from` must be an ISO instant.", 422);
  }
  const dayCount = Number(days);
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_DAYS) {
    return apiFail(`\`days\` must be a whole number between 1 and ${MAX_DAYS}.`, 422);
  }

  const visits = await listVisitsInRange(from, dayCount);
  return apiOk(visits);
});
