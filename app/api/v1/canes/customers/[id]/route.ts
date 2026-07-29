import { apiFail, apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { getCustomer } from "@/lib/canes/customers";

// GET /api/v1/canes/customers/:id — one customer's detail record.
//
// A missing id and an id the caller may not see both answer the same 404 with
// the same notice, so the endpoint cannot be used to probe for real ids.
//
// REDACTION — why this does not just return getCustomer() whole.
// CustomerDetail bundles full Estimate and Invoice rows, and `public_token` on
// those is not an identifier, it is a CREDENTIAL: /e/[token] and /i/[token] are
// unauthenticated public pages that grant access to anyone holding the value —
// enough to approve an estimate or open an invoice's pay page. This response is
// gated on `customers`, a lower bar than `estimates` or `invoices`, so returning
// the raw object would hand those tokens to someone the system never granted
// estimate or invoice access. Square ids, the hosted payment URL and
// internal_notes go with them: owner-surface data riding along in a customer read.
//
// The web page never had this problem because it renders server-side and the raw
// rows never reach the browser. Serialising them for a client is what created it.

export const dynamic = "force-dynamic";

type Redactable = Record<string, unknown>;

// Denylist rather than destructuring-to-discard: an explicit list reads as the
// security decision it is, and adding a field to it is a one-line change.
const SENSITIVE_FIELDS = [
  "public_token",
  "internal_notes",
  "square_invoice_id",
  "square_order_id",
  "hosted_payment_url",
] as const;

function stripSensitive(row: Redactable): Redactable {
  const safe: Redactable = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SENSITIVE_FIELDS.includes(key as (typeof SENSITIVE_FIELDS)[number])) safe[key] = value;
  }
  return safe;
}

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  // Page-parity guard: this backs the web customer page, which gates with
  // requirePagePermission("customers"). The action-shaped guard would also admit
  // a flagged plain technician, who is redirected on web.
  const denied = denyUnlessPagePermitted(actor, "customers");
  if (denied) return denied;

  const customer = await getCustomer(params.id);
  if (!customer) return apiFail("Not found.", 404);

  return apiOk({
    ...customer,
    estimates: customer.estimates.map((e) => stripSensitive(e as unknown as Redactable)),
    invoices: customer.invoices.map((i) => stripSensitive(i as unknown as Redactable)),
  });
});
