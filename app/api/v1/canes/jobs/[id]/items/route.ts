import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import {
  addJobChecklistItem,
  removeJobChecklistItem,
} from "@/app/CanesPressure/crew-owner-actions";
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

// Owner checklist editing uses the same collection route as the read. Keeping
// add/remove behind the schedule permission means the native editor and web
// job sheet share the domain actions and their refusal messages.
export const POST = apiRoute<{ id: string }>(async ({ req, actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "schedule");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }

  if (body.action === "add") {
    if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
    if (typeof body.required !== "boolean") {
      return apiFail("`required` must be a boolean.", 422);
    }
    return apiResult(
      await addJobChecklistItem({
        jobId: params.id,
        name: body.name,
        required: body.required,
      }),
    );
  }

  if (body.action === "remove") {
    if (typeof body.itemId !== "string") return apiFail("`itemId` must be a string.", 422);
    return apiResult(await removeJobChecklistItem(body.itemId));
  }

  return apiFail("Send an `action` of add or remove.", 422);
});
