import { apiFail, apiResult, crewRoute } from "@/lib/api/v1";
import { requestJobPhotoUpload } from "@/app/CanesPressure/crew-actions";
import type { JobMediaCategory } from "@/lib/canes/types";

// POST /api/v1/canes/crew/jobs/:id/photos/grant — mint a short-lived signed
// upload URL. The app then PUTs the image straight to private Storage, so the
// bytes never pass through this route.
//
// Shape only: the category value, the mime allow-list and the size ceiling are
// the action's to enforce (it re-checks them at finalize too), and each refusal
// comes back as ok:false → 409 with a notice worth showing.

export const dynamic = "force-dynamic";

export const POST = crewRoute<{ id: string }>(async ({ req, params }) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (!body || typeof body !== "object") return apiFail("Send a JSON body.", 422);

  const { mimeType, sizeBytes, category } = body;
  if (typeof mimeType !== "string") return apiFail("`mimeType` must be a string.", 422);
  if (typeof sizeBytes !== "number") return apiFail("`sizeBytes` must be a number.", 422);
  if (typeof category !== "string") return apiFail("`category` must be a string.", 422);

  return apiResult(
    await requestJobPhotoUpload(params.id, {
      mimeType,
      sizeBytes,
      category: category as JobMediaCategory,
    }),
  );
});
