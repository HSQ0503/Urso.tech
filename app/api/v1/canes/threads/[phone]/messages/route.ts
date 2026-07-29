import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
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
