"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  priceServices,
  type DocumentChange,
  type DocumentEdit,
  type DocumentKind,
  type Estimate,
  type Invoice,
  type Job,
} from "@urso/types";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { getAdminSession } from "@/lib/urso-auth";
import { getTechnicianActor } from "@/lib/canes/crew-auth";
import {
  deleteDepositLink,
  retireSquareInvoice,
  squareRevisionLedgerMatches,
} from "@/lib/canes/square";
import { getInvoice } from "@/lib/canes/invoices";
import { getEstimate, getJobByEstimateId } from "@/lib/canes/estimates";
import { setJobStatus, voidInvoice } from "@/app/CanesPressure/actions";

type LineRow = {
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents?: number;
  line_total_cents: number;
  discount_mode?: "amount" | "percent";
  discount_value?: number;
  discount_cents?: number;
  taxable?: boolean;
  is_option?: boolean;
  is_mandatory?: boolean;
  is_selected?: boolean;
  package_group?: string | null;
  kind?: string;
};
type Graph = {
  fingerprint: string;
  repeat?: { id: string; future: { id: string; has_money: boolean }[] } | null;
  invoiceRewardCents: number;
  estimate: (Estimate & { items: LineRow[] }) | null;
  job:
    | (Job & {
        items: LineRow[];
        adjustment_cents?: number;
        tax_rate_bps?: number;
        tax_cents?: number;
      })
    | null;
  invoice: (Invoice & { items: LineRow[] }) | null;
};
type Result<T> = { ok: true; data: T } | { ok: false; notice: string };

async function graph(kind: DocumentKind, id: string): Promise<Result<Graph>> {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: document editing is unavailable." };
  if (!["estimate", "job", "invoice"].includes(kind))
    return { ok: false, notice: "Choose a document." };
  const permission =
    kind === "estimate"
      ? "estimates"
      : kind === "job"
        ? "schedule"
        : "invoices";
  const denied = await denyUnlessPermitted(permission);
  if (denied) return denied;
  const { data, error } = await canesDb().rpc("canes_document_graph", {
    p_kind: kind,
    p_id: id,
  });
  if (error || !data?.[kind])
    return {
      ok: false,
      notice: "This document could not be loaded. Refresh and try again.",
    };
  const result = data as Graph;
  if (result[kind]?.archived_at)
    return {
      ok: false,
      notice: "Restore this archived record before editing it.",
    };
  for (const [name, permission] of [
    ["estimate", "estimates"],
    ["job", "schedule"],
    ["invoice", "invoices"],
  ] as const) {
    if (result[name] && (await denyUnlessPermitted(permission)))
      return {
        ok: false,
        notice:
          "Changing this linked work requires access to its estimates, schedule, and invoices.",
      };
  }
  return { ok: true, data: result };
}

export async function loadDocumentEdit(
  kind: DocumentKind,
  id: string,
): Promise<Result<DocumentEdit>> {
  const result = await graph(kind, id);
  if (!result.ok) return result;
  const g = result.data,
    doc = g[kind]!;
  const source =
    g.estimate && g.estimate.estimate_type !== "standard" ? g.estimate : doc;
  const creditAdjustment = source.items
    .filter((item) => (item.unit_price_cents ?? 0) < 0)
    .reduce((sum, item) => sum + item.line_total_cents, 0);
  const lines = source.items
    .filter((item) => (item.unit_price_cents ?? 0) >= 0)
    .map((item) => ({
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents:
        item.unit_price_cents ??
        Math.round(item.line_total_cents / Number(item.quantity || 1)),
      discountMode: item.discount_mode ?? ("amount" as const),
      discountValue: item.discount_value ?? item.discount_cents ?? 0,
      taxable: item.taxable ?? false,
      isOption: item.is_option,
      isMandatory: item.is_mandatory,
      isSelected: item.is_selected,
      packageGroup: item.package_group,
      kind: item.kind,
    }));
  return {
    ok: true,
    data: {
      kind,
      id,
      fingerprint: g.fingerprint,
      title: "number" in doc ? doc.number : (doc.job_name ?? "Work order"),
      lines,
      adjustmentCents: (source.adjustment_cents ?? 0) + creditAdjustment,
      taxRateBps: source.tax_rate_bps ?? 0,
      terms:
        "terms" in doc
          ? (doc.terms ?? "")
          : (g.estimate?.terms ?? g.invoice?.terms ?? ""),
      paidCents:
        g.invoice?.amount_paid_cents ?? g.job?.deposit_collected_cents ?? 0,
      totalCents: doc.total_cents,
      invoiceRewardCents: g.invoiceRewardCents ?? 0,
      recurringPlanId: g.repeat?.id,
      futureVisitCount: g.repeat?.future.length ?? 0,
      futureVisitsEditable: !g.repeat?.future.some((job) => job.has_money),
      affected: (["estimate", "job", "invoice"] as const).flatMap((name) => {
        const item = g[name];
        return item
          ? [
              {
                kind: name,
                id: item.id,
                label:
                  "number" in item
                    ? item.number
                    : (item.job_name ?? "Work order"),
              },
            ]
          : [];
      }),
    },
  };
}

