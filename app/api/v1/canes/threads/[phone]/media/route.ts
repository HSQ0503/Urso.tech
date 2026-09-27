import { apiFail, apiResult, apiRoute, denyUnlessApiPermitted } from "@/lib/api/v1";
import { sendPhotoMessage } from "@/app/CanesPressure/actions";
import { validateMessageMedia } from "@/lib/canes/message-media";

// POST /api/v1/canes/threads/:phone/media — send one photo as MMS.
// Multipart fields: file, message (optional), leadId (optional).

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ phone: string }>(async ({ req, actor, params }) => {
  const denied = denyUnlessApiPermitted(actor, "leads");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiFail("Send a photo upload.", 422);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiFail("Choose a photo to send.", 422);
  const invalid = validateMessageMedia(file);
  if (invalid) return apiFail(invalid, 422);

  return apiResult(await sendPhotoMessage(peerPhoneFrom(params.phone), form));
});

function peerPhoneFrom(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
