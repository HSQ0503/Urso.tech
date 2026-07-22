"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canesConfigured, canesDb, squareConfigured } from "@/lib/canes/supabase";
import { getSettings, getLead } from "@/lib/canes/data";
import { sendCanesSms, fillTemplate, canesTwilioCreds, alertOwner } from "@/lib/canes/twilio";
import {
  getEstimate,
  getEstimateByToken,
  getEstimateItems,
  getEstimateWithItems,
  getJob,
  getScheduleBoard,
  listCrews,
  listJobItems,
  nextEstimateNumber,
  enqueueEstimateSend,
  enqueueEstimateReminders,
} from "@/lib/canes/estimates";
import {
  getInvoice,
  getInvoiceByJob,
  getInvoiceByToken,
  getInvoiceItems,
  nextInvoiceNumber,
  invoicePublicUrl,
  enqueueInvoiceSend,
  enqueueInvoiceReminders,
} from "@/lib/canes/invoices";
import { listJobExpenses, addJobExpenseRow, deleteJobExpenseRow } from "@/lib/canes/expenses";
import { addBusinessExpenseRow, deleteBusinessExpenseRow } from "@/lib/canes/overhead";
import { ensureContact, getCustomer } from "@/lib/canes/customers";
import { listInvoiceRewards, rewardConfigFrom, getRewardConfig, type RewardConfig } from "@/lib/canes/rewards";
import {
  notifyEstimateSent,
  notifyEstimateApproved,
  notifyEstimateDeclined,
  notifyInvoiceSent,
  notifyInvoicePaid,
  notifyInvoiceReceipt,
  notifyRewardClaimed,
} from "@/lib/canes/notify";
import { cancelSquareInvoice, createDepositLink, createSquareInvoice, recomputeInvoicePaid } from "@/lib/canes/square";
import { PRACTICE_PHONE } from "@/lib/canes/tour";
import {
  fmtEt,
  fmtMoney,
  fmtPhone,
  toE164,
  type CalendarEventKind,
  type CatalogKind,
  type Estimate,
  type EstimateItem,
  type EstimateType,
  type EstimateWithItems,
  type Invoice,
  type InvoiceReward,
  type InvoiceRewardKind,
  type Job,
  type JobExpense,
  type JobInvoiceSummary,
  type JobStatus,
  type LeadStatus,
  type LeadSource,
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
  const { error } = await canesDb().from("leads").update(patch).eq("id", leadId);
  if (error) return { ok: false, notice: error.message };
  await logEvent(leadId, "edited", "Lead details updated");
  await touch(leadId);
  refresh();
  return { ok: true };
}