export async function applyDocumentChange(
  kind: DocumentKind,
  id: string,
  input: DocumentChange,
): Promise<Result<{ notice: string }>> {
  const current = await graph(kind, id);
  if (!current.ok) return current;
  const g = current.data;
  if (
    input.futureVisits &&
    (!g.repeat || g.repeat.future.some((job) => job.has_money))
  )
    return {
      ok: false,
      notice:
        "Future visits with invoices or payments need individual revisions. Choose this visit only.",
    };
  if (g.invoice?.credit_link_pending)
    return {
      ok: false,
      notice:
        "A credit adjustment is reconciling its old payment link. Refresh after recovery before editing.",
    };
  if (input.fingerprint !== g.fingerprint)
    return {
      ok: false,
      notice:
        "This document changed. Reload it and review the new amounts before saving.",
    };
  let priced: ReturnType<typeof priceServices>;
  try {
    priced = priceServices(
      input.lines,
      input.adjustmentCents,
      input.taxRateBps,
    );
  } catch (error) {
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "Check the services and discounts.",
    };
  }
  if (
    typeof input.terms !== "string" ||
    input.terms.length > 30000 ||
    !["resend", "verbal"].includes(input.agreement)
  )
    return {
      ok: false,
      notice: "Choose the agreement method and valid terms.",
    };
  const db = canesDb(),
    lease = randomUUID();
  let invoiceClaimed = false,
    jobClaimed = false,
    retired = false;
  try {
    if (g.job) {
      const claim = await db.rpc("claim_job_cancellation_billing_locked", {
        p_job_id: g.job.id,
        p_expected_status: g.job.status,
        p_operation_id: lease,
      });
      if (claim.error || claim.data?.[0]?.outcome !== "claimed")
        return {
          ok: false,
          notice:
            "The work order is changing or a payment is processing. Refresh before revising it.",
        };
      jobClaimed = true;
    }
    if (g.invoice) {
      const claim = await db.rpc("claim_canes_invoice_revision", {
        p_invoice_id: g.invoice.id,
        p_operation_id: lease,
      });
      if (claim.error || claim.data !== true)
        return {
          ok: false,
          notice:
            "The invoice is being paid, sent, or reconciled. Refresh before revising it.",
        };
      invoiceClaimed = true;
    }
    if (g.invoice?.square_invoice_id) {
      const outcome = await retireSquareInvoice(g.invoice.square_invoice_id, {
        reconcileMoney: true,
      });
      if (
        [
          "canceled",
          "failed",
          "paid",
          "refunded",
          "canceled_money_bearing",
        ].includes(outcome)
      )
        retired = true;
      if (
        ![
          "canceled",
          "failed",
          "paid",
          "refunded",
          "canceled_money_bearing",
        ].includes(outcome) ||
        !(await squareRevisionLedgerMatches(
          g.invoice,
          outcome === "paid" || outcome === "canceled_money_bearing",
        ))
      )
        return {
          ok: false,
          notice:
            "Square money or payment-link state is not reconciled yet. No prices were changed. Refresh after reconciliation before retrying.",
        };
      retired = true;
    }
    if (g.job?.deposit_link_id) {
      if (!(await deleteDepositLink(g.job.deposit_link_id)))
        return {
          ok: false,
          notice:
            "The deposit link could not be disabled. No prices were changed.",
        };
      retired = true;
    }
    if (g.job?.deposit_link_url && !g.job.deposit_link_id)
      return {
        ok: false,
        notice:
          "The legacy deposit URL needs reconciliation before this work can be repriced.",
      };
    const admin = await getAdminSession();
    const actor =
      admin?.email ?? (await getTechnicianActor())?.email ?? "owner";
    const result = await db.rpc("revise_canes_documents", {
      p_kind: kind,
      p_id: id,
      p_fingerprint: input.fingerprint,
      p_actor: actor,
      p_mode: input.agreement,
      p_invoice_lease: lease,
      p_patch: {
        future_visits: input.futureVisits === true,
        adjustment_cents: input.adjustmentCents,
        tax_rate_bps: input.taxRateBps,
        terms: input.terms,
      },
      p_lines: priced.lines.map((line) => ({
        name: line.name.trim(),
        description: line.description ?? null,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        discount_mode: line.discountMode ?? "amount",
        discount_value: line.discountValue ?? 0,
        discount_cents: line.discountCents,
        taxable: line.taxable ?? false,
        line_total_cents: line.lineTotalCents,
        is_option: line.isOption ?? false,
        is_mandatory: line.isMandatory ?? false,
        is_selected: line.isSelected ?? true,
        package_group: line.packageGroup ?? null,
        kind: line.kind ?? "service",
      })),
    });
    if (result.error || result.data?.outcome !== "saved")
      return {
        ok: false,
        notice: retired
          ? "The old payment link is disabled, but the records changed before the revision saved. Reload and review before retrying."
          : "The documents changed before the revision saved. Reload and try again.",
      };
    revalidatePath("/CanesPressure", "layout");
    return {
      ok: true,
      data: {
        notice:
          input.agreement === "verbal"
            ? "Revision saved. Phone/in-person agreement recorded. Send the revised invoice when ready."
            : "Revision saved. Previous signatures are preserved. Resend the estimate for approval and the revised invoice when ready.",
      },
    };
  } finally {
    if (retired && g.invoice?.square_invoice_id)
      await db
        .from("invoices")
        .update({ hosted_payment_url: null })
        .eq("id", g.invoice.id)
        .eq("square_invoice_id", g.invoice.square_invoice_id);
    if (retired && g.job?.deposit_link_id)
      await db
        .from("jobs")
        .update({
          deposit_link_id: null,
          deposit_link_url: null,
          deposit_link_retired_at: new Date().toISOString(),
        })
        .eq("id", g.job.id)
        .eq("deposit_link_id", g.job.deposit_link_id)
        .eq("deposit_link_operation_id", lease);
    if (invoiceClaimed && g.invoice)
      await db.rpc("release_invoice_billing_operation", {
        p_invoice_id: g.invoice.id,
        p_operation_id: lease,
      });
    if (jobClaimed && g.job)
      await db.rpc("release_job_deposit_link_operation", {
        p_job_id: g.job.id,
        p_operation_id: lease,
      });
  }
}

