import { apiOk, apiRoute, requireTechnician } from "@/lib/api/v1";

// GET /api/v1/canes/crew/me — the authenticated technician's identity, crew
// scoping and permission flags. The app calls this once on launch to decide
// which module tree to render; every real authorization decision still happens
// server-side on the endpoint that does the work.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const technician = requireTechnician(actor);
  if (technician instanceof Response) return technician;

  return apiOk({
    accountId: technician.accountId,
    teamMemberId: technician.teamMemberId,
    email: technician.email,
    name: technician.name,
    phone: technician.phone,
    role: technician.role,
    permissions: technician.permissions,
    crewIds: technician.crewIds,
    crewNames: technician.crewNames,
  });
});
