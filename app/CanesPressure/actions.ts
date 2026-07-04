"use server";

import { revalidatePath } from "next/cache";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings, getLead } from "@/lib/canes/data";
import { sendCanesSms, fillTemplate, canesTwilioCreds } from "@/lib/canes/twilio";
import { fmtEt, toE164, type LeadStatus, type LeadSource } from "@/lib/canes/types";

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
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.tech";
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