export async function declineEstimateByOwner(
  id: string,
): Promise<{ ok: boolean; notice?: string }> {
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const estimate = await getEstimate(id);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  const job = await getJobByEstimateId(id);
  if (
    job &&
    !["completed", "invoiced", "paid", "canceled"].includes(job.status)
  ) {
    const canceled = await setJobStatus(
      job.id,
      "canceled",
      "Estimate declined by owner",
    );
    if (!canceled.ok) return canceled;
  }
  const bills = await canesDb()
    .from("invoices")
    .select("id")
    .eq("estimate_id", id)
    .not("status", "in", "(paid,void)");
  if (bills.error)
    return {
      ok: false,
      notice: "Linked invoices could not be checked. Refresh before declining.",
    };
  for (const bill of bills.data ?? []) {
    const result = await voidInvoice(bill.id);
    if (!result.ok) return result;
  }
  const { data, error } = await canesDb()
    .from("estimates")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: "Recorded by owner",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", estimate.status)
    .select("id");
  if (error || !data?.length)
    return {
      ok: false,
      notice:
        "The estimate changed. Refresh and check any linked work before retrying.",
    };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice:
      "Estimate declined. Completed work and payment history are preserved.",
  };
}

export async function recordManualRefund(
  paymentId: string,
  amountCents: number,
  requestKey: string,
): Promise<{ ok: boolean; notice?: string }> {
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  if (
    !canesConfigured() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !requestKey ||
    requestKey.length > 160
  )
    return { ok: false, notice: "Enter a valid refund amount and request." };
  const admin = await getAdminSession();
  const { data, error } = await canesDb().rpc("record_canes_manual_refund", {
    p_payment: paymentId,
    p_amount: amountCents,
    p_key: requestKey,
    p_actor: admin?.email ?? "owner",
  });
  if (error || !["recorded", "duplicate"].includes(data))
    return {
      ok: false,
      notice:
        "Only an unrefunded manual payment can be refunded here. Make card refunds in Square.",
    };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice: "Refund already paid to the customer was recorded.",
  };
}

