import { fmtPhone } from "@/lib/canes/types";
import { canesDb } from "@/lib/canes/supabase";
import {
  enqueueCanesPush,
  sendCanesPush,
  type CanesPush,
  type CanesPushResult,
} from "@/lib/canes/push";

type LeadPushInput = {
  id: string;
  name: string | null;
  phone: string | null;
};

type JobPushInput = {
  id: string;
  customerName: string | null;
  jobName?: string | null;
  crewId?: string | null;
};

type JobPushState = {
  crewId: string | null;
  status: string;
  scheduledAt: string | null;
  endsAt: string | null;
};

function displayName(name: string | null | undefined, phone?: string | null): string {
  return name?.trim() || (phone ? fmtPhone(phone) : "A customer");
}

function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function canonicalTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function requirePersisted(result: CanesPushResult, dedupeKey: string): CanesPushResult {
  if (!result.persisted) {
    throw new Error(`Push outbox persistence failed for ${dedupeKey}.`);
  }
  return result;
}

async function durableSend(input: CanesPush): Promise<CanesPushResult> {
  return requirePersisted(await sendCanesPush(input), input.dedupeKey);
}

async function durableEnqueue(input: CanesPush): Promise<CanesPushResult> {
  return requirePersisted(await enqueueCanesPush(input), input.dedupeKey);
}

async function ownerPush(input: Omit<CanesPush, "audience">): Promise<CanesPushResult> {
  return durableSend({ ...input, audience: { kind: "owner" } });
}

async function queuedOwnerPush(input: Omit<CanesPush, "audience">): Promise<CanesPushResult> {
  return durableEnqueue({ ...input, audience: { kind: "owner" } });
}

export async function pushNewLead(
  lead: LeadPushInput,
  source: "new_lead" | "missed_call" | "website_request",
  sourceEventId?: string | null,
) {
  const { data: currentLead, error } = await canesDb()
    .from("leads")
    .select("status, opportunity_started_at, created_at, last_activity_at")
    .eq("id", lead.id)
    .maybeSingle();
  if (error) throw new Error(`pushNewLead state: ${error.message}`);
  if (!currentLead) throw new Error(`pushNewLead state: lead ${lead.id} not found`);
  if (source === "new_lead" && !["new", "appointment_set"].includes(currentLead.status)) {
    return null;
  }
  const person = displayName(lead.name, lead.phone);
  return ownerPush({
    dedupeKey: `${source}:${sourceEventId ?? lead.id}`,
    eventType: "new_lead",
    urgency: "time_sensitive",
    title: source === "missed_call"
      ? "Missed call — call now"
      : source === "website_request"
      ? "Website request — call now"
      : "New lead — call now",
    body: `${person} is waiting for a response.`,
    href: `/(owner)/lead/${lead.id}`,
    entityId: lead.id,
    state: {
      leadState: {
        status: currentLead.status,
        opportunityStartedAt: currentLead.opportunity_started_at ?? currentLead.created_at,
        lastActivityAt: currentLead.last_activity_at,
      },
    },
  });
}

export function pushCustomerMessage(input: {
  messageId: string;
  peerPhone: string;
  displayName?: string | null;
  rescheduleRequest?: boolean;
  optOut?: boolean;
  vendorReview?: boolean;
}) {
  const person = displayName(input.displayName, input.peerPhone);
  return ownerPush({
    dedupeKey: `customer_message:${input.messageId}`,
    eventType: "customer_message",
    urgency: "time_sensitive",
    title: input.vendorReview
      ? "Lead vendor needs review"
      : input.optOut
      ? "Customer opted out"
      : input.rescheduleRequest ? "Schedule change requested" : "New customer text",
    body: input.vendorReview
      ? "A vendor message could not be parsed. Tap to review it."
      : input.optOut
      ? `${person} opted out of automated texts.`
      : `${person} sent a message. Tap to reply.`,
    href: `/(owner)/thread/${encodeURIComponent(input.peerPhone)}`,
    entityId: input.messageId,
  });
}

export async function pushEstimateApproved(input: {
  estimateId: string;
  estimateNumber: string;
  customerName: string | null;
  jobId?: string | null;
}) {
  const { data: estimate, error } = await canesDb()
    .from("estimates")
    .select("status, approved_at")
    .eq("id", input.estimateId)
    .maybeSingle();
  if (error) throw new Error(`pushEstimateApproved state: ${error.message}`);
  if (!estimate) throw new Error(`pushEstimateApproved state: estimate ${input.estimateId} not found`);
  return ownerPush({
    dedupeKey: `estimate_approved:${input.estimateId}`,
    eventType: "estimate_approved",
    urgency: "active",
    title: "Estimate approved",
    body: `${displayName(input.customerName)} approved ${input.estimateNumber}.`,
    href: input.jobId ? `/(owner)/job/${input.jobId}` : `/(owner)/estimate/${input.estimateId}`,
    entityId: input.jobId ?? input.estimateId,
    state: {
      estimateId: input.estimateId,
      estimateState: { status: estimate.status, approvedAt: estimate.approved_at },
    },
  });
}

