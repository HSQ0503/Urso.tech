import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getLeadEvents } from "@/lib/canes/data";

// GET /api/v1/canes/leads/:id/events — the lead's activity timeline, the same
// read the web detail page makes. Gated on "leads", matching that page.
//
// An unknown lead id yields an empty list rather than a 404: getLeadEvents is
// a plain scoped read and adding an existence probe here would mean a second
// query this layer has no business owning.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const events = await getLeadEvents(params.id);
  return apiOk(events);
});
