import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listCrews } from "@/lib/canes/estimates";

// GET /api/v1/canes/crews — the crew roster the schedule board assigns work to.
// Gated on `schedule`, matching requirePagePermission("schedule") on
// app/CanesPressure/(app)/schedule/page.tsx.
//
// Returns every crew, active or not. The web schedule page narrows to
// listCrews(true) for its assignment picker, but a board can still be showing
// jobs on a crew that was since deactivated, and dropping those rows would
// leave the app unable to name them. `active` is on each row, so a picker
// filters client-side without a second request.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  return apiOk(await listCrews());
});
