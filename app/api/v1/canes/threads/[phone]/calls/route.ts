import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getThreadCalls } from "@/lib/canes/data";
import { toE164 } from "@/lib/canes/types";

// GET /api/v1/canes/threads/:phone/calls — one thread's calls, oldest first,
// so the app can interleave them with the messages from the sibling route.
//
// Same peer-phone normalization as .../messages: the thread key is the phone
// itself, and it is normalized to E.164 the way the web inbox page normalizes
// its ?thread= parameter.
//
// Gated on "leads" — the inbox page's key. Calls live behind the "calls"
// permission only when the caller is placing one; reading the call log of a
// thread is part of the inbox surface.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ phone: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  return apiOk(await getThreadCalls(peerPhoneFrom(params.phone)));
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
