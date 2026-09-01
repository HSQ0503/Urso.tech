"use server";

import { createHash, randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canesConfigured, canesDb, squareConfigured } from "@/lib/canes/supabase";
import { getSettings, getLead } from "@/lib/canes/data";
import { sendCanesSms, fillTemplate, canesTwilioCreds, canesVoiceNumber, alertOwner } from "@/lib/canes/twilio";
import { signedMessageMediaUrl } from "@/lib/canes/message-media";
import {
  getEstimate,
  getEstimateByToken,
  getEstimateItems,
  getEstimateWithItems,
  getJob,
  getScheduleBoard,
  listCrews,
  nextEstimateNumber,
  enqueueEstimateSend,
  enqueueEstimateReminders,
} from "@/lib/canes/estimates";
import {
  getInvoice,
  getInvoiceByJob,
  getInvoiceByToken,
  getInvoiceItems,
  invoicePublicUrl,
  enqueueInvoiceReminders,
} from "@/lib/canes/invoices";
import {
  listJobExpenses,
  addJobExpenseRow,
  deleteJobExpenseRow,
  listEstimateExpenses,
  addEstimateExpenseRow,
  deleteEstimateExpenseRow,
} from "@/lib/canes/expenses";
import { addBusinessExpenseRow, deleteBusinessExpenseRow } from "@/lib/canes/overhead";
import { ensureContact, getCustomer } from "@/lib/canes/customers";
import { denyUnlessPermitted, denyUnlessPermittedOrAssignedTechnician } from "@/lib/canes/access";
import { listInvoiceRewards, rewardConfigFrom, getRewardConfig, type RewardConfig } from "@/lib/canes/rewards";
import {
  notifyEstimateSent,
  notifyEstimateApproved,
  notifyEstimateDeclined,
  notifyInvoiceSent,
  notifyRewardClaimed,
} from "@/lib/canes/notify";
import { drainPaymentEmailTasks, enqueueInvoicePaymentEmails } from "@/lib/canes/payment-notifications";
import { drainCanesPushOutbox } from "@/lib/canes/push";
import {
  cancelSquareInvoice,
  createDepositLink,
  createSquareInvoice,
  deleteDepositLink,
  handleSquarePaymentEvent,
  recomputeInvoicePaid,
} from "@/lib/canes/square";
import { PRACTICE_PHONE } from "@/lib/canes/tour";
import {
  pushCrewRemovedFromJob,
  pushDepositReceived,
  pushEstimateApproved,
  pushInvoicePaid,
  pushJobChanged,
  pushPaymentIssue,
} from "@/lib/canes/push-events";
import {
  fmtEt,
  fmtMoney,
  fmtPhone,
  toE164,
  PAYMENT_METHOD_LABEL,
  type CalendarEventKind,
  type CatalogKind,
  type Estimate,
  type EstimateExpense,
  type EstimateItem,
  type EstimateType,
  type EstimateWithItems,
  type Invoice,
  type InvoiceReward,
  type InvoiceRewardKind,
  type Job,
  type JobExpense,
  type JobInvoiceSummary,
  type JobRecurrence,
  type JobStatus,
  type LeadStatus,
  type LeadSource,
  type PaymentMethod,
  type TeamRole,
  type CompType,
  type ExpenseFrequency,
} from "@/lib/canes/types";

// Server actions for the Canes UI. Every mutation returns { ok, notice? } and
// revalidates the routes that render the touched data. In demo mode (no
// secret key yet) they respond with a friendly notice instead of writing.

export type ActionResult = { ok: boolean; notice?: string };

const DEMO: ActionResult = { ok: false, notice: "Demo mode — connect the Canes Supabase secret key to save changes." };

function refresh() {
  revalidatePath("/CanesPressure", "layout");
}

async function logEvent(leadId: string, kind: string, detail: string) {
  await canesDb().from("events").insert({ lead_id: leadId, kind, detail });
}

async function touch(leadId: string) {
  await canesDb().from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", leadId);
}

// ── Lead field + status edits ────────────────────────────────────────────────

export async function updateLeadFields(
  leadId: string,
  fields: { name?: string; phone?: string; email?: string; address?: string; service?: string; notes?: string; source?: LeadSource },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const patch: Record<string, unknown> = { ...fields };
  if (fields.phone !== undefined) {
    const e164 = fields.phone ? toE164(fields.phone) : null;
    if (fields.phone && !e164) return { ok: false, notice: "That phone number doesn't look valid." };
    patch.phone = e164;
  }
  if (fields.email !== undefined) {
    const email = fields.email.trim() || null;
    if (email && !EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };
    patch.email = email;
  }
  // Claimed write. The filter is the id alone, so zero rows means this lead does
  // not exist — and unlike a deactivation there is no reading of that under which
  // the caller got what they asked for: the typed name, corrected phone or gate
  // code simply went nowhere while the editor showed "Saved".
  const { data: claimed, error } = await canesDb()
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "This lead just changed — refresh and try again." };
  }
  await logEvent(leadId, "edited", "Lead details updated");
  await touch(leadId);
  refresh();
  return { ok: true };
}

export async function setLeadStatus(leadId: string, status: LeadStatus, lostReason?: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const patch: Record<string, unknown> = { status };
  if (status === "lost") patch.lost_reason = lostReason ?? null;
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  // Claimed write, same reasoning as updateLeadFields: id-only filter, so zero
  // rows is a lead that is gone, and the pipeline move the owner was told about
  // (won, lost with its reason, confirmed with its timestamp) never happened.
  const { data: claimed, error } = await canesDb()
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "This lead just changed — refresh and try again." };
  }
  await logEvent(leadId, "status", `Status set to ${status}${lostReason ? ` — ${lostReason}` : ""}`);
  await touch(leadId);
  refresh();
  return { ok: true };
}

// Closing over the phone: mark won-path and book the estimate visit in one go.
// The manual appointment enters the exact same confirmation automation as a
// hot lead from the vendor: a `confirmation` task at T-minus the configured
// offset, then YES-handling in the SMS webhook.
export async function setAppointment(leadId: string, appointmentIso: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const when = new Date(appointmentIso);
  if (Number.isNaN(when.getTime())) return { ok: false, notice: "Invalid date." };
  const db = canesDb();
  // Claimed write, and it has to be THIS write that refuses rather than anything
  // downstream. Everything below assumes the appointment landed: the confirmation
  // task upsert carries lead_id, so on a missing lead it fails its foreign key —
  // and its error is deliberately unchecked, so the failure is silent. The owner
  // was told the visit was booked, no appointment_at was stored, no confirmation
  // text was queued, and nothing anywhere reported a problem.
  const { data: claimed, error } = await db
    .from("leads")
    .update({ appointment_at: when.toISOString(), status: "appointment_set", confirmed_at: null })
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "This lead just changed — refresh and try again." };
  }

  const settings = await getSettings();
  const sendAt = new Date(when.getTime() - settings.confirmation_offset_hours * 3_600_000);
  const dedupeKey = `confirmation:${leadId}:${when.toISOString()}`;
  // Rescheduling: pending tasks tied to the old appointment time are stale —
  // cancel them so the customer is only texted about the new slot.
  await db
    .from("tasks")
    .update({ status: "canceled" })
    .eq("lead_id", leadId)
    .in("kind", ["confirmation", "no_reply_escalation"])
    .eq("status", "pending")
    .neq("dedupe_key", dedupeKey);
  // Insert-only: a dedupe_key that already exists means the task ran (or is
  // queued) for this exact time — never resurrect a sent one back to pending.
  await db.from("tasks").upsert(
    {
      lead_id: leadId,
      kind: "confirmation",
      dedupe_key: dedupeKey,
      scheduled_for: (sendAt.getTime() < Date.now() ? new Date() : sendAt).toISOString(),
      status: "pending",
      payload: { appointment_at: when.toISOString() },
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  await logEvent(leadId, "appointment", `Estimate visit set for ${fmtEt(when.toISOString())}`);
  await touch(leadId);
  refresh();
  return { ok: true };
}

// Calendar-side quote booking: creates a fresh appointment from free-text
// details instead of forcing the owner to find or create a lead first. The
// lead row remains the schedule's source of truth for estimate visits, but a
// phone-less standalone quote does not enqueue confirmation texts.
export async function createQuoteVisit(input: {
  customerName: string;
  jobName: string;
  address: string;
  appointmentIso: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;

  const customerName = input.customerName.trim();
  const jobName = input.jobName.trim();
  const address = input.address.trim();
  if (!customerName) return { ok: false, notice: "Enter the customer's name." };
  if (!jobName) return { ok: false, notice: "Enter a job name." };
  if (!address) return { ok: false, notice: "Enter the client address." };
  if (customerName.length > 120 || jobName.length > 160 || address.length > 240) {
    return { ok: false, notice: "One of those details is too long." };
  }

  const when = new Date(input.appointmentIso);
  if (Number.isNaN(when.getTime())) return { ok: false, notice: "Choose a valid visit time." };
  if (when.getTime() < Date.now()) return { ok: false, notice: "Choose a future visit time." };

  const { data, error } = await canesDb()
    .from("leads")
    .insert({
      type: "hot",
      status: "appointment_set",
      name: customerName,
      phone: null,
      address,
      service: jobName,
      source: "other",
      appointment_at: when.toISOString(),
      notes: "Standalone quote visit booked from the schedule.",
    })
    .select("id")
    .single();
  if (error) return { ok: false, notice: error.message };

  await logEvent(data.id, "appointment", `Standalone quote visit set for ${fmtEt(when.toISOString())}`);
  refresh();
  return { ok: true, notice: "Quote visit booked." };
}

export async function snoozeLead(leadId: string, untilIso: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  // Claimed write. Mildest of the four — the web card partly reveals it, since
  // the "Snoozed until" line just never appears — but the API reports a flat
  // success, so a follow-up the owner believes is parked keeps surfacing in the
  // queue they thought they had cleared.
  const { data: claimed, error } = await canesDb()
    .from("leads")
    .update({ snoozed_until: untilIso })
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "This lead just changed — refresh and try again." };
  }
  await logEvent(leadId, "snooze", `Follow-up snoozed until ${fmtEt(untilIso)}`);
  refresh();
  return { ok: true };
}

// Log the outcome of a phone call (the disposition prompt after calling).
export async function logCallOutcome(
  leadId: string,
  outcome: "closed" | "follow_up" | "no_answer" | "lost",
  detail?: string,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("calls");
  if (denied) return denied;
  const db = canesDb();
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, notice: "Lead not found." };
  await db.from("calls").insert({
    lead_id: leadId,
    peer_phone: lead.phone ?? "",
    direction: "out",
    status: outcome === "no_answer" ? "no-answer" : "completed",
  });
  if (outcome === "follow_up" || outcome === "no_answer") {
    await db.from("leads").update({ status: "contacted" }).eq("id", leadId);
  } else if (outcome === "lost") {
    await db.from("leads").update({ status: "lost", lost_reason: detail ?? "Lost on call" }).eq("id", leadId);
  }
  await logEvent(leadId, "call", `Call logged — ${outcome.replace("_", " ")}${detail ? `: ${detail}` : ""}`);
  await touch(leadId);
  refresh();
  return { ok: true };
}

// ── Messaging ────────────────────────────────────────────────────────────────

// Append a manually collected deposit (cash in hand, Zelle, card on site) to
// the ledger, job-anchored — Sebastian's "$2,100 job, they paid $520 up
// front" flow. createInvoiceFromJob later re-points the row onto the bill and
// folds it into amount_paid_cents, so the invoice opens at balance due and
// the Square hosted invoice shows "Deposit received −$X". When a draft
// invoice already exists the row attaches to it directly.
type JobDepositSnapshot = {
  deposit_collected_cents: number;
  deposit_square_payment_id: string | null;
  deposit_link_id: string | null;
  deposit_link_url: string | null;
  deposit_order_id: string | null;
  deposit_link_retired_at: string | null;
};

type SquareOrderTender = {
  paymentId: string;
  amountCents: number;
  currency: string;
};

