import { apiFail, apiResult, crewRoute } from "@/lib/api/v1";
import { finalizeJobPhotoUpload } from "@/app/CanesPressure/crew-actions";
import type { MediaFinalizeInput } from "@/lib/canes/media";
import type { JobMediaCategory } from "@/lib/canes/types";

// POST /api/v1/canes/crew/jobs/:id/photos/finalize — record an upload that has
// already landed in Storage.
//
// jobId comes from the URL, never the body: the body is client-supplied and
// must not be able to point a finished upload at a different job than the one
// the caller was granted access to. Everything else is metadata the action
// re-validates before it writes a row.

export const dynamic = "force-dynamic";

export const POST = crewRoute<{ id: string }>(async ({ req, params }) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (!body || typeof body !== "object") return apiFail("Send a JSON body.", 422);

  const { mediaId, category, mimeType, sizeBytes, width, height, capturedAt, caption } = body;
  if (typeof mediaId !== "string") return apiFail("`mediaId` must be a string.", 422);
  if (typeof category !== "string") return apiFail("`category` must be a string.", 422);
  if (typeof mimeType !== "string") return apiFail("`mimeType` must be a string.", 422);
  if (typeof sizeBytes !== "number") return apiFail("`sizeBytes` must be a number.", 422);
  if (width != null && typeof width !== "number") return apiFail("`width` must be a number.", 422);
  if (height != null && typeof height !== "number") return apiFail("`height` must be a number.", 422);
  if (capturedAt != null && typeof capturedAt !== "string") {
    return apiFail("`capturedAt` must be an ISO date string.", 422);
  }
  if (caption != null && typeof caption !== "string") {
    return apiFail("`caption` must be a string.", 422);
  }

  const input: MediaFinalizeInput = {
    jobId: params.id,
    mediaId,
    category: category as JobMediaCategory,
    mimeType,
    sizeBytes,
    width: width ?? null,
    height: height ?? null,
    capturedAt: capturedAt ?? null,
    caption: caption ?? null,
  };

  return apiResult(await finalizeJobPhotoUpload(input));
});
