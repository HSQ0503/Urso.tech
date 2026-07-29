import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listInvoices } from "@/lib/canes/invoices";

// GET /api/v1/canes/invoices — the invoice list, exactly as the owner console's
// /CanesPressure/invoices page reads it. That page gates on
// requirePagePermission("invoices"), so this gates on the same key.
//
// Money is returned in the integer cents the domain stores. Formatting is a
// client concern; rounding or summing here would make the API and the web
// console disagree about the same invoice.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "invoices");
  if (denied) return denied;

  const invoices = await listInvoices();
  return apiOk(invoices);
});
