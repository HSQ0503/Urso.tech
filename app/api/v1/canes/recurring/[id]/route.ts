import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getPlanDetail } from "@/lib/canes/recurring";

// GET /api/v1/canes/recurring/:id — one plan with its services and every visit
// it has produced (newest first). Same `estimates` gate as the list.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;
  const plan = await getPlanDetail(params.id);
  if (!plan) return apiFail("Not found.", 404);
  return apiOk(plan);
});
