"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
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
  nextEstimateNumber,
  enqueueEstimateSend,
  enqueueEstimateReminders,
} from "@/lib/canes/estimates";
import {
  notifyEstimateSent,
  notifyEstimateApproved,
  notifyEstimateDeclined,
} from "@/lib/canes/notify";
import { createDepositLink } from "@/lib/canes/square";
import {
  fmtEt,
  fmtMoney,
  toE164,
  type CalendarEventKind,
  type CatalogKind,
  type Estimate,
  type EstimateItem,
  type EstimateType,
  type EstimateWithItems,
  type Job,
  type JobStatus,
  type LeadStatus,
  type LeadSource,
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
  fields: { name?: string; phone?: string; address?: string; service?: string; notes?: string; source?: LeadSource },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const patch: Record<string, unknown> = { ...fields };
  if (fields.phone !== undefined) {
    const e164 = fields.phone ? toE164(fields.phone) : null;
    if (fields.phone && !e164) return { ok: false, notice: "That phone number doesn't look valid." };
    patch.phone = e164;
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

// Click-to-call: ring Sebastian's cell first, then bridge the lead, with the
// business number as caller ID. Requires Twilio + a public deployment URL.
export async function initiateCall(leadId: string): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const lead = await getLead(leadId);
  if (!lead?.phone) return { ok: false, notice: "Lead has no phone number." };
  const owner = process.env.CANES_OWNER_PHONE;
  const { accountSid, authToken, from } = canesTwilioCreds();
  if (!owner || !accountSid) return { ok: false, notice: "Twilio isn't configured yet — use the Call link instead." };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const twimlUrl = `${base}/api/canes/twilio/bridge?to=${encodeURIComponent(lead.phone)}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: owner, From: from, Url: twimlUrl }),
  });
  if (!res.ok) return { ok: false, notice: `Twilio responded ${res.status}` };
  await canesDb().from("calls").insert({ lead_id: leadId, peer_phone: lead.phone, direction: "out", status: "initiated" });
  await logEvent(leadId, "call", "Click-to-call started (bridging your phone)");
  return { ok: true, notice: "Calling your phone now — answer to connect." };
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
  service?: string;
  address?: string;
  appointmentIso?: string;
}): Promise<ActionResult> {
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
      service: fields.service ?? null,
      address: fields.address ?? null,
      status: "new",
    })
    .select("id")
    .single();
  if (error) return { ok: false, notice: error.message };
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
    estimateType: "standard",
    customerName: lead.name ?? undefined,
    customerPhone: lead.phone ?? undefined,
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
  if (estimate.status !== "draft") return { ok: false, notice: "Only draft estimates can be edited." };

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
  opts?: { channels?: { email?: boolean; text?: boolean } },
): Promise<ActionResult> {
  if (!canesConfigured()) return DEMO;
  const estimate = await getEstimate(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  if (estimate.status !== "draft") return { ok: false, notice: "This estimate has already been sent." };

  const db = canesDb();
  // Lock in final totals (and deposit) before the customer ever sees them.
  const totals = await recomputeEstimateTotals(estimateId);
  const now = new Date().toISOString();
  const { error } = await db
    .from("estimates")
    .update({ status: "sent", sent_at: now, updated_at: now })
    .eq("id", estimateId);
  if (error) return { ok: false, notice: error.message };
  const sent: Estimate = {
    ...estimate,
    status: "sent",
    sent_at: now,
    ...(totals ?? {}),
  };

  // Resolve effective channels. No opts = send to whatever is on file
  // (back-compat). Text is gated on opt-out; both are gated on the field
  // actually being present.
  const lead = estimate.lead_id ? await getLead(estimate.lead_id) : null;
  const optedOut = Boolean(lead?.opted_out);
  const wantsText = opts?.channels?.text ?? true;
  const wantsEmail = opts?.channels?.email ?? true;
  const canText = Boolean(sent.customer_phone) && !optedOut && wantsText;
  const canEmail = Boolean(sent.customer_email) && wantsEmail;

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
    await logEvent(estimate.lead_id, "estimate", `Estimate ${estimate.number} sent (${fmtMoney(sent.total_cents)})`);
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
    return { ok: true, notice: "This estimate is already approved." };
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

  await alertOwner(
    `Estimate ${approved.number} approved by ${approved.customer_name ?? signature} — ` +
      `${fmtMoney(approved.total_cents)}. A job was created; time to schedule.`,
  );
  await notifyEstimateApproved(approved);

  const withItems = await getEstimateWithItems(estimate.id);
  if (withItems) await createJobFromEstimate(withItems);

  const deposit = await createDepositLink(approved);
  refresh();
  return { ok: true, depositUrl: deposit.url };
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
  await alertOwner(
    `Estimate ${declined.number} declined by ${declined.customer_name ?? "customer"}${trimmed ? `: ${trimmed}` : "."}`,
  );
  await notifyEstimateDeclined(declined);
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

  const { data, error } = await db
    .from("jobs")
    .insert({
      estimate_id: estimate.id,
      lead_id: estimate.lead_id,
      contact_id: estimate.contact_id,
      status: "unscheduled",
      customer_name: estimate.customer_name,
      customer_phone: estimate.customer_phone,
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
  await armJobConfirmation(job, startIso);
  if (crew) await notifyCrewAssignment(job, crew.name, startIso);
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
  if (crew) await notifyCrewAssignment(job, crew.name, job.scheduled_at);
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

// Create a non-job calendar block (holiday / time off / note) — the lean
// "Create Event". Because jobs are born from estimates, we never need a
// "Create Work Order" form.
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
