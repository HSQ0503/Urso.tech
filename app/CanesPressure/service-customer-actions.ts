"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { SERVICE_CADENCES, type ServiceEnrollmentChoice } from "@urso/types";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getInvoice, getInvoiceByToken } from "@/lib/canes/invoices";
import { getJob } from "@/lib/canes/estimates";
import {
  deleteDepositLink,
  retireSquareInvoice,
  squareRevisionLedgerMatches,
} from "@/lib/canes/square";
import {
  saveEnrollmentCard,
  type ServiceEnrollment,
} from "@/lib/canes/square-cards";
import {
  publishServiceInvoice,
  releaseServiceInvoiceLease,
} from "@/lib/canes/service-billing";
import {
  cancellationHash,
  cancellationView,
  verifyFirstRepeatPayment,
  SERVICE_TERMS,
  SERVICE_TERMS_VERSION,
  type CancellationView,
} from "@/lib/canes/service-agreements";

type Result = { ok: boolean; notice: string; hostedUrl?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function acceptServiceEnrollment(input: {
  token: string;
  revision: number;
  name: string;
  email: string;
  choices: ServiceEnrollmentChoice[];
  sourceId: string;
  requestKey: string;
  acceptTerms: boolean;
  acceptAutopay: boolean;
}): Promise<Result> {
  if (!canesConfigured())
    return { ok: false, notice: "Enrollment is unavailable in demo mode." };
  if (
    !input ||
    input.acceptTerms !== true ||
    input.acceptAutopay !== true ||
    typeof input.name !== "string" ||
    input.name.trim().length < 2 ||
    input.name.length > 150 ||
    typeof input.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    !uuid.test(input.requestKey) ||
    !Number.isSafeInteger(input.revision) ||
    !Array.isArray(input.choices) ||
    !input.choices.length ||
    input.choices.length > 200 ||
    input.choices.some(
      (choice) =>
        !choice ||
        !uuid.test(choice.serviceLineId) ||
        !SERVICE_CADENCES.some((cadence) => cadence.months === choice.months),
    )
  )
    return {
      ok: false,
      notice:
        "Choose your services, enter your name and email, and accept the terms and card authorization.",
    };
  const invoice =
    typeof input.token === "string" && input.token.length <= 160
      ? await getInvoiceByToken(input.token)
      : null;
  if (!invoice || invoice.status === "void")
    return { ok: false, notice: "This invoice is unavailable." };
  const db = canesDb(),
    lease = randomUUID();
  let claimedInvoice = false,
    claimedJob = false,
    retired = false;
  try {
    const choices = input.choices
      .map((choice) => ({
        service_line_id: choice.serviceLineId,
        months: choice.months,
      }))
      .sort((a, b) => a.service_line_id.localeCompare(b.service_line_id));
    const { data: id, error } = await db.rpc(
      "prepare_canes_service_enrollment",
      {
        p_invoice: invoice.id,
        p_revision: input.revision,
        p_choices: choices,
        p_name: input.name.trim(),
        p_email: input.email.trim(),
        p_request: input.requestKey,
        p_terms: SERVICE_TERMS,
        p_terms_version: SERVICE_TERMS_VERSION,
      },
    );
    if (error) throw new Error(error.message);
    const { data: row, error: readError } = await db
      .from("canes_service_enrollments")
      .select("*")
      .eq("id", id)
      .single();
    if (readError || !row)
      throw new Error("The enrollment could not be verified.");
    const enrollment = row as ServiceEnrollment;
    if (enrollment.state === "applied")
      return await publishServiceInvoice(invoice.id);
    await saveEnrollmentCard(enrollment, input.sourceId);
    const job = invoice.job_id ? await getJob(invoice.job_id) : null;
    if (job) {
      const claim = await db.rpc("claim_job_cancellation_billing_locked", {
        p_job_id: job.id,
        p_expected_status: job.status,
        p_operation_id: lease,
      });
      if (claim.error || claim.data?.[0]?.outcome !== "claimed")
        throw new Error(
          "The service or its deposit is being updated. Retry after its payment is reconciled.",
        );
      claimedJob = true;
    }
    const claim = await db.rpc("claim_canes_invoice_revision", {
      p_invoice_id: invoice.id,
      p_operation_id: lease,
    });
    if (claim.error || claim.data !== true)
      throw new Error(
        "The invoice is being paid or updated. Refresh before continuing.",
      );
    claimedInvoice = true;
    const current = await getInvoice(invoice.id);
    if (!current || current.status === "paid" || current.status === "void")
      throw new Error(
        "This invoice is already settled or closed. Canes must review any credit before applying a recurring discount.",
      );
    if (current.square_invoice_id) {
      const outcome = await retireSquareInvoice(current.square_invoice_id, {
        reconcileMoney: true,
      });
      if (
        !["canceled", "failed"].includes(outcome) ||
        !(await squareRevisionLedgerMatches(current))
      )
        throw new Error(
          "The earlier payment is still being reconciled. No discount or second charge was started.",
        );
      retired = true;
    }
    if (job?.deposit_link_url && !job.deposit_link_id)
      throw new Error("The earlier deposit link needs owner review.");
    if (job?.deposit_link_id && !(await deleteDepositLink(job.deposit_link_id)))
      throw new Error(
        "The deposit page could not be disabled. No prices were changed.",
      );
    const applied = await db.rpc("apply_canes_service_enrollment", {
      p_enrollment: id,
      p_lease: lease,
      p_old_square: current.square_invoice_id,
    });
    if (applied.error) throw new Error(applied.error.message);
    await releaseServiceInvoiceLease(invoice.id, lease);
    claimedInvoice = false;
    if (claimedJob && job) {
      await db.rpc("release_job_deposit_link_operation", {
        p_job_id: job.id,
        p_operation_id: lease,
      });
      claimedJob = false;
    }
    revalidatePath("/CanesPressure", "layout");
    return await publishServiceInvoice(invoice.id);
  } catch (error) {
    if (retired)
      await db
        .from("invoices")
        .update({
          hosted_payment_url: null,
          service_payment_issue:
            "Recurring enrollment needs review; the previous payment page was retired.",
        })
        .eq("id", invoice.id)
        .eq("billing_operation_id", lease);
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "Enrollment could not complete. No recurring visit was activated.",
    };
  } finally {
    if (claimedInvoice) await releaseServiceInvoiceLease(invoice.id, lease);
    if (claimedJob && invoice.job_id)
      await db.rpc("release_job_deposit_link_operation", {
        p_job_id: invoice.job_id,
        p_operation_id: lease,
      });
  }
}

