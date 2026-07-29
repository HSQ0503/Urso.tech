import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listInvoiceRewards } from "@/lib/canes/rewards";

// GET /api/v1/canes/invoices/:id/rewards — the review rewards attached to one
// invoice. The web console surfaces these inside the invoice detail page, which
// gates on requirePagePermission("invoices"), so this uses the same key.
//
// Reward cents are already folded into the invoice total by the domain; they
// are returned raw here and never re-applied.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "invoices");
  if (denied) return denied;

  const rewards = await listInvoiceRewards(params.id);
  return apiOk(rewards);
});
