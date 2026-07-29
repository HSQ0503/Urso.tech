import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getInvoicePayments } from "@/lib/canes/invoices";

// GET /api/v1/canes/invoices/:id/payments — the payments ledger for one
// invoice, newest first, exactly as the domain returns it.
//
// The ledger is the source of truth for revenue, so the rows pass through
// untouched: integer cents, no formatting, no totals, no balance. Any derived
// number computed here would be a second implementation of money math that
// could drift from lib/canes/types (invoiceBalanceCents) — the client uses the
// same helpers the web console does.
//
// An unknown id yields an empty list rather than a 404: the payments read is
// keyed on invoice_id and never reveals whether that invoice exists.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "invoices");
  if (denied) return denied;

  const payments = await getInvoicePayments(params.id);
  return apiOk(payments);
});
