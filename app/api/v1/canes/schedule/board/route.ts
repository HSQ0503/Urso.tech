import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted, isIsoInstant } from "@/lib/api/v1";
import { getScheduleBoard } from "@/lib/canes/estimates";

// GET /api/v1/canes/schedule/board?from=<iso>&days=<n> — the placed jobs the
// schedule board renders. Gated on `schedule`, matching
// requirePagePermission("schedule") on app/CanesPressure/(app)/schedule/page.tsx.
//
// The domain function takes (rangeStartIso, days), NOT a from/to pair, so the
// query string mirrors it exactly. `from` is handed to the library verbatim:
// the window is America/New_York wall time and the caller already resolved it
// (the web page runs its ET midnight through etLocalToIso), so re-formatting it
// here would be a second, divergent source of DST truth.
//
// Passing it through verbatim is NOT the same as not checking it, though, and
// this route used to do the second thing: presence was the only test. getScheduleBoard
// opens with `if (Number.isNaN(start.getTime())) return []`, so a malformed
// `from` answered 200 with an empty board — indistinguishable from a genuinely
// clear week, to a dispatcher looking at a day that actually has work on it. A
// non-instant that V8 happens to coerce ("3" → 2001-03-01) is worse still: it
// returns a real, confidently empty window from the wrong century.
//
// isIsoInstant requires the offset the range semantics depend on. A naive
// "2026-08-01T00:00" would resolve in the SERVER's zone — UTC in production —
// and move the ET day boundary by four or five hours, quietly dropping the first
// or last job of the window.

export const dynamic = "force-dynamic";

const MAX_DAYS = 92;

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const from = req.nextUrl.searchParams.get("from");
  if (!from) return apiFail("`from` is required — an ISO timestamp for the window start.", 422);
  if (!isIsoInstant(from)) {
    return apiFail("`from` must be an ISO instant, with a Z or ±HH:MM offset.", 422);
  }

  const rawDays = req.nextUrl.searchParams.get("days");
  let days: number | undefined;
  if (rawDays !== null) {
    days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return apiFail(`\`days\` must be a whole number between 1 and ${MAX_DAYS}.`, 422);
    }
  }

  return apiOk(await getScheduleBoard(from, days));
});
