import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getInvoiceWithItems } from "@/lib/canes/invoices";

// GET /api/v1/canes/invoices/:id — one invoice with its line items and its
// payments, the same read the web detail page performs.
//
// A missing invoice and an invoice the caller may not see are both 404 with the
// same notice. Distinguishing them would turn this endpoint into an oracle for
// enumerating invoice ids.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "invoices");
  if (denied) return denied;

  const invoice = await getInvoiceWithItems(params.id);
  if (!invoice) return apiFail("Not found.", 404);

  return apiOk(invoice);
});