async function retrieveSquareOrderTenders(orderId: string): Promise<{
  tenders: SquareOrderTender[];
  error?: string;
}> {
  if (!squareConfigured()) return { tenders: [], error: "Square is not configured." };
  const squareApiBase = (process.env.CANES_SQUARE_ENV ?? "production") === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
  try {
    const response = await fetch(`${squareApiBase}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN as string}`,
        "Square-Version": "2026-07-15",
      },
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const errors = json.errors as Array<{ detail?: string }> | undefined;
      return { tenders: [], error: errors?.[0]?.detail ?? `Square responded ${response.status}` };
    }
    const order = (json.order ?? {}) as Record<string, unknown>;
    const rawTenders = Array.isArray(order.tenders)
      ? order.tenders as Array<Record<string, unknown>>
      : [];
    const tenders = new Map<string, SquareOrderTender>();
    for (const tender of rawTenders) {
      const paymentId = typeof tender.payment_id === "string"
        ? tender.payment_id
        : typeof tender.id === "string" ? tender.id : null;
      const money = (tender.amount_money ?? {}) as Record<string, unknown>;
      const amountCents = typeof money.amount === "number" ? money.amount : null;
      const currency = typeof money.currency === "string" ? money.currency : null;
      if (
        !paymentId ||
        amountCents === null ||
        !Number.isSafeInteger(amountCents) ||
        amountCents <= 0 ||
        amountCents > 2_147_483_647 ||
        !currency
      ) {
        return {
          tenders: [],
          error: "Square returned an incomplete tender. Review the order before recording off-platform money.",
        };
      }
      tenders.set(paymentId, { paymentId, amountCents, currency });
    }
    return { tenders: [...tenders.values()] };
  } catch (error) {
    return { tenders: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function reconcileSquareDepositOrderBeforeManualEntry(
  jobId: string,
  orderId: string,
): Promise<{ ok: boolean; notice?: string }> {
  const result = await retrieveSquareOrderTenders(orderId);
  if (result.error) {
    return {
      ok: false,
      notice: `The Square link was disabled, but its order could not be verified (${result.error}). No manual deposit was recorded.`,
    };
  }
  for (const tender of result.tenders) {
    const eventId = `manual-preflight:${jobId}:${tender.paymentId}`;
    const outcome = await handleSquarePaymentEvent(
      {
        eventId,
        eventType: "payment.updated",
        squareInvoiceId: null,
        squarePaymentId: tender.paymentId,
        squareOrderId: orderId,
        amountCents: tender.amountCents,
        currency: tender.currency,
        status: "COMPLETED",
        paid: true,
        refund: null,
      },
      {
        event_id: eventId,
        type: "manual.deposit_preflight",
        order_id: orderId,
        payment_id: tender.paymentId,
        amount_cents: tender.amountCents,
        currency: tender.currency,
      },
    );
    if (outcome.handled !== "recorded" && outcome.handled !== "duplicate") {
      return {
        ok: false,
        notice: "Square reported a deposit that needs reconciliation. No manual deposit was recorded — refresh and verify the payment ledger.",
      };
    }
  }
  return { ok: true };
}

async function insertJobDepositRow(
  job: Job,
  amountCents: number,
  method: PaymentMethod,
  invoiceId?: string | null,
  idempotencyKey: string = randomUUID(),
): Promise<ActionResult> {
  const db = canesDb();
  const original = {
    deposit_collected_cents: job.deposit_collected_cents ?? 0,
    deposit_square_payment_id:
      (job as Job & { deposit_square_payment_id?: string | null }).deposit_square_payment_id ?? null,
    deposit_link_id: job.deposit_link_id ?? null,
    deposit_link_url: job.deposit_link_url ?? null,
    deposit_order_id: job.deposit_order_id ?? null,
    deposit_link_retired_at: job.deposit_link_retired_at ?? null,
  } satisfies JobDepositSnapshot;
  let expected = original;
  let retiredOrderToReconcile: string | null = null;

  // Older rows can have an order or customer-facing URL but no Payment Link id.
  // Without the id we cannot prove the charging surface was disabled. Never
  // guess and risk recording cash beside an in-flight card payment.
  if (!original.deposit_link_id && original.deposit_link_url) {
    return {
      ok: false,
      notice: "This job has a legacy Square deposit link that cannot be safely disabled. No manual deposit was recorded; reconcile the Square order first.",
    };
  }
  if (!original.deposit_link_id && original.deposit_order_id) {
    if (!original.deposit_link_retired_at) {
      return {
        ok: false,
        notice: "This job has a legacy Square deposit order whose link state is unknown. No manual deposit was recorded; reconcile the Square order first.",
      };
    }
    retiredOrderToReconcile = original.deposit_order_id;
  }
  if (original.deposit_link_id && !original.deposit_order_id) {
    return {
      ok: false,
      notice: "This Square deposit link is missing its reconciliation order ID. No manual deposit was recorded; verify the link in Square first.",
    };
  }
  // Never record off-platform money while a live Square link can still charge
  // the requested amount. Delete first, then inspect and reconcile the order:
  // a card may have completed immediately before Square accepted the delete.
  if (original.deposit_link_id && original.deposit_order_id) {
    const deleted = await deleteDepositLink(original.deposit_link_id);
    if (!deleted) {
      return { ok: false, notice: "Couldn't disable the existing Square deposit link. No payment was recorded; try again." };
    }
    let clearQuery = db
      .from("jobs")
      .update({
        deposit_link_id: null,
        deposit_link_url: null,
        deposit_link_retired_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("deposit_link_id", original.deposit_link_id)
      .eq("deposit_order_id", original.deposit_order_id)
      .eq("deposit_collected_cents", original.deposit_collected_cents);
    clearQuery = original.deposit_link_url
      ? clearQuery.eq("deposit_link_url", original.deposit_link_url)
      : clearQuery.is("deposit_link_url", null);
    clearQuery = original.deposit_square_payment_id
      ? clearQuery.eq("deposit_square_payment_id", original.deposit_square_payment_id)
      : clearQuery.is("deposit_square_payment_id", null);
    const { data: cleared, error: clearError } = await clearQuery.select("id");
    if (clearError || !cleared?.length) {
      return { ok: false, notice: "The Square link was disabled, but its local state could not be updated. Refresh before recording the deposit." };
    }

    retiredOrderToReconcile = original.deposit_order_id;
  }

  if (retiredOrderToReconcile) {
    let reconciliation: { ok: boolean; notice?: string };
    try {
      reconciliation = await reconcileSquareDepositOrderBeforeManualEntry(job.id, retiredOrderToReconcile);
    } catch (error) {
      reconciliation = {
        ok: false,
        notice: `The Square link was disabled, but its order could not be reconciled (${error instanceof Error ? error.message : String(error)}). No manual deposit was recorded.`,
      };
    }

    const { data: freshRow, error: freshError } = await db
      .from("jobs")
      .select("deposit_collected_cents, deposit_square_payment_id, deposit_link_id, deposit_link_url, deposit_order_id, deposit_link_retired_at")
      .eq("id", job.id)
      .maybeSingle();
    if (freshError || !freshRow) {
      return { ok: false, notice: "The Square link was disabled, but the payment state could not be rechecked. No manual deposit was recorded." };
    }
    const fresh = freshRow as JobDepositSnapshot;
    const squarePaymentLanded =
      fresh.deposit_collected_cents !== original.deposit_collected_cents ||
      fresh.deposit_square_payment_id !== original.deposit_square_payment_id;
    if (squarePaymentLanded) {
      return {
        ok: false,
        notice: "A card deposit completed while the Square link was being disabled. It was reconciled; no manual deposit was recorded.",
      };
    }
    if (
      fresh.deposit_link_id !== null ||
      fresh.deposit_link_url !== null ||
      fresh.deposit_order_id !== retiredOrderToReconcile
    ) {
      return { ok: false, notice: "The deposit payment state changed. No manual deposit was recorded — refresh and try again." };
    }
    if (!reconciliation.ok) return { ok: false, notice: reconciliation.notice };
    expected = fresh;
  }

  const { data: rows, error } = await db.rpc("record_manual_job_deposit_locked", {
    p_job_id: job.id,
    p_amount_cents: amountCents,
    p_method: method,
    p_expected_collected_cents: expected.deposit_collected_cents,
    p_expected_square_payment_id: expected.deposit_square_payment_id,
    p_expected_link_id: expected.deposit_link_id,
    p_expected_link_url: expected.deposit_link_url,
    p_expected_order_id: expected.deposit_order_id,
    p_idempotency_key: `manual-deposit:${idempotencyKey}`,
  });
  if (error) return { ok: false, notice: error.message };
  const result = (rows?.[0] ?? null) as {
    outcome: "recorded" | "duplicate" | "not_found" | "job_closed" | "invalid" | "deposit_busy" | "financial_busy" | "invoice_busy" | "invoice_sent" | "square_pending" | "over_cap" | "payment_conflict";
    payment_id: string | null;
    invoice_id: string | null;
    collected_cents: number;
    job_total_cents: number;
  } | null;
  if (!result) return { ok: false, notice: "Couldn't record the deposit. Please try again." };
  const duplicate = result.outcome === "duplicate";
  if (result.outcome === "not_found") return { ok: false, notice: "Job not found." };
  if (result.outcome === "job_closed") return { ok: false, notice: "This job is closed — no deposit was recorded." };
  if (result.outcome === "payment_conflict") {
    return { ok: false, notice: "A card deposit may have landed while the Square link was being disabled. No manual deposit was recorded — refresh and verify the payment ledger." };
  }
  if (result.outcome === "deposit_busy") return { ok: false, notice: "A Square deposit link is being prepared right now. Refresh and try again before recording off-platform money." };
  if (result.outcome === "financial_busy") return { ok: false, notice: "Square is reconciling a payment or refund right now. Refresh the ledger before recording off-platform money." };
  if (result.outcome === "invoice_busy") return { ok: false, notice: "This invoice is being sent or updated right now — refresh and record the money on the invoice." };
  if (result.outcome === "invoice_sent") return { ok: false, notice: "The invoice has already gone out — record the money on the invoice instead." };
  if (result.outcome === "square_pending") return { ok: false, notice: "A prior Square invoice publish may still be live. Reconcile or void it before recording off-platform money." };
  if (result.outcome === "over_cap") {
    return { ok: false, notice: `That would put deposits above the ${fmtMoney(result.job_total_cents)} job total.` };
  }
  if ((!duplicate && result.outcome !== "recorded") || !result.payment_id) {
    return { ok: false, notice: "Couldn't record the deposit. Check the amount and try again." };
  }

  if (!duplicate) {
    const attachedTo = result.invoice_id ?? invoiceId ?? null;
    if (attachedTo) await recomputeInvoicePaid(attachedTo);
    await logJobEvent(job.lead_id, `Deposit recorded — ${fmtMoney(amountCents)} (${PAYMENT_METHOD_LABEL[method]})`);
  }
  const paymentEventId = `manual:${result.payment_id}`;
  try {
    await pushDepositReceived({
      eventId: paymentEventId,
      estimateId: job.estimate_id,
      jobId: job.id,
      customerName: job.customer_name,
      amountCents,
    });
  } catch (error) {
    // The transaction already stored the push outbox event. A delivery-path
    // failure must not turn committed money into a false action failure.
    console.error(`[canes] manual deposit push ensure failed for ${result.payment_id}:`, error);
  }
  // The ledger RPC already committed both outbox rows atomically. These drains
  // only reduce delivery latency; a provider failure or request interruption
  // leaves cron-safe pending rows behind.
  void drainCanesPushOutbox({ deadlineAt: Date.now() + 20_000 }).catch((error) => {
    console.error("[canes] manual deposit push drain failed:", error);
  });
  void drainPaymentEmailTasks({ eventId: paymentEventId, limit: 1 }).catch((error) => {
    console.error("[canes] manual deposit email drain failed:", error);
  });
  return {
    ok: true,
    notice: duplicate ? `Deposit of ${fmtMoney(amountCents)} already recorded.` : undefined,
  };
}

// Owner action: record a deposit the customer already paid outside the
// system. Refused once the invoice has gone out — at that point money is
// recorded on the invoice itself (Record cash payment), where the totals and
// the Square hosted bill stay consistent.
export async function recordJobDeposit(
  jobId: string,
  amountCents: number,
  method: PaymentMethod,
  idempotencyKey?: string,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const amount = Math.round(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the deposit amount collected." };
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (job.status === "canceled" || job.status === "paid") {
    return { ok: false, notice: `This job is ${job.status} — no deposit to record.` };
  }

  const invoice = await getInvoiceByJob(jobId); // void steps aside
  if (invoice) {
    if (invoice.status !== "draft") {
      return {
        ok: false,
        notice: `Invoice ${invoice.number} has already gone out — record the money on the invoice instead.`,
      };
    }
    // Mid-send signal: Square ids persist on the draft before the status
    // flips. A deposit landing then would miss the just-published bill.
    if (invoice.square_invoice_id) {
      return { ok: false, notice: `Invoice ${invoice.number} is being sent right now — record the money on the invoice instead.` };
    }
  }
  const requestKey = idempotencyKey?.trim() || randomUUID();
  if (requestKey.length > 160) return { ok: false, notice: "The payment request key is invalid. Try again." };
  const res = await insertJobDepositRow(job, amount, method, invoice?.id ?? null, requestKey);
  if (!res.ok) return res;
  refresh();
  return { ok: true, notice: res.notice ?? `Deposit of ${fmtMoney(amount)} recorded.` };
}

// Permanently remove a junk or duplicate lead. Two refusals protect the
// business: an opted-out lead IS the do-not-text record for that number
// (deleting it would let a future inbound re-create the lead with a clean
// consent slate — an A2P violation waiting to happen), and a lead with an
// estimate or job carries the queued sends/reminders/confirmations for that
// work (tasks cascade with the lead even though the work itself survives).
// The SMS thread survives either way; tasks and timeline events cascade.
export async function deleteLead(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, notice: "Lead not found." };
  if (lead.opted_out) {
    return {
      ok: false,
      notice: "This number texted STOP — the lead is the record that keeps automations from ever texting it again, so it can't be deleted.",
    };
  }
  const db = canesDb();
  // Only LIVE work blocks deletion — a long-dead duplicate whose estimate was
  // voided (or job canceled) is exactly the junk this cleans up. Active work
  // keeps the lead: its queued sends/reminders/confirmations ride the lead
  // row, and channel attribution needs the source.
  const [est, jobs] = await Promise.all([
    db
      .from("estimates")
      .select("id")
      .eq("lead_id", leadId)
      .not("status", "in", "(void,declined,expired)")
      .limit(1),
    db.from("jobs").select("id").eq("lead_id", leadId).neq("status", "canceled").limit(1),
  ]);
  if (est.error) return { ok: false, notice: est.error.message };
  if (jobs.error) return { ok: false, notice: jobs.error.message };
  if ((est.data ?? []).length > 0 || (jobs.data ?? []).length > 0) {
    return {
      ok: false,
      notice: "This lead has an active estimate or job on file — keep it for the record and mark it lost instead.",
    };
  }
  const { error } = await db.from("leads").delete().eq("id", leadId);
  if (error) return { ok: false, notice: error.message };
  refresh();
  // The profile page no longer exists — redirect from the action so the
  // navigation and the revalidation land together (no not-found flash).
  redirect("/CanesPressure/leads");
}

export async function sendMessage(peerPhone: string, body: string, leadId?: string | null): Promise<ActionResult> {
  if (!body.trim()) return { ok: false, notice: "Empty message." };
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const res = await sendCanesSms({ to: peerPhone, body: body.trim(), leadId: leadId ?? null, automated: false });
  if (!res.ok) return { ok: false, notice: res.skipped ?? res.error ?? "Send failed." };
  if (leadId) {
    const lead = await getLead(leadId);
    if (lead && lead.status === "new") {
      await canesDb().from("leads").update({ status: "contacted" }).eq("id", leadId);
    }
    await touch(leadId);
  }
  refresh();
  return { ok: true };
}

export async function sendMessageWithMedia(
  peerPhone: string,
  body: string,
  mediaRefs: string[],
  leadId?: string | null,
): Promise<ActionResult> {
  if (!body.trim() && mediaRefs.length === 0) return { ok: false, notice: "Add a message or photo." };
  if (mediaRefs.length !== 1 || typeof mediaRefs[0] !== "string") {
    return { ok: false, notice: "Attach one photo at a time." };
  }
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;

  const mediaUrl = await signedMessageMediaUrl(mediaRefs[0]);
  if (!mediaUrl) return { ok: false, notice: "That photo could not be prepared. Try again." };

  const res = await sendCanesSms({
    to: peerPhone,
    body: body.trim(),
    mediaUrls: [mediaUrl],
    storedMediaUrls: mediaRefs,
    leadId: leadId ?? null,
    automated: false,
  });
  if (!res.ok) return { ok: false, notice: res.skipped ?? res.error ?? "Send failed." };
  if (leadId) {
    const lead = await getLead(leadId);
    if (lead && lead.status === "new") {
      await canesDb().from("leads").update({ status: "contacted" }).eq("id", leadId);
    }
    await touch(leadId);
  }
  refresh();
  return { ok: true };
}

// Send (or re-send) the confirmation text right now, outside the scheduler.
export async function sendConfirmationNow(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const lead = await getLead(leadId);
  if (!lead?.phone) return { ok: false, notice: "Lead has no phone number." };
  if (lead.opted_out) return { ok: false, notice: "This customer opted out of texts." };
  if (!lead.appointment_at) return { ok: false, notice: "Set an appointment first." };
  const settings = await getSettings();
  const body = fillTemplate(settings.templates.confirmation, {
    name: lead.name,
    when: fmtEt(lead.appointment_at),
    address: lead.address,
  });
  const res = await sendCanesSms({ to: lead.phone, body, leadId, automated: true, force: true });
  if (!res.ok) return { ok: false, notice: res.skipped ?? res.error ?? "Send failed." };
  await logEvent(leadId, "automation", "Confirmation text sent manually");
  refresh();
  return { ok: true };
}

// Click-to-call, the one true outbound-voice path: Twilio rings Sebastian's own
// phone first, then bridges the customer with the BUSINESS number as caller ID
// (see app/api/canes/twilio/bridge). Every owner-app button labelled "Call"
// routes through here, so customers see the business line and callbacks return
// to our system. The explicitly labelled direct-dial fallback still uses the
// handset carrier and therefore exposes its caller ID. Requires Twilio + a
// public deployment URL.
export async function bridgeCall(
  phone: string | null | undefined,
  opts?: { leadId?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("calls");
  if (denied) return denied;
  // Normalize BEFORE dialing, not after. The TwiML leg runs `to` through
  // toE164 and answers 400 on anything it cannot parse — so an unnormalized
  // number rings Sebastian, tells him to answer, and then dies when Twilio
  // fetches the TwiML. That was latent while every caller passed a stored
  // phone; POST /api/v1/canes/calls/bridge takes one from the client, so it
  // is reachable now. Normalizing here also keeps the calls row's peer_phone
  // on the same E.164 key the thread view groups by.
  const to = toE164(phone ?? "");
  if (!to) return { ok: false, notice: "No phone number to call." };
  const owner = process.env.CANES_OWNER_PHONE;
  const { accountSid, authToken } = canesTwilioCreds();
  const voiceFrom = canesVoiceNumber();
  if (!owner || !accountSid || !authToken || !voiceFrom) {
    return { ok: false, notice: "Twilio isn't configured yet." };
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const twimlUrl = `${base}/api/canes/twilio/bridge?to=${encodeURIComponent(to)}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // Twilio reports how a call ended only if asked to. Without StatusCallback
    // the row below is the last thing anyone ever writes about this call, so it
    // stays "initiated" forever and the inbox reads a ten-minute conversation
    // as "No answer".
    body: new URLSearchParams({
      To: owner,
      From: voiceFrom,
      Url: twimlUrl,
      StatusCallback: `${base}/api/canes/twilio/status`,
    }),
  });
  if (!res.ok) return { ok: false, notice: `Twilio responded ${res.status}` };
  // The SID is the ONLY key the status callback can match on, so read it before
  // writing the row. A row stored without one can never be completed and cannot
  // be repaired afterwards — there is nothing to match it by.
  const sid = await res
    .json()
    .then((body: unknown) =>
      body && typeof body === "object" && typeof (body as { sid?: unknown }).sid === "string"
        ? ((body as { sid: string }).sid)
        : null,
    )
    .catch(() => null);
  await canesDb().from("calls").insert({
    lead_id: opts?.leadId ?? null,
    peer_phone: to,
    direction: "out",
    status: "initiated",
    twilio_sid: sid,
  });
  if (opts?.leadId) await logEvent(opts.leadId, "call", "Click-to-call started (bridging your phone)");
  return { ok: true, notice: "Calling your phone now — answer to connect." };
}

// Lead-scoped convenience wrapper: look the number up from the lead, then bridge.
export async function initiateCall(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("calls");
  if (denied) return denied;
  const lead = await getLead(leadId);
  if (!lead?.phone) return { ok: false, notice: "Lead has no phone number." };
  return bridgeCall(lead.phone, { leadId });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function saveSettings(patch: {
  quiet_hours?: { start: number; end: number; timezone: string };
  confirmation_offset_hours?: number;
  templates?: Record<string, string>;
  lead_vendor_phones?: string[];
  estimate_terms?: string;
  estimate_message?: string;
  deposit_presets?: number[];
  estimate_expiry_days?: number;
  estimate_tax_rate_bps?: number;
  estimate_reminder_days?: number[];
  invoice_reminder_days?: number[];
  review_rewards?: {
    google_cents: number;
    facebook_cents: number;
    follow_cents: number;
    google_url: string;
    facebook_url: string;
    instagram_url: string;
  };
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const db = canesDb();
  const rows = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  for (const row of rows) {
    const { error } = await db.from("settings").upsert(row, { onConflict: "key" });
    if (error) return { ok: false, notice: error.message };
  }
  refresh();
  return { ok: true };
}

// ── Manual lead creation (door-to-door, referrals) ──────────────────────────

export async function createLead(fields: {
  name: string;
  phone: string;
  type: "hot" | "cold";
  source: LeadSource;
  email?: string;
  service?: string;
  address?: string;
  appointmentIso?: string;
}): Promise<ActionResult & { existingLeadId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("leads");
  if (denied) return denied;
  const e164 = toE164(fields.phone);
  if (!e164) return { ok: false, notice: "That phone number doesn't look valid." };
  const db = canesDb();
  const { data, error } = await db
    .from("leads")
    .insert({
      name: fields.name,
      phone: e164,
      type: fields.type,
      source: fields.source,
      email: fields.email?.trim() || null,
      service: fields.service ?? null,
      address: fields.address ?? null,
      status: "new",
    })
    .select("id")
    .single();
  if (error) {
    // Phone is UNIQUE on leads — surface the existing lead instead of a raw
    // constraint error so a repeat customer routes to their history.
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("leads")
        .select("id, name")
        .eq("phone", e164)
        .maybeSingle();
      return {
        ok: false,
        notice: `A lead already exists for ${fmtPhone(e164)}${existing?.name ? ` (${existing.name})` : ""}.`,
        existingLeadId: existing?.id as string | undefined,
      };
    }
    return { ok: false, notice: error.message };
  }
  await logEvent(data.id, "created", "Lead added manually");
  if (fields.appointmentIso) await setAppointment(data.id, fields.appointmentIso);
  refresh();
  return { ok: true };
}

// ── Estimates (Phase 2) ──────────────────────────────────────────────────────
//
// Money is always recomputed SERVER-SIDE from the line items — client-supplied
// totals are never trusted. Line total = quantity*unit_price - discount. A line
// counts toward the subtotal when it is mandatory, standard (not an option), or
// a selected option. total = subtotal + adjustment + tax; deposit is a rounded
// percentage of the total. Every mutation follows the ActionResult + DEMO guard
// + logEvent/touch/refresh pattern from setAppointment.

const genToken = () => randomBytes(16).toString("base64url");

// Loose shape check for send-target email overrides — deliverability is the
// mail provider's job; this only catches obvious typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The contact snapshot fields that stay editable after an estimate/invoice is
// sent — a typo'd phone/email must be fixable or the document is undeliverable.
const CONTACT_PATCH_KEYS = ["customerName", "customerPhone", "customerEmail", "contactId"];

function lineTotalCents(item: { quantity: number; unit_price_cents: number; discount_cents: number }): number {
  return Math.round(item.quantity * item.unit_price_cents) - item.discount_cents;
}

// Does this line contribute to the subtotal? Mandatory + standard lines always
// count; an option only counts once the customer selects it.
function itemCounts(item: { is_option: boolean; is_mandatory: boolean; is_selected: boolean }): boolean {
  return item.is_mandatory || !item.is_option || item.is_selected;
}

type Totals = {
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
};

function computeTotals(
  items: EstimateItem[],
  opts: { adjustmentCents: number; depositPercent: number; taxRateBps: number },
): Totals {
  let subtotal = 0;
  let discount = 0;
  let taxableBase = 0;
  for (const item of items) {
    if (!itemCounts(item)) continue;
    subtotal += item.line_total_cents;
    discount += item.discount_cents;
    if (item.taxable) taxableBase += item.line_total_cents;
  }
  const tax = Math.round((taxableBase * opts.taxRateBps) / 10000);
  const total = subtotal + opts.adjustmentCents + tax;
  const deposit = Math.round((total * opts.depositPercent) / 100);
  return { subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: total, deposit_cents: deposit };
}

// Re-read the estimate + its items and persist recomputed totals. Called after
// any change to items, adjustment, or deposit percent. Returns the fresh totals.
async function recomputeEstimateTotals(estimateId: string): Promise<Totals | null> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) return null;
  const items = await getEstimateItems(estimateId);
  const totals = computeTotals(items, {
    adjustmentCents: estimate.adjustment_cents,
    depositPercent: estimate.deposit_percent,
    taxRateBps: estimate.tax_rate_bps,
  });
  const { error } = await canesDb()
    .from("estimates")
    .update({ ...totals, updated_at: new Date().toISOString() })
    .eq("id", estimateId);
  if (error) return null;
  return totals;
}

export async function createEstimateFromLead(
  leadId: string,
): Promise<ActionResult & { estimateId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, notice: "Lead not found." };
  return createEstimate({
    leadId,
    contactId: lead.contact_id ?? undefined,
    estimateType: "standard",
    customerName: lead.name ?? undefined,
    customerPhone: lead.phone ?? undefined,
    customerEmail: lead.email ?? undefined,
    jobAddress: lead.address ?? undefined,
    jobName: lead.service ?? undefined,
  });
}

// Which client record an estimate files under: an explicit picker hit wins;
// with no phone/email to key on, dedupe by exact (escaped) name against live
// contacts; else ensureContact creates/links one. The client-first rule —
// every estimate lives under Customers from the first touch.
async function resolveEstimateContact(input: {
  contactId?: string | null;
  name?: string | null;
  phone?: string | null; // already E.164 (or null)
  email?: string | null;
  address?: string | null;
  leadId?: string | null;
}): Promise<string | null> {
  if (input.contactId) return input.contactId;
  const name = input.name?.trim();
  if (!name && !input.phone) return null;
  if (name && !input.phone && !input.email?.trim()) {
    // ilike is a pattern match — escape the pattern chars a real business
    // name could carry ("100% Clean LLC") so it can't match strangers.
    const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: sameName } = await canesDb()
      .from("contacts")
      .select("id")
      .ilike("name", pattern)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sameName?.id) return sameName.id as string;
  }
  const contact = await ensureContact({
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    leadId: input.leadId,
  });
  return contact?.id ?? null;
}

export async function createEstimate(input: {
  leadId?: string;
  contactId?: string;
  estimateType: EstimateType;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobName?: string;
}): Promise<ActionResult & { estimateId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const settings = await getSettings();
  const number = await nextEstimateNumber();
  const phone = input.customerPhone ? toE164(input.customerPhone) : null;
  if (input.customerPhone && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  // Snapshot terms + message + expiry from settings at creation so later
  // settings edits never rewrite a sent estimate.
  const expiresAt = new Date(
    Date.now() + settings.estimate_expiry_days * 86_400_000,
  ).toISOString();
  // Client-first (Sebastian's ask): an estimate for an unmatched name creates
  // the customer record NOW, not at approval — so the Contacts tab is the one
  // place every client lives from the first touch.
  const contactId = await resolveEstimateContact({
    contactId: input.contactId,
    name: input.customerName,
    phone,
    email: input.customerEmail,
    address: input.jobAddress,
    leadId: input.leadId,
  });

  const { data, error } = await canesDb()
    .from("estimates")
    .insert({
      lead_id: input.leadId ?? null,
      contact_id: contactId,
      number,
      estimate_type: input.estimateType,
      status: "draft",
      customer_name: input.customerName ?? null,
      customer_phone: phone,
      customer_email: input.customerEmail ?? null,
      job_address: input.jobAddress ?? null,
      job_name: input.jobName ?? null,
      message_to_customer: settings.estimate_message,
      terms: settings.estimate_terms,
      tax_rate_bps: settings.estimate_tax_rate_bps,
      expires_at: expiresAt,
      public_token: genToken(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, notice: error.message };
  if (input.leadId) {
    await logEvent(input.leadId, "estimate", `Estimate ${number} created`);
    await touch(input.leadId);
  }
  refresh();
  return { ok: true, estimateId: data.id as string };
}

export async function updateEstimate(
  estimateId: string,
  patch: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    contactId?: string | null;
    jobAddress?: string;
    jobName?: string;
    estimateType?: EstimateType;
    adjustmentCents?: number;
    depositPercent?: number;
    messageToCustomer?: string;
    terms?: string;
    internalNotes?: string;
    expiresAtIso?: string | null;
    employee?: string;
  },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  // Money/terms are frozen once sent, but the contact snapshot stays editable —
  // a typo'd phone/email on a sent estimate must be fixable to resend it.
  const patchKeys = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  const contactOnly = patchKeys.every((k) => CONTACT_PATCH_KEYS.includes(k));
  if (estimate.status !== "draft" && !contactOnly) {
    return { ok: false, notice: "Only draft estimates can be edited (contact details excepted)." };
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.customerName !== undefined) row.customer_name = patch.customerName || null;
  if (patch.customerPhone !== undefined) {
    const phone = patch.customerPhone ? toE164(patch.customerPhone) : null;
    if (patch.customerPhone && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
    row.customer_phone = phone;
  }
  if (patch.customerEmail !== undefined) row.customer_email = patch.customerEmail || null;
  if (patch.contactId !== undefined) {
    // An explicit unlink with a typed name is a NEW client — resolve it now
    // (same client-first rule as createEstimate) rather than leaving the
    // estimate orphaned from Customers.
    row.contact_id =
      patch.contactId ??
      (await resolveEstimateContact({
        name: patch.customerName ?? estimate.customer_name,
        phone: patch.customerPhone !== undefined
          ? ((row.customer_phone as string | null) ?? null)
          : estimate.customer_phone,
        email: patch.customerEmail ?? estimate.customer_email,
        address: patch.jobAddress ?? estimate.job_address,
        leadId: estimate.lead_id,
      }));
  }
  if (patch.jobAddress !== undefined) row.job_address = patch.jobAddress || null;
  if (patch.jobName !== undefined) row.job_name = patch.jobName || null;
  if (patch.estimateType !== undefined) row.estimate_type = patch.estimateType;
  if (patch.adjustmentCents !== undefined) row.adjustment_cents = Math.round(patch.adjustmentCents);
  if (patch.depositPercent !== undefined) {
    row.deposit_percent = Math.max(0, Math.min(100, Math.round(patch.depositPercent)));
  }
  if (patch.messageToCustomer !== undefined) row.message_to_customer = patch.messageToCustomer || null;
  if (patch.terms !== undefined) row.terms = patch.terms || null;
  if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes || null;
  if (patch.expiresAtIso !== undefined) row.expires_at = patch.expiresAtIso;
  if (patch.employee !== undefined) row.employee = patch.employee || null;

  const { error } = await canesDb().from("estimates").update(row).eq("id", estimateId);
  if (error) return { ok: false, notice: error.message };
  // Adjustment or deposit percent changed → totals must be recomputed.
  await recomputeEstimateTotals(estimateId);
  if (estimate.lead_id) await touch(estimate.lead_id);
  refresh();
  return { ok: true };
}

export async function saveEstimateItems(
  estimateId: string,
  items: Array<{
    catalogId?: string | null;
    name: string;
    description?: string | null;
    kind: CatalogKind;
    quantity: number;
    unitPriceCents: number;
    discountCents?: number;
    taxable?: boolean;
    isOption?: boolean;
    isMandatory?: boolean;
    packageGroup?: string | null;
  }>,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (estimate.status !== "draft") return { ok: false, notice: "Only draft estimates can be edited." };

  const db = canesDb();
  // Replace-all: wipe the old lines, insert the fresh set with recomputed line
  // totals, then recompute the estimate totals from what was actually written.
  const { error: delErr } = await db.from("estimate_items").delete().eq("estimate_id", estimateId);
  if (delErr) return { ok: false, notice: delErr.message };

  if (items.length > 0) {
    const rows = items.map((it, i) => {
      const quantity = Number(it.quantity) || 0;
      const unit = Math.round(it.unitPriceCents);
      const discount = Math.round(it.discountCents ?? 0);
      const isOption = it.isOption ?? false;
      const isMandatory = it.isMandatory ?? false;
      return {
        estimate_id: estimateId,
        catalog_id: it.catalogId ?? null,
        position: i,
        name: it.name,
        description: it.description ?? null,
        kind: it.kind,
        quantity,
        unit_price_cents: unit,
        discount_cents: discount,
        taxable: it.taxable ?? false,
        line_total_cents: lineTotalCents({ quantity, unit_price_cents: unit, discount_cents: discount }),
        is_option: isOption,
        is_mandatory: isMandatory,
        // Options start selected only when mandatory; standard lines are selected.
        is_selected: isOption ? isMandatory : true,
        package_group: it.packageGroup ?? null,
      };
    });
    const { error: insErr } = await db.from("estimate_items").insert(rows);
    if (insErr) return { ok: false, notice: insErr.message };
  }

  await recomputeEstimateTotals(estimateId);
  if (estimate.lead_id) await touch(estimate.lead_id);
  refresh();
  return { ok: true };
}

export async function sendEstimate(
  estimateId: string,
  opts?: { channels?: { email?: boolean; text?: boolean }; toEmail?: string; toPhone?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  // Draft + resend (sent/viewed) are both deliverable; terminal statuses aren't.
  if (estimate.status === "approved") return { ok: false, notice: "This estimate is already approved." };
  if (estimate.status === "declined") return { ok: false, notice: "This estimate was declined." };
  if (estimate.status === "expired") return { ok: false, notice: "This estimate has expired — create a new one." };

  const db = canesDb();
  const now = new Date().toISOString();

  // Send-target overrides: validate, then PERSIST onto the row — the snapshot
  // columns are the send-of-record, so the fix survives reminders and resends.
  const overrides: Record<string, unknown> = {};
  if (opts?.toPhone !== undefined && opts.toPhone.trim()) {
    const phone = toE164(opts.toPhone);
    if (!phone) return { ok: false, notice: "That phone number doesn't look valid." };
    overrides.customer_phone = phone;
  }
  if (opts?.toEmail !== undefined && opts.toEmail.trim()) {
    const email = opts.toEmail.trim();
    if (!EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };
    overrides.customer_email = email;
  }
  if (Object.keys(overrides).length > 0) {
    const { error } = await db
      .from("estimates")
      .update({ ...overrides, updated_at: now })
      .eq("id", estimateId);
    if (error) return { ok: false, notice: error.message };
  }
  const effectivePhone = (overrides.customer_phone as string | undefined) ?? estimate.customer_phone;
  const effectiveEmail = (overrides.customer_email as string | undefined) ?? estimate.customer_email;

  // Resolve effective channels BEFORE flipping the status. No opts = send to
  // whatever is on file (back-compat). Text is gated on opt-out; both are gated
  // on the field actually being present.
  const lead = estimate.lead_id ? await getLead(estimate.lead_id) : null;
  const optedOut = Boolean(lead?.opted_out);
  const wantsText = opts?.channels?.text ?? true;
  const wantsEmail = opts?.channels?.email ?? true;
  const canText = Boolean(effectivePhone) && !optedOut && wantsText;
  const canEmail = Boolean(effectiveEmail) && wantsEmail;
  // Never mark an estimate sent when it has nowhere to go — that used to strand
  // a destination-less quote in an uneditable, unresendable "sent" state.
  if (!canText && !canEmail) {
    return {
      ok: false,
      notice: optedOut && Boolean(effectivePhone)
        ? "This customer opted out of texts — add an email to send the estimate."
        : "No destination: add a phone or email (or pick a channel) before sending.",
    };
  }

  // Lock in final totals (and deposit) before the customer ever sees them.
  const totals = await recomputeEstimateTotals(estimateId);
  const { error } = await db
    .from("estimates")
    // Resends keep the original sent_at — it anchors the reminder timeline.
    .update({ status: "sent", sent_at: estimate.sent_at ?? now, updated_at: now })
    .eq("id", estimateId);
  if (error) return { ok: false, notice: error.message };
  const sent: Estimate = {
    ...estimate,
    status: "sent",
    sent_at: estimate.sent_at ?? now,
    customer_phone: effectivePhone,
    customer_email: effectiveEmail,
    ...(totals ?? {}),
  };

  // Email inline with a per-attempt idempotency key. The provider outcome is
  // part of the action result — never claim "emailed" after a missing key,
  // render failure, or provider rejection.
  const emailResult = canEmail ? await notifyEstimateSent(sent, now) : null;

  // Text inline NOW so it lands in the thread immediately (sendCanesSms logs to
  // messages). If quiet hours or Twilio isn't configured, fall back to the tasks
  // outbox so the cron delivers it later — never double-send.
  let textQueued = false;
  let textSent = false;
  if (canText) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws").replace(/\/$/, "");
    const res = await sendCanesSms({
      to: sent.customer_phone as string,
      body: `Here is your estimate: ${base}/CanesPressure/e/${sent.public_token}`,
      leadId: estimate.lead_id,
      automated: true,
    });
    if (res.ok) {
      textSent = true;
    } else {
      // Quiet hours, Twilio not configured, OR a hard send failure — hand off to
      // the tasks outbox so the cron retries. Never drop the text silently.
      textQueued = await enqueueEstimateSend(sent);
    }
  }
  await enqueueEstimateReminders(sent);

  if (estimate.lead_id) {
    // Advance the lead to 'estimated' (never regress a won/lost lead).
    if (lead && !["won", "lost"].includes(lead.status)) {
      await db.from("leads").update({ status: "estimated" }).eq("id", estimate.lead_id);
    }
    await logEvent(
      estimate.lead_id,
      "estimate",
      `Estimate ${estimate.number} ${estimate.sent_at ? "re-sent" : "sent"} (${fmtMoney(sent.total_cents)})`,
    );
    await touch(estimate.lead_id);
  }
  refresh();
  const emailSent = emailResult?.ok === true;
  const emailFailure = emailResult && !emailResult.ok
    ? emailResult.skipped ?? emailResult.error ?? "Email delivery failed."
    : null;
  const delivered = emailSent || textSent || textQueued;
  return {
    ok: delivered,
    notice: sendEstimateNotice({ emailSent, emailFailure, optedOut, textSent, textQueued }),
  };
}

// Human-readable summary of what actually happened when the estimate went out.
function sendEstimateNotice(s: {
  emailSent: boolean;
  emailFailure: string | null;
  optedOut: boolean;
  textSent: boolean;
  textQueued: boolean;
}): string {
  if (s.emailFailure && s.textSent) return `Texted the estimate. Email failed: ${s.emailFailure}`;
  if (s.emailFailure && s.textQueued) return `Text queued. Email failed: ${s.emailFailure}`;
  if (s.emailFailure) return `The estimate was prepared, but email failed: ${s.emailFailure}`;
  if (s.textSent && s.emailSent) return "Texted and emailed the estimate.";
  if (s.textSent) return "Texted the estimate.";
  if (s.textQueued && s.emailSent) return "Text queued for after quiet hours; emailed now.";
  if (s.textQueued) return "Text queued for after quiet hours.";
  // Opted-out surfaces regardless of the picker choice so the owner knows why no text went.
  if (s.optedOut && s.emailSent) return "Sent by email — customer opted out of texts.";
  if (s.emailSent) return "Emailed the estimate.";
  return "The estimate could not be delivered. Try again.";
}

export async function voidEstimate(estimateId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  // Voiding takes a LIVE quote off the table. Its terminal siblings are not
  // live, and each one loses something real if it is overwritten with
  // "expired" — the same reasoning deleteEstimate uses below, in the same
  // order.
  if (estimate.status === "approved") {
    return { ok: false, notice: "This estimate was approved and has a job — void the job instead." };
  }
  if (estimate.status === "declined") {
    return { ok: false, notice: "Declined estimates are part of your win-rate record — keep this one." };
  }
  if (estimate.status === "expired") return { ok: true, notice: "That estimate was already voided." };
  const db = canesDb();
  const now = new Date().toISOString();
  // Expired is the terminal "no longer live" status the schema allows for a
  // voided estimate; cancel any pending reminder/send tasks so the customer is
  // never texted about a dead estimate.
  //
  // CLAIMED, and the status filter is the claim rather than a re-check: the
  // read above cannot hold. approveEstimate is one of the seven deliberately
  // unguarded actions the public /e/ token page calls, so a customer tapping
  // Approve between the read and this write is an ordinary Saturday, not a
  // race worth ignoring. Zero rows means they got there first.
  const { data: claimed, error } = await db
    .from("estimates")
    .update({ status: "expired", updated_at: now })
    .eq("id", estimateId)
    .in("status", ["draft", "sent", "viewed"])
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed?.length) {
    return { ok: false, notice: "That estimate changed while you were looking at it — refresh and try again." };
  }
  await db
    .from("tasks")
    .update({ status: "canceled" })
    .in("kind", ["estimate_send", "estimate_reminder"])
    .eq("status", "pending")
    .in("dedupe_key", [
      `estimate_send:${estimateId}`,
      `estimate_reminder:${estimateId}:d2`,
      `estimate_reminder:${estimateId}:d5`,
    ]);
  if (estimate.lead_id) {
    await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} voided`);
    await touch(estimate.lead_id);
  }
  refresh();
  return { ok: true };
}

// Permanently remove a mistyped or dead estimate — Sebastian's junk-cleanup
// ask, mirroring deleteLead's discipline. Drafts and voided/expired ones
// only: a live sent estimate must be voided first (the customer may have the
// link open), declined stays (it IS the win-rate record), and anything that
// spawned a job or invoice is business history. Items cascade; the sender
// tasks are canceled explicitly rather than left for the cron to reap.
export async function deleteEstimate(estimateId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (!["draft", "expired"].includes(estimate.status)) {
    if (estimate.status === "approved") {
      return { ok: false, notice: "This estimate was approved and has a job — it can't be deleted." };
    }
    if (estimate.status === "declined") {
      return { ok: false, notice: "Declined estimates are part of your win-rate record — keep this one." };
    }
    return { ok: false, notice: "Void the estimate first, then delete it." };
  }

  const db = canesDb();
  const [jobRef, invRef] = await Promise.all([
    db.from("jobs").select("id").eq("estimate_id", estimateId).limit(1),
    db.from("invoices").select("id").eq("estimate_id", estimateId).limit(1),
  ]);
  if (jobRef.error) return { ok: false, notice: jobRef.error.message };
  if (invRef.error) return { ok: false, notice: invRef.error.message };
  if ((jobRef.data ?? []).length > 0 || (invRef.data ?? []).length > 0) {
    return { ok: false, notice: "This estimate has a job or invoice attached — keep it for the record." };
  }

  await db
    .from("tasks")
    .update({ status: "canceled" })
    .eq("status", "pending")
    .in("dedupe_key", [
      `estimate_send:${estimateId}`,
      `estimate_reminder:${estimateId}:d2`,
      `estimate_reminder:${estimateId}:d5`,
    ]);
  const { error } = await db.from("estimates").delete().eq("id", estimateId);
  if (error) return { ok: false, notice: error.message };
  if (estimate.lead_id) {
    await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} deleted`);
  }
  refresh();
  // The detail page no longer exists — redirect from the action so navigation
  // and revalidation land together (no not-found flash).
  redirect("/CanesPressure/estimates");
}

// Permanently remove a dead invoice — drafts and voids only, and never one
// money has touched. A sent/viewed/paid invoice is the customer-facing money
// record; Square history (ids on the row) also keeps it. Deposit rows detach
// automatically (SET NULL, job-anchored) and re-point onto the next bill.
export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status !== "draft" && invoice.status !== "void") {
    return { ok: false, notice: "Only a draft or voided invoice can be deleted — void it first if it was sent." };
  }
  if (invoice.square_invoice_id) {
    return { ok: false, notice: "This invoice has Square history — keep it for reconciliation." };
  }
  const db = canesDb();
  const { data: payRows, error: payErr } = await db
    .from("payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .neq("kind", "deposit")
    .limit(1);
  if (payErr) return { ok: false, notice: payErr.message };
  if ((payRows ?? []).length > 0) {
    return { ok: false, notice: "This invoice has a payment recorded — it can't be deleted." };
  }
  // Same optimistic discipline as reopenJob: only a still-draft/void row at
  // the amount we read deletes — a racing send keeps its invoice, and a
  // racing partial cash payment (which bumps amount_paid_cents while status
  // stays draft) aborts instead of orphaning its ledger row.
  const { data: deleted, error } = await db
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .in("status", ["draft", "void"])
    .eq("amount_paid_cents", invoice.amount_paid_cents)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false, notice: "This invoice just changed — refresh and check it." };
  }
  // Cancel the sender tasks only AFTER the delete claim wins — canceling
  // first would strip a racing send's queued text/reminders from an invoice
  // that survives.
  await db
    .from("tasks")
    .update({ status: "canceled" })
    .eq("status", "pending")
    .like("dedupe_key", `invoice_%:${invoiceId}%`);
  if (invoice.lead_id) await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} deleted`);
  refresh();
  redirect("/CanesPressure/invoices");
}

// Permanently remove a junk job. Manual jobs only (an estimate-backed job is
// the approval's record — cancel it instead), and never one with an invoice
// or money attached. Items, expenses, time entries, and media rows cascade.
export async function deleteJob(jobId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (job.estimate_id) {
    return { ok: false, notice: "This job came from an approved estimate — cancel it instead so the record stays." };
  }
  const db = canesDb();
  const [invRef, payRef, timeRef] = await Promise.all([
    db.from("invoices").select("id").eq("job_id", jobId).limit(1),
    db.from("payments").select("id").eq("job_id", jobId).limit(1),
    db.from("job_time_entries").select("id").eq("job_id", jobId).limit(1),
  ]);
  if (invRef.error) return { ok: false, notice: invRef.error.message };
  if (payRef.error) return { ok: false, notice: payRef.error.message };
  if (timeRef.error) return { ok: false, notice: timeRef.error.message };
  if ((invRef.data ?? []).length > 0) {
    return { ok: false, notice: "This job has an invoice — delete or void the invoice first." };
  }
  if ((payRef.data ?? []).length > 0) {
    return { ok: false, notice: "This job has money in the ledger (a deposit or payment) — it can't be deleted." };
  }
  if ((timeRef.data ?? []).length > 0) {
    return { ok: false, notice: "Crew hours are logged on this job — the timesheet keeps it. Cancel it instead." };
  }
  await cancelJobConfirmation(jobId);
  // Claimed delete: only a still-idle job goes — a racing Complete (which
  // flips status and mints the invoice) wins and this aborts. The ms-scale
  // window against a concurrent deposit insert is accepted for a one-owner
  // shop; the payments precheck above covers every human-speed path.
  const { data: deleted, error } = await db
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .in("status", ["unscheduled", "scheduled", "confirmed", "canceled"])
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false, notice: "This job just changed (it may be in progress or billed) — refresh and check it." };
  }
  await logJobEvent(job.lead_id, `Job deleted — ${job.job_name ?? "job"}`);
  refresh();
  return { ok: true, notice: "Job deleted." };
}

// Permanently remove a junk or duplicate customer. Anyone with an estimate,
// job, or invoice on file is business history and stays; addresses cascade,
// and any linked lead survives with its consent state intact.
export async function deleteContact(contactId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const db = canesDb();
  const [est, jobs, invs] = await Promise.all([
    db.from("estimates").select("id").eq("contact_id", contactId).limit(1),
    db.from("jobs").select("id").eq("contact_id", contactId).limit(1),
    db.from("invoices").select("id").eq("contact_id", contactId).limit(1),
  ]);
  if (est.error) return { ok: false, notice: est.error.message };
  if (jobs.error) return { ok: false, notice: jobs.error.message };
  if (invs.error) return { ok: false, notice: invs.error.message };
  if ((est.data ?? []).length > 0 || (jobs.data ?? []).length > 0 || (invs.data ?? []).length > 0) {
    return {
      ok: false,
      notice: "This customer has an estimate, job, or invoice on file — archive them instead of deleting.",
    };
  }
  const { error } = await db.from("contacts").delete().eq("id", contactId);
  if (error) return { ok: false, notice: error.message };
  refresh();
  redirect("/CanesPressure/customers");
}

// ── Public, token-scoped (called from the ungated /CanesPressure/e/[token]) ──

export async function markViewed(token: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const estimate = await getEstimateByToken(token);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  // Only the first open of a sent estimate flips to viewed; idempotent after.
  if (estimate.status !== "sent") return { ok: true };
  const now = new Date().toISOString();
  const { error } = await canesDb()
    .from("estimates")
    .update({ status: "viewed", viewed_at: now, updated_at: now })
    .eq("id", estimate.id)
    .eq("status", "sent");
  if (error) return { ok: false, notice: error.message };
  if (estimate.lead_id) await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} viewed by customer`);
  refresh();
  return { ok: true };
}

export async function approveEstimate(
  token: string,
  signatureName: string,
  selectedItemIds?: string[],
): Promise<ActionResult & { depositUrl?: string | null }> {
  if (!canesConfigured()) return DEMO;
  const signature = signatureName.trim();
  if (!signature) return { ok: false, notice: "Please type your name to sign." };
  const estimate = await getEstimateByToken(token);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (estimate.status === "approved") return { ok: false, notice: "This estimate is already approved." };
  if (!["sent", "viewed"].includes(estimate.status)) {
    return { ok: false, notice: "This estimate can no longer be approved." };
  }
  if (estimate.expires_at && new Date(estimate.expires_at).getTime() < Date.now()) {
    return { ok: false, notice: "This estimate has expired. Please contact us for a new one." };
  }
  return finalizeEstimateApproval(estimate, signature, { selectedItemIds });
}

// Owner-side approval for a client who said yes in person or on the phone —
// Sebastian's "manually approve" ask. Same finalize path as the public page
// (job creation, deposit link, lead → won), with the e-signature recorded as
// an in-person agreement. Standard estimates only: options/packages totals
// derive from the customer's selection, which only the public page captures —
// approving those here would silently drop every unselected line. (No
// separate expiry check: the cron already flips overdue estimates to
// 'expired', which the sent/viewed guard rejects.)
// jobId comes back so the phone can land on the job this approval just created.
// The public approveEstimate above deliberately does NOT widen — a customer on
// the token page has no business receiving an internal job id.
export async function approveEstimateInPerson(
  estimateId: string,
  opts?: { depositCollected?: boolean; depositMethod?: PaymentMethod },
): Promise<ActionResult & { depositUrl?: string | null; jobId?: string | null }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (estimate.status === "approved") return { ok: false, notice: "This estimate is already approved." };
  if (!["sent", "viewed"].includes(estimate.status)) {
    return { ok: false, notice: "Only a sent estimate can be marked approved." };
  }
  if (estimate.estimate_type !== "standard") {
    return {
      ok: false,
      notice: "Options and package estimates need the customer's own selection — have them approve from their link.",
    };
  }
  const signature = `${estimate.customer_name ?? "Customer"} (agreed in person)`;
  return finalizeEstimateApproval(estimate, signature, {
    inPerson: true,
    depositCollected: Boolean(opts?.depositCollected),
    depositMethod: opts?.depositMethod ?? "cash",
  });
}

// The shared back half of an approval, after each caller's own guards: claim
// the status flip, promote the lead, upsert the contact, create the job, mint
// the deposit link. Owner notifications only fire for the public path — the
// in-person path IS the owner acting.
async function finalizeEstimateApproval(
  estimate: Estimate,
  signature: string,
  opts: {
    selectedItemIds?: string[];
    inPerson?: boolean;
    depositCollected?: boolean;
    depositMethod?: PaymentMethod;
  } = {},
): Promise<ActionResult & { depositUrl?: string | null; jobId?: string | null }> {
  const { selectedItemIds } = opts;
  const db = canesDb();
  // Options estimates: persist the customer's selection before recomputing so
  // the approved totals reflect exactly what they chose.
  if (estimate.estimate_type === "options" && selectedItemIds) {
    const items = await getEstimateItems(estimate.id);
    const chosen = new Set(selectedItemIds);
    for (const item of items) {
      if (item.is_mandatory) continue; // mandatory lines are never toggled off
      const selected = chosen.has(item.id);
      if (selected !== item.is_selected) {
        await db.from("estimate_items").update({ is_selected: selected }).eq("id", item.id);
      }
    }
  }
  const totals = await recomputeEstimateTotals(estimate.id);
  const now = new Date().toISOString();
  // Conditional claim on the exact status we read: if a concurrent approve (a
  // second tab, a replayed POST) already flipped it, we match zero rows and bail
  // before firing the owner alert or creating a second job.
  const { data: claimed, error } = await db
    .from("estimates")
    .update({
      status: "approved",
      approved_at: now,
      approval_source: opts.inPerson ? "in_person" : "customer",
      signature_name: signature,
      updated_at: now,
    })
    .eq("id", estimate.id)
    .eq("status", estimate.status)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimed || claimed.length === 0) {
    // The status moved between the caller's read and our claim. A double-tap
    // or replayed approve really is approved — but a markViewed race is not,
    // and must not masquerade as success.
    const current = await getEstimate(estimate.id);
    if (current?.status === "approved") {
      return { ok: true, notice: "This estimate is already approved." };
    }
    return { ok: false, notice: "This estimate just changed — please try again." };
  }

  const approved: Estimate = {
    ...estimate,
    status: "approved",
    approved_at: now,
    signature_name: signature,
    ...(totals ?? {}),
  };

  if (estimate.lead_id) {
    const lead = await getLead(estimate.lead_id);
    if (lead && lead.status !== "lost") {
      await db.from("leads").update({ status: "won" }).eq("id", estimate.lead_id);
    }
    await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} approved by ${signature}`);
    await touch(estimate.lead_id);
  }

  // An approval IS the moment a lead becomes a customer: upsert the contact
  // from the estimate snapshot and stamp it before the job snapshot copies it.
  const contact = await ensureContact({
    name: approved.customer_name,
    phone: approved.customer_phone,
    email: approved.customer_email,
    address: approved.job_address,
    leadId: estimate.lead_id,
  });
  if (contact && estimate.contact_id !== contact.id) {
    await db
      .from("estimates")
      .update({ contact_id: contact.id, updated_at: new Date().toISOString() })
      .eq("id", estimate.id);
  }

  // Notifications are best-effort: a Twilio/network throw here must never
  // strand an approved estimate without its job (the approve claim already
  // happened, so a retried approve would bail as "already approved"). The
  // in-person path skips them — alerting Sebastian about his own tap is noise.
  if (!opts.inPerson) {
    try {
      await alertOwner(
        `Estimate ${approved.number} approved by ${approved.customer_name ?? signature} — ` +
          `${fmtMoney(approved.total_cents)}. A job was created; time to schedule.`,
      );
      await notifyEstimateApproved(approved);
    } catch (err) {
      console.error(`[canes] approval notifications failed for ${approved.number}:`, err);
    }
  }

  const withItems = await getEstimateWithItems(estimate.id);
  const jobId = withItems ? await createJobFromEstimate(withItems) : null;
  if (!opts.inPerson) {
    try {
      await pushEstimateApproved({
        estimateId: approved.id,
        estimateNumber: approved.number,
        customerName: approved.customer_name,
        jobId,
      });
    } catch (error) {
      // Approval and job creation have committed. Notification recovery owns
      // delivery; never skip the deposit flow or report approval as failed.
      console.error(`[canes] estimate approval push persistence failed for ${approved.id}:`, error);
    }
  }

  // Deposit already in hand (in-person approval): ledger it now and never
  // mint an online link — the customer must not be able to pay twice. The
  // approval itself already committed, so a failed ledger write can only be
  // reported honestly, never rolled back.
  if (opts.depositCollected && jobId && approved.deposit_cents > 0) {
    const job = await getJob(jobId);
    const dep = job
      ? await insertJobDepositRow(job, approved.deposit_cents, opts.depositMethod ?? "cash")
      : { ok: false as const, notice: "job not found" };
    refresh();
    // jobId rides back on every success path so a caller can land on the job
    // the approval just created instead of announcing it and leaving the person
    // to go find it. The web ignores it; the phone navigates with it.
    return dep.ok
      ? {
          ok: true,
          jobId,
          depositUrl: null,
          notice: "Approved — deposit recorded, job in the schedule tray.",
        }
      : {
          ok: true,
          jobId,
          depositUrl: null,
          notice: "Approved — but the deposit could NOT be recorded. Open the job and record it there.",
        };
  }

  const deposit = await createDepositLink(approved, jobId);
  refresh();
  return {
    ok: true,
    jobId,
    depositUrl: deposit.url,
    ...(opts.inPerson
      ? {
          notice: deposit.url
            ? "Approved — job created. The customer's estimate link now shows their deposit button."
            : "Approved — the job is in the schedule tray.",
        }
      : {}),
  };
}

