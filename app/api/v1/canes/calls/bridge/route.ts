import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { bridgeCall } from "@/app/CanesPressure/actions";

// POST /api/v1/canes/calls/bridge — place a click-to-call through Twilio.
//
// NOT the same thing as the app's existing `tel:` links, which is why this
// exists. A tel: dial goes out from Sebastian's personal handset with his
// personal number as caller ID, and the shop learns nothing: no call row, no
// lead event, no duration. bridgeCall rings HIM first, then dials the customer
// with the BUSINESS number as caller ID, and writes the call into the record.
// The web offers it from the lead header, the inbox conversation and the quote
// visit sheet; the phone offered it nowhere, which is backwards — the phone is
// the device he is actually holding.
//
// NO GUARD HERE, deliberately, like every other mutation route in this layer:
// bridgeCall opens with denyUnlessPermitted("calls") — a permission key of its
// own, distinct from "leads" — and getAdminSession()/getTechnicianActor() both
// resolve the bearer, so the action sees the same actor it would on web. A
// second check is a second thing to drift.
//
// `leadId` is optional because a thread need not have a lead (the same reason
// POST /canes/threads/:phone/messages exists). When present the action files the
// call against it; when absent the call still happens and still gets recorded
// against the phone number.

export const dynamic = "force-dynamic";

export const POST = apiRoute(async ({ req }) => {
  let body: { phone?: unknown; leadId?: unknown };
  try {
    body = (await req.json()) as { phone?: unknown; leadId?: unknown };
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.phone !== "string") {
    return apiFail("`phone` must be a string.", 422);
  }
  if (body.leadId !== undefined && typeof body.leadId !== "string") {
    return apiFail("`leadId` must be a string.", 422);
  }

  // The action owns the rest: an empty number, missing Twilio credentials, a
  // missing owner phone, and the Twilio call itself — each refusal a written
  // sentence.
  return apiResult(
    await bridgeCall(body.phone, body.leadId === undefined ? undefined : { leadId: body.leadId }),
  );
});
