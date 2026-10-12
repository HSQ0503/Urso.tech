import { createHash } from "node:crypto";
import type { Invoice, InvoiceItem } from "@urso/types";

export function invoicePublishFingerprint(
  invoice: Invoice,
  items: InvoiceItem[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        invoice: {
          id: invoice.id,
          contactId: invoice.contact_id,
          customerName: invoice.customer_name,
          customerPhone: invoice.customer_phone,
          customerEmail: invoice.customer_email,
          jobName: invoice.job_name,
          totalCents: invoice.total_cents,
          paidCents: invoice.amount_paid_cents,
          adjustmentCents: invoice.adjustment_cents,
          taxCents: invoice.tax_cents,
          ...(invoice.service_autopay_authorization_id
            ? {
                cardAuthorizationId: invoice.service_autopay_authorization_id,
                finalizedAt: invoice.service_autopay_finalized_at,
              }
            : {}),
        },
        items: items.map((item) => ({
          position: item.position,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          lineTotalCents: item.line_total_cents,
        })),
      }),
    )
    .digest("hex")
    .slice(0, 32);
}