export async function declineEstimate(token: string, reason: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const estimate = await getEstimateByToken(token);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (!["sent", "viewed"].includes(estimate.status)) {
    return { ok: false, notice: "This estimate can no longer be declined." };
  }
  const db = canesDb();
  const now = new Date().toISOString();
  const trimmed = reason.trim() || null;
  const { error } = await db
    .from("estimates")
    .update({ status: "declined", declined_at: now, decline_reason: trimmed, updated_at: now })
    .eq("id", estimate.id);
  if (error) return { ok: false, notice: error.message };

  const declined: Estimate = {
    ...estimate,
    status: "declined",
    declined_at: now,
    decline_reason: trimmed,
  };

  // Cancel any pending reminder/send tasks — no more nagging a declined estimate.
  await db
    .from("tasks")
    .update({ status: "canceled" })
    .eq("status", "pending")
    .in("dedupe_key", [
      `estimate_send:${estimate.id}`,
      `estimate_reminder:${estimate.id}:d2`,
      `estimate_reminder:${estimate.id}:d5`,
    ]);

  if (estimate.lead_id) {
    await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} declined${trimmed ? ` — ${trimmed}` : ""}`);
    await touch(estimate.lead_id);
  }
  try {
    await alertOwner(
      `Estimate ${declined.number} declined by ${declined.customer_name ?? "customer"}${trimmed ? `: ${trimmed}` : "."}`,
    );
    await notifyEstimateDeclined(declined);
  } catch (err) {
    console.error(`[canes] decline notifications failed for ${declined.number}:`, err);
  }
  refresh();
  return { ok: true };
}

// Internal: create the job that backs an approved estimate. Insert-only dedupe
// on estimate_id so a double-approve (or a retried approve) never spawns a
// second job. Not exported as an action surface; called by approveEstimate.
export async function createJobFromEstimate(estimate: EstimateWithItems): Promise<string | null> {
  if (!canesConfigured()) return null;
  const db = canesDb();
  // Guard: a job already tied to this estimate means we're done.
  const { data: existing } = await db
    .from("jobs")
    .select("id")
    .eq("estimate_id", estimate.id)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // Belt-and-braces contact link: approveEstimate stamps contact_id, but this
  // is exported and callable on its own, so resolve the contact here too.
  const contactId =
    estimate.contact_id ??
    (
      await ensureContact({
        name: estimate.customer_name,
        phone: estimate.customer_phone,
        email: estimate.customer_email,
        address: estimate.job_address,
        leadId: estimate.lead_id,
      })
    )?.id ??
    null;

  const { data, error } = await db
    .from("jobs")
    .insert({
      estimate_id: estimate.id,
      lead_id: estimate.lead_id,
      contact_id: contactId,
      status: "unscheduled",
      customer_name: estimate.customer_name,
      customer_phone: estimate.customer_phone,
      customer_email: estimate.customer_email,
      job_name: estimate.job_name,
      job_address: estimate.job_address,
      total_cents: estimate.total_cents,
      deposit_cents: estimate.deposit_cents,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[canes] createJobFromEstimate failed for ${estimate.id}: ${error.message}`);
    return null;
  }
  const jobId = data.id as string;

  // Snapshot the sold line items into job_items (the run-sheet checklist). Only
  // the lines that count toward the sale — the customer never sees deselected
  // options on their run sheet. Best-effort: a failed snapshot never orphans the
  // job (the estimate_id UNIQUE backstop still dedupes a retry).
  const soldItems = estimate.items.filter(itemCounts);
  if (soldItems.length > 0) {
    const rows = soldItems.map((it, i) => ({
      job_id: jobId,
      estimate_item_id: it.id,
      position: i,
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      line_total_cents: it.line_total_cents,
    }));
    const { error: itemsErr } = await db.from("job_items").insert(rows);
    if (itemsErr) {
      console.error(`[canes] job_items snapshot failed for job ${jobId}: ${itemsErr.message}`);
    }
  }

  // The quote-time cost model (0014) seeds the job's real expense sheet, so
  // margin carries from estimate to job without re-entry. Best-effort, and
  // runs at most once — a retried approve early-returns on the existing job.
  const projected = await listEstimateExpenses(estimate.id);
  if (projected.length > 0) {
    const { error: expErr } = await db.from("job_expenses").insert(
      projected.map((e) => ({
        job_id: jobId,
        amount_cents: e.amount_cents,
        category: e.category,
        note: e.note,
        crew_id: null,
        created_by: "estimate",
      })),
    );
    if (expErr) console.error(`[canes] expense copy failed for job ${jobId}: ${expErr.message}`);
  }
  return jobId;
}

