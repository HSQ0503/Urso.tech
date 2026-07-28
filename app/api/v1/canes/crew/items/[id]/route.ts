import { apiFail, apiResult, crewRoute } from "@/lib/api/v1";
import {
  saveChecklistItemNote,
  setChecklistItemBlocked,
  setChecklistItemDone,
} from "@/app/CanesPressure/crew-actions";

// PATCH /api/v1/canes/crew/items/:id — one checklist item, three mutations.
//
// The web app has three separate controls (a checkbox, a blocked toggle, a note
// field); mobile sends the same three through one endpoint. Exactly one field
// per request keeps each call mapped to exactly one action, so there is no
// ordering question when two of them disagree.
//
// Shape only. The actions resolve the technician from the bearer token, look up
// the item's job, and scope it to that technician's crews.

export const dynamic = "force-dynamic";

export const PATCH = crewRoute<{ id: string }>(async ({ req, params }) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (!body || typeof body !== "object") return apiFail("Send a JSON body.", 422);

  const fields = (["done", "blocked", "note"] as const).filter((key) => key in body);
  if (fields.length !== 1) {
    return apiFail("Send exactly one of: done, blocked, note.", 422);
  }

  const field = fields[0];
  const value = body[field];

  if (field === "note") {
    if (typeof value !== "string") return apiFail("`note` must be a string.", 422);
    return apiResult(await saveChecklistItemNote(params.id, value));
  }

  if (typeof value !== "boolean") return apiFail(`\`${field}\` must be a boolean.`, 422);
  return apiResult(
    field === "done"
      ? await setChecklistItemDone(params.id, value)
      : await setChecklistItemBlocked(params.id, value),
  );
});
