import { apiFail, apiResult, apiRoute, denyUnlessApiPermitted } from "@/lib/api/v1";
import { sendMessageWithMedia } from "@/app/CanesPressure/actions";
import {
  removeMessageMedia,
  storeMessageMedia,
  validateMessageMedia,
} from "@/lib/canes/message-media";
import { toE164 } from "@/lib/canes/types";

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

  const rawMessage = form.get("message");
  const rawLeadId = form.get("leadId");
  const message = typeof rawMessage === "string" ? rawMessage : "";
  const leadId = typeof rawLeadId === "string" && rawLeadId.length > 0 ? rawLeadId : null;
  const peerPhone = toE164(peerPhoneFrom(params.phone)) ?? peerPhoneFrom(params.phone);

  const stored = await storeMessageMedia(file);
  try {
    const result = await sendMessageWithMedia(peerPhone, message, [stored.ref], leadId);
    if (!result.ok) await removeMessageMedia(stored.path);
    return apiResult(result);
  } catch (error) {
    await removeMessageMedia(stored.path);
    throw error;
  }
});

function peerPhoneFrom(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