export async function pushDepositReceived(input: {
  eventId: string;
  estimateId?: string | null;
  customerName: string | null;
  amountCents: number;
  jobId?: string | null;
}) {
  const href = input.jobId
    ? `/(owner)/job/${input.jobId}`
    : input.estimateId ? `/(owner)/estimate/${input.estimateId}` : "/(owner)/schedule";
  let depositState: Record<string, unknown> | undefined;
  if (input.jobId) {
    const { data: job, error } = await canesDb()
      .from("jobs")
      .select("deposit_paid_at, deposit_collected_cents, deposit_square_payment_id")
      .eq("id", input.jobId)
      .maybeSingle();
    if (error) throw new Error(`pushDepositReceived state: ${error.message}`);
    if (!job) throw new Error(`pushDepositReceived state: job ${input.jobId} not found`);
    depositState = {
      paidAt: job.deposit_paid_at,
      collectedCents: job.deposit_collected_cents,
      squarePaymentId: job.deposit_square_payment_id,
    };
  }
  return ownerPush({
    dedupeKey: `deposit_received:${input.eventId}`,
    eventType: "deposit_received",
    urgency: "active",
    title: "Deposit received",
    body: `${dollars(input.amountCents)} received from ${displayName(input.customerName)}.`,
    href,
    entityId: input.jobId ?? input.estimateId ?? input.eventId,
    state: {
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(depositState ? { depositState } : {}),
    },
  });
}

export async function pushInvoicePaid(input: {
  eventId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string | null;
  amountCents: number;
}) {
  const { data: invoice, error } = await canesDb()
    .from("invoices")
    .select("status, amount_paid_cents, settlement_generation")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (error) throw new Error(`pushInvoicePaid state: ${error.message}`);
  if (!invoice) throw new Error(`pushInvoicePaid state: invoice ${input.invoiceId} not found`);
  return ownerPush({
    dedupeKey: `invoice_paid:${input.eventId}`,
    eventType: "invoice_paid",
    urgency: "active",
    title: "Invoice paid",
    body: `${displayName(input.customerName)} paid ${dollars(input.amountCents)} on ${input.invoiceNumber}.`,
    href: `/(owner)/invoice/${input.invoiceId}`,
    entityId: input.invoiceId,
    state: {
      invoiceState: {
        status: invoice.status,
        amountPaidCents: invoice.amount_paid_cents,
        settlementGeneration: invoice.settlement_generation,
      },
    },
  });
}

export function pushCustomerJobChangeRequest(input: JobPushInput & {
  messageId: string;
  change: "canceled" | "rescheduled";
  expectedJobState: JobPushState;
}) {
  const person = displayName(input.customerName);
  return ownerPush({
    dedupeKey: `customer_job_change:${input.messageId}:${input.id}`,
    eventType: "job_changed",
    urgency: "time_sensitive",
    title: input.change === "canceled" ? "Customer wants to cancel" : "Customer wants to reschedule",
    body: `${person} requested a change to an upcoming ${input.jobName || "job"}.`,
    href: `/(owner)/job/${input.id}`,
    entityId: input.id,
    state: { jobState: input.expectedJobState },
  });
}

export function pushPaymentIssue(input: {
  eventId: string;
  invoiceId?: string | null;
  jobId?: string | null;
  title: string;
  detail: string;
}) {
  const href = input.invoiceId
    ? `/(owner)/invoice/${input.invoiceId}?payments=1`
    : input.jobId ? `/(owner)/job/${input.jobId}?focus=billing` : "/(owner)/invoices";
  return ownerPush({
    dedupeKey: `payment_issue:${input.eventId}`,
    eventType: "payment_issue",
    urgency: "time_sensitive",
    title: input.title,
    body: input.detail,
    href,
    entityId: input.invoiceId ?? input.jobId ?? input.eventId,
  });
}

