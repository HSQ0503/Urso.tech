import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { sendMessage } from "@/app/CanesPressure/actions";
import { getThreadMessages } from "@/lib/canes/data";
import { toE164 } from "@/lib/canes/types";

// GET /api/v1/canes/threads/:phone/messages — one thread's SMS, oldest first.
//
// The thread key IS the peer phone (getThreadMessages(peerPhone)), so the path
// segment is normalized to E.164 exactly the way the web inbox page normalizes
// its ?thread= parameter — a client sending "5615550001" must land on the same
// thread it would on web. An unnormalizable value is passed through untouched
// and simply matches nothing.
//
// Gated on "leads", matching requirePagePermission("leads") on the web page.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ phone: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  return apiOk(await getThreadMessages(peerPhoneFrom(params.phone)));
});

// POST /api/v1/canes/threads/:phone/messages — text the thread. Body: { message }.
//
// The lead route (POST /canes/leads/:id/actions, action "sendMessage") carries
// the lead id as a PATH SEGMENT, so it has no shape at all for a send with no
// lead — and sendMessage's third argument is `string | null | undefined`
// precisely because a thread need not have one. The web composer already sends
// on any thread (Composer({ peerPhone, leadId }) with leadId null), so a
// contact created outside the lead flow, or one whose lead was deleted, was
// textable from the console and untextable from the phone. This route is that
// missing call shape and nothing more: same action, peer phone from the path,
// NO lead id.
//
// NO GUARD HERE, and that is the rule rather than an omission. Every mutation
// route in this layer adds none: sendMessage opens with its own
// denyUnlessPermitted("leads"), and getAdminSession()/getTechnicianActor() both
// resolve the bearer, so the action sees the same actor it would on web. A
// second check is a second thing to drift — it is how completeJob broke for
// every technician for weeks.
//
// The GET above keeps its page-parity guard because a READ backs a page. Using
// the page guard on this WRITE would have been strictly WORSE than none:
// denyUnlessPagePermitted has no technician fallback (see the note beside it in
// lib/api/v1.ts), so it would refuse a flagged caller the action itself allows.
//
// Passing null rather than omitting the lead argument is deliberate: with no
// lead there is no status to advance and no lead event to touch, and the action
// already branches on exactly that.
export const POST = apiRoute<{ phone: string }>(async ({ req, params }) => {
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.message !== "string") {
    return apiFail("`message` must be a string.", 422);
  }

  // The action trims and refuses an empty body, so an empty string is its
  // refusal to write, not this layer's.
  return apiResult(await sendMessage(peerPhoneFrom(params.phone), body.message, null));
});

// Next hands the segment back already URL-decoded; the extra decode only
// rescues a client that percent-encoded the leading "+" twice, and a malformed
// escape falls back to the raw segment instead of throwing a 500.
function peerPhoneFrom(segment: string): string {
  let raw = segment;
  try {
    raw = decodeURIComponent(segment);
  } catch {
    raw = segment;
  }
  return toE164(raw) ?? raw;
}
