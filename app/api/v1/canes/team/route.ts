import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { listTeamMembers } from "@/lib/canes/payouts";

// GET /api/v1/canes/team — the active roster with each member's compensation
// setup, the same read /CanesPressure/payouts makes.
//
// OWNER ONLY. The roster rows carry comp_type, comp_bps and hourly_cents —
// everyone's pay terms — and the only page that renders them is guarded by
// requireOwnerPage(), so this uses denyUnlessOwner rather than a permission key.
//
// No filter parameter: listTeamMembers() takes none, and the web page narrows
// in the UI.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  return apiOk(await listTeamMembers());
});
