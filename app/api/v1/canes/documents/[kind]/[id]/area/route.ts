import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { setDocumentServiceArea } from "@/app/CanesPressure/area-actions";
import { isServiceArea } from "@urso/types";

export const POST = apiRoute<{ kind: string; id: string }>(async ({ req, params }) => {
  const { kind, id } = params;
  if (kind !== "estimate" && kind !== "job" && kind !== "invoice" && kind !== "plan") {
    return apiFail("Unknown document.", 422);
  }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("area" in body) ||
    (body.area !== null && !isServiceArea(body.area))) {
    return apiFail("Choose a valid service area.", 422);
  }
  return apiResult(await setDocumentServiceArea(kind, id, body.area));
});