export async function setLeadStatus(leadId: string, status: LeadStatus, lostReason?: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const patch: Record<string, unknown> = { status };
  if (status === "lost") patch.lost_reason = lostReason ?? null;
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  const { error } = await canesDb().from("leads").update(patch).eq("id", leadId);
  if (error) return { ok: false, notice: error.message };
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
  const when = new Date(appointmentIso);
  if (Number.isNaN(when.getTime())) return { ok: false, notice: "Invalid date." };
  const db = canesDb();
  const { error } = await db
    .from("leads")
    .update({ appointment_at: when.toISOString(), status: "appointment_set", confirmed_at: null })
    .eq("id", leadId);
  if (error) return { ok: false, notice: error.message };

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

export async function snoozeLead(leadId: string, untilIso: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const { error } = await canesDb().from("leads").update({ snoozed_until: untilIso }).eq("id", leadId);
  if (error) return { ok: false, notice: error.message };
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

// Permanently remove a junk or duplicate lead. Two refusals protect the
// business: an opted-out lead IS the do-not-text record for that number
// (deleting it would let a future inbound re-create the lead with a clean
// consent slate — an A2P violation waiting to happen), and a lead with an
// estimate or job carries the queued sends/reminders/confirmations for that
// work (tasks cascade with the lead even though the work itself survives).
// The SMS thread survives either way; tasks and timeline events cascade.
export async function deleteLead(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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

// Send (or re-send) the confirmation text right now, outside the scheduler.
export async function sendConfirmationNow(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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
// (see app/api/canes/twilio/bridge). Every "Call" button in the app routes
// through here, so customers only ever see the business line and callbacks come
// back into our system — never Sebastian's personal cell. Requires Twilio + a
// public deployment URL.
export async function bridgeCall(
  phone: string | null | undefined,
  opts?: { leadId?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const to = phone?.trim();
  if (!to) return { ok: false, notice: "No phone number to call." };
  const owner = process.env.CANES_OWNER_PHONE;
  const { accountSid, authToken, from } = canesTwilioCreds();
  if (!owner || !accountSid) return { ok: false, notice: "Twilio isn't configured yet." };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const twimlUrl = `${base}/api/canes/twilio/bridge?to=${encodeURIComponent(to)}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: owner, From: from, Url: twimlUrl }),
  });
  if (!res.ok) return { ok: false, notice: `Twilio responded ${res.status}` };
  await canesDb()
    .from("calls")
    .insert({ lead_id: opts?.leadId ?? null, peer_phone: to, direction: "out", status: "initiated" });
  if (opts?.leadId) await logEvent(opts.leadId, "call", "Click-to-call started (bridging your phone)");
  return { ok: true, notice: "Calling your phone now — answer to connect." };
}

// Lead-scoped convenience wrapper: look the number up from the lead, then bridge.
export async function initiateCall(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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
const CONTACT_PATCH_KEYS = ["customerName", "customerPhone", "customerEmail"];

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
  const settings = await getSettings();
  const number = await nextEstimateNumber();
  const phone = input.customerPhone ? toE164(input.customerPhone) : null;
  if (input.customerPhone && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  // Snapshot terms + message + expiry from settings at creation so later
  // settings edits never rewrite a sent estimate.
  const expiresAt = new Date(
    Date.now() + settings.estimate_expiry_days * 86_400_000,
  ).toISOString();
  const { data, error } = await canesDb()
    .from("estimates")
    .insert({
      lead_id: input.leadId ?? null,
      contact_id: input.contactId ?? null,
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

  // Email inline (best-effort). notifyEstimateSent no-ops without an address.
  if (canEmail) await notifyEstimateSent(sent);

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
  return { ok: true, notice: sendEstimateNotice({ canEmail, optedOut, textSent, textQueued }) };
}

// Human-readable summary of what actually happened when the estimate went out.
function sendEstimateNotice(s: {
  canEmail: boolean;
  optedOut: boolean;
  textSent: boolean;
  textQueued: boolean;
}): string {
  if (s.textSent && s.canEmail) return "Texted and emailed the estimate.";
  if (s.textSent) return "Texted the estimate.";
  if (s.textQueued && s.canEmail) return "Text queued for after quiet hours; emailed now.";
  if (s.textQueued) return "Text queued for after quiet hours.";
  // Opted-out surfaces regardless of the picker choice so the owner knows why no text went.
  if (s.optedOut && s.canEmail) return "Sent by email — customer opted out of texts.";
  if (s.canEmail) return "Emailed the estimate.";
  return "Estimate sent.";
}

export async function voidEstimate(estimateId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  const db = canesDb();
  const now = new Date().toISOString();
  // Expired is the terminal "no longer live" status the schema allows for a
  // voided estimate; cancel any pending reminder/send tasks so the customer is
  // never texted about a dead estimate.
  const { error } = await db
    .from("estimates")
    .update({ status: "expired", updated_at: now })
    .eq("id", estimateId);
  if (error) return { ok: false, notice: error.message };
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
export async function approveEstimateInPerson(
  estimateId: string,
): Promise<ActionResult & { depositUrl?: string | null }> {
  if (!canesConfigured()) return DEMO;
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
  return finalizeEstimateApproval(estimate, signature, { inPerson: true });
}

// The shared back half of an approval, after each caller's own guards: claim
// the status flip, promote the lead, upsert the contact, create the job, mint
// the deposit link. Owner notifications only fire for the public path — the
// in-person path IS the owner acting.
async function finalizeEstimateApproval(
  estimate: Estimate,
  signature: string,
  opts: { selectedItemIds?: string[]; inPerson?: boolean } = {},
): Promise<ActionResult & { depositUrl?: string | null }> {
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
    .update({ status: "approved", approved_at: now, signature_name: signature, updated_at: now })
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

  const deposit = await createDepositLink(approved, jobId);
  refresh();
  return {
    ok: true,
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
    const { error } = await db.from("service_catalog").update(row).eq("id", item.id);
    if (error) return { ok: false, notice: error.message };
  } else {
    const { error } = await db.from("service_catalog").insert(row);
    if (error) return { ok: false, notice: error.message };
  }
  refresh();
  return { ok: true };
}

export async function deleteCatalogItem(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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
  const db = canesDb();
  const crews = crewId ? await listCrews() : [];
  const crew = crewId ? crews.find((c) => c.id === crewId) ?? null : null;
  const { error } = await db
    .from("jobs")
    .update({
      scheduled_at: startIso,
      ends_at: endIso,
      duration_minutes: duration,
      crew_id: crewId,
      assigned_to: crew?.name ?? job.assigned_to,
      // Rescheduling moves a job to a new, not-yet-agreed slot, so a confirmed
      // job must drop back to scheduled and clear confirmed_at — the customer
      // hasn't said YES to the new time. Terminal states are rejected above.
      ...((job.status === "unscheduled" || job.status === "scheduled" || job.status === "confirmed") ? { status: "scheduled", confirmed_at: null } : {}),
    })
    .eq("id", jobId);
  if (error) return { ok: false, notice: error.message };

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
  if (crew && !pastSlot) await notifyCrewAssignment(job, crew.name, startIso);
  await logJobEvent(job.lead_id, `Scheduled ${fmtEt(startIso)} · ${crewLabel(crew)}`);
  refresh();
  return { ok: true, notice: conflict };
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
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: `Can't unschedule a ${job.status} job.` };
  }
  const { error } = await canesDb()
    .from("jobs")
    .update({ scheduled_at: null, ends_at: null, status: "unscheduled" })
    .eq("id", jobId);
  if (error) return { ok: false, notice: error.message };
  await cancelJobConfirmation(jobId);
  await logJobEvent(job.lead_id, "Returned to the unscheduled tray");
  refresh();
  return { ok: true };
}

// Assign / reassign a crew without changing the time.
export async function assignJob(jobId: string, crewId: string | null): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };
  const crews = crewId ? await listCrews() : [];
  const crew = crewId ? crews.find((c) => c.id === crewId) ?? null : null;
  if (crewId && !crew) return { ok: false, notice: "Crew not found." };
  const { error } = await canesDb()
    .from("jobs")
    .update({ crew_id: crewId, assigned_to: crew?.name ?? null })
    .eq("id", jobId);
  if (error) return { ok: false, notice: error.message };

  let notice: string | undefined;
  if (job.scheduled_at && job.ends_at) {
    notice = await findConflictNotice(jobId, crewId, job.scheduled_at, job.ends_at);
  }
  // A back-dated (already-done) job doesn't need an assignment alert.
  const pastSlot = !!job.scheduled_at && new Date(job.scheduled_at).getTime() < Date.now();
  if (crew && !pastSlot) await notifyCrewAssignment(job, crew.name, job.scheduled_at);
  await logJobEvent(job.lead_id, crew ? `Assigned to ${crew.name}` : "Crew unassigned");
  refresh();
  return { ok: true, notice };
}

// Drive the manual status transitions this build owns, plus cancel/no-show with
// a reason. Cancel stores canceled_reason (no-show is a reason string) and
// cancels the pending confirmation.
export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  reason?: string,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  if (status === "canceled" && !reason?.trim()) {
    return { ok: false, notice: "A reason is required to cancel a job." };
  }
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };

  const patch: Record<string, unknown> = { status };
  if (status === "canceled") patch.canceled_reason = reason?.trim() ?? null;
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  const { error } = await canesDb().from("jobs").update(patch).eq("id", jobId);
  if (error) return { ok: false, notice: error.message };

  // Leaving the live window (canceled) means the day-before text is now noise.
  if (status === "canceled") await cancelJobConfirmation(jobId);
  await logJobEvent(
    job.lead_id,
    `Status set to ${status}${status === "canceled" && reason ? ` — ${reason.trim()}` : ""}`,
  );
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
  const existing = await getInvoiceByJob(jobId); // ignores void — re-bill path
  if (existing) return { ok: true, invoiceId: existing.id };
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Job not found." };

  const settings = await getSettings();
  const number = await nextInvoiceNumber();
  const db = canesDb();
  const { data, error } = await db
    .from("invoices")
    .insert({
      job_id: jobId,
      estimate_id: job.estimate_id,
      lead_id: job.lead_id,
      contact_id: job.contact_id,
      number,
      status: "draft",
      customer_name: job.customer_name,
      customer_phone: job.customer_phone,
      customer_email: job.customer_email,
      job_address: job.job_address,
      job_name: job.job_name,
      message_to_customer: settings.invoice_message,
      terms: settings.invoice_terms,
      tax_rate_bps: 0, // FL residential non-taxable by default
      public_token: genInvoiceToken(),
    })
    .select("id")
    .single();
  if (error) {
    // A racing complete may have inserted first (job_id UNIQUE) — reuse it.
    const raced = await getInvoiceByJob(jobId);
    if (raced) return { ok: true, invoiceId: raced.id };
    return { ok: false, notice: error.message };
  }
  const invoiceId = data.id as string;

  // Procedural crew steps live beside the sold work snapshot but must never be
  // copied onto the customer's invoice.
  const jobItems = (await listJobItems(jobId)).filter((item) => !item.checklist_only);
  if (jobItems.length > 0) {
    const rows = jobItems.map((it, i) => ({
      invoice_id: invoiceId,
      job_item_id: it.id,
      position: i,
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unit_price_cents: it.quantity > 0 ? Math.round(it.line_total_cents / it.quantity) : it.line_total_cents,
      line_total_cents: it.line_total_cents,
    }));
    const { error: itemsErr } = await db.from("invoice_items").insert(rows);
    if (itemsErr) console.error(`[canes] invoice_items snapshot failed for ${invoiceId}: ${itemsErr.message}`);
  } else {
    // No line items on the job (e.g. a manual job) — bill the job total as one line.
    await db.from("invoice_items").insert({
      invoice_id: invoiceId,
      position: 0,
      name: job.job_name ?? "Pressure washing service",
      quantity: 1,
      unit_price_cents: job.total_cents,
      line_total_cents: job.total_cents,
    });
  }

  // Seed review-reward offers for every configured kind (0012). Seeding at
  // creation means the quick "text invoice" path in the job sheet carries the
  // offers automatically; Sebastian unchecks per invoice for a shaky client.
  // The tour's practice sandbox never seeds — its invoice is fictional.
  if (job.customer_phone !== PRACTICE_PHONE) {
    const config = rewardConfigFrom(settings);
    const offerRows = (Object.keys(config) as InvoiceRewardKind[])
      .filter((kind) => config[kind].configured)
      .map((kind) => ({
        invoice_id: invoiceId,
        kind,
        label: config[kind].label,
        amount_cents: config[kind].cents,
        status: "offered",
      }));
    if (offerRows.length > 0) {
      const { error: rewardErr } = await db.from("invoice_rewards").insert(offerRows);
      if (rewardErr) console.error(`[canes] reward seed failed for ${invoiceId}: ${rewardErr.message}`);
    }
  }

  // Pull the job's booking deposit onto this bill (0013): ledger rows minted
  // by the deposit webhook before the invoice existed (or stranded on a voided
  // bill) re-point here, so the invoice opens already credited and the
  // customer is only ever asked for the balance.
  const { data: voidRows } = await db
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "void");
  const voidIds = ((voidRows ?? []) as { id: string }[]).map((r) => r.id);
  let claimDeposits = db
    .from("payments")
    .update({ invoice_id: invoiceId })
    .eq("job_id", jobId)
    .eq("kind", "deposit");
  claimDeposits =
    voidIds.length > 0
      ? claimDeposits.or(`invoice_id.is.null,invoice_id.in.(${voidIds.join(",")})`)
      : claimDeposits.is("invoice_id", null);
  const { error: claimErr } = await claimDeposits;
  if (claimErr) console.error(`[canes] deposit re-point failed for ${invoiceId}: ${claimErr.message}`);
  // The void bills just lost their deposit rows — refresh their paid caches so
  // a set-aside invoice never shows money it no longer holds.
  if (!claimErr) {
    for (const vid of voidIds) await recomputeInvoicePaid(vid);
  }

  await recomputeInvoiceTotals(invoiceId);
  await recomputeInvoicePaid(invoiceId); // fold the deposit into the paid cache
  await logInvoiceEvent(job.lead_id, `Invoice ${number} created`);
  refresh();
  return { ok: true, invoiceId };
}

