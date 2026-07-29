import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listThreads } from "@/lib/canes/data";

// GET /api/v1/canes/threads — the shared inbox list: one entry per peer phone
// with its last message, last call and unread flag.
//
// Gated on "leads", the same key the web inbox page passes to
// requirePagePermission("leads").

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  return apiOk(await listThreads());
});
