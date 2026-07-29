import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { getTeamHours } from "@/lib/canes/payouts";

// GET /api/v1/canes/team/hours — the check-in/out timesheet per team member
// (today / week / month / all time plus the auditable entry list), as rendered
// on /CanesPressure/payouts.
//
// OWNER ONLY, matching requireOwnerPage() on that page. It reports every
// technician's hours, which is exactly the cross-crew visibility a technician
// or ops manager must not get from the mobile app.
//
// No range parameter: getTeamHours() takes no arguments — it computes its own
// ET day/week/month buckets internally, so there is nothing for this layer to
// parse or pass. The web page calls it the same bare way.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  return apiOk(await getTeamHours());
});