// Edit a draft invoice — the "actual amount" lever is adjustment_cents, plus
// contact + message + terms. Draft-only, then recompute. Mirrors updateEstimate.
export async function updateInvoice(
  invoiceId: string,
  patch: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    adjustmentCents?: number;
    messageToCustomer?: string;
    terms?: string;
    internalNotes?: string;
  },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  // Same contact-fields exception as updateEstimate: amounts freeze at send,
  // but a wrong phone/email must stay fixable or the bill is undeliverable.
  const patchKeys = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  const contactOnly = patchKeys.every((k) => CONTACT_PATCH_KEYS.includes(k));
  if (invoice.status !== "draft" && !contactOnly) {
    return { ok: false, notice: "Only draft invoices can be edited (contact details excepted)." };
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.customerName !== undefined) row.customer_name = patch.customerName || null;
  if (patch.customerPhone !== undefined) {
    const phone = patch.customerPhone ? toE164(patch.customerPhone) : null;
    if (patch.customerPhone && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
    row.customer_phone = phone;
  }
  if (patch.customerEmail !== undefined) row.customer_email = patch.customerEmail || null;
  if (patch.adjustmentCents !== undefined) row.adjustment_cents = Math.round(patch.adjustmentCents);
  if (patch.messageToCustomer !== undefined) row.message_to_customer = patch.messageToCustomer || null;
  if (patch.terms !== undefined) row.terms = patch.terms || null;
  if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes || null;

  const { error } = await canesDb().from("invoices").update(row).eq("id", invoiceId);
  if (error) return { ok: false, notice: error.message };
  await recomputeInvoiceTotals(invoiceId);
  if (invoice.lead_id) await touch(invoice.lead_id);
  refresh();
  return { ok: true };
}