export async function resumeServiceEnrollmentPayment(
  token: string,
): Promise<Result> {
  if (!canesConfigured() || typeof token !== "string" || token.length > 160)
    return { ok: false, notice: "Invoice unavailable." };
  const invoice = await getInvoiceByToken(token);
  if (!invoice || invoice.service_autopay_kind !== "enrollment")
    return { ok: false, notice: "No accepted enrollment was found." };
  try {
    return await publishServiceInvoice(invoice.id);
  } catch (error) {
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "Payment status could not be checked.",
    };
  }
}

export async function loadServiceCancellation(
  token: string,
): Promise<
  { ok: true; data: CancellationView } | { ok: false; notice: string }
> {
  const data = await cancellationView(token);
  return data
    ? { ok: true, data }
    : {
        ok: false,
        notice:
          "This link expired or was replaced. Ask Canes for a fresh cancellation link.",
      };
}
export async function confirmServiceCancellation(input: {
  token: string;
  mode: "now" | "after_next";
  expectedFeeCents: number;
  expectedFinalDue: string;
}): Promise<Result> {
  if (
    !input ||
    !["now", "after_next"].includes(input.mode) ||
    !Number.isSafeInteger(input.expectedFeeCents)
  )
    return { ok: false, notice: "Review and choose a cancellation option." };
  let view = await cancellationView(input.token);
  if (!view)
    return {
      ok: false,
      notice: "This link expired or was replaced. Ask Canes for a fresh link.",
    };
  const paymentVerified =
    input.mode === "now"
      ? await verifyFirstRepeatPayment(view.agreementId)
      : true;
  view = await cancellationView(input.token);
  if (!view)
    return {
      ok: false,
      notice: "This cancellation link was replaced. Request a fresh link.",
    };
  const { data, error } = await canesDb().rpc(
    "cancel_canes_service_agreement",
    {
      p_agreement: view.agreementId,
      p_token_hash: cancellationHash(input.token),
      p_mode: input.mode,
      p_expected_fee: input.expectedFeeCents,
      p_expected_final_due: input.expectedFinalDue,
    },
  );
  if (error) return { ok: false, notice: error.message };
  revalidatePath("/CanesPressure", "layout");
  if (data.invoice_id) {
    if (!paymentVerified) {
      await canesDb()
        .from("invoices")
        .update({
          service_autopay_finalized_at: null,
          service_payment_issue:
            "Cancellation confirmed. Verify the first repeat payment before collecting this fee.",
        })
        .eq("id", data.invoice_id)
        .is("square_invoice_id", null);
      return {
        ok: true,
        notice:
          "Service canceled. The fee is paused while Canes verifies the earlier service payment; no cancellation charge was started.",
      };
    }
    try {
      const payment = await publishServiceInvoice(data.invoice_id);
      return {
        ok: true,
        notice: payment.ok
          ? "Service canceled. Square is processing the agreed cancellation invoice and will email you."
          : "Service canceled. The cancellation invoice remains payable; its payment needs review.",
        ...(payment.hostedUrl ? { hostedUrl: payment.hostedUrl } : {}),
      };
    } catch {
      return {
        ok: true,
        notice:
          "Service canceled. The cancellation invoice remains payable; Canes will help resolve its payment.",
      };
    }
  }
  return {
    ok: true,
    notice:
      data.state === "cancel_after_next"
        ? "Your next service will be the final visit. It will be billed normally, without the signup-discount repayment or $50 cancellation fee."
        : "This service agreement is canceled. No future visits will be generated.",
  };
}

export async function restartPendingEnrollment(token: string): Promise<Result> {
  if (!canesConfigured() || typeof token !== "string" || token.length > 160)
    return { ok: false, notice: "Invoice unavailable." };
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return { ok: false, notice: "Invoice unavailable." };
  const { error } = await canesDb().rpc("abandon_canes_service_enrollment", {
    p_invoice: invoice.id,
  });
  if (error) return { ok: false, notice: error.message };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice:
      "The unfinished enrollment was replaced. Its card authorization cannot be used. Choose your services and card again.",
  };
}
