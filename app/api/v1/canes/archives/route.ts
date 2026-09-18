import {
  apiFail,
  apiOk,
  apiResult,
  apiRoute,
  denyUnlessOwner,
} from "@/lib/api/v1";
import {
  listArchivedDocuments,
  restoreArchivedDocument,
} from "@/app/CanesPressure/archive-actions";
export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  const result = await listArchivedDocuments();
  return result.ok ? apiOk(result.data) : apiFail(result.notice, 409);
});
export const POST = apiRoute(async ({ actor, req }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !["estimate", "job", "invoice"].includes(body.kind)
  )
    return apiFail("Choose a valid record.", 422);
  return apiResult(await restoreArchivedDocument(body.kind, body.id));
});
