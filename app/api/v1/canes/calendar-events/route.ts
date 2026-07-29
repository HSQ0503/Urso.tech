import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted, isIsoInstant } from "@/lib/api/v1";
import { listCalendarEvents } from "@/lib/canes/estimates";

// GET /api/v1/canes/calendar-events?from=<iso>&days=<n> — the holiday / time
// off / note blocks drawn behind the schedule board. Gated on `schedule`,
// matching requirePagePermission("schedule") on
// app/CanesPressure/(app)/schedule/page.tsx.
//
// Same window contract as /schedule/board: the domain function takes
// (rangeStartIso, days), and `from` is passed through verbatim so the ET
// boundary the caller resolved is the only one in play — and validated here for
// the same reason. listCalendarEvents also returns [] for an unparseable start,
// so without this the blocks behind the board silently vanished rather than
// erroring, and a V8-coercible non-instant returned a real window from the wrong
// year. The offset is required because the boundary is ET wall time.

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

  return apiOk(await listCalendarEvents(from, days));
});
