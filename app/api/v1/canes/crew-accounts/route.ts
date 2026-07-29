import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { listTechnicianAccountsForOwner } from "@/lib/canes/crew-admin";

// GET /api/v1/canes/crew-accounts — the crew account admin roster (members,
// provisioning state, crews). Owner-only, matching the web settings page's
// requireOwnerPage().
//
// listTechnicianAccountsForOwner() re-checks the owner session ITSELF via the
// web session cookie, so over bearer auth it answers { ready: false, rows: [],
// crews: [] }. That is a fail-closed empty payload, never someone else's data,
// and the shape is unchanged — the client renders its "not ready" state. Making
// it return rows for a bearer admin means changing the domain function, which
// is out of scope here (see the note in the report).

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  const accounts = await listTechnicianAccountsForOwner();
  return apiOk(accounts);
});
