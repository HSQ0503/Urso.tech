import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listRecentCalls } from "@/lib/canes/data";

// GET /api/v1/canes/calls — the shop-wide call log, newest first. Backs the
// mobile Inbox's Call Logs tab (missed calls, calls placed, calls answered).
//
// Gated on "leads", the same key the inbox list (/canes/threads) uses — a call
// log is the inbox read in another shape, not a new permission.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  return apiOk(await listRecentCalls());
});