// ── Service catalog ──────────────────────────────────────────────────────────

export async function upsertCatalogItem(item: {
  id?: string;
  name: string;
  kind: CatalogKind;
  defaultPriceCents: number;
  description?: string | null;
  unit?: string;
  taxable?: boolean;
  active?: boolean;
  position?: number;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  if (!item.name.trim()) return { ok: false, notice: "Name is required." };
  const db = canesDb();
  const row: Record<string, unknown> = {
    name: item.name.trim(),
    kind: item.kind,
    default_price_cents: Math.round(item.defaultPriceCents),
    description: item.description ?? null,
    unit: item.unit ?? "each",
    taxable: item.taxable ?? false,
    active: item.active ?? true,
    position: item.position ?? 0,
  };
  if (item.id) {
    // Claimed write: an id that no longer exists (deleted in another tab, or
    // held in a phone's cached price list) matched zero rows and still reported
    // success — so a PRICE CHANGE the owner watched confirm had not happened,
    // and the next estimate quoted the old number.
    const { data: claimed, error } = await db
      .from("service_catalog")
      .update(row)
      .eq("id", item.id)
      .select("id");
    if (error) return { ok: false, notice: error.message };
    if (!claimed || claimed.length === 0) {
      return { ok: false, notice: "This item just changed — refresh and try again." };
    }
  } else {
    const { error } = await db.from("service_catalog").insert(row);
    if (error) return { ok: false, notice: error.message };
  }
  refresh();
  return { ok: true };
}

export async function deleteCatalogItem(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  // Soft-delete: catalog items may be referenced by historical estimate lines,
  // so deactivate rather than remove.
  const { error } = await canesDb().from("service_catalog").update({ active: false }).eq("id", id);
  if (error) return { ok: false, notice: error.message };
  refresh();
  return { ok: true };
}

// ── Scheduler (Phase 2) ──────────────────────────────────────────────────────
//
// Every mutation clones the setAppointment template: DEMO guard → validate →
// write jobs/calendar_events → (re)arm the day-before job_confirmation task →
// logJobEvent (null-lead-guarded) → refresh() → ActionResult. A schedule/move
// never regresses a terminal job (completed|invoiced|paid|canceled), mirroring
// the won/lost guards. ET wall-time composition happens upstream in the UI via
// etLocalToIso; these actions receive true ISO strings. Money stays in cents.

// Terminal jobs are finished work — never re-slot or re-crew them via drag.
const TERMINAL_JOB_STATUSES: JobStatus[] = ["completed", "invoiced", "paid", "canceled"];
// Statuses that occupy a crew's calendar for the overlap/conflict check.
const ACTIVE_JOB_STATUSES: JobStatus[] = ["scheduled", "confirmed", "in_progress"];

// Jobs may have no lead (a job created outside the estimate flow), so job event
// logging must tolerate a null lead_id — unlike the lead-scoped logEvent.
async function logJobEvent(leadId: string | null, detail: string): Promise<void> {
  if (!leadId) return;
  await logEvent(leadId, "job", detail);
}

type JobNotificationMutation = {
  operation: "schedule" | "unschedule" | "assign" | "status";
  eventType: "schedule_changed" | "schedule_removed" | "crew_assignment_changed" | "status_changed";
  detail: Record<string, unknown>;
  newStatus?: JobStatus | null;
  newScheduledAt?: string | null;
  newEndsAt?: string | null;
  newDurationMinutes?: number | null;
  newCrewId?: string | null;
  newAssignedTo?: string | null;
  newConfirmedAt?: string | null;
  newCanceledReason?: string | null;
};

// The job CAS and immutable recovery audit commit in one transaction. A lost
// HTTP response can no longer make us delete the only evidence of a mutation
// that PostgreSQL already committed.
async function mutateJobWithNotification(
  job: Job,
  mutation: JobNotificationMutation,
): Promise<{ ok: true; eventId: string } | { ok: false; notice: string }> {
  const { data, error } = await canesDb().rpc("mutate_job_with_notification_locked", {
    p_job_id: job.id,
    p_operation: mutation.operation,
    p_expected_status: job.status,
    p_expected_scheduled_at: job.scheduled_at,
    p_expected_crew_id: job.crew_id,
    p_event_type: mutation.eventType,
    p_detail: mutation.detail,
    p_new_status: mutation.newStatus ?? null,
    p_new_scheduled_at: mutation.newScheduledAt ?? null,
    p_new_ends_at: mutation.newEndsAt ?? null,
    p_new_duration_minutes: mutation.newDurationMinutes ?? null,
    p_new_crew_id: mutation.newCrewId ?? null,
    p_new_assigned_to: mutation.newAssignedTo ?? null,
    p_new_confirmed_at: mutation.newConfirmedAt ?? null,
    p_new_canceled_reason: mutation.newCanceledReason ?? null,
  });
  if (error) return { ok: false, notice: error.message };
  const result = (data?.[0] ?? null) as {
    outcome: "updated" | "not_found" | "conflict" | "terminal" | "invalid";
    event_id: string | null;
  } | null;
  if (result?.outcome === "updated" && result.event_id) {
    return { ok: true, eventId: result.event_id };
  }
  if (result?.outcome === "not_found") return { ok: false, notice: "Job not found." };
  if (result?.outcome === "terminal") return { ok: false, notice: "This job is already closed." };
  if (result?.outcome === "conflict") {
    return { ok: false, notice: "This job changed while you were updating it — refresh and try again." };
  }
  return { ok: false, notice: "The job update was rejected. Refresh and try again." };
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return new Date(left).getTime() === new Date(right).getTime();
}

function crewLabel(crew: { name: string } | null): string {
  return crew?.name ?? "no crew";
}

// Same crew, overlapping [scheduled_at, ends_at), active status, different job.
// Warn-only (Sebastian may deliberately double-book two nearby small jobs).
async function findConflictNotice(
  jobId: string,
  crewId: string | null,
  startIso: string,
  endIso: string,
): Promise<string | undefined> {
  if (!crewId) return undefined;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  // Scan a generous window around the slot so any same-crew overlap is caught.
  const board = await getScheduleBoard(new Date(start - 7 * 86_400_000).toISOString(), 21);
  const clash = board.find((j) => {
    if (j.id === jobId || j.crew_id !== crewId) return false;
    if (!ACTIVE_JOB_STATUSES.includes(j.status)) return false;
    if (!j.scheduled_at || !j.ends_at) return false;
    const s = new Date(j.scheduled_at).getTime();
    const e = new Date(j.ends_at).getTime();
    return start < e && s < end; // half-open interval overlap
  });
  if (!clash) return undefined;
  return `Heads up: overlaps ${clash.customer_name ?? "another job"} ${fmtEt(clash.scheduled_at)} for ${crewLabel(clash.crew)}.`;
}

// Arm / re-arm the day-before customer confirmation for a scheduled job. The
// dedupe_key includes the time so a reschedule mints a fresh task; stale pending
// tasks for this job on a different key are canceled first. Insert-only upsert so
// a task that already ran is never resurrected. Mirrors setAppointment's
// confirmation exactly, keyed off the snapshotted jobs.customer_phone.
async function armJobConfirmation(job: Job, scheduledIso: string): Promise<void> {
  const db = canesDb();
  const settings = await getSettings();
  const offsetHours = settings.job_confirmation_offset_hours;
  const sendAt = new Date(new Date(scheduledIso).getTime() - offsetHours * 3_600_000);
  const dedupeKey = `job_confirmation:${job.id}:${scheduledIso}`;
  // Cancel stale pending confirmations for this job whose key differs (an old slot).
  await db
    .from("tasks")
    .update({ status: "canceled" })
    .eq("kind", "job_confirmation")
    .eq("status", "pending")
    .contains("payload", { job_id: job.id })
    .neq("dedupe_key", dedupeKey);
  await db.from("tasks").upsert(
    {
      lead_id: job.lead_id,
      kind: "job_confirmation",
      dedupe_key: dedupeKey,
      scheduled_for: (sendAt.getTime() < Date.now() ? new Date() : sendAt).toISOString(),
      status: "pending",
      payload: { job_id: job.id, scheduled_at: scheduledIso },
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
}

// Cancel the pending day-before confirmation when a job leaves the calendar.
async function cancelJobConfirmation(jobId: string): Promise<void> {
  await canesDb()
    .from("tasks")
    .update({ status: "canceled" })
    .eq("kind", "job_confirmation")
    .eq("status", "pending")
    .contains("payload", { job_id: jobId });
}

// v1 = owner notification via the existing alertOwner path (Sebastian is the
// crew). Schema-ready for a real per-worker contact when multi-crew ships.
async function notifyCrewAssignment(job: Job, crewName: string, whenIso: string | null): Promise<void> {
  const when = whenIso ? ` ${fmtEt(whenIso)}` : "";
  await alertOwner(`Job assigned to ${crewName}: ${job.customer_name ?? "customer"}${when}.`);
}

// Place an unscheduled job onto the calendar (tray → calendar) or set/replace
// its slot. Writes ends_at = scheduled_at + duration in the same update.
export async function scheduleJob(
  jobId: string,
  scheduledIso: string,
  durationMinutes: number,
  crewId: string | null,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const when = new Date(scheduledIso);
  if (Number.isNaN(when.getTime())) return { ok: false, notice: "Invalid date." };
  const duration = Math.max(15, Math.round(durationMinutes));
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: `Can't schedule a ${job.status} job.` };
  }

  const startIso = when.toISOString();
  const endIso = new Date(when.getTime() + duration * 60_000).toISOString();
  const crews = crewId ? await listCrews() : [];
  const crew = crewId ? crews.find((c) => c.id === crewId) ?? null : null;
  if (crewId && !crew) return { ok: false, notice: "Crew not found." };
  const scheduleChanged =
    !sameInstant(job.scheduled_at, startIso) ||
    !sameInstant(job.ends_at, endIso) ||
    job.crew_id !== crewId ||
    job.duration_minutes !== duration;
  if (!scheduleChanged) return { ok: true, notice: "This job is already in that slot." };
  const resultingStatus: JobStatus = ["unscheduled", "scheduled", "confirmed"].includes(job.status)
    ? "scheduled"
    : job.status;
  const mutation = await mutateJobWithNotification(job, {
    operation: "schedule",
    eventType: "schedule_changed",
    detail: {
      previousScheduledAt: job.scheduled_at,
      scheduledAt: startIso,
      previousCrewId: job.crew_id,
      crewId,
    },
    newStatus: resultingStatus,
    newScheduledAt: startIso,
    newEndsAt: endIso,
    newDurationMinutes: duration,
    newCrewId: crewId,
    newAssignedTo: crew?.name ?? job.assigned_to,
    newConfirmedAt: resultingStatus === "scheduled" ? null : job.confirmed_at,
  });
  if (!mutation.ok) return mutation;
  const notificationEventId = mutation.eventId;

  const conflict = await findConflictNotice(jobId, crewId, startIso, endIso);
  // Back-dating (logging a job Sebastian forgot to schedule): never text the
  // customer a confirmation for a visit that already happened — and drop any
  // pending one from the job's old future slot.
  const pastSlot = when.getTime() < Date.now();
  if (pastSlot) {
    await cancelJobConfirmation(jobId);
  } else {
    await armJobConfirmation(job, startIso);
  }
  if (!pastSlot && job.crew_id && job.crew_id !== crewId) {
    try {
      await pushCrewRemovedFromJob({
        eventId: notificationEventId,
        jobId: job.id,
        crewId: job.crew_id,
        customerName: job.customer_name,
        jobName: job.job_name,
      });
    } catch (error) {
      console.error(`[canes] crew removal push persistence failed for ${job.id}:`, error);
    }
  }
  if (!pastSlot && scheduleChanged) {
    try {
      await pushJobChanged({
        id: job.id,
        customerName: job.customer_name,
        jobName: job.job_name,
        crewId,
        eventId: notificationEventId,
        change: job.scheduled_at ? "rescheduled" : "updated",
        detail: job.scheduled_at
          ? `${job.customer_name ?? "A customer"}'s job moved to ${fmtEt(startIso)}.`
          : `${job.customer_name ?? "A customer"}'s job is scheduled for ${fmtEt(startIso)}.`,
        notifyOwner: false,
        expectedJobState: { crewId, status: resultingStatus, scheduledAt: startIso, endsAt: endIso },
      });
    } catch (error) {
      console.error(`[canes] schedule push persistence failed for ${job.id}:`, error);
    }
  }
  if (crew && !pastSlot) {
    try {
      await notifyCrewAssignment(job, crew.name, startIso);
    } catch (error) {
      console.error(`[canes] legacy crew assignment notice failed for ${job.id}:`, error);
    }
  }
  await logJobEvent(job.lead_id, `Scheduled ${fmtEt(startIso)} · ${crewLabel(crew)}`);
  refresh();
  const notices = [conflict, lateNightNotice(startIso)].filter(Boolean);
  return { ok: true, notice: notices.length ? notices.join(" ") : undefined };
}

// An AM/PM slip is the easiest scheduling mistake to make and the hardest to
// spot — an 11 PM job just stretches the calendar into an empty desert. Say
// it out loud at save time.
function lateNightNotice(startIso: string): string | undefined {
  const hour = Number(fmtEt(startIso, { hour: "2-digit", hourCycle: "h23" }));
  if (hour >= 21 || hour < 5) {
    return `Heads up — that's ${fmtEt(startIso, { hour: "numeric", minute: "2-digit" })} at night. Double-check the AM/PM if you meant daytime.`;
  }
  return undefined;
}

// Reschedule / re-crew an already-placed job. scheduledIso === null sends it
// back to the tray (unschedule semantics). durationMinutes/crewId default to the
// job's current values when omitted.
export async function moveJob(
  jobId: string,
  scheduledIso: string | null,
  durationMinutes?: number,
  crewId?: string | null,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  if (scheduledIso === null) return unscheduleJob(jobId);
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: `Can't move a ${job.status} job.` };
  }
  const duration = durationMinutes !== undefined ? durationMinutes : job.duration_minutes;
  // crewId omitted (undefined) → keep the current crew; null → clear it.
  const nextCrewId = crewId !== undefined ? crewId : job.crew_id;
  return scheduleJob(jobId, scheduledIso, duration, nextCrewId);
}

// Pull a job off the calendar back into the tray. Cancels its pending day-before
// confirmation so the customer is never texted about a dropped slot.
export async function unscheduleJob(jobId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: `Can't unschedule a ${job.status} job.` };
  }
  if (job.scheduled_at === null && job.ends_at === null && job.status === "unscheduled") {
    return { ok: true, notice: "This job is already unscheduled." };
  }
  const mutation = await mutateJobWithNotification(job, {
    operation: "unschedule",
    eventType: "schedule_removed",
    detail: {
      previousScheduledAt: job.scheduled_at,
      previousCrewId: job.crew_id,
    },
  });
  if (!mutation.ok) return mutation;
  const notificationEventId = mutation.eventId;
  await cancelJobConfirmation(jobId);
  await logJobEvent(job.lead_id, "Returned to the unscheduled tray");
  if (job.crew_id && job.scheduled_at && new Date(job.scheduled_at).getTime() >= Date.now()) {
    try {
      await pushJobChanged({
        id: job.id,
        customerName: job.customer_name,
        jobName: job.job_name,
        crewId: job.crew_id,
        eventId: notificationEventId,
        change: "rescheduled",
        detail: `${job.customer_name ?? "A customer"}'s job was removed from the schedule.`,
        notifyOwner: false,
        expectedJobState: { crewId: job.crew_id, status: "unscheduled", scheduledAt: null, endsAt: null },
      });
    } catch (error) {
      console.error(`[canes] unschedule push persistence failed for ${job.id}:`, error);
    }
  }
  refresh();
  return { ok: true };
}

// Assign / reassign a crew without changing the time.
export async function assignJob(jobId: string, crewId: string | null): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: `Can't assign a crew to a ${job.status} job.` };
  }
  if (job.crew_id === crewId) return { ok: true, notice: "This crew is already assigned." };
  const crews = crewId ? await listCrews() : [];
  const crew = crewId ? crews.find((c) => c.id === crewId) ?? null : null;
  if (crewId && !crew) return { ok: false, notice: "Crew not found." };
  const mutation = await mutateJobWithNotification(job, {
    operation: "assign",
    eventType: "crew_assignment_changed",
    detail: {
      previousCrewId: job.crew_id,
      crewId,
      scheduledAt: job.scheduled_at,
    },
    newCrewId: crewId,
    newAssignedTo: crew?.name ?? null,
  });
  if (!mutation.ok) return mutation;
  const notificationEventId = mutation.eventId;

  let notice: string | undefined;
  if (job.scheduled_at && job.ends_at) {
    notice = await findConflictNotice(jobId, crewId, job.scheduled_at, job.ends_at);
  }
  // A back-dated (already-done) job doesn't need an assignment alert.
  const pastSlot = !!job.scheduled_at && new Date(job.scheduled_at).getTime() < Date.now();
  if (!pastSlot && job.crew_id && job.crew_id !== crewId) {
    try {
      await pushCrewRemovedFromJob({
        eventId: notificationEventId,
        jobId: job.id,
        crewId: job.crew_id,
        customerName: job.customer_name,
        jobName: job.job_name,
      });
    } catch (error) {
      console.error(`[canes] assignment removal push persistence failed for ${job.id}:`, error);
    }
  }
  if (crew && !pastSlot) {
    try {
      await pushJobChanged({
        id: job.id,
        customerName: job.customer_name,
        jobName: job.job_name,
        crewId: crew.id,
        eventId: notificationEventId,
        change: "updated",
        detail: `${job.customer_name ?? "A customer"}'s job was assigned to ${crew.name}.`,
        notifyOwner: false,
        expectedJobState: { crewId: crew.id, status: job.status, scheduledAt: job.scheduled_at, endsAt: job.ends_at },
      });
    } catch (error) {
      console.error(`[canes] assignment push persistence failed for ${job.id}:`, error);
    }
  }
  if (crew && !pastSlot) {
    try {
      await notifyCrewAssignment(job, crew.name, job.scheduled_at);
    } catch (error) {
      console.error(`[canes] legacy crew assignment notice failed for ${job.id}:`, error);
    }
  }
  await logJobEvent(job.lead_id, crew ? `Assigned to ${crew.name}` : "Crew unassigned");
  refresh();
  return { ok: true, notice };
}

