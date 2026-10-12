import { randomUUID } from "node:crypto";
import { invoiceBalanceCents, type Invoice } from "@urso/types";
import { canesDb } from "./supabase";
import { getInvoice, getInvoiceItems } from "./invoices";
import { createSquareInvoice } from "./square";
import { invoicePublishFingerprint } from "./invoice-publish-fingerprint";
import { pushPaymentIssue } from "./push-events";

type BillingInvoice = Invoice & {
  square_publish_attempt_key: string | null;
  square_publish_fingerprint: string | null;
  billing_operation_id: string | null;
};
export async function claimServiceInvoiceLease(
  invoiceId: string,
): Promise<string> {
  const operation = randomUUID();
  const { data, error } = await canesDb().rpc(
    "claim_invoice_billing_operation",
    { p_invoice_id: invoiceId, p_operation_id: operation },
  );
  if (error || data !== true)
    throw new Error(
      "This invoice is being paid or updated. Refresh before continuing.",
    );
  return operation;
}
export async function releaseServiceInvoiceLease(
  invoiceId: string,
  operation: string,
): Promise<void> {
  const { error } = await canesDb().rpc("release_invoice_billing_operation", {
    p_invoice_id: invoiceId,
    p_operation_id: operation,
  });
  if (error)
    console.error(
      "[canes] service invoice lease could not be released",
      invoiceId,
    );
}

export async function publishServiceInvoice(
  invoiceId: string,
): Promise<{ ok: boolean; notice: string; hostedUrl?: string }> {
  const settled = await getInvoice(invoiceId);
  if (settled?.status === "paid")
    return { ok: true, notice: "Payment is settled." };
  const operation = await claimServiceInvoiceLease(invoiceId),
    db = canesDb();
  try {
    const invoice = (await getInvoice(invoiceId)) as BillingInvoice | null;
    if (
      !invoice?.service_autopay_authorization_id ||
      !invoice.service_autopay_finalized_at ||
      invoice.status === "void"
    )
      return {
        ok: false,
        notice:
          "The invoice needs confirmed payment authorization and final approval.",
      };
    if (invoice.status === "paid" || invoiceBalanceCents(invoice) <= 0)
      return {
        ok: true,
        notice: "Payment is settled. Your agreement status has been updated.",
      };
    if (
      invoice.square_invoice_id &&
      invoice.hosted_payment_url &&
      !invoice.square_publish_attempt_key
    )
      return {
        ok: true,
        hostedUrl: invoice.hosted_payment_url,
        notice:
          invoice.service_payment_issue ??
          "Square is processing the authorized payment. Your receipt will arrive by email.",
      };
    const items = await getInvoiceItems(invoice.id),
      fingerprint = invoicePublishFingerprint(invoice, items);
    if (
      invoice.square_publish_attempt_key &&
      invoice.square_publish_fingerprint !== fingerprint
    )
      return {
        ok: false,
        notice:
          "An earlier payment attempt needs reconciliation. No new charge was started.",
      };
    if (!invoice.square_publish_attempt_key) {
      if (invoice.square_invoice_id)
        return {
          ok: false,
          notice:
            "The earlier Square invoice needs review before another payment attempt.",
        };
      const { data, error } = await db
        .from("invoices")
        .update({
          square_publish_attempt_key: fingerprint,
          square_publish_fingerprint: fingerprint,
          square_publish_started_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("billing_operation_id", operation)
        .is("square_publish_attempt_key", null)
        .is("square_invoice_id", null)
        .select("id")
        .maybeSingle();
      if (error || !data)
        return {
          ok: false,
          notice:
            "The invoice changed before payment could start. Refresh to check its status.",
        };
    }
    const attempt = invoice.square_publish_attempt_key ?? fingerprint;
    const result = await createSquareInvoice(invoice, items, attempt);
    // Persist all returned provider identities even after an uncertain publish.
    // A retry reuses the same request key; it never cancels a possibly paid bill.
    const complete = Boolean(
      !result.error &&
      result.squareInvoiceId &&
      result.squareOrderId &&
      result.hostedUrl,
    );
    const patch = {
      ...(result.squareInvoiceId
        ? { square_invoice_id: result.squareInvoiceId }
        : {}),
      ...(result.squareOrderId
        ? { square_order_id: result.squareOrderId }
        : {}),
      ...(result.hostedUrl ? { hosted_payment_url: result.hostedUrl } : {}),
      ...(complete
        ? {
            status: "sent",
            sent_at: invoice.sent_at ?? new Date().toISOString(),
            square_publish_attempt_key: null,
            square_publish_fingerprint: null,
            square_publish_started_at: null,
            service_payment_issue: null,
          }
        : {
            service_payment_issue:
              "The authorized Square payment needs reconciliation. Retry this unchanged invoice; do not create another charge.",
          }),
    };
    const { data, error } = await db
      .from("invoices")
      .update(patch)
      .eq("id", invoice.id)
      .eq("billing_operation_id", operation)
      .eq("square_publish_attempt_key", attempt)
      .eq("amount_paid_cents", invoice.amount_paid_cents)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      const current = await getInvoice(invoice.id);
      if (current?.status === "paid")
        return { ok: true, notice: "Payment received." };
      return {
        ok: false,
        notice:
          "Square may have accepted the payment, but its local status is still being reconciled. No second charge was started.",
      };
    }
    if (!complete) {
      await pushPaymentIssue({
        eventId: `service-billing:${invoice.id}:${attempt}`,
        invoiceId: invoice.id,
        jobId: invoice.job_id,
        title: "Recurring payment needs review",
        detail: `${invoice.number} could not confirm its authorized Square payment. Check the existing attempt before collecting again.`,
      }).catch(() => {});
      return { ok: false, notice: patch.service_payment_issue! };
    }
    return {
      ok: true,
      hostedUrl: result.hostedUrl!,
      notice:
        "Square is processing the authorized payment and will email your receipt. Service activates after the current invoice is settled.",
    };
  } finally {
    await releaseServiceInvoiceLease(invoiceId, operation);
  }
}