export async function pushJobChanged(input: JobPushInput & {
  eventId: string;
  change: "canceled" | "rescheduled" | "updated";
  detail?: string;
  notifyOwner?: boolean;
  expectedJobState: JobPushState;
}) {
  const verb = input.change === "canceled"
    ? "was canceled"
    : input.change === "rescheduled" ? "was rescheduled" : "was updated";
  const person = displayName(input.customerName);
  const owner = input.notifyOwner === false ? Promise.resolve(null) : ownerPush({
    dedupeKey: `job_changed:owner:${input.eventId}`,
    eventType: "job_changed",
    urgency: "time_sensitive",
    title: input.change === "canceled" ? "Upcoming job canceled" : "Upcoming job changed",
    body: input.detail ?? `${person}'s job ${verb}.`,
    href: `/(owner)/job/${input.id}`,
    entityId: input.id,
    state: { jobState: input.expectedJobState },
  });
  if (!input.crewId) return owner;
  const crew = durableSend({
    dedupeKey: `job_changed:crew:${input.eventId}`,
    audience: { kind: "crew_accounts", accountIds: [], crewId: input.crewId },
    eventType: "job_changed",
    urgency: "time_sensitive",
    title: input.change === "canceled" ? "Job canceled" : "Schedule changed",
    body: input.detail ?? `${person}'s ${input.jobName || "job"} ${verb}.`,
    href: `/(crew)/job/${input.id}`,
    entityId: input.id,
    state: { jobState: input.expectedJobState },
  });
  const [ownerResult, crewResult] = await Promise.all([owner, crew]);
  return { owner: ownerResult, crew: crewResult };
}

export async function pushCrewRemovedFromJob(input: {
  eventId: string;
  jobId: string;
  crewId: string;
  customerName: string | null;
  jobName?: string | null;
}) {
  return durableSend({
    dedupeKey: `job_removed:crew:${input.eventId}`,
    audience: { kind: "crew_accounts", accountIds: [], crewId: input.crewId },
    eventType: "job_changed",
    urgency: "time_sensitive",
    title: "Assignment changed",
    body: `You are no longer assigned to ${displayName(input.customerName)}'s ${input.jobName || "job"}.`,
    href: "/(crew)",
    entityId: input.jobId,
  });
}

export function pushChecklistBlocked(input: {
  eventId: string;
  jobId: string;
  customerName: string | null;
  stepName: string;
  technicianName: string;
  itemId: string;
  blockedAt: string;
}) {
  return ownerPush({
    dedupeKey: `checklist_blocked:${input.itemId}:${canonicalTimestamp(input.blockedAt)}`,
    eventType: "checklist_blocked",
    urgency: "time_sensitive",
    title: "Crew is blocked",
    body: `${input.technicianName} blocked “${input.stepName}” for ${displayName(input.customerName)}.`,
    href: `/(owner)/job/${input.jobId}?focus=checklist`,
    entityId: input.jobId,
    state: { itemId: input.itemId, blockedAt: input.blockedAt },
  });
}

export function pushCrewLate(input: {
  jobId: string;
  customerName: string | null;
  scheduledAt: string;
  minutesLate: number;
}) {
  return queuedOwnerPush({
    dedupeKey: `crew_late:${input.jobId}:${canonicalTimestamp(input.scheduledAt)}`,
    eventType: "crew_late",
    urgency: "time_sensitive",
    title: "No crew check-in",
    body: `${displayName(input.customerName)}'s crew is ${Math.max(1, Math.round(input.minutesLate))} minutes past start.`,
    href: `/(owner)/job/${input.jobId}`,
    entityId: input.jobId,
    state: { scheduledAt: input.scheduledAt },
  });
}

export function pushMorningRunSheet(input: {
  day: string;
  jobs: number;
  unconfirmed: number;
  leadsWaiting: number;
}) {
  const parts = [
    `${input.jobs} job${input.jobs === 1 ? "" : "s"}`,
    input.unconfirmed ? `${input.unconfirmed} unconfirmed` : null,
    input.leadsWaiting ? `${input.leadsWaiting} lead${input.leadsWaiting === 1 ? "" : "s"} waiting` : null,
  ].filter((value): value is string => Boolean(value));
  return queuedOwnerPush({
    dedupeKey: `morning_summary:${input.day}`,
    eventType: "morning_summary",
    urgency: "summary",
    title: "Your Canes run sheet",
    body: parts.join(" · ") || "Your day is clear.",
    href: "/(owner)/schedule",
    entityId: input.day,
  });
}

export function pushDailyFollowupSummary(input: {
  day: string;
  overdueInvoices: number;
  dormantLeads: number;
}) {
  return queuedOwnerPush({
    dedupeKey: `daily_followups:${input.day}`,
    eventType: "daily_followups",
    urgency: "summary",
    title: "Money and follow-ups",
    body: `${input.overdueInvoices} overdue invoice${input.overdueInvoices === 1 ? "" : "s"} · ${input.dormantLeads} follow-up${input.dormantLeads === 1 ? "" : "s"} due`,
    href: "/(owner)/dashboard",
    entityId: input.day,
  });
}