// Drive the manual status transitions this build owns, plus cancel/no-show with
// a reason. Cancel stores canceled_reason (no-show is a reason string) and
// cancels the pending confirmation.
async function retireJobPaymentSurfacesBeforeCancellation(job: Job): Promise<ActionResult> {
  const db = canesDb();
  if (job.deposit_link_url && !job.deposit_link_id) {
    return {
      ok: false,
      notice: "This job has a Square deposit URL that cannot be safely disabled. Reconcile it before canceling the job.",
    };
  }
  if (job.deposit_link_id) {
    if (!await deleteDepositLink(job.deposit_link_id)) {
      return { ok: false, notice: "Couldn't disable the live Square deposit link. The job was not canceled; try again." };
    }
    const retiredAt = new Date().toISOString();
    const { data: retired, error } = await db
      .from("jobs")
      .update({
        deposit_link_id: null,
        deposit_link_url: null,
        deposit_link_retired_at: retiredAt,
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .eq("deposit_link_id", job.deposit_link_id)
      .select("id");
    if (error || !retired?.length) {
      return {
        ok: false,
        notice: "The Square deposit link was disabled, but the job changed locally. Refresh before retrying the cancellation.",
      };
    }
    job.deposit_link_id = null;
    job.deposit_link_url = null;
    job.deposit_link_retired_at = retiredAt;
  }

  const invoice = await getInvoiceByJob(job.id);
  if (!invoice || invoice.status === "paid") return { ok: true };
  const billingOperationId = await claimInvoiceBillingOperation(invoice.id);
  if (!billingOperationId) {
    return {
      ok: false,
      notice: `Invoice ${invoice.number} is being sent, paid, or updated. Refresh before canceling the job.`,
    };
  }
  try {
    const currentInvoice = await getInvoice(invoice.id);
    if (!currentInvoice || currentInvoice.status === "paid") {
      return currentInvoice?.status === "paid"
        ? { ok: true }
        : { ok: false, notice: "The invoice changed while the cancellation was starting. Refresh and try again." };
    }
    if (currentInvoice.hosted_payment_url && !currentInvoice.square_invoice_id) {
    return {
      ok: false,
        notice: `Invoice ${currentInvoice.number} has an unverified payment URL. Reconcile it before canceling the job.`,
    };
  }
    if (currentInvoice.square_invoice_id && !await cancelSquareInvoice(currentInvoice.square_invoice_id)) {
    return {
      ok: false,
        notice: `Square could not confirm ${currentInvoice.number} was canceled. It may have just been paid or refunded; refresh the ledger before canceling this job.`,
    };
  }
  const now = new Date().toISOString();
  let retireInvoice = db
    .from("invoices")
    .update({
      status: "void",
      hosted_payment_url: null,
      paid_at: null,
      voided_at: now,
      updated_at: now,
    })
      .eq("id", currentInvoice.id)
      .eq("billing_operation_id", billingOperationId)
      .eq("status", currentInvoice.status)
      .eq("amount_paid_cents", currentInvoice.amount_paid_cents);
    retireInvoice = currentInvoice.square_invoice_id
      ? retireInvoice.eq("square_invoice_id", currentInvoice.square_invoice_id)
    : retireInvoice.is("square_invoice_id", null);
  const { data: retiredInvoice, error: retireError } = await retireInvoice.select("id");
  if (retireError || !retiredInvoice?.length) {
    return {
      ok: false,
        notice: `The Square page for ${currentInvoice.number} is disabled, but its local record changed. Refresh before retrying the cancellation.`,
    };
  }
    await cancelInvoiceTasks(currentInvoice.id);
    return { ok: true };
  } finally {
    await releaseInvoiceBillingOperation(invoice.id, billingOperationId);
  }
}

export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  reason?: string,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  if (status === "canceled" && !reason?.trim()) {
    return { ok: false, notice: "A reason is required to cancel a job." };
  }
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (job.status === status) return { ok: true, notice: `This job is already ${status}.` };
  let cancellationOperationId: string | null = null;
  if (status === "canceled") {
    cancellationOperationId = randomUUID();
    const { data: claimRows, error: claimError } = await canesDb().rpc(
      "claim_job_cancellation_billing_locked",
      {
        p_job_id: job.id,
        p_expected_status: job.status,
        p_operation_id: cancellationOperationId,
      },
    );
    if (claimError) return { ok: false, notice: claimError.message };
    const claim = (claimRows?.[0] ?? null) as {
      outcome: "claimed" | "not_found" | "conflict" | "deposit_busy" | "financial_busy";
      deposit_link_id: string | null;
      deposit_link_url: string | null;
      deposit_order_id: string | null;
      deposit_collected_cents: number;
      deposit_link_retired_at: string | null;
    } | null;
    if (claim?.outcome !== "claimed") {
      return {
        ok: false,
        notice: claim?.outcome === "deposit_busy"
          ? "A Square deposit link is still being created or reconciled. Refresh before canceling this job."
          : claim?.outcome === "financial_busy"
            ? "Square is reconciling a payment or refund. Refresh the ledger before canceling this job."
            : "This job changed while you were canceling it — refresh and try again.",
      };
    }
    job.deposit_link_id = claim.deposit_link_id;
    job.deposit_link_url = claim.deposit_link_url;
    job.deposit_order_id = claim.deposit_order_id;
    job.deposit_collected_cents = claim.deposit_collected_cents;
    job.deposit_link_retired_at = claim.deposit_link_retired_at;
    const billingRetired = await retireJobPaymentSurfacesBeforeCancellation(job);
    if (!billingRetired.ok) {
      await canesDb().rpc("release_job_deposit_link_operation", {
        p_job_id: job.id,
        p_operation_id: cancellationOperationId,
      });
      return billingRetired;
    }
  }

  const confirmedAt = status === "confirmed" ? new Date().toISOString() : null;
  const mutation = await mutateJobWithNotification(job, {
    operation: "status",
    eventType: "status_changed",
    detail: {
      previousStatus: job.status,
      status,
      reason: reason?.trim() || null,
    },
    newStatus: status,
    newConfirmedAt: confirmedAt,
    newCanceledReason: status === "canceled" ? reason?.trim() ?? null : null,
  });
  if (!mutation.ok) {
    if (cancellationOperationId) {
      await canesDb().rpc("release_job_deposit_link_operation", {
        p_job_id: job.id,
        p_operation_id: cancellationOperationId,
      });
    }
    return mutation;
  }
  const notificationEventId = mutation.eventId;
  if (cancellationOperationId) {
    await canesDb().rpc("release_job_deposit_link_operation", {
      p_job_id: job.id,
      p_operation_id: cancellationOperationId,
    });
  }

  // Leaving the live window (canceled) means the day-before text is now noise.
  if (status === "canceled") await cancelJobConfirmation(jobId);
  await logJobEvent(
    job.lead_id,
    `Status set to ${status}${status === "canceled" && reason ? ` — ${reason.trim()}` : ""}`,
  );
  if (status === "canceled" && job.scheduled_at && new Date(job.scheduled_at).getTime() >= Date.now()) {
    try {
      await pushJobChanged({
        id: job.id,
        customerName: job.customer_name,
        jobName: job.job_name,
        crewId: job.crew_id,
        eventId: notificationEventId,
        change: "canceled",
        detail: `${job.customer_name ?? "A customer"}'s job was canceled${reason?.trim() ? `: ${reason.trim()}` : "."}`,
        notifyOwner: false,
        expectedJobState: { crewId: job.crew_id, status, scheduledAt: job.scheduled_at, endsAt: job.ends_at },
      });
    } catch (error) {
      console.error(`[canes] status push persistence failed for ${job.id}:`, error);
    }
  }
  if (status === "canceled") {
    const { data: canceledJob } = await canesDb()
      .from("jobs")
      .select("deposit_collected_cents")
      .eq("id", job.id)
      .maybeSingle();
    if ((canceledJob?.deposit_collected_cents ?? 0) > 0) {
      const detail = `${job.customer_name ?? "This customer"}'s canceled job has ${fmtMoney(canceledJob?.deposit_collected_cents ?? 0)} in collected deposits. Review the cancellation policy and refund ledger.`;
      try {
        await pushPaymentIssue({
          eventId: `job-canceled-with-deposit:${notificationEventId}`,
          jobId: job.id,
          title: "Canceled job has a deposit",
          detail,
        });
      } catch (error) {
        console.error(`[canes] canceled-job deposit push persistence failed for ${job.id}:`, error);
      }
    }
  }
  refresh();
  return { ok: true };
}

// Edit the on-site facts the crew relies on (notes, gate code, site notes)
// without touching schedule or billing state.
export async function updateJobDetails(
  jobId: string,
  fields: { notes?: string; gateCode?: string; siteNotes?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  const patch: Record<string, unknown> = {};
  if (fields.notes !== undefined) patch.notes = fields.notes.trim() || null;
  if (fields.gateCode !== undefined) patch.gate_code = fields.gateCode.trim() || null;
  if (fields.siteNotes !== undefined) patch.site_notes = fields.siteNotes.trim() || null;
  const { error } = await canesDb().from("jobs").update(patch).eq("id", jobId);
  if (error) return { ok: false, notice: error.message };
  await logJobEvent(job.lead_id, "Job details updated");
  refresh();
  return { ok: true };
}

// Mark a job as a repeating maintenance plan (0015). Display + insights only —
// nothing is auto-created; the recurring section derives "next due" from this.
export async function setJobRecurrence(
  jobId: string,
  recurrence: JobRecurrence,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const allowed: JobRecurrence[] = ["none", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"];
  if (!allowed.includes(recurrence)) return { ok: false, notice: "Invalid cadence." };
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  const { error } = await canesDb().from("jobs").update({ recurrence }).eq("id", jobId);
  if (error) return { ok: false, notice: error.message };
  await logJobEvent(job.lead_id, recurrence === "none" ? "Recurrence removed" : `Set to repeat: ${recurrence}`);
  refresh();
  return { ok: true };
}

// Create a non-job calendar block (holiday / time off / note) — the lean
// "Create Event". Jobs come from estimate approval or createManualJob below.
export async function createCalendarEvent(input: {
  title: string;
  startIso: string;
  endIso: string;
  allDay?: boolean;
  crewId?: string | null;
  kind?: CalendarEventKind;
  notes?: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const title = input.title.trim();
  if (!title) return { ok: false, notice: "A title is required." };
  const start = new Date(input.startIso);
  const end = new Date(input.endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, notice: "Invalid date." };
  }
  if (end.getTime() <= start.getTime()) return { ok: false, notice: "End must be after start." };
  const { error } = await canesDb().from("calendar_events").insert({
    title,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: input.allDay ?? false,
    crew_id: input.crewId ?? null,
    kind: input.kind ?? "block",
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, notice: error.message };
  refresh();
  return { ok: true };
}

// ── Job completion + invoicing + payments (Phase 2.5) ─────────────────────────
//
// The back half of the money pipeline. A completed job mints an invoice (the
// estimate's twin), then either a card invoice goes to the customer (Square
// hosted pay page, webhook-settled) or Sebastian records cash with a Verify
// step. Money is server-authoritative; the `payments` ledger is the source of
// truth and invoice.status is a cache. Every settle is TOCTOU-safe (conditional
// claim on the prior status), so a double-click, a webhook redelivery, and a
// webhook/redirect race all converge to exactly one payment. Card data never
// touches us — Square hosts the pay page (PCI SAQ-A).

// Payment public tokens are 256-bit (stronger than the estimate token) — these
// gate a page that can move money.
const genInvoiceToken = () => randomBytes(32).toString("base64url");

async function logInvoiceEvent(leadId: string | null, detail: string): Promise<void> {
  if (leadId) await logEvent(leadId, "invoice", detail);
}

// Invoices are non-taxable by default (FL residential); tax is a flat rate on
// the subtotal, snapshotted per invoice. Approved review rewards (0012) enter
// the total HERE and only here — the single formula every consumer (balance,
// cash settle, Square amount-match, displays) inherits. Recompute server-side
// after any change. A PAID or VOID invoice's totals are FROZEN — the update is
// status-guarded so no code path (e.g. a reward approval racing a settle) can
// rewrite the amount of a closed bill. Returns whether the write landed.
async function recomputeInvoiceTotals(invoiceId: string): Promise<boolean> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return false;
  const [items, rewards] = await Promise.all([
    getInvoiceItems(invoiceId),
    listInvoiceRewards(invoiceId),
  ]);
  const subtotal = items.reduce((sum, it) => sum + it.line_total_cents, 0);
  const tax = Math.round((subtotal * invoice.tax_rate_bps) / 10000);
  const rewardCents = rewards
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.amount_cents, 0);
  // Floor at zero — a discount larger than the subtotal must never produce a
  // negative bill (which would let a "payment" of $0 or a mismatch settle it).
  const total = Math.max(0, subtotal + invoice.adjustment_cents + tax - rewardCents);
  const { data: updated, error } = await canesDb()
    .from("invoices")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: total, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent", "viewed"])
    .select("id");
  if (error) {
    console.error(`[canes] recomputeInvoiceTotals failed for ${invoiceId}: ${error.message}`);
    return false;
  }
  return (updated ?? []).length > 0;
}

// Mark a job in progress (the "Start job" tap). Guarded against terminal jobs.
export async function startJob(jobId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (["completed", "invoiced", "paid", "canceled"].includes(job.status)) {
    return { ok: false, notice: `This job is already ${job.status}.` };
  }
  const { error } = await canesDb().from("jobs").update({ status: "in_progress" }).eq("id", jobId);
  if (error) return { ok: false, notice: error.message };
  await logJobEvent(job.lead_id, "Job started");
  refresh();
  return { ok: true };
}

// Mark a job complete and mint its draft invoice in one step — the invoice is
// what the billing panel bills against. Idempotent: an existing invoice is
// reused (job_id is UNIQUE), so re-completing never mints a second bill.
export async function completeJob(jobId: string): Promise<ActionResult & { invoiceId?: string }> {
  if (!canesConfigured()) return DEMO;
  // Reachable from the owner console AND from the crew portal via
  // completeTechnicianJob. "schedule" gates the owner's button; a technician
  // assigned to this job is allowed regardless, verified against the database
  // rather than any flag the caller sends.
  const denied = await denyUnlessPermittedOrAssignedTechnician("schedule", jobId);
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (["invoiced", "paid", "canceled"].includes(job.status)) {
    // Already past completion — just hand back the existing invoice if any.
    const existing = await getInvoiceByJob(jobId);
    return existing
      ? { ok: true, invoiceId: existing.id }
      : { ok: false, notice: `This job is ${job.status}.` };
  }
  // Claimed write (mirrors the guard above): a job that just went canceled,
  // invoiced, or paid in another tab is not silently re-completed.
  const { data: claimedJob, error } = await canesDb()
    .from("jobs")
    .update({ status: "completed" })
    .eq("id", jobId)
    .in("status", ["unscheduled", "scheduled", "confirmed", "in_progress", "completed"])
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!claimedJob || claimedJob.length === 0) {
    return { ok: false, notice: "This job just changed — refresh and try again." };
  }
  await logJobEvent(job.lead_id, "Job completed");
  const inv = await createInvoiceFromJob(jobId);
  refresh();
  // Surface a failed invoice creation instead of returning ok with no id — the
  // billing panel keys off invoiceId, so a silent undefined would strand the job.
  if (!inv.ok || !inv.invoiceId) {
    return {
      ok: false,
      notice: inv.notice ?? "Job marked complete, but the invoice couldn't be created. Open it from Invoices to bill.",
    };
  }
  return { ok: true, invoiceId: inv.invoiceId };
}

// Undo an accidental "Complete": put the job back in its live state and set
// the draft invoice completeJob minted aside (voided, never deleted — the
// re-bill path already steps around void invoices, and deposit ledger rows
// re-point onto the next bill). A sent or paid invoice blocks the reopen.
// Concurrency discipline mirrors recordCashPayment: every write is an
// optimistic claim whose row count is checked, so a racing send or cash
// payment aborts the reopen instead of being clobbered.
export async function reopenJob(jobId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (job.status !== "completed") {
    return { ok: false, notice: `Only a completed job can be reopened — this one is ${job.status}.` };
  }

  const db = canesDb();
  const invoice = await getInvoiceByJob(jobId); // void invoices step aside
  if (invoice) {
    if (invoice.status !== "draft") {
      return {
        ok: false,
        notice: `Invoice ${invoice.number} has already been ${invoice.status === "paid" ? "paid" : "sent"} — void it from the invoice page first.`,
      };
    }
    // Square ids on a draft mean a send is mid-flight (they persist before the
    // status flips) — let it finish rather than voiding under it.
    if (invoice.square_invoice_id) {
      return { ok: false, notice: `Invoice ${invoice.number} is being sent right now — refresh and void it from the invoice page instead.` };
    }
    // Claim draft → void. The status filter + row-count check means a send or
    // full cash settle that got there first wins and the reopen aborts; once
    // void, recordCashPayment/sendInvoice claims can no longer touch it. The
    // square-id filter re-asserts the mid-send guard atomically, and the
    // amount_paid filter catches a partial cash claim whose ledger insert
    // hasn't landed yet (recordCashPayment bumps the cache before inserting).
    const { data: voided, error: voidErr } = await db
      .from("invoices")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("status", "draft")
      .is("square_invoice_id", null)
      .eq("amount_paid_cents", invoice.amount_paid_cents)
      .select("id");
    if (voidErr) return { ok: false, notice: voidErr.message };
    if (!voided || voided.length === 0) {
      return { ok: false, notice: `Invoice ${invoice.number} just changed (it may have been sent or paid) — check the invoice page.` };
    }
    // Post-claim money check: a cash row that landed before our claim is
    // visible now, and nothing new can attach. Deposits are fine (job-anchored,
    // re-point on the next complete); anything else reverts the void + aborts.
    const { data: paidRows, error: payErr } = await db
      .from("payments")
      .select("id")
      .eq("invoice_id", invoice.id)
      .neq("kind", "deposit")
      .limit(1);
    if (!payErr && (paidRows ?? []).length > 0) {
      await db.from("invoices").update({ status: "draft" }).eq("id", invoice.id).eq("status", "void");
      return { ok: false, notice: `Invoice ${invoice.number} already has a payment recorded — it can't be set aside.` };
    }
    if (payErr) {
      await db.from("invoices").update({ status: "draft" }).eq("id", invoice.id).eq("status", "void");
      return { ok: false, notice: payErr.message };
    }
  }

  const status: JobStatus = job.scheduled_at
    ? (job.confirmed_at ? "confirmed" : "scheduled")
    : "unscheduled";
  // Same claim discipline on the job: only a still-completed job reverts. A
  // racing send that flipped it to invoiced keeps its state, and we hand the
  // invoice back.
  const { data: reverted, error } = await db
    .from("jobs")
    .update({ status })
    .eq("id", jobId)
    .eq("status", "completed")
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!reverted || reverted.length === 0) {
    if (invoice) {
      await db.from("invoices").update({ status: "draft" }).eq("id", invoice.id).eq("status", "void");
    }
    return { ok: false, notice: "This job just changed in another tab — refresh and try again." };
  }

  // The cron cancels the day-before confirmation while a job sits (wrongly)
  // completed — revive it for a still-future, not-yet-confirmed visit.
  if (status === "scheduled" && job.scheduled_at && new Date(job.scheduled_at).getTime() > Date.now()) {
    const scheduledIso = new Date(job.scheduled_at).toISOString();
    const { data: revived } = await db
      .from("tasks")
      .update({ status: "pending" })
      .eq("dedupe_key", `job_confirmation:${job.id}:${scheduledIso}`)
      .eq("status", "canceled")
      .select("id");
    if (!revived || revived.length === 0) await armJobConfirmation(job, scheduledIso);
  }

  await logJobEvent(job.lead_id, "Completion undone — job reopened, draft invoice set aside");
  refresh();
  return { ok: true, notice: "Job reopened." };
}

// Internal-ish: create the draft invoice backing a job, snapshotting job_items
// into invoice_items. Insert-only via the partial unique index on job_id
// (void invoices step aside, so a voided bill can be re-billed). The customer
// email + contact link now copy straight off the job snapshot — no join back
// to the originating estimate.
export async function createInvoiceFromJob(
  jobId: string,
): Promise<ActionResult & { invoiceId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };

  const settings = await getSettings();
  const db = canesDb();
  let rewardOffers: Array<{ kind: InvoiceRewardKind; label: string; amount_cents: number }> = [];
  if (job.customer_phone !== PRACTICE_PHONE) {
    const config = rewardConfigFrom(settings);
    rewardOffers = (Object.keys(config) as InvoiceRewardKind[])
      .filter((kind) => config[kind].configured)
      .map((kind) => ({
        kind,
        label: config[kind].label,
        amount_cents: config[kind].cents,
      }));
  }
  const { data: rows, error } = await db.rpc("initialize_invoice_from_job_locked", {
    p_job_id: jobId,
    p_public_token: genInvoiceToken(),
    p_message_to_customer: settings.invoice_message,
    p_terms: settings.invoice_terms,
    p_reward_offers: rewardOffers,
  });
  if (error) return { ok: false, notice: error.message };
  const result = (rows?.[0] ?? null) as {
    outcome: "ready" | "existing" | "not_found" | "incomplete_closed" | "financial_busy";
    invoice_id: string | null;
    invoice_number: string | null;
  } | null;
  if (!result || !result.invoice_id) {
    return {
      ok: false,
      notice: result?.outcome === "not_found"
        ? "Job not found."
        : result?.outcome === "financial_busy"
          ? "Square is reconciling a payment or refund right now. Refresh before creating the invoice."
          : "The invoice could not be initialized. Please retry.",
    };
  }
  if (result.outcome === "incomplete_closed") {
    return { ok: false, notice: "This invoice was sent before initialization completed. Void it and re-create the invoice." };
  }
  if (result.outcome === "ready") {
    await logInvoiceEvent(job.lead_id, `Invoice ${result.invoice_number ?? "created"} created`);
  }
  refresh();
  return { ok: true, invoiceId: result.invoice_id };
}

// Replace a DRAFT invoice's line items, then recompute. Mirrors
// saveEstimateItems (replace-all, recompute from what was actually written) —
// but the guards are stricter, because an invoice is a bill and an estimate is
// an offer.
//
// Until now invoice_items were WRITE-ONCE across the whole codebase: three
// inserts, no update, no delete. The lines were snapshotted from the job at
// completion and the only lever afterwards was adjustment_cents. That is fine
// on the web, where Sebastian builds the work on the ESTIMATE and the job
// inherits it — but it left no way to fix a bill whose lines are simply wrong
// (a service dropped on site, a quantity that changed in the driveway) short of
// voiding and re-billing.
//
// Why the extra guards over updateInvoice's draft-only rule:
//   · a bill with PAYMENTS against it has money reconciled to those lines;
//     editing them silently re-points what the customer already paid for
//   · a bill with a SQUARE invoice has lines the customer can see on a hosted
//     page we do not control — the two would disagree
// Both are checked here rather than inferred from status, because a draft can
// carry a deposit payment (recordJobDeposit re-points deposits onto the bill).
export async function saveInvoiceItems(
  invoiceId: string,
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unitPriceCents: number;
  }>,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  if (items.length === 0) {
    return { ok: false, notice: "A bill needs at least one line." };
  }
  const normalized = items.map((it) => {
    const quantity = Number(it.quantity) || 0;
    const unit = Math.round(it.unitPriceCents);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(unit) || unit < 0) return null;
    return {
      name: it.name.trim() || "Service",
      description: it.description?.trim() || null,
      quantity,
      unit_price_cents: unit,
    };
  });
  if (normalized.some((item) => item === null)) return { ok: false, notice: "Every invoice line needs a positive quantity and valid price." };

  const billingOperationId = await claimInvoiceBillingOperation(invoiceId);
  if (!billingOperationId) return { ok: false, notice: "This invoice is being paid or updated right now — refresh and try again." };
  try {
    const db = canesDb();
    const { data, error: readError } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (readError) return { ok: false, notice: `Couldn't verify the invoice: ${readError.message}` };
    const invoice = data as Invoice | null;
    if (!invoice) return { ok: false, notice: "Invoice not found." };
    const { data: rows, error } = await db.rpc("replace_invoice_items_locked", {
      p_invoice_id: invoiceId,
      p_items: normalized,
      p_expected_status: invoice.status,
      p_expected_total_cents: invoice.total_cents,
      p_expected_paid_cents: invoice.amount_paid_cents,
      p_expected_square_invoice_id: invoice.square_invoice_id,
      p_operation_id: billingOperationId,
    });
    if (error) return { ok: false, notice: error.message };
    const outcome = (rows?.[0] as { outcome?: string } | undefined)?.outcome;
    if (outcome !== "saved") {
      const notices: Record<string, string> = {
        frozen: "Only draft invoices can have their lines edited.",
        square_live: "This bill is already on Square — void it and re-bill to change the lines.",
        has_payments: "Money has already been recorded against this bill — its lines are frozen.",
        initializing: "This invoice is still being initialized. Refresh and try again.",
        square_pending: "A prior Square publish may still be live. Reconcile or void it before changing the bill.",
      };
      return { ok: false, notice: notices[outcome ?? ""] ?? "This invoice changed while you were editing it — refresh and try again." };
    }
    refresh();
    return { ok: true };
  } finally {
    await releaseInvoiceBillingOperation(invoiceId, billingOperationId);
  }
}

