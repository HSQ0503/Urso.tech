import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listJobItems } from "@/lib/canes/estimates";

// GET /api/v1/canes/jobs/:id/items — the sold work snapshot for one job, in
// position order, including checklist-only steps. Same `schedule` gate as the
// web schedule page the job detail sheet renders inside.
//
// An unknown job id returns an empty list rather than 404: the underlying read
// is a filter, not a lookup, and an empty array leaks nothing.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  const items = await listJobItems(params.id);
  return apiOk(items);
});
