import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getScheduleBoard } from "@/lib/canes/estimates";

// GET /api/v1/canes/schedule/board?from=<iso>&days=<n> — the placed jobs the
// schedule board renders. Gated on `schedule`, matching
// requirePagePermission("schedule") on app/CanesPressure/(app)/schedule/page.tsx.
//
// The domain function takes (rangeStartIso, days), NOT a from/to pair, so the
// query string mirrors it exactly. `from` is handed to the library verbatim:
// the window is America/New_York wall time and the caller already resolved it
// (the web page runs its ET midnight through etLocalToIso), so re-parsing or
// re-formatting it here would be a second, divergent source of DST truth.

export const dynamic = "force-dynamic";

const MAX_DAYS = 92;

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const from = req.nextUrl.searchParams.get("from");
  if (!from) return apiFail("`from` is required — an ISO timestamp for the window start.", 422);

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