export async function applyCustomerCredit(
  sourceId: string,
  targetId: string,
  amountCents: number,
  requestKey: string,
): Promise<{ ok: boolean; notice?: string }> {
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  if (
    !canesConfigured() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !requestKey ||
    requestKey.length > 160
  )
    return { ok: false, notice: "Enter a valid credit amount." };
  const target = await getInvoice(targetId);
  if (!target) return { ok: false, notice: "Invoice not found." };
  const db = canesDb(),
    lease = randomUUID();
  const claim = await db.rpc("claim_invoice_billing_operation", {
    p_invoice_id: targetId,
    p_operation_id: lease,
  });
  if (claim.data !== true)
    return {
      ok: false,
      notice: "The receiving invoice is being updated or is closed.",
    };
  try {
    if (target.square_invoice_id) {
      const result = await retireSquareInvoice(target.square_invoice_id);
      if (!["canceled", "failed"].includes(result))
        return {
          ok: false,
          notice:
            "The invoice's live card page could not be retired. No credit was applied.",
        };
      await db
        .from("invoices")
        .update({ hosted_payment_url: null })
        .eq("id", targetId)
        .eq("billing_operation_id", lease);
    }
    const admin = await getAdminSession();
    const { data, error } = await db.rpc("apply_canes_customer_credit", {
      p_source: sourceId,
      p_target: targetId,
      p_amount: amountCents,
      p_key: requestKey,
      p_actor: admin?.email ?? "owner",
      p_target_lease: lease,
    });
    if (error || !["applied", "duplicate"].includes(data))
      return {
        ok: false,
        notice:
          "The available credit or invoice balance changed. Both invoices must belong to the same saved customer.",
      };
    revalidatePath("/CanesPressure", "layout");
    return {
      ok: true,
      notice: "Customer credit applied. No new cash collection was recorded.",
    };
  } finally {
    await db.rpc("release_invoice_billing_operation", {
      p_invoice_id: targetId,
      p_operation_id: lease,
    });
  }
}

export async function customerCreditSources(
  invoiceId: string,
): Promise<Result<{ id: string; number: string; availableCents: number }[]>> {
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  if (!canesConfigured()) return { ok: true, data: [] };
  const invoice = await getInvoice(invoiceId);
  if (!invoice?.contact_id) return { ok: true, data: [] };
  const { data, error } = await canesDb().rpc("canes_customer_credit_sources", {
    p_contact: invoice.contact_id,
  });
  if (error)
    return { ok: false, notice: "Customer credit could not be loaded." };
  return {
    ok: true,
    data: (data ?? [])
      .filter((row: { id: string }) => row.id !== invoiceId)
      .map((row: { id: string; number: string; available_cents: number }) => ({
        id: row.id,
        number: row.number,
        availableCents: Number(row.available_cents),
      })),
  };
}
