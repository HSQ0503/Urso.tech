import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getLeadCalls } from "@/lib/canes/data";

// GET /api/v1/canes/leads/:id/calls — the calls attached to this lead, the same
// read the web detail page makes. Gated on "leads" like that page, NOT on
// "calls": this is the lead surface, and the web console does not ask for the
// calls permission to render it.
//
// An unknown lead id yields an empty list, for the same reason as /events.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const calls = await getLeadCalls(params.id);
  return apiOk(calls);
});