// Send (or resend) an invoice for card payment. Publishes a Square invoice when
// configured (captures the hosted pay URL), marks sent, texts/emails the link
// with the same outbox fallback as sendEstimate, queues day-3/7 reminders, and
// advances the job to `invoiced`. The customer pays on Square's hosted page;
// the webhook settles us. Never sends a card link for an already-paid invoice.
export async function sendInvoice(
  invoiceId: string,
  opts?: { channels?: { email?: boolean; text?: boolean }; toEmail?: string; toPhone?: string },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status === "paid") return { ok: false, notice: "This invoice is already paid." };
  if (invoice.status === "void") return { ok: false, notice: "This invoice was voided." };

  const db = canesDb();

  // Send-target overrides: validate, then PERSIST — the snapshot is the
  // send-of-record, so reminders and resends follow the corrected destination.
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
      .from("invoices")
      .update({ ...overrides, updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (error) return { ok: false, notice: error.message };
  }

  // No-destination guard BEFORE any status flip or Square publish: an invoice
  // must never go "sent" with nowhere to deliver it.
  const effectivePhone = (overrides.customer_phone as string | undefined) ?? invoice.customer_phone;
  const effectiveEmail = (overrides.customer_email as string | undefined) ?? invoice.customer_email;
  const guardLead = invoice.lead_id ? await getLead(invoice.lead_id) : null;
  const optedOut = Boolean(guardLead?.opted_out);
  const wantsText = opts?.channels?.text ?? true;
  const wantsEmail = opts?.channels?.email ?? true;
  const canText = Boolean(effectivePhone) && !optedOut && wantsText;
  const canEmail = Boolean(effectiveEmail) && wantsEmail;
  if (!canText && !canEmail) {
    return {
      ok: false,
      notice: optedOut && Boolean(effectivePhone)
        ? "This customer opted out of texts — add an email to send the invoice."
        : "No destination: add a phone or email (or pick a channel) before sending.",
    };
  }

  await recomputeInvoiceTotals(invoiceId);
  const fresh = (await getInvoice(invoiceId)) ?? invoice;

  // Create + publish the Square invoice if Square is connected. Best-effort:
  // a Square failure never blocks sending our own branded link. The tour's
  // practice sandbox never reaches Square — a published Square invoice for a
  // fictional customer would outlive the sandbox cleanup.
  let hostedUrl = fresh.hosted_payment_url;
  if (!hostedUrl && fresh.customer_phone !== PRACTICE_PHONE) {
    const sq = await createSquareInvoice(fresh);
    if (sq.error) {
      await alertOwner(`Couldn't create the Square invoice for ${fresh.number}: ${sq.error}. Sent our link instead.`);
    }
    if (sq.squareInvoiceId || sq.hostedUrl) {
      hostedUrl = sq.hostedUrl;
      await db
        .from("invoices")
        .update({
          square_invoice_id: sq.squareInvoiceId,
          square_order_id: sq.squareOrderId,
          hosted_payment_url: sq.hostedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
    }
  }

  const now = new Date().toISOString();
  // House claim discipline: only a live draft/sent/viewed row flips to sent —
  // a reopen that voided this invoice mid-send (or a webhook that settled it)
  // wins, and we abort BEFORE any customer contact, killing the just-published
  // Square pay page so nothing chargeable outlives the abort.
  const { data: flipped, error } = await db
    .from("invoices")
    .update({ status: "sent", sent_at: fresh.sent_at ?? now, updated_at: now })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent", "viewed"])
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!flipped || flipped.length === 0) {
    const current = await getInvoice(invoiceId);
    if (current?.status === "void" && current.square_invoice_id) {
      await cancelSquareInvoice(current.square_invoice_id);
    }
    return {
      ok: false,
      notice: `Invoice ${invoice.number} changed while sending (now ${current?.status ?? "gone"}) — refresh and check it.`,
    };
  }
  const sent: Invoice = { ...fresh, status: "sent", sent_at: fresh.sent_at ?? now, hosted_payment_url: hostedUrl ?? null };

  if (canEmail) await notifyInvoiceSent(sent);

  const link = invoicePublicUrl(sent);
  let textSent = false;
  let textQueued = false;
  if (canText) {
    const res = await sendCanesSms({
      to: sent.customer_phone as string,
      body: `Here is your invoice from Canes Pressure Washing: ${link}`,
      leadId: invoice.lead_id,
      automated: true,
    });
    if (res.ok) textSent = true;
    else textQueued = await enqueueInvoiceSend(sent);
  }
  await enqueueInvoiceReminders(sent);

  // Advance the job to invoiced (never regress a paid job).
  if (invoice.job_id) {
    await db.from("jobs").update({ status: "invoiced" }).eq("id", invoice.job_id).eq("status", "completed");
  }
  await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} sent (${fmtMoney(sent.total_cents)})`);
  if (invoice.lead_id) await touch(invoice.lead_id);
  refresh();
  return { ok: true, notice: sendInvoiceNotice({ canEmail, optedOut, textSent, textQueued }) };
}

function sendInvoiceNotice(s: { canEmail: boolean; optedOut: boolean; textSent: boolean; textQueued: boolean }): string {
  if (s.textSent && s.canEmail) return "Texted and emailed the invoice.";
  if (s.textSent) return "Texted the invoice.";
  if (s.textQueued && s.canEmail) return "Text queued for after quiet hours; emailed now.";
  if (s.textQueued) return "Text queued for after quiet hours.";
  if (s.optedOut && s.canEmail) return "Sent by email — customer opted out of texts.";
  if (s.canEmail) return "Emailed the invoice.";
  return "Invoice sent.";
}

// Record a cash payment against an invoice — the Verify step. TOCTOU-safe: the
// status claim (draft|sent|viewed → paid) is the double-record lock, so two
// taps insert exactly one ledger row. Settles the job too.
export async function recordCashPayment(invoiceId: string, amountCents: number): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const amount = Math.round(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, notice: "Enter the cash amount collected." };
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status === "paid") return { ok: true, notice: "This invoice is already marked paid." };
  if (invoice.status === "void") return { ok: false, notice: "This invoice was voided." };

  const db = canesDb();
  const now = new Date().toISOString();
  const prior = invoice.status;
  const priorPaid = invoice.amount_paid_cents;
  const newPaid = priorPaid + amount;
  // Only settle when the cumulative cash actually covers the total — an
  // underpayment is recorded but leaves the balance open (never closes it).
  const fullyPaid = newPaid >= invoice.total_cents;

  // Optimistic lock on amount_paid_cents (its own version) AND total_cents:
  // the claim only wins if both figures are still what we read, so two
  // concurrent taps can't double-insert a ledger row, and a review-reward
  // approval landing in the read→claim window can't make this settle (or stay
  // open) against a stale total. Settle in the SAME update only when covered.
  const { data: claimed, error: claimErr } = await db
    .from("invoices")
    .update({
      amount_paid_cents: newPaid,
      updated_at: now,
      ...(fullyPaid ? { status: "paid", paid_at: now } : {}),
    })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent", "viewed"])
    .eq("amount_paid_cents", priorPaid)
    .eq("total_cents", invoice.total_cents)
    .select("id");
  if (claimErr) return { ok: false, notice: claimErr.message };
  if (!claimed || claimed.length === 0) {
    return { ok: true, notice: "This invoice was already updated — refresh to see the latest." };
  }

  // Won the claim → append the immutable ledger row. If the insert fails, revert
  // the claim so we never leave a settled invoice with no backing payment.
  const { error: payErr } = await db.from("payments").insert({
    invoice_id: invoiceId,
    job_id: invoice.job_id,
    amount_cents: amount,
    currency: "USD",
    method: "cash",
    source: "manual",
    status: "completed",
    recorded_by: "owner",
  });
  if (payErr) {
    console.error(`[canes] cash payment insert failed for ${invoiceId}: ${payErr.message}`);
    await db
      .from("invoices")
      .update({ amount_paid_cents: priorPaid, status: prior, paid_at: invoice.paid_at, updated_at: now })
      .eq("id", invoiceId);
    return { ok: false, notice: "Couldn't record the payment. Please try again." };
  }

  if (fullyPaid) {
    if (invoice.job_id) {
      await db.from("jobs").update({ status: "paid" }).eq("id", invoice.job_id).neq("status", "canceled");
    }
    await cancelInvoiceTasks(invoiceId);
    // Kill the Square hosted link so the customer can't also pay it by card.
    if (invoice.square_invoice_id) await cancelSquareInvoice(invoice.square_invoice_id);
  }
  await logInvoiceEvent(
    invoice.lead_id,
    `${fullyPaid ? "Cash payment" : "Partial cash payment"} recorded — ${fmtMoney(amount)} for ${invoice.number}`,
  );
  if (invoice.lead_id) await touch(invoice.lead_id);

  if (fullyPaid) {
    const paid: Invoice = { ...invoice, status: "paid", paid_at: now, amount_paid_cents: newPaid };
    await notifyInvoicePaid(paid, "cash");
    await notifyInvoiceReceipt(paid, "cash"); // customer receipt (no-ops without an email)
  }
  refresh();
  return {
    ok: true,
    notice: fullyPaid
      ? `Recorded ${fmtMoney(amount)} in cash. Job marked paid.`
      : `Recorded ${fmtMoney(amount)} — ${fmtMoney(invoice.total_cents - newPaid)} still due.`,
  };
}

// Void an unpaid invoice — cancels pending send/reminder texts, kills the link.
export async function voidInvoice(invoiceId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status === "paid") return { ok: false, notice: "A paid invoice can't be voided." };
  const now = new Date().toISOString();
  const { error } = await canesDb()
    .from("invoices")
    .update({ status: "void", voided_at: now, updated_at: now })
    .eq("id", invoiceId)
    .neq("status", "paid");
  if (error) return { ok: false, notice: error.message };
  // A voided invoice must release its job for re-billing (the partial unique
  // index only allows a fresh invoice once the old one is void) and kill the
  // hosted Square link so the customer can't pay a dead document.
  if (invoice.job_id) {
    await canesDb()
      .from("jobs")
      .update({ status: "completed" })
      .eq("id", invoice.job_id)
      .eq("status", "invoiced");
  }
  if (invoice.square_invoice_id) await cancelSquareInvoice(invoice.square_invoice_id);
  await cancelInvoiceTasks(invoiceId);
  await logInvoiceEvent(invoice.lead_id, `Invoice ${invoice.number} voided`);
  if (invoice.lead_id) await touch(invoice.lead_id);
  refresh();
  return { ok: true };
}

// Match on the payload's invoice_id (not hardcoded dedupe keys) so every
// reminder day configured in settings.invoice_reminder_days is caught.
async function cancelInvoiceTasks(invoiceId: string): Promise<void> {
  await canesDb()
    .from("tasks")
    .update({ status: "canceled" })
    .in("kind", ["invoice_send", "invoice_reminder"])
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
  return listInvoiceRewards(invoiceId);
}

// Demo-safe config read: which kinds are configured, their labels/amounts/links.
export async function getRewardConfigAction(): Promise<RewardConfig> {
  return getRewardConfig();
}

// Demo-safe, token-free invoice summary so client panels (the job sheet's
// billing step) can refresh amounts after a reward approval changes the total.
export async function getInvoiceSummaryAction(invoiceId: string): Promise<JobInvoiceSummary | null> {
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

// Owner: verify + resolve a claim. Approving is THE money mutation: the reward
// enters recomputeInvoiceTotals and the bill drops. Hardened against the races
// the adversarial review surfaced:
//  - the reward CAS wins first, then the invoice is RE-READ and every money
//    guard re-checked; any violation (settled meanwhile, overshoot from a
//    concurrent approval) REVERTS the reward and re-derives totals — the
//    reward row can never stay "approved" without its discount applied;
//  - a paid/void invoice's totals are frozen inside recomputeInvoiceTotals;
//  - when the discount exactly covers what's already paid, the invoice SETTLES
//    (job → paid, reminders canceled) instead of stranding a $0 balance;
//  - Square ids are cleared ONLY when Square confirmed the cancel — otherwise
//    they're kept so a late payment on the old link still matches the invoice
//    and raises the double-payment/overpaid alert instead of vanishing.
export async function setRewardApproval(
  rewardId: string,
  approve: boolean,
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const db = canesDb();
  const { data: rewardRow } = await db
    .from("invoice_rewards")
    .select("*")
    .eq("id", rewardId)
    .maybeSingle();
  const reward = rewardRow as InvoiceReward | null;
  if (!reward) return { ok: false, notice: "Reward not found." };
  const invoice = await getInvoice(reward.invoice_id);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  if (invoice.status === "void") return { ok: false, notice: "This invoice was voided." };
  if (invoice.status === "paid") {
    return { ok: false, notice: "This invoice is already paid — settle any reward offline." };
  }

  // Money guards (re-checked on fresh data after the CAS below; this early
  // pass just gives a clean notice without touching the reward row).
  // total_cents already reflects previously approved rewards, so the projected
  // new total is a simple subtraction.
  const guardNotice = (inv: Invoice): string | null => {
    if (!approve) return null;
    const projected = Math.max(0, inv.total_cents - reward.amount_cents);
    if (projected === 0 && inv.amount_paid_cents === 0) {
      return "This discount would zero out the bill. Use the invoice's adjustment amount instead.";
    }
    if (projected < inv.amount_paid_cents) {
      return `${fmtMoney(inv.amount_paid_cents)} is already paid — this discount would overshoot the balance. Handle it offline.`;
    }
    return null;
  };
  const early = guardNotice(invoice);
  if (early) return { ok: false, notice: early };

  const now = new Date().toISOString();
  const next = approve ? "approved" : "declined";
  const prevStatus = reward.status; // offered | claimed (only these can win)
  // CAS from offered|claimed only — approving twice, or resolving a row the
  // other device just resolved, is a no-op with a clear notice.
  const { data: won, error } = await db
    .from("invoice_rewards")
    .update({ status: next, resolved_at: now, resolved_by: "owner", updated_at: now })
    .eq("id", rewardId)
    .in("status", ["offered", "claimed"])
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!won || won.length === 0) {
    return { ok: true, notice: "This reward was already resolved — refresh to see the latest." };
  }

  if (!approve) {
    await logInvoiceEvent(invoice.lead_id, `Reward declined on ${invoice.number} — ${reward.label}`);
    if (invoice.lead_id) await touch(invoice.lead_id);
    refresh();
    return { ok: true, notice: "Declined — no discount applied." };
  }

  // ── Approve path ────────────────────────────────────────────────────────────
  // Undo the CAS and re-derive totals from rows, so a failed/blocked approval
  // never leaves an "approved" reward whose discount isn't in the bill.
  const revert = async (): Promise<void> => {
    await db
      .from("invoice_rewards")
      .update({
        status: prevStatus,
        claimed_at: reward.claimed_at,
        resolved_at: null,
        resolved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId)
      .eq("status", "approved");
    await recomputeInvoiceTotals(reward.invoice_id);
  };

  // Re-read AFTER winning the CAS — a cash settle or webhook may have landed
  // between the guard read and here.
  const freshPre = await getInvoice(reward.invoice_id);
  const freshGuard = freshPre
    ? freshPre.status === "paid" || freshPre.status === "void"
      ? "This invoice was just settled — handle the reward offline."
      : guardNotice(freshPre)
    : "Invoice not found.";
  if (freshGuard) {
    await revert();
    refresh();
    return { ok: false, notice: freshGuard };
  }

  const applied = await recomputeInvoiceTotals(reward.invoice_id);
  if (!applied) {
    // Frozen (settled in the window) or the write failed — never report
    // success for a discount that isn't in the total.
    await revert();
    refresh();
    return { ok: false, notice: "Couldn't apply the discount — the invoice may have just been paid. Refresh and try again." };
  }

  // Post-write verification: recompute derives from rows, so a concurrent
  // approval of ANOTHER reward can only push the combined discount past the
  // paid amount here. Repair deterministically by reverting this one.
  const after = await getInvoice(reward.invoice_id);
  if (after && after.amount_paid_cents > 0 && after.total_cents < after.amount_paid_cents) {
    await revert();
    refresh();
    return { ok: false, notice: "Another update landed at the same moment — refresh and try again." };
  }

  // Settle-on-cover: the discount brought the total down to exactly what's
  // already been paid — the bill is done. Flip it (CAS on paid figure), close
  // the job, stop reminders. No payment happened, so no receipt email — the
  // ledger stays truthful and the public page shows Paid in full.
  let settledByReward = false;
  if (
    after &&
    after.amount_paid_cents > 0 &&
    after.total_cents === after.amount_paid_cents &&
    ["draft", "sent", "viewed"].includes(after.status)
  ) {
    const settleNow = new Date().toISOString();
    const { data: settled } = await db
      .from("invoices")
      .update({ status: "paid", paid_at: settleNow, updated_at: settleNow })
      .eq("id", after.id)
      .in("status", ["draft", "sent", "viewed"])
      .eq("amount_paid_cents", after.amount_paid_cents)
      .select("id");
    if (settled && settled.length > 0) {
      settledByReward = true;
      if (after.job_id) {
        await db.from("jobs").update({ status: "paid" }).eq("id", after.job_id).neq("status", "canceled");
      }
      await cancelInvoiceTasks(after.id);
      // Kill the hosted link (nothing left to pay) but KEEP the Square ids so
      // a late card payment still matches and raises the double-payment alert.
      if (after.square_invoice_id) await cancelSquareInvoice(after.square_invoice_id);
      await logInvoiceEvent(
        invoice.lead_id,
        `Invoice ${invoice.number} settled — reward covered the remaining balance`,
      );
    }
  }

  // Square link refresh. Sever our ids ONLY on a CONFIRMED cancel — clearing
  // them while the hosted link might still take money would orphan that
  // payment's webhook (no match → never recorded). On failure the ids stay, so
  // the webhook matches and the amount-mismatch/overpaid alerts do their job.
  let squareNote = "";
  if (!settledByReward && invoice.square_invoice_id) {
    const canceled = await cancelSquareInvoice(invoice.square_invoice_id);
    if (canceled) {
      await db
        .from("invoices")
        .update({
          square_invoice_id: null,
          square_order_id: null,
          hosted_payment_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("square_invoice_id", invoice.square_invoice_id);
      squareNote = " The old card link was canceled — resend the invoice for an updated card link.";
    } else if (squareConfigured()) {
      squareNote =
        " Heads-up: the existing card link could not be canceled and still shows the OLD amount — check Square before the customer pays it.";
    }
  }

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
  return listJobExpenses(jobId);
}

export async function addJobExpense(input: {
  jobId: string;
  amountCents: number;
  category: string;
  note?: string;
}): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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

export async function deleteJobExpense(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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
  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) upd.name = patch.name.trim();
  if (patch.role !== undefined) upd.role = patch.role;
  if (patch.compType !== undefined) upd.comp_type = patch.compType;
  if (patch.compBps !== undefined) upd.comp_bps = Math.max(0, Math.round(patch.compBps));
  if (patch.hourlyCents !== undefined) upd.hourly_cents = Math.max(0, Math.round(patch.hourlyCents));
  if (patch.crewId !== undefined) upd.crew_id = patch.crewId;
  if (patch.active !== undefined) upd.active = patch.active;
  if (Object.keys(upd).length === 0) return { ok: true };
  const { error } = await canesDb().from("team_members").update(upd).eq("id", id);
  if (error) {
    console.error(`[canes] updateTeamMember: ${error.message}`);
    return { ok: false, notice: "Couldn't update the team member. Please try again." };
  }
  refresh();
  return { ok: true };
}

export async function removeTeamMember(id: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
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
  const { error } = await canesDb().from("contacts").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, notice: "Another customer already has that phone number." };
    return { ok: false, notice: error.message };
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
  const db = canesDb();
  // Demote-then-promote keeps exactly one primary per contact.
  const { error: demoteErr } = await db
    .from("addresses")
    .update({ is_primary: false })
    .eq("contact_id", contactId);
  if (demoteErr) return { ok: false, notice: demoteErr.message };
  const { error } = await db
    .from("addresses")
    .update({ is_primary: true })
    .eq("id", addressId)
    .eq("contact_id", contactId);
  if (error) return { ok: false, notice: error.message };
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
  scheduledAtIso?: string;
  durationMinutes?: number;
  crewId?: string;
  notes?: string;
}): Promise<ActionResult & { jobId?: string }> {
  if (!canesConfigured()) return DEMO;
  const customerName = input.customerName.trim();
  if (!customerName) return { ok: false, notice: "A customer name is required." };
  const jobName = input.jobName.trim();
  if (!jobName) return { ok: false, notice: "A job name is required." };
  const total = Math.round(input.totalCents);
  if (!Number.isFinite(total) || total < 0) return { ok: false, notice: "Enter a valid job total." };
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

  // A back-dated manual job (forgot-to-log) must never trigger the customer
  // confirmation text — the visit already happened.
  if (startIso && new Date(startIso).getTime() >= Date.now()) {
    const job = await getJob(jobId);
    if (job) await armJobConfirmation(job, startIso);
  }
  await logJobEvent(lead, `Job created manually${startIso ? ` — scheduled ${fmtEt(startIso)}` : ""}`);
  refresh();
  return { ok: true, jobId };
}

// The lead behind a phone number, if any — manual jobs keep the lead timeline
// attached without requiring one.
async function findLeadIdByPhone(phone: string): Promise<string | null> {
  const { data } = await canesDb().from("leads").select("id").eq("phone", phone).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// Start a fresh estimate for an existing customer — prefills from the contact,
// their primary address, and the linked lead (which now carries the email).
export async function createEstimateForCustomer(
  contactId: string,
): Promise<ActionResult & { estimateId?: string }> {
  if (!canesConfigured()) return DEMO;
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