// Edit a draft invoice — the "actual amount" lever is adjustment_cents, plus
// contact + message + terms. Draft-only, then recompute. Mirrors updateEstimate.
export async function updateInvoice(
  invoiceId: string,
  patch: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    contactId?: string | null;
    jobName?: string;
    jobAddress?: string;
    adjustmentCents?: number;
    messageToCustomer?: string;
    terms?: string;
    internalNotes?: string;
  },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const patchKeys = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  const contactOnly = patchKeys.every((k) => CONTACT_PATCH_KEYS.includes(k));
  const billingOperationId = await claimInvoiceBillingOperation(invoiceId);
  if (!billingOperationId) return { ok: false, notice: "This invoice is being paid or updated right now — refresh and try again." };
  try {
    const db = canesDb();
    const { data, error: readError } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (readError) return { ok: false, notice: `Couldn't verify the invoice: ${readError.message}` };
    const invoice = data as Invoice | null;
    if (!invoice) return { ok: false, notice: "Invoice not found." };
    if (invoice.status !== "draft" && !contactOnly) {
      return { ok: false, notice: "Only draft invoices can be edited (contact details excepted)." };
    }
    const row: Record<string, unknown> = {};
    if (patch.customerName !== undefined) row.customer_name = patch.customerName || null;
    if (patch.customerPhone !== undefined) {
      const phone = patch.customerPhone ? toE164(patch.customerPhone) : null;
      if (patch.customerPhone && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
      row.customer_phone = phone;
    }
    if (patch.customerEmail !== undefined) row.customer_email = patch.customerEmail || null;
    if (patch.contactId !== undefined) {
      row.contact_id = patch.contactId ?? (await resolveEstimateContact({
        name: patch.customerName ?? invoice.customer_name,
        phone: patch.customerPhone !== undefined ? ((row.customer_phone as string | null) ?? null) : invoice.customer_phone,
        email: patch.customerEmail ?? invoice.customer_email,
        address: patch.jobAddress ?? invoice.job_address,
        leadId: invoice.lead_id,
      }));
    }
    if (patch.jobName !== undefined) row.job_name = patch.jobName || null;
    if (patch.jobAddress !== undefined) row.job_address = patch.jobAddress || null;
    if (patch.adjustmentCents !== undefined) {
      const adjustment = Math.round(patch.adjustmentCents);
      if (!Number.isSafeInteger(adjustment)) return { ok: false, notice: "Enter a valid adjustment amount." };
      row.adjustment_cents = adjustment;
    }
    if (patch.messageToCustomer !== undefined) row.message_to_customer = patch.messageToCustomer || null;
    if (patch.terms !== undefined) row.terms = patch.terms || null;
    if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes || null;
    const { data: rows, error } = await db.rpc("patch_invoice_locked", {
      p_invoice_id: invoiceId,
      p_patch: row,
      p_contact_only: contactOnly,
      p_expected_status: invoice.status,
      p_expected_total_cents: invoice.total_cents,
      p_expected_paid_cents: invoice.amount_paid_cents,
      p_expected_square_invoice_id: invoice.square_invoice_id,
      p_operation_id: billingOperationId,
    });
    if (error) return { ok: false, notice: error.message };
    const outcome = (rows?.[0] as { outcome?: string } | undefined)?.outcome;
    if (outcome !== "saved" && outcome !== "settled") {
      const outcomeNotices: Record<string, string> = {
        zero_total: "That adjustment would make the invoice total zero. Void the invoice instead.",
        over_paid: `That adjustment would put the total below the ${fmtMoney(invoice.amount_paid_cents)} already paid. Handle the difference as a refund instead.`,
        square_live: "This bill is already on Square — void it and re-bill to change the amount.",
        square_pending: "A prior Square publish may still be live. Reconcile or void it before editing this invoice.",
      };
      return {
        ok: false,
        notice: outcomeNotices[outcome ?? ""]
          ?? "This invoice changed while you were editing it — refresh and try again.",
      };
    }
    if (outcome === "settled") {
      await cancelInvoiceTasks(invoiceId);
      await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} settled by adjustment at ${fmtMoney(invoice.amount_paid_cents)}`);
    }
    if (invoice.lead_id) await touch(invoice.lead_id);
    refresh();
    return {
      ok: true,
      notice: outcome === "settled" ? "Adjustment saved — the existing payment now covers this invoice in full." : undefined,
    };
  } finally {
    await releaseInvoiceBillingOperation(invoiceId, billingOperationId);
  }
}

// Send (or resend) an invoice for card payment. Publishes a Square invoice when
// configured (captures the hosted pay URL), marks sent, texts/emails the link
// with the same outbox fallback as sendEstimate, queues day-3/7 reminders, and
// advances the job to `invoiced`. The customer pays on Square's hosted page;
// the webhook settles us. Never sends a card link for an already-paid invoice.
async function claimInvoiceBillingOperation(invoiceId: string): Promise<string | null> {
  const operationId = randomUUID();
  const { data, error } = await canesDb().rpc("claim_invoice_billing_operation", {
    p_invoice_id: invoiceId,
    p_operation_id: operationId,
  });
  if (error) {
    console.error(`[canes] invoice billing claim failed for ${invoiceId}: ${error.message}`);
    return null;
  }
  return data === true ? operationId : null;
}

async function releaseInvoiceBillingOperation(invoiceId: string, operationId: string): Promise<void> {
  const { error } = await canesDb().rpc("release_invoice_billing_operation", {
    p_invoice_id: invoiceId,
    p_operation_id: operationId,
  });
  if (error) console.error(`[canes] invoice billing release failed for ${invoiceId}: ${error.message}`);
}

export async function sendInvoice(
  invoiceId: string,
  opts?: { channels?: { email?: boolean; text?: boolean }; toEmail?: string; toPhone?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const db = canesDb();
  const overrides: Record<string, unknown> = {};
  if (opts?.toPhone !== undefined && opts.toPhone.trim()) {
    const phone = toE164(opts.toPhone);
    if (!phone) return { ok: false, notice: "That phone number doesn't look valid." };
    overrides.customer_phone = phone;
  }
  if (opts?.toEmail !== undefined && opts.toEmail.trim()) {
    const email = opts.toEmail.trim();
    if (!EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };
    overrides.customer_email = email;
  }
  const wantsText = opts?.channels?.text ?? true;
  const wantsEmail = opts?.channels?.email ?? true;

  const billingOperationId = await claimInvoiceBillingOperation(invoiceId);
  if (!billingOperationId) {
    return { ok: false, notice: "This invoice is being paid or updated right now — refresh and try again." };
  }

  try {
    type SendInvoiceRow = Invoice & {
      initialization_completed_at?: string | null;
      square_publish_attempt_key?: string | null;
      square_publish_fingerprint?: string | null;
      square_publish_started_at?: string | null;
    };
    const readCurrent = async (): Promise<SendInvoiceRow | null> => {
      const { data, error } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as SendInvoiceRow | null;
    };
    let fresh: SendInvoiceRow | null;
    try {
      fresh = await readCurrent();
    } catch (error) {
      return { ok: false, notice: `Couldn't verify the invoice: ${error instanceof Error ? error.message : "unknown error"}` };
    }
    if (!fresh) return { ok: false, notice: "Invoice not found." };
    if (fresh.status === "paid") return { ok: false, notice: "This invoice is already paid." };
    if (fresh.status === "void") return { ok: false, notice: "This invoice was voided." };
    if (fresh.hosted_payment_url && !fresh.square_invoice_id) {
      return {
        ok: false,
        notice: "This invoice has an unverified Square payment URL. Reconcile or void it before sending again.",
      };
    }

    // Destination overrides belong to this billing lease and use the money +
    // provider snapshot as their CAS. A send racing payment/void/edit cannot
    // silently persist a stale destination.
    if (Object.keys(overrides).length > 0) {
      const changesPendingFingerprint = Boolean(
        fresh.square_publish_attempt_key
        && (
          (overrides.customer_phone !== undefined && overrides.customer_phone !== fresh.customer_phone)
          || (overrides.customer_email !== undefined && overrides.customer_email !== fresh.customer_email)
        ),
      );
      if (changesPendingFingerprint) {
        return {
          ok: false,
          notice: "A prior Square publish may still be live. Reconcile or void it before changing the delivery address.",
        };
      }
      let overrideQuery = db
        .from("invoices")
        .update({ ...overrides, updated_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .eq("billing_operation_id", billingOperationId)
        .eq("status", fresh.status)
        .eq("total_cents", fresh.total_cents)
        .eq("amount_paid_cents", fresh.amount_paid_cents);
      overrideQuery = fresh.square_invoice_id
        ? overrideQuery.eq("square_invoice_id", fresh.square_invoice_id)
        : overrideQuery.is("square_invoice_id", null);
      const { data: updated, error } = await overrideQuery.select("id");
      if (error || !updated?.length) {
        return {
          ok: false,
          notice: error?.message ?? "The invoice changed while saving its delivery address — refresh and try again.",
        };
      }
      try {
        fresh = await readCurrent();
      } catch (error) {
        return { ok: false, notice: `Couldn't reload the invoice: ${error instanceof Error ? error.message : "unknown error"}` };
      }
      if (!fresh) return { ok: false, notice: "Invoice not found." };
    }

    // Derive delivery channels only from the post-lease, post-override row.
    const guardLead = fresh.lead_id ? await getLead(fresh.lead_id) : null;
    const optedOut = Boolean(guardLead?.opted_out);
    const canText = Boolean(fresh.customer_phone) && !optedOut && wantsText;
    const canEmail = Boolean(fresh.customer_email) && wantsEmail;
    if (!canText && !canEmail) {
      return {
        ok: false,
        notice: optedOut && Boolean(fresh.customer_phone)
          ? "This customer opted out of texts — add an email to send the invoice."
          : "No destination: add a phone or email (or pick a channel) before sending.",
      };
    }

    let recomputed = false;
    try {
      recomputed = await recomputeInvoiceTotals(invoiceId);
    } catch (error) {
      console.error(`[canes] invoice recompute failed before send for ${invoiceId}:`, error);
    }
    if (!recomputed) {
      return { ok: false, notice: "Couldn't verify the invoice total. Nothing was sent — refresh and try again." };
    }
    try {
      fresh = await readCurrent();
    } catch (error) {
      return { ok: false, notice: `Couldn't verify the invoice before sending: ${error instanceof Error ? error.message : "unknown error"}` };
    }
    if (!fresh) return { ok: false, notice: "Invoice not found." };
    if (!fresh.initialization_completed_at) {
      return { ok: false, notice: "This invoice is still being initialized. Nothing was sent — refresh and try again." };
    }
    if (!(["draft", "sent", "viewed"] as string[]).includes(fresh.status)) {
      return { ok: false, notice: `Invoice ${fresh.number} changed before sending (now ${fresh.status}).` };
    }

    // Square publish is fail-closed. Its idempotency attempt is a stable hash
    // of bill content/payment state, not the rotating local lease UUID, so an
    // ambiguous provider timeout can be retried without creating new objects.
    let hostedUrl = fresh.hosted_payment_url;
    let expectedSquareInvoiceId = fresh.square_invoice_id;
    let createdSquareInvoiceId: string | null = null;
    if (!hostedUrl && fresh.square_invoice_id) {
      return {
        ok: false,
        notice: "This invoice's previous Square page was retired. Void and reissue the invoice before sending another payment link.",
      };
    }
    if (!hostedUrl && fresh.customer_phone !== PRACTICE_PHONE && squareConfigured()) {
      const squareItems = await getInvoiceItems(fresh.id);
      const squareFingerprint = createHash("sha256")
        .update(JSON.stringify({
          invoice: {
            id: fresh.id,
            contactId: fresh.contact_id,
            customerName: fresh.customer_name,
            customerPhone: fresh.customer_phone,
            customerEmail: fresh.customer_email,
            jobName: fresh.job_name,
            totalCents: fresh.total_cents,
            paidCents: fresh.amount_paid_cents,
            adjustmentCents: fresh.adjustment_cents,
            taxCents: fresh.tax_cents,
          },
          items: squareItems.map((item) => ({
            position: item.position,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unit_price_cents,
            lineTotalCents: item.line_total_cents,
          })),
        }))
        .digest("hex")
        .slice(0, 32);
      let squareAttemptId = fresh.square_publish_attempt_key;
      if (squareAttemptId && fresh.square_publish_fingerprint !== squareFingerprint) {
        return {
          ok: false,
          notice: "A prior Square publish has an unknown outcome and the bill has changed since. Check Square, then void and reissue before sending.",
        };
      }
      if (!squareAttemptId) {
        const { data: claimedAttempt, error: attemptError } = await db
          .from("invoices")
          .update({
            square_publish_attempt_key: squareFingerprint,
            square_publish_fingerprint: squareFingerprint,
            square_publish_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("billing_operation_id", billingOperationId)
          .eq("status", fresh.status)
          .eq("total_cents", fresh.total_cents)
          .eq("amount_paid_cents", fresh.amount_paid_cents)
          .is("square_invoice_id", null)
          .is("square_publish_attempt_key", null)
          .select("id");
        if (attemptError || !claimedAttempt?.length) {
          return {
            ok: false,
            notice: attemptError?.message ?? "The invoice changed before Square publish could begin — refresh and try again.",
          };
        }
        squareAttemptId = squareFingerprint;
      }
      const clearSquareAttempt = async (): Promise<void> => {
        const { error } = await db.from("invoices")
          .update({
            square_publish_attempt_key: null,
            square_publish_fingerprint: null,
            square_publish_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("billing_operation_id", billingOperationId)
          .eq("square_publish_attempt_key", squareAttemptId);
        if (error) console.error(`[canes] Square attempt cleanup failed for ${invoiceId}: ${error.message}`);
      };
      const sq = await createSquareInvoice(fresh, squareItems, squareAttemptId);
      if (sq.error) {
        const canceled = sq.squareInvoiceId ? await cancelSquareInvoice(sq.squareInvoiceId) : false;
        if (canceled) await clearSquareAttempt();
        await alertOwner(`Couldn't create the Square invoice for ${fresh.number}: ${sq.error}. Nothing was sent.`);
        return {
          ok: false,
          notice: sq.squareInvoiceId && canceled
            ? `Square couldn't publish a complete payment page: ${sq.error}. Nothing was sent; retry.`
            : `Square publish failed or timed out: ${sq.error}. Nothing was sent. Retry this unchanged invoice; if it still fails, check Square before editing.`,
        };
      }
      const squareComplete = Boolean(sq.squareInvoiceId && sq.squareOrderId && sq.hostedUrl);
      if (sq.squareInvoiceId || sq.squareOrderId || sq.hostedUrl) {
        if (!squareComplete) {
          const canceled = sq.squareInvoiceId ? await cancelSquareInvoice(sq.squareInvoiceId) : false;
          if (canceled) await clearSquareAttempt();
          return {
            ok: false,
            notice: canceled
              ? "Square returned an incomplete payment page. It was canceled; retry."
              : "Square returned an incomplete payment page with an unknown live state. Check Square before editing or retrying.",
          };
        }
        const { data: savedSquare, error: saveSquareError } = await db
          .from("invoices")
          .update({
            square_invoice_id: sq.squareInvoiceId,
            square_order_id: sq.squareOrderId,
            hosted_payment_url: sq.hostedUrl,
            square_publish_attempt_key: null,
            square_publish_fingerprint: null,
            square_publish_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("billing_operation_id", billingOperationId)
          .eq("status", fresh.status)
          .eq("total_cents", fresh.total_cents)
          .eq("amount_paid_cents", fresh.amount_paid_cents)
          .is("square_invoice_id", null)
          .eq("square_publish_attempt_key", squareAttemptId)
          .select("id");
        if (saveSquareError || !savedSquare?.length) {
          const canceled = sq.squareInvoiceId
            ? await cancelSquareInvoice(sq.squareInvoiceId)
            : true;
          if (canceled) await clearSquareAttempt();
          console.error(
            `[canes] Square invoice identity save failed for ${invoiceId}: ${saveSquareError?.message ?? "billing lease lost"}`,
          );
          return {
            ok: false,
            notice: canceled
              ? "Square created the payment page, but its reconciliation IDs could not be saved. The page was canceled; refresh and retry."
              : "Square created a payment page that could not be reconciled or canceled. Do not resend—check Square and the payment ledger first.",
          };
        }
        hostedUrl = sq.hostedUrl;
        expectedSquareInvoiceId = sq.squareInvoiceId;
        createdSquareInvoiceId = sq.squareInvoiceId;
      }
    }

    const { data: publishRows, error: publishError } = await db.rpc("publish_invoice_locked", {
      p_invoice_id: invoiceId,
      p_expected_status: fresh.status,
      p_expected_total_cents: fresh.total_cents,
      p_expected_paid_cents: fresh.amount_paid_cents,
      p_expected_square_invoice_id: expectedSquareInvoiceId,
      p_operation_id: billingOperationId,
      p_queue_text: canText,
      p_queue_email: canEmail,
    });
    const published = (publishRows?.[0] ?? null) as {
      outcome: "published" | "not_found" | "lease_lost" | "conflict" | "initializing" | "closed" | "no_destination" | "square_pending";
      delivery_generation: number;
      sent_at: string | null;
      text_dedupe_key: string | null;
      email_dedupe_key: string | null;
    } | null;
    if (publishError || published?.outcome !== "published") {
      const current = await getInvoice(invoiceId);
      const squareIdToCancel = createdSquareInvoiceId ?? (current?.status === "void" ? current.square_invoice_id : null);
      if (squareIdToCancel) {
        const canceled = await cancelSquareInvoice(squareIdToCancel);
        if (canceled && createdSquareInvoiceId) {
          await db.from("invoices")
            .update({ hosted_payment_url: null, updated_at: new Date().toISOString() })
            .eq("id", invoiceId)
            .eq("square_invoice_id", createdSquareInvoiceId);
        }
      }
      return {
        ok: false,
        notice: publishError?.message
          ?? (published?.outcome === "square_pending"
            ? "A prior Square publish may still be live but has no verified provider ID. Nothing was sent—reconcile or void it first."
            : `Invoice ${fresh.number} changed while sending (now ${current?.status ?? "gone"}) — refresh and check it.`),
      };
    }
    const deliveryId = `send-g${published.delivery_generation}`;
    const sent: Invoice = {
      ...fresh,
      status: "sent",
      sent_at: published.sent_at ?? fresh.sent_at,
      square_invoice_id: expectedSquareInvoiceId,
      hosted_payment_url: hostedUrl ?? null,
    };

    let emailResult: Awaited<ReturnType<typeof notifyInvoiceSent>> | null = null;
    let emailQueued = false;
    if (canEmail && published.email_dedupe_key) {
      const { data: claimed } = await db
        .from("tasks")
        .update({ status: "sending", scheduled_for: new Date().toISOString() })
        .eq("dedupe_key", published.email_dedupe_key)
        .eq("status", "pending")
        .select("id");
      if (claimed?.length) {
        emailResult = await notifyInvoiceSent(sent, deliveryId);
        if (emailResult.ok) {
          await db.from("tasks")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("dedupe_key", published.email_dedupe_key)
            .eq("status", "sending");
        } else {
          await db.from("tasks")
            .update({ status: "pending", scheduled_for: new Date().toISOString() })
            .eq("dedupe_key", published.email_dedupe_key)
            .eq("status", "sending");
          emailQueued = true;
        }
      } else {
        emailQueued = true;
      }
    }

    const link = invoicePublicUrl(sent);
    let textSent = false;
    let textQueued = false;
    if (canText && published.text_dedupe_key) {
      const { data: claimed } = await db
        .from("tasks")
        .update({ status: "sending", scheduled_for: new Date().toISOString() })
        .eq("dedupe_key", published.text_dedupe_key)
        .eq("status", "pending")
        .select("id");
      if (claimed?.length) {
        const res = await sendCanesSms({
          to: sent.customer_phone as string,
          body: `Here is your invoice from Canes Pressure Washing: ${link}`,
          leadId: fresh.lead_id,
          automated: true,
        });
        if (res.ok) {
          textSent = true;
          await db.from("tasks")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("dedupe_key", published.text_dedupe_key)
            .eq("status", "sending");
        } else {
          textQueued = true;
          await db.from("tasks")
            .update({ status: "pending", scheduled_for: new Date().toISOString() })
            .eq("dedupe_key", published.text_dedupe_key)
            .eq("status", "sending");
        }
      } else {
        textQueued = true;
      }
    }
    await enqueueInvoiceReminders(sent);

    // Advance the job to invoiced (never regress a paid job).
    if (fresh.job_id) {
      await db.from("jobs").update({ status: "invoiced" }).eq("id", fresh.job_id).eq("status", "completed");
    }
    await logInvoiceEvent(fresh.lead_id, `Invoice ${fresh.number} sent (${fmtMoney(sent.total_cents)})`);
    if (fresh.lead_id) await touch(fresh.lead_id);
    refresh();
    const emailSent = emailResult?.ok === true;
    const emailFailure = emailResult && !emailResult.ok
      ? emailResult.skipped ?? emailResult.error ?? "Email delivery failed."
      : null;
    return {
      ok: true,
      notice: sendInvoiceNotice({ emailSent, emailQueued, emailFailure, optedOut, textSent, textQueued }),
    };
  } finally {
    await releaseInvoiceBillingOperation(invoiceId, billingOperationId);
  }
}

function sendInvoiceNotice(s: { emailSent: boolean; emailQueued: boolean; emailFailure: string | null; optedOut: boolean; textSent: boolean; textQueued: boolean }): string {
  if (s.textSent && s.emailSent) return "Texted and emailed the invoice.";
  if (s.textSent && s.emailQueued) return "Texted the invoice; email queued for retry.";
  if (s.textSent) return "Texted the invoice.";
  if (s.textQueued && s.emailSent) return "Text queued for after quiet hours; emailed now.";
  if (s.textQueued && s.emailQueued) return "Text and email queued for delivery.";
  if (s.textQueued) return "Text queued for after quiet hours.";
  if (s.optedOut && s.emailSent) return "Sent by email — customer opted out of texts.";
  if (s.optedOut && s.emailQueued) return "Email queued — customer opted out of texts.";
  if (s.emailSent) return "Emailed the invoice.";
  if (s.emailQueued) return s.emailFailure
    ? `Email queued for retry: ${s.emailFailure}`
    : "Email queued for delivery.";
  return "Invoice delivery queued.";
}

// Record a cash payment against an invoice — the Verify step. The database RPC
// shares Square's invoice lock and checks the cache values this screen read, so
// a stale/double tap records nothing and cash cannot race a card settlement.
export async function recordCashPayment(invoiceId: string, amountCents: number): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const amount = Math.round(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the cash amount collected." };
  const db = canesDb();
  const billingOperationId = await claimInvoiceBillingOperation(invoiceId);
  if (!billingOperationId) {
    return { ok: false, notice: "This invoice is being sent or paid right now — refresh and verify the balance." };
  }
  try {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) return { ok: false, notice: "Invoice not found." };
    if (invoice.status === "paid") return { ok: true, notice: "This invoice is already marked paid." };
    if (invoice.status === "void") return { ok: false, notice: "This invoice was voided." };
    const balance = Math.max(0, invoice.total_cents - invoice.amount_paid_cents);
    if (amount > balance) {
      return { ok: false, notice: `Amount exceeds the ${fmtMoney(balance)} balance due.` };
    }
    if (invoice.square_invoice_id && amount !== balance) {
      return {
        ok: false,
        notice: "A partial cash payment would leave the existing Square invoice chargeable for the old balance. Cancel/void that bill or collect the full remaining balance instead.",
      };
    }
    let squareCanceled = false;
    // Disable a published Square invoice before committing off-platform money.
    // If cancellation fails, record nothing: leaving both paths chargeable is
    // worse than asking Sebastian to retry.
    if (invoice.square_invoice_id) {
      const canceled = await cancelSquareInvoice(invoice.square_invoice_id);
      if (!canceled) {
        return { ok: false, notice: "Couldn't cancel the Square payment page, so no cash payment was recorded. Try again." };
      }
      squareCanceled = true;
      const { data: retired, error: retireError } = await db
        .from("invoices")
        .update({ hosted_payment_url: null, updated_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .eq("billing_operation_id", billingOperationId)
        .select("id");
      if (retireError || !retired?.length) {
        return {
          ok: false,
          notice: "The Square page was canceled, but the invoice changed before cash could be recorded. Refresh and verify; reissue if a balance remains.",
        };
      }
    }

    const { data: paymentRows, error: paymentError } = await db.rpc(
      "record_manual_invoice_payment_locked",
      {
        p_invoice_id: invoiceId,
        p_amount_cents: amount,
        p_method: "cash",
        p_expected_paid_cents: invoice.amount_paid_cents,
        p_expected_total_cents: invoice.total_cents,
        p_expected_square_invoice_id: invoice.square_invoice_id,
        p_square_canceled: squareCanceled,
        p_operation_id: billingOperationId,
      },
    );
    if (paymentError) {
      console.error(`[canes] cash payment transaction failed for ${invoiceId}: ${paymentError.message}`);
      return { ok: false, notice: "Couldn't record the payment. Please try again." };
    }
    const payment = (paymentRows?.[0] ?? null) as {
      outcome: "recorded" | "not_found" | "already_paid" | "void" | "conflict" | "invalid" | "square_pending" | "square_live";
      payment_id: string | null;
      paid_cents: number;
      total_cents: number;
      fully_paid: boolean;
      newly_settled: boolean;
    } | null;
    if (!payment) return { ok: false, notice: "Couldn't record the payment. Please try again." };
    if (payment.outcome === "not_found") return { ok: false, notice: "Invoice not found." };
    if (payment.outcome === "already_paid") {
      return { ok: true, notice: "This invoice is already marked paid." };
    }
    if (payment.outcome === "void") return { ok: false, notice: "This invoice was voided." };
    if (payment.outcome === "invalid") {
      return { ok: false, notice: "Enter a valid cash payment amount." };
    }
    if (payment.outcome === "square_pending") {
      return { ok: false, notice: "A prior Square publish may still be chargeable. Reconcile or void it before recording cash." };
    }
    if (payment.outcome === "square_live") {
      return { ok: false, notice: "The Square payment page is still live, so no cash payment was recorded." };
    }
    if (payment.outcome === "conflict") {
      return {
        ok: false,
        notice: invoice.square_invoice_id
          ? "This invoice changed while recording payment. Its Square page is retired; refresh and reissue if a balance remains."
          : "This invoice changed while recording payment — refresh and verify the balance.",
      };
    }
    if (!payment.payment_id) {
      return { ok: false, notice: "Couldn't record the payment. Please try again." };
    }

    const newPaid = Number(payment.paid_cents);
    const fullyPaid = Boolean(payment.fully_paid);
    if (payment.newly_settled) await cancelInvoiceTasks(invoiceId);
    await logInvoiceEvent(
      invoice.lead_id,
      `${fullyPaid ? "Cash payment" : "Partial cash payment"} recorded — ${fmtMoney(amount)} for ${invoice.number}`,
    );
    if (invoice.lead_id) await touch(invoice.lead_id);

    if (payment.newly_settled) {
      // The payment RPC inserted the push and email outbox rows in the same
      // transaction as the ledger entry. These idempotent calls provide a
      // low-latency send/ensure pass without being the durability boundary.
      const paymentEventId = `manual:${payment.payment_id}`;
      try {
        await pushInvoicePaid({
          eventId: paymentEventId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          customerName: invoice.customer_name,
          amountCents: amount,
        });
      } catch (error) {
        // The payment RPC committed the outbox event with the ledger entry.
        // Cron can recover delivery; the recorded payment remains successful.
        console.error(`[canes] cash payment push ensure failed for ${payment.payment_id}:`, error);
      }
      try {
        await enqueueInvoicePaymentEmails({
          eventId: paymentEventId,
          invoiceId: invoice.id,
          method: "cash",
        });
        // Best-effort low-latency drain. The durable rows remain pending and
        // cron retries them if the provider or this request fails afterward.
        void drainPaymentEmailTasks({ eventId: paymentEventId, limit: 2 }).catch((error) => {
          console.error("[canes] cash payment email drain failed:", error);
        });
      } catch (error) {
        console.error("[canes] cash payment email enqueue failed:", error);
      }
      void drainCanesPushOutbox({ deadlineAt: Date.now() + 20_000 }).catch((error) => {
        console.error("[canes] cash payment push drain failed:", error);
      });
    }
    refresh();
    return {
      ok: true,
      notice: fullyPaid
        ? `Recorded ${fmtMoney(amount)} in cash. Job marked paid.`
        : `Recorded ${fmtMoney(amount)} — ${fmtMoney(invoice.total_cents - newPaid)} still due.`,
    };
  } finally {
    await releaseInvoiceBillingOperation(invoiceId, billingOperationId);
  }
}

// Void an unpaid invoice — cancels pending send/reminder texts, kills the link.
export async function voidInvoice(invoiceId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const billingOperationId = await claimInvoiceBillingOperation(invoiceId);
  if (!billingOperationId) return { ok: false, notice: "This invoice is being sent or paid right now — refresh and try again." };
  try {
    const db = canesDb();
    const { data, error: readError } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (readError) return { ok: false, notice: `Couldn't verify the invoice: ${readError.message}` };
    const invoice = data as Invoice | null;
    if (!invoice) return { ok: false, notice: "Invoice not found." };
    if (invoice.status === "paid") return { ok: false, notice: "A paid invoice can't be voided." };
    if (invoice.status === "void") return { ok: true, notice: "This invoice is already void." };

    let squareCanceled = false;
    if (invoice.square_invoice_id) {
      squareCanceled = await cancelSquareInvoice(invoice.square_invoice_id);
      if (!squareCanceled) {
        return { ok: false, notice: "Square could not cancel the payment page, so the invoice was not voided. Refresh and verify whether it was paid." };
      }
    }
    const { data: rows, error } = await db.rpc("void_invoice_locked", {
      p_invoice_id: invoiceId,
      p_expected_status: invoice.status,
      p_expected_total_cents: invoice.total_cents,
      p_expected_paid_cents: invoice.amount_paid_cents,
      p_expected_square_invoice_id: invoice.square_invoice_id,
      p_square_canceled: squareCanceled,
      p_operation_id: billingOperationId,
    });
    if (error) return { ok: false, notice: error.message };
    const outcome = (rows?.[0] as { outcome?: string } | undefined)?.outcome;
    if (outcome !== "voided" && outcome !== "already_void") {
      if (squareCanceled && invoice.square_invoice_id) {
        await db.from("invoices")
          .update({ hosted_payment_url: null, updated_at: new Date().toISOString() })
          .eq("id", invoiceId)
          .eq("billing_operation_id", billingOperationId)
          .eq("square_invoice_id", invoice.square_invoice_id)
          .in("status", ["draft", "sent", "viewed"]);
      }
      return {
        ok: false,
        notice: outcome === "square_pending"
          ? "A prior Square publish may still be live but has no reconciled ID. Check Square before voiding locally."
          : outcome === "paid"
          ? "The customer paid while this invoice was being voided. Refresh and verify the payment."
          : "The invoice changed before the void committed. Its Square page is retired; refresh and retry or reissue it.",
      };
    }
    if (invoice.job_id) {
      await db.from("jobs").update({ status: "completed" }).eq("id", invoice.job_id).eq("status", "invoiced");
    }
    await cancelInvoiceTasks(invoiceId);
    await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} voided`);
    if (invoice.lead_id) await touch(invoice.lead_id);
    refresh();
    return { ok: true };
  } finally {
    await releaseInvoiceBillingOperation(invoiceId, billingOperationId);
  }
}

// Match on the payload's invoice_id (not hardcoded dedupe keys) so every
// reminder day configured in settings.invoice_reminder_days is caught.
async function cancelInvoiceTasks(invoiceId: string): Promise<void> {
  await canesDb()
    .from("tasks")
    .update({ status: "canceled" })
    .in("kind", ["invoice_send", "invoice_customer_email", "invoice_reminder"])
    .eq("status", "pending")
    .contains("payload", { invoice_id: invoiceId });
}

// Public, token-scoped: first open of a sent invoice flips it to viewed.
export async function markInvoiceViewed(token: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status !== "sent") return { ok: true };
  const now = new Date().toISOString();
  const { error } = await canesDb()
    .from("invoices")
    .update({ status: "viewed", viewed_at: now, updated_at: now })
    .eq("id", invoice.id)
    .eq("status", "sent");
  if (error) return { ok: false, notice: error.message };
  if (invoice.lead_id) await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} viewed by customer`);
  refresh();
  return { ok: true };
}

// ── Review rewards (0012) ─────────────────────────────────────────────────────
//
// Money-off offers on an invoice: OFFERED rows are toggled by the owner before
// (or after) sending; the customer CLAIMS on the public token page; the owner
// verifies the review/follow actually exists and APPROVES — approval is the
// mutation that changes the bill (via recomputeInvoiceTotals). Statuses only
// move forward through CAS updates so double-taps and races can't double-apply.

// Demo-safe read for the self-contained client panels (job sheet + invoice rail).
export async function listInvoiceRewardsAction(invoiceId: string): Promise<InvoiceReward[]> {
  if (await denyUnlessPermitted("invoices")) return [];
  return listInvoiceRewards(invoiceId);
}

// Demo-safe config read: which kinds are configured, their labels/amounts/links.
export async function getRewardConfigAction(): Promise<RewardConfig> {
  return getRewardConfig();
}

// Demo-safe, token-free invoice summary so client panels (the job sheet's
// billing step) can refresh amounts after a reward approval changes the total.
export async function getInvoiceSummaryAction(invoiceId: string): Promise<JobInvoiceSummary | null> {
  if (await denyUnlessPermitted("invoices")) return null;
  const inv = await getInvoice(invoiceId);
  if (!inv) return null;
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    total_cents: inv.total_cents,
    amount_paid_cents: inv.amount_paid_cents,
  };
}

// Owner: attach or remove an offer on an invoice. Only OFFERED rows can be
// removed and only non-terminal invoices can change — a claimed or approved
// reward is the customer's earned state and never silently disappears.
export async function setInvoiceRewardOffer(
  invoiceId: string,
  kind: InvoiceRewardKind,
  enabled: boolean,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status === "paid" || invoice.status === "void") {
    return { ok: false, notice: `This invoice is ${invoice.status} — offers can't change.` };
  }
  const db = canesDb();

  if (!enabled) {
    const { error } = await db
      .from("invoice_rewards")
      .delete()
      .eq("invoice_id", invoiceId)
      .eq("kind", kind)
      .eq("status", "offered");
    if (error) return { ok: false, notice: error.message };
    refresh();
    return { ok: true };
  }

  const config = (await getRewardConfig())[kind];
  if (!config.configured) {
    return { ok: false, notice: "Add the destination link in Settings → Review rewards first." };
  }
  const now = new Date().toISOString();
  const { error } = await db.from("invoice_rewards").insert({
    invoice_id: invoiceId,
    kind,
    label: config.label,
    amount_cents: config.cents,
    status: "offered",
  });
  if (error) {
    // Unique (invoice_id, kind): a row already exists. Revive it only from
    // DECLINED (an owner change of mind) — claimed/approved rows are immutable
    // here, and an existing offered row means we're already done.
    if (error.code === "23505") {
      await db
        .from("invoice_rewards")
        .update({ status: "offered", claimed_at: null, resolved_at: null, resolved_by: null, updated_at: now })
        .eq("invoice_id", invoiceId)
        .eq("kind", kind)
        .eq("status", "declined");
      refresh();
      return { ok: true };
    }
    return { ok: false, notice: error.message };
  }
  refresh();
  return { ok: true };
}

// PUBLIC, token-scoped: the customer taps "I did this" on the invoice page.
// CAS offered → claimed; idempotent (a repeat tap is a friendly no-op). The
// claim never touches money — it only queues the owner's verification.
export async function claimInvoiceReward(
  token: string,
  kind: InvoiceRewardKind,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status !== "sent" && invoice.status !== "viewed") {
    return { ok: false, notice: "This invoice is no longer open for reward claims." };
  }
  const now = new Date().toISOString();
  const { data: won, error } = await canesDb()
    .from("invoice_rewards")
    .update({ status: "claimed", claimed_at: now, updated_at: now })
    .eq("invoice_id", invoice.id)
    .eq("kind", kind)
    .eq("status", "offered")
    .select("id, label, amount_cents");
  if (error) return { ok: false, notice: "Something went wrong — please try again." };
  if (!won || won.length === 0) {
    // Double tap on an already-claimed/approved offer stays friendly; a kind
    // that was never offered (or was retracted/declined) must NOT promise a
    // verification that will never happen.
    const { data: existing } = await canesDb()
      .from("invoice_rewards")
      .select("status")
      .eq("invoice_id", invoice.id)
      .eq("kind", kind)
      .maybeSingle();
    const st = (existing as { status: string } | null)?.status;
    if (st === "claimed" || st === "approved") {
      return { ok: true, notice: "Thanks — this one is already being verified." };
    }
    return { ok: false, notice: "This offer is no longer available on this invoice." };
  }
  const reward = won[0] as Pick<InvoiceReward, "id" | "label" | "amount_cents">;
  await logInvoiceEvent(
    invoice.lead_id,
    `Reward claimed on ${invoice.number} — ${reward.label} (−${fmtMoney(reward.amount_cents)}) awaiting verification`,
  );
  await notifyRewardClaimed(invoice, reward.label, reward.amount_cents);
  refresh();
  return { ok: true, notice: "Claim received — we'll verify and apply your discount." };
}

// Owner: verify + resolve a claim. Approval is one database transaction that
// CASes the reward, recalculates the invoice, and settles it when appropriate.
// If Square already hosts the bill, that higher bill must be canceled before
// the local total is allowed to move.
export async function setRewardApproval(
  rewardId: string,
  approve: boolean,
  // 0015: optional team member credited with earning the review.
  attributedMemberId?: string | null,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const db = canesDb();
  const { data: rewardRow } = await db
    .from("invoice_rewards")
    .select("*")
    .eq("id", rewardId)
    .maybeSingle();
  const reward = rewardRow as InvoiceReward | null;
  if (!reward) return { ok: false, notice: "Reward not found." };
  let invoice = await getInvoice(reward.invoice_id);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  const billingOperationId = await claimInvoiceBillingOperation(invoice.id);
  if (!billingOperationId) {
    return { ok: false, notice: "This invoice is being sent, paid, or updated right now — refresh and try again." };
  }
  try {
    const { data: freshRow, error: freshError } = await db
      .from("invoices")
      .select("*")
      .eq("id", invoice.id)
      .maybeSingle();
    if (freshError || !freshRow) {
      return { ok: false, notice: `Couldn't verify the invoice${freshError ? `: ${freshError.message}` : "."}` };
    }
    invoice = freshRow as Invoice;
    if (invoice.status === "void") return { ok: false, notice: "This invoice was voided." };
    if (invoice.status === "paid") {
      return { ok: false, notice: "This invoice is already paid — settle any reward offline." };
    }

    // total_cents already reflects previously approved rewards, so the early
    // projection is a simple subtraction. The RPC repeats both guards while
    // holding the invoice lock.
    if (approve) {
      const projected = Math.max(0, invoice.total_cents - reward.amount_cents);
      if (projected === 0 && invoice.amount_paid_cents === 0) {
        return { ok: false, notice: "This discount would zero out the bill. Use the invoice's adjustment amount instead." };
      }
      if (projected < invoice.amount_paid_cents) {
        return {
          ok: false,
          notice: `${fmtMoney(invoice.amount_paid_cents)} is already paid — this discount would overshoot the balance. Handle it offline.`,
        };
      }
    }
    if (
      attributedMemberId
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attributedMemberId)
    ) {
      return { ok: false, notice: "That team member id is invalid." };
    }

    // A reward changes Square's published amount. Kill the old hosted bill
    // before the local transaction can lower its total. Failed cancellation
    // leaves both the reward and local total untouched.
    let squareCanceled = false;
    const invoiceSnapshot = invoice;
    const retireCanceledHostedUrl = async (): Promise<void> => {
      if (!invoiceSnapshot.square_invoice_id) return;
      const { error } = await db
        .from("invoices")
        .update({ hosted_payment_url: null, updated_at: new Date().toISOString() })
        .eq("id", invoiceSnapshot.id)
        .eq("square_invoice_id", invoiceSnapshot.square_invoice_id);
      if (error) console.error(`[canes] canceled reward link cleanup failed for ${invoiceSnapshot.id}: ${error.message}`);
    };
    if (approve && invoice.square_invoice_id) {
      squareCanceled = await cancelSquareInvoice(invoice.square_invoice_id);
      if (!squareCanceled) {
        return {
          ok: false,
          notice: "Square could not cancel the existing payment page, so the reward was not applied and the invoice total was not changed.",
        };
      }
    }

    const { data: resolutionRows, error: resolutionError } = await db.rpc("resolve_invoice_reward_locked", {
      p_reward_id: rewardId,
      p_approve: approve,
      p_attributed_member_id: attributedMemberId ?? null,
      p_expected_status: invoice.status,
      p_expected_total_cents: invoice.total_cents,
      p_expected_paid_cents: invoice.amount_paid_cents,
      p_expected_square_invoice_id: invoice.square_invoice_id,
      p_square_canceled: squareCanceled,
      p_operation_id: billingOperationId,
    });
  if (resolutionError) {
    if (squareCanceled) await retireCanceledHostedUrl();
    return { ok: false, notice: resolutionError.message };
  }
  const resolution = (resolutionRows?.[0] ?? null) as {
    outcome: "approved" | "declined" | "resolved" | "reward_not_found" | "invoice_not_found" | "lease_lost" | "conflict" | "closed" | "square_live" | "square_pending" | "zero_total" | "over_paid";
    invoice_id: string | null;
    total_cents: number;
    settled: boolean;
  } | null;
  if (!resolution) {
    if (squareCanceled) await retireCanceledHostedUrl();
    return { ok: false, notice: "The reward could not be resolved. Refresh and try again." };
  }
  if (resolution.outcome === "resolved") {
    if (squareCanceled) await retireCanceledHostedUrl();
    return { ok: true, notice: "This reward was already resolved — refresh to see the latest." };
  }
  if (resolution.outcome !== "approved" && resolution.outcome !== "declined") {
    if (squareCanceled) await retireCanceledHostedUrl();
    const resolutionNotices: Record<string, string> = {
      zero_total: "This discount would zero out the bill. Use the invoice's adjustment amount instead.",
      over_paid: `${fmtMoney(invoice.amount_paid_cents)} is already paid — this discount would overshoot the balance. Handle it offline.`,
      closed: "This invoice was just settled — handle the reward offline.",
      square_live: "The Square payment page is still active, so the reward was not applied.",
      square_pending: "A prior Square publish may still be live, so the reward was not applied. Reconcile or void it first.",
      reward_not_found: "Reward not found.",
      invoice_not_found: "Invoice not found.",
    };
    return {
      ok: false,
      notice: resolutionNotices[resolution.outcome] ?? "This invoice changed while the reward was being resolved — refresh and try again.",
    };
  }

  if (resolution.outcome === "declined") {
    await logInvoiceEvent(invoice.lead_id, `Reward declined on ${invoice.number} — ${reward.label}`);
    if (invoice.lead_id) await touch(invoice.lead_id);
    refresh();
    return { ok: true, notice: "Declined — no discount applied." };
  }

  // The database RPC above is the only approval mutation: reward status,
  // invoice total, optional settlement, Square identity cleanup, and job status
  // commit together under the invoice advisory lock. Never follow it with a
  // client-side recompute/revert sequence; that would reopen the race the RPC
  // exists to close.
  const settledByReward = resolution.settled;
  if (settledByReward) {
    await cancelInvoiceTasks(invoice.id);
    await logInvoiceEvent(
      invoice.lead_id,
      `Invoice ${invoice.number} settled — reward covered the remaining balance`,
    );
  }
  const squareNote = squareCanceled
    ? " The old card link was canceled — resend the invoice for an updated card link."
    : "";

  await logInvoiceEvent(
    invoice.lead_id,
    `Reward approved on ${invoice.number} — ${reward.label} (−${fmtMoney(reward.amount_cents)} applied)`,
  );
  if (invoice.lead_id) await touch(invoice.lead_id);
  refresh();
  return {
    ok: true,
    notice: settledByReward
      ? `Applied −${fmtMoney(reward.amount_cents)} — the balance is covered and the invoice is now paid.`
      : `Applied −${fmtMoney(reward.amount_cents)}.${squareNote}`,
  };
  } finally {
    await releaseInvoiceBillingOperation(invoice.id, billingOperationId);
  }
}

// ── Job expenses (Feature B) ──────────────────────────────────────────────────
//
// Per-job costs (materials, gas, dump fee, sub) that turn revenue into true
// profit per job and per crew. The read is demo-safe so the billing panel can
// fetch its own expenses on mount; the writes follow the DEMO guard → validate →
// snapshot crew_id (in addJobExpenseRow) → refresh() pattern of the section
// above. logEvent needs a lead, and a job may have none, so it is skipped here.

// Demo-safe read: the panel fetches its own expenses without prop-threading, so
// this stays outside the canesConfigured guard (the reader handles isDemo()).
export async function listJobExpensesAction(jobId: string): Promise<JobExpense[]> {
  if (await denyUnlessPermitted("invoices")) return [];
  return listJobExpenses(jobId);
}

export async function addJobExpense(input: {
  jobId: string;
  amountCents: number;
  category: string;
  note?: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the expense amount." };
  const category = input.category.trim();
  if (!category) return { ok: false, notice: "Pick a category." };
  const job = await getJob(input.jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  const id = await addJobExpenseRow({
    jobId: input.jobId,
    amountCents: amount,
    category,
    note: input.note?.trim() || null,
  });
  if (!id) return { ok: false, notice: "Couldn't save the expense. Please try again." };
  await logJobEvent(job.lead_id, `Expense added — ${fmtMoney(amount)} (${category})`);
  refresh();
  return { ok: true };
}

// ── Estimate expenses (0014) — the quote-time cost model ─────────────────────

export async function listEstimateExpensesAction(estimateId: string): Promise<EstimateExpense[]> {
  if (await denyUnlessPermitted("estimates")) return [];
  return listEstimateExpenses(estimateId);
}

export async function addEstimateExpense(input: {
  estimateId: string;
  amountCents: number;
  category: string;
  note?: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the cost amount." };
  const category = input.category.trim();
  if (!category) return { ok: false, notice: "Pick a category." };
  const estimate = await getEstimate(input.estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  const id = await addEstimateExpenseRow({
    estimateId: input.estimateId,
    amountCents: amount,
    category,
    note: input.note?.trim() || null,
  });
  if (!id) return { ok: false, notice: "Couldn't save the cost. Please try again." };
  refresh();
  return { ok: true };
}

export async function deleteEstimateExpense(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const ok = await deleteEstimateExpenseRow(id);
  if (!ok) return { ok: false, notice: "Couldn't remove the cost. Please try again." };
  refresh();
  return { ok: true };
}

export async function deleteJobExpense(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const ok = await deleteJobExpenseRow(id);
  if (!ok) return { ok: false, notice: "Couldn't remove the expense. Please try again." };
  refresh();
  return { ok: true };
}

// ── Phase 5: business/overhead expenses + team payouts (0008_growth.sql) ──────

function todayEtYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export async function addBusinessExpense(input: {
  name: string;
  amountCents: number;
  category: string;
  recurring: boolean;
  frequency: ExpenseFrequency;
  incurredOn?: string;
  endsOn?: string | null;
  note?: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const name = input.name.trim();
  if (!name) return { ok: false, notice: "Name the expense." };
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the expense amount." };
  const id = await addBusinessExpenseRow({
    name,
    amountCents: amount,
    category: input.category.trim() || "Other",
    recurring: input.recurring,
    frequency: input.frequency,
    incurredOn: input.incurredOn || todayEtYmd(),
    endsOn: input.endsOn ?? null,
    note: input.note?.trim() || null,
  });
  if (!id) return { ok: false, notice: "Couldn't save the expense. Please try again." };
  refresh();
  return { ok: true };
}

export async function deleteBusinessExpense(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const ok = await deleteBusinessExpenseRow(id);
  if (!ok) return { ok: false, notice: "Couldn't remove the expense. Please try again." };
  refresh();
  return { ok: true };
}

export async function addTeamMember(input: {
  name: string;
  role: TeamRole;
  compType: CompType;
  compBps?: number;
  hourlyCents?: number;
  crewId?: string | null;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const name = input.name.trim();
  if (!name) return { ok: false, notice: "A name is required." };
  const { error } = await canesDb().from("team_members").insert({
    name,
    role: input.role,
    comp_type: input.compType,
    comp_bps: Math.max(0, Math.round(input.compBps ?? 0)),
    hourly_cents: Math.max(0, Math.round(input.hourlyCents ?? 0)),
    crew_id: input.crewId ?? null,
  });
  if (error) {
    console.error(`[canes] addTeamMember: ${error.message}`);
    return { ok: false, notice: "Couldn't add the team member. Please try again." };
  }
  refresh();
  return { ok: true };
}

export async function updateTeamMember(
  id: string,
  patch: {
    name?: string;
    role?: TeamRole;
    compType?: CompType;
    compBps?: number;
    hourlyCents?: number;
    crewId?: string | null;
    active?: boolean;
  },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) upd.name = patch.name.trim();
  if (patch.role !== undefined) upd.role = patch.role;
  if (patch.compType !== undefined) upd.comp_type = patch.compType;
  if (patch.compBps !== undefined) upd.comp_bps = Math.max(0, Math.round(patch.compBps));
  if (patch.hourlyCents !== undefined) upd.hourly_cents = Math.max(0, Math.round(patch.hourlyCents));
  if (patch.crewId !== undefined) upd.crew_id = patch.crewId;
  if (patch.active !== undefined) upd.active = patch.active;
  if (Object.keys(upd).length === 0) return { ok: true };
  // Claimed write — this patch carries comp_bps and hourly_cents, the pay terms
  // the payout waterfall divides by. Zero rows means a rate change was reported
  // saved and was not, and the next payout run uses the old number.
  //
  // Note for the split editor, which calls this in a LOOP over members: a refusal
  // stops the loop with the notice shown, which is a real improvement on today's
  // behaviour — a deleted member currently returns ok:true, so the loop finishes,
  // says "Split saved", and leaves shares that no longer sum to 100.
  const { data: claimed, error } = await canesDb()
    .from("team_members")
    .update(upd)
    .eq("id", id)
    .select("id");
  if (error) {
    console.error(`[canes] updateTeamMember: ${error.message}`);
    return { ok: false, notice: "Couldn't update the team member. Please try again." };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "That team member just changed — refresh and try again." };
  }
  refresh();
  return { ok: true };
}

export async function removeTeamMember(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const { error } = await canesDb().from("team_members").update({ active: false }).eq("id", id);
  if (error) {
    console.error(`[canes] removeTeamMember: ${error.message}`);
    return { ok: false, notice: "Couldn't remove the team member. Please try again." };
  }
  refresh();
  return { ok: true };
}

// ── Customers (Phase 3) ──────────────────────────────────────────────────────
//
// The contacts/addresses layer revived by 0006_customers.sql. Same conventions
// as every section above: DEMO guard → validate → write → refresh() →
// ActionResult. ensureContact (lib/canes/customers.ts) does the identity
// matching; these actions are the page-facing surface.

export async function createCustomer(fields: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  source?: LeadSource;
}): Promise<ActionResult & { id?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("customers");
  if (denied) return denied;
  const name = fields.name.trim();
  if (!name) return { ok: false, notice: "A name is required." };
  const phone = fields.phone?.trim() ? toE164(fields.phone) : null;
  if (fields.phone?.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  const email = fields.email?.trim() || null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };

  // A phone that already belongs to a contact is the same customer — hand back
  // the existing record instead of a raw unique-constraint error.
  if (phone) {
    const { data: existing } = await canesDb()
      .from("contacts")
      .select("id, name")
      .eq("phone", phone)
      .maybeSingle();
    if (existing?.id) {
      return {
        ok: false,
        notice: `A customer already exists for ${fmtPhone(phone)}${existing.name ? ` (${existing.name})` : ""}.`,
        id: existing.id as string,
      };
    }
  }

  const contact = await ensureContact({
    name,
    phone,
    email,
    address: fields.address,
    source: fields.source ?? "other",
  });
  if (!contact) return { ok: false, notice: "Couldn't create the customer. Please try again." };
  if (fields.notes?.trim()) {
    await canesDb().from("contacts").update({ notes: fields.notes.trim() }).eq("id", contact.id);
  }
  refresh();
  return { ok: true, id: contact.id };
}

export async function updateCustomer(
  id: string,
  fields: { name?: string; phone?: string; email?: string; notes?: string; archived?: boolean },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("customers");
  if (denied) return denied;
  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  if (fields.name !== undefined) patch.name = fields.name.trim() || null;
  if (fields.phone !== undefined) {
    const phone = fields.phone.trim() ? toE164(fields.phone) : null;
    if (fields.phone.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
    patch.phone = phone;
  }
  if (fields.email !== undefined) {
    const email = fields.email.trim() || null;
    if (email && !EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };
    patch.email = email;
  }
  if (fields.notes !== undefined) patch.notes = fields.notes.trim() || null;
  if (fields.archived !== undefined) patch.archived = fields.archived;
  // Claimed write. id-only filter, no prior read, so zero rows is a customer that
  // is gone — and the edits reported saved (a corrected phone number, the archive
  // flag that decides whether they appear in the directory at all) went nowhere.
  const { data: claimed, error } = await canesDb()
    .from("contacts")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, notice: "Another customer already has that phone number." };
    return { ok: false, notice: error.message };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "This customer just changed — refresh and try again." };
  }
  refresh();
  return { ok: true };
}

export async function addCustomerAddress(
  contactId: string,
  line: string,
  siteNotes?: string,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("customers");
  if (denied) return denied;
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, notice: "An address is required." };
  const db = canesDb();
  // First address on a contact becomes primary automatically.
  const { data: existing } = await db.from("addresses").select("id").eq("contact_id", contactId).limit(1);
  const { error } = await db.from("addresses").insert({
    contact_id: contactId,
    line: trimmed,
    site_notes: siteNotes?.trim() || null,
    is_primary: !existing || existing.length === 0,
  });
  if (error) return { ok: false, notice: error.message };
  await db.from("contacts").update({ last_activity_at: new Date().toISOString() }).eq("id", contactId);
  refresh();
  return { ok: true };
}

export async function setPrimaryAddress(contactId: string, addressId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("customers");
  if (denied) return denied;
  const db = canesDb();
  // Checked BEFORE the demote, which is the whole point.
  //
  // Demote-then-promote keeps exactly one primary per contact, but the two
  // statements do not fail together: the demote clears is_primary on EVERY
  // address the contact has, while the promote is filtered by both id and
  // contact_id. An addressId that was deleted, or that belongs to a different
  // customer, therefore matched nothing on the way back up — and the action
  // returned ok:true having left the customer with NO primary address at all.
  // A row-count check on the promote would report that correctly and still
  // leave the damage done, so the read has to come first.
  //
  // On web this is nearly unreachable: the button is rendered from the
  // contact's own address list. From a phone the list is CACHED, so an address
  // deleted on the laptop a minute ago is an ordinary stale id.
  const { data: target, error: lookupErr } = await db
    .from("addresses")
    .select("id")
    .eq("id", addressId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (lookupErr) return { ok: false, notice: lookupErr.message };
  if (!target) {
    return { ok: false, notice: "That address just changed — refresh and try again." };
  }
  const { error: demoteErr } = await db
    .from("addresses")
    .update({ is_primary: false })
    .eq("contact_id", contactId);
  if (demoteErr) return { ok: false, notice: demoteErr.message };
  const { data: claimed, error } = await db
    .from("addresses")
    .update({ is_primary: true })
    .eq("id", addressId)
    .eq("contact_id", contactId)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  // Belt and braces: the row was there a moment ago, so zero here means it was
  // removed between the two statements. Say so rather than report a primary
  // that does not exist — the demote has already run, and the customer is in
  // exactly the state this function exists to prevent.
  if (!claimed || claimed.length === 0) {
    return { ok: false, notice: "That address just changed — refresh and try again." };
  }
  refresh();
  return { ok: true };
}

// THE standalone-job path — repeat work, referrals, anything that never went
// through an estimate. (Supersedes the old "jobs are only born from estimates"
// design note above.) Creates the job, links/creates the contact, snapshots a
// single line item, and — when a slot is given — schedules it and arms the
// day-before confirmation exactly like scheduleJob.
export async function createManualJob(input: {
  contactId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobName: string;
  totalCents: number;
  // Money the customer already handed over (Sebastian's "$520 up front") —
  // lands in the ledger as a job-anchored deposit and nets off the invoice.
  depositCollectedCents?: number;
  depositMethod?: PaymentMethod;
  scheduledAtIso?: string;
  durationMinutes?: number;
  crewId?: string;
  notes?: string;
}): Promise<ActionResult & { jobId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const customerName = input.customerName.trim();
  if (!customerName) return { ok: false, notice: "A customer name is required." };
  const jobName = input.jobName.trim();
  if (!jobName) return { ok: false, notice: "A job name is required." };
  const total = Math.round(input.totalCents);
  if (!Number.isFinite(total) || total < 0) return { ok: false, notice: "Enter a valid job total." };
  if (Math.round(input.depositCollectedCents ?? 0) > total) {
    return { ok: false, notice: "The deposit can't exceed the job total." };
  }
  const phone = input.customerPhone?.trim() ? toE164(input.customerPhone) : null;
  if (input.customerPhone?.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  const email = input.customerEmail?.trim() || null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };

  const when = input.scheduledAtIso ? new Date(input.scheduledAtIso) : null;
  if (when && Number.isNaN(when.getTime())) return { ok: false, notice: "Invalid date." };
  const duration = Math.max(15, Math.round(input.durationMinutes ?? 120));

  const contactId =
    input.contactId ??
    (
      await ensureContact({
        name: customerName,
        phone,
        email,
        address: input.jobAddress,
      })
    )?.id ??
    null;

  const db = canesDb();
  const crews = input.crewId ? await listCrews() : [];
  const crew = input.crewId ? crews.find((c) => c.id === input.crewId) ?? null : null;
  if (input.crewId && !crew) return { ok: false, notice: "Crew not found." };
  const lead = phone ? await findLeadIdByPhone(phone) : null;
  const startIso = when?.toISOString() ?? null;
  const { data, error } = await db
    .from("jobs")
    .insert({
      estimate_id: null,
      lead_id: lead,
      contact_id: contactId,
      status: startIso ? "scheduled" : "unscheduled",
      customer_name: customerName,
      customer_phone: phone,
      customer_email: email,
      job_name: jobName,
      job_address: input.jobAddress?.trim() || null,
      total_cents: total,
      deposit_cents: 0,
      scheduled_at: startIso,
      ends_at: startIso ? new Date((when as Date).getTime() + duration * 60_000).toISOString() : null,
      duration_minutes: duration,
      crew_id: crew?.id ?? null,
      assigned_to: crew?.name ?? null,
      creation_notification_crew_id: crew?.id ?? null,
      creation_notification_scheduled_at: startIso,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, notice: error.message };
  const jobId = data.id as string;

  // The single line item is the run-sheet checklist entry + the invoice line.
  await db.from("job_items").insert({
    job_id: jobId,
    position: 0,
    name: jobName,
    quantity: 1,
    line_total_cents: total,
  });

  const createdJob = await getJob(jobId);
  const futureSlot = Boolean(startIso && new Date(startIso).getTime() >= Date.now());
  // A back-dated manual job (forgot-to-log) must never trigger the customer
  // confirmation text — the visit already happened.
  if (startIso && futureSlot && createdJob) await armJobConfirmation(createdJob, startIso);
  if (crew && createdJob && (!startIso || futureSlot)) {
    try {
      await pushJobChanged({
        id: createdJob.id,
        customerName: createdJob.customer_name,
        jobName: createdJob.job_name,
        crewId: crew.id,
        eventId: `manual-created:${createdJob.id}:${startIso ?? "unscheduled"}:${crew.id}`,
        change: "updated",
        detail: startIso
          ? `${createdJob.customer_name ?? "A customer"}'s job is scheduled for ${fmtEt(startIso)}.`
          : `${createdJob.customer_name ?? "A customer"}'s job was assigned to ${crew.name}.`,
        notifyOwner: false,
        expectedJobState: {
          crewId: crew.id,
          status: startIso ? "scheduled" : "unscheduled",
          scheduledAt: startIso,
          endsAt: startIso ? new Date((when as Date).getTime() + duration * 60_000).toISOString() : null,
        },
      });
    } catch (error) {
      console.error(`[canes] manual job push persistence failed for ${createdJob.id}:`, error);
    }
    try {
      await notifyCrewAssignment(createdJob, crew.name, startIso);
    } catch (error) {
      console.error(`[canes] legacy crew assignment notice failed for ${createdJob.id}:`, error);
    }
  }
  const depositCollected = Math.round(input.depositCollectedCents ?? 0);
  let depositNotice: string | undefined;
  if (depositCollected > 0) {
    const dep = createdJob
      ? await insertJobDepositRow(createdJob, depositCollected, input.depositMethod ?? "cash")
      : { ok: false as const };
    if (!dep.ok) depositNotice = "Job created, but the deposit could NOT be recorded — open the job and record it there.";
  }
  await logJobEvent(lead, `Job created manually${startIso ? ` — scheduled ${fmtEt(startIso)}` : ""}`);
  refresh();
  const notices = [depositNotice, startIso ? lateNightNotice(startIso) : undefined].filter(Boolean);
  return { ok: true, jobId, ...(notices.length ? { notice: notices.join(" ") } : {}) };
}

// A standalone invoice with no job behind it — Sebastian's "make a new
// invoice from the invoice section" ask (billing work that never went
// through an estimate or the schedule). Client-first like every create flow;
// one line item carries the amount, and the invoice behaves exactly like a
// job-born one from here (send, cash, rewards, ledger).
export async function createManualInvoice(input: {
  contactId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobName: string;
  totalCents: number;
}): Promise<ActionResult & { invoiceId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("invoices");
  if (denied) return denied;
  const customerName = input.customerName.trim();
  if (!customerName) return { ok: false, notice: "A client name is required." };
  const jobName = input.jobName.trim();
  if (!jobName) return { ok: false, notice: "Describe what this invoice is for." };
  const total = Math.round(input.totalCents);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, notice: "Enter a valid amount." };
  const phone = input.customerPhone?.trim() ? toE164(input.customerPhone) : null;
  if (input.customerPhone?.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  const email = input.customerEmail?.trim() || null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, notice: "That email address doesn't look valid." };

  const contactId = await resolveEstimateContact({
    contactId: input.contactId,
    name: customerName,
    phone,
    email,
    address: input.jobAddress,
  });

  const settings = await getSettings();
  const db = canesDb();
  const config = rewardConfigFrom(settings);
  const rewardOffers = phone === PRACTICE_PHONE
    ? []
    : (Object.keys(config) as InvoiceRewardKind[])
        .filter((kind) => config[kind].configured)
        .map((kind) => ({
          kind,
          label: config[kind].label,
          amount_cents: config[kind].cents,
        }));
  const { data: rows, error } = await db.rpc("initialize_manual_invoice_locked", {
    p_contact_id: contactId,
    p_customer_name: customerName,
    p_customer_phone: phone,
    p_customer_email: email,
    p_job_address: input.jobAddress?.trim() || null,
    p_job_name: jobName,
    p_total_cents: total,
    p_message_to_customer: settings.invoice_message,
    p_terms: settings.invoice_terms,
    p_public_token: genInvoiceToken(),
    p_reward_offers: rewardOffers,
  });
  if (error) return { ok: false, notice: error.message };
  const initialized = (rows?.[0] ?? null) as {
    outcome: "ready" | "invalid";
    invoice_id: string | null;
    invoice_number: string | null;
  } | null;
  if (!initialized?.invoice_id || initialized.outcome !== "ready") {
    return { ok: false, notice: "The invoice could not be initialized. Please retry." };
  }
  const invoiceId = initialized.invoice_id;
  const number = initialized.invoice_number ?? "Invoice";
  await logInvoiceEvent(null, `Invoice ${number} created manually`);
  refresh();
  return { ok: true, invoiceId };
}

// The lead behind a phone number, if any — manual jobs keep the lead timeline
// attached without requiring one.
async function findLeadIdByPhone(phone: string): Promise<string | null> {
  const { data } = await canesDb().from("leads").select("id").eq("phone", phone).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// Start a fresh estimate for an existing customer — prefills from the contact,
// their primary address, and the linked lead (which now carries the email).
// Copy a quote, lines and all.
//
// Canes prices the same handful of jobs all week — driveway, roof, paver seal —
// and re-quoting meant retyping every line into a blank builder. Neither
// surface could do this, so it is new capability rather than parity work, and
// it is the highest-leverage thing on a repeat-service business's quote flow.
//
// `contactId` retargets the copy at a different customer; omitted, it re-quotes
// the same one (a second property, a revised price after a decline).
//
// THE TOTALS ARE NEVER COPIED. saveEstimateItems is the one place that turns
// lines into money, and it recomputes from what it actually wrote — so the copy
// reuses that rather than carrying totals across, where a stale tax rate or a
// changed adjustment would silently produce a quote whose lines and total
// disagree. The adjustment and discount deliberately do NOT come along either:
// they were a negotiation on that job, not a property of the work.
export async function duplicateEstimate(
  estimateId: string,
  opts?: { contactId?: string },
): Promise<ActionResult & { estimateId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;

  const source = await getEstimate(estimateId);
  if (!source) return { ok: false, notice: "Estimate not found." };
  const items = await getEstimateItems(estimateId);
  if (items.length === 0) {
    return { ok: false, notice: "That estimate has no lines to copy." };
  }

  // Retargeting reads the new customer so the copy carries THEIR contact
  // details, not the original's. Without it the copy would quote the right work
  // to the wrong phone number.
  let target: {
    contactId?: string;
    leadId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    jobAddress?: string;
  };
  if (opts?.contactId) {
    const detail = await getCustomer(opts.contactId);
    if (!detail) return { ok: false, notice: "Customer not found." };
    const { contact, addresses, lead } = detail;
    const primary = addresses.find((a) => a.is_primary) ?? addresses[0] ?? null;
    target = {
      contactId: contact.id,
      leadId: lead?.id,
      customerName: contact.name ?? undefined,
      customerPhone: contact.phone ?? undefined,
      customerEmail: contact.email ?? undefined,
      jobAddress: primary?.line ?? undefined,
    };
  } else {
    target = {
      contactId: source.contact_id ?? undefined,
      leadId: source.lead_id ?? undefined,
      customerName: source.customer_name ?? undefined,
      customerPhone: source.customer_phone ?? undefined,
      customerEmail: source.customer_email ?? undefined,
      jobAddress: source.job_address ?? undefined,
    };
  }

  const created = await createEstimate({
    ...target,
    estimateType: source.estimate_type,
    jobName: source.job_name ?? undefined,
  });
  if (!created.ok || !created.estimateId) return created;

  const saved = await saveEstimateItems(
    created.estimateId,
    items.map((item) => ({
      catalogId: item.catalog_id,
      name: item.name,
      description: item.description,
      kind: item.kind,
      quantity: Number(item.quantity),
      unitPriceCents: item.unit_price_cents,
      discountCents: item.discount_cents,
      taxable: item.taxable,
      isOption: item.is_option,
      isMandatory: item.is_mandatory,
      packageGroup: item.package_group,
    })),
  );
  // The draft exists either way. Say so rather than reporting a clean success
  // over an empty quote — he is about to open it and find nothing in it.
  if (!saved.ok) {
    return {
      ok: true,
      estimateId: created.estimateId,
      notice: `Copied, but the lines didn’t come with it — ${saved.notice}`,
    };
  }

  return { ok: true, estimateId: created.estimateId, notice: "Copied to a new draft." };
}

export async function createEstimateForCustomer(
  contactId: string,
): Promise<ActionResult & { estimateId?: string }> {
  if (!canesConfigured()) return DEMO;
  const denied = await denyUnlessPermitted("estimates");
  if (denied) return denied;
  const detail = await getCustomer(contactId);
  if (!detail) return { ok: false, notice: "Customer not found." };
  const { contact, addresses, lead } = detail;
  const primary = addresses.find((a) => a.is_primary) ?? addresses[0] ?? null;
  return createEstimate({
    leadId: lead?.id,
    contactId: contact.id,
    estimateType: "standard",
    customerName: contact.name ?? lead?.name ?? undefined,
    customerPhone: contact.phone ?? lead?.phone ?? undefined,
    customerEmail: contact.email ?? lead?.email ?? undefined,
    jobAddress: primary?.line ?? lead?.address ?? undefined,
    jobName: lead?.service ?? undefined,
  });
}
