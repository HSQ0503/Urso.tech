import { canesDb } from "@/lib/canes/supabase";
import { canesAutomationsEnabled } from "@/lib/canes/automations";
import { getLead, getSettings } from "@/lib/canes/data";
import { fillTemplate, nextAllowedSendTime, sendCanesSms } from "@/lib/canes/twilio";
import { fmtEt, type AutomationTask, type CanesSettings, type Lead } from "@/lib/canes/types";

export const LEAD_MESSAGE_KINDS = ["hold_text", "meta_intro", "confirmation", "manual_booking"] as const;
export type LeadMessageResult = "sent" | "deferred" | "canceled" | "failed" | "contested";

export function sameInstant(a: unknown, b: unknown): boolean {
  return typeof a === "string" && typeof b === "string" &&
    Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
}

export function currentAppointmentTask(task: AutomationTask, lead: Lead, now = Date.now()): boolean {
  return sameInstant(task.payload.appointment_at, lead.appointment_at) &&
    Date.parse(lead.appointment_at ?? "") > now;
}

export function leadMessageIsCurrent(task: AutomationTask, lead: Lead | null, now = Date.now()): boolean {
  if (!lead?.phone || lead.opted_out) return false;
  if (task.kind === "meta_intro") {
    return lead.source === "meta_ads" && lead.type === "cold" && lead.status === "new" &&
      !lead.first_contacted_at && lead.phone === task.payload.phone &&
      lead.meta_leadgen_id === task.payload.meta_leadgen_id &&
      sameInstant(task.payload.opportunity_started_at, lead.opportunity_started_at ?? lead.created_at);
  }
  if (task.kind === "hold_text") {
    return lead.type === "cold" && lead.status === "new" &&
      (!task.payload.opportunity_started_at ||
        sameInstant(task.payload.opportunity_started_at, lead.opportunity_started_at ?? lead.created_at));
  }
  if (!currentAppointmentTask(task, lead, now)) return false;
  if (task.kind === "manual_booking") {
    return lead.status === "confirmed" && sameInstant(task.payload.confirmed_at, lead.confirmed_at);
  }
  return task.kind === "confirmation" && lead.status === "appointment_set";
}

async function queueTask(row: {
  lead_id: string;
  kind: AutomationTask["kind"];
  dedupe_key: string;
  scheduled_for: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string; created: boolean }> {
  const db = canesDb();
  const { data, error } = await db.from("tasks")
    .upsert({ ...row, status: "pending" }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`Lead message could not be queued: ${error.message}`);
  if (data?.[0]) return { id: data[0].id, created: true };
  const existing = await db.from("tasks").select("id").eq("dedupe_key", row.dedupe_key).single();
  if (existing.error || !existing.data) throw new Error("Queued lead message could not be found.");
  return { id: existing.data.id, created: false };
}

export async function queueVirtualQuote(lead: Lead, settings: CanesSettings): Promise<void> {
  if (!lead.phone || lead.opted_out || lead.type !== "cold" || lead.status !== "new") return;
  const opportunity = new Date(lead.opportunity_started_at ?? lead.created_at).toISOString();
  const task = await queueTask({
    lead_id: lead.id,
    kind: "hold_text",
    dedupe_key: `hold_text:${lead.id}:${opportunity}`,
    scheduled_for: new Date().toISOString(),
    payload: { opportunity_started_at: opportunity },
  });
  await sendLeadMessageTask(task.id, settings);
}

export async function queueMetaIntro(leadId: string, leadgenId: string, submittedAt?: string): Promise<void> {
  const parsed = submittedAt ? Date.parse(submittedAt) : NaN;
  const { error } = await canesDb().rpc("queue_meta_intro", {
    p_lead_id: leadId,
    p_leadgen_id: leadgenId,
    p_submitted_at: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
  });
  if (error) throw new Error(`Meta introduction could not be queued: ${error.message}`);
}

export function metaIntroText(template: string, name: string | null, service: unknown): string {
  const selected = typeof service === "string" ? service.replace(/[_\s]+/g, " ").trim().slice(0, 120) : "";
  const person = name?.replace(/\s+/g, " ").trim() || null;
  return fillTemplate(template, { name: person }).replaceAll("{request}", selected ? `request for ${selected}` : "quote request");
}

async function metaIntroEligible(task: AutomationTask): Promise<boolean> {
  if (task.kind !== "meta_intro") return true;
  const { data, error } = await canesDb().rpc("meta_intro_is_eligible", { p_task_id: task.id });
  if (error) throw new Error(`Meta introduction eligibility failed: ${error.message}`);
  return data === true;
}

export async function drainMetaIntros(deadlineAt: number) {
  const db = canesDb();
  const { error: recoveryError } = await db.from("tasks").update({ status: "failed" })
    .eq("kind", "meta_intro").eq("status", "sending")
    .lt("scheduled_for", new Date(Date.now() - 10 * 60_000).toISOString());
  if (recoveryError) throw new Error(`Meta introduction recovery failed: ${recoveryError.message}`);
  if (!(await canesAutomationsEnabled("meta_intro"))) return { paused: true };
  const { data, error } = await db.from("tasks").select("*")
    .eq("kind", "meta_intro").eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true }).limit(25);
  if (error) throw new Error(`Meta introduction queue read failed: ${error.message}`);
  const settings = await getSettings();
  const results: Record<LeadMessageResult, number> = { sent: 0, deferred: 0, canceled: 0, failed: 0, contested: 0 };
  for (const task of (data ?? []) as AutomationTask[]) {
    if (Date.now() + 12_000 >= deadlineAt) break;
    results[await sendLeadMessageTask(task.id, settings)]++;
  }
  return results;
}

export async function upsertConfirmationTask(
  lead: Lead,
  settings: CanesSettings,
  immediate = false,
): Promise<boolean> {
  if (!lead.phone || lead.opted_out || lead.status !== "appointment_set" ||
    !lead.appointment_at || Date.parse(lead.appointment_at) <= Date.now()) return false;
  const appointment = new Date(lead.appointment_at);
  const when = appointment.toISOString();
  const firstAt = immediate ? Date.now() : Math.max(Date.now(), appointment.getTime() - settings.confirmation_offset_hours * 3_600_000);
  const task = await queueTask({
    lead_id: lead.id, kind: "confirmation", dedupe_key: `confirmation:${lead.id}:${when}`,
    scheduled_for: new Date(firstAt).toISOString(), payload: { appointment_at: when },
  });
  const finalAt = appointment.getTime() - settings.confirmation_final_offset_hours * 3_600_000;
  if (finalAt > Date.now() && finalAt < appointment.getTime()) {
    await queueTask({
      lead_id: lead.id, kind: "confirmation_final", dedupe_key: `confirmation_final:${lead.id}:${when}`,
      scheduled_for: new Date(finalAt).toISOString(), payload: { appointment_at: when },
    });
  }
  if (immediate) await sendLeadMessageTask(task.id, settings);
  return task.created;
}

// Immediate sends and cron compete for the same durable task. A webhook retry
// or repeated tap cannot create a second message for the same booking.
export async function sendLeadMessageTask(id: string, settings: CanesSettings): Promise<LeadMessageResult> {
  const db = canesDb();
  const now = new Date().toISOString();
  const { data, error } = await db.rpc("claim_lead_message_task", { p_task_id: id });
  if (error) throw new Error(`Lead message claim failed: ${error.message}`);
  if (!data?.[0]) {
    const existing = await db.from("tasks").select("status").eq("id", id).maybeSingle();
    return existing.data?.status === "failed" ? "failed" : "contested";
  }
  const task = data[0] as AutomationTask;
  const finish = async (status: AutomationTask["status"], payload = task.payload, scheduledFor = now) => {
    const result = await db.from("tasks").update({
      status, payload, scheduled_for: scheduledFor,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
    }).eq("id", id).eq("status", "sending");
    if (result.error) throw new Error(`Lead message result could not be recorded: ${result.error.message}`);
  };

  try {
    const lead = task.lead_id ? await getLead(task.lead_id) : null;
    if (!lead?.phone || !leadMessageIsCurrent(task, lead) || !(await metaIntroEligible(task))) {
      await finish("canceled");
      return "canceled";
    }
    const template = task.kind === "meta_intro" ? settings.templates.meta_intro : task.kind === "hold_text" ? settings.templates.hold_text :
      task.kind === "manual_booking" ? settings.templates.manual_booking : settings.templates.confirmation;
    const body = task.kind === "meta_intro" ? metaIntroText(template, lead.name, task.payload.service) : fillTemplate(template, {
      name: lead.name, when: fmtEt(lead.appointment_at), address: lead.address,
    });
    const result = await sendCanesSms({
      to: lead.phone, body, leadId: lead.id, automated: true,
      beforeSend: async () => {
        const [current, state] = await Promise.all([
          getLead(lead.id),
          db.from("tasks").select("status").eq("id", id).single(),
        ]);
        return state.data?.status === "sending" && current?.phone === lead.phone &&
          leadMessageIsCurrent(task, current) && await metaIntroEligible(task);
      },
    });
    if (result.skipped === "quiet_hours") {
      await finish("pending", task.payload, (nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000)).toISOString());
      return "deferred";
    }
    if (!result.ok) {
      const canceled = result.skipped === "This customer opted out of texts." || result.skipped === "superseded" || result.skipped === "Automations are paused.";
      await finish(canceled ? "canceled" : "failed", { ...task.payload, error: result.error ?? result.skipped ?? "SMS failed" });
      if (!canceled) await db.from("events").insert({
        lead_id: lead.id, kind: "automation", detail: "Automatic text failed. Review the inbox before sending again.",
      });
      return canceled ? "canceled" : "failed";
    }
    await finish("sent", { ...task.payload, twilio_sid: result.sid });
    await db.from("events").insert({
      lead_id: lead.id, kind: "automation",
      detail: task.kind === "meta_intro" ? "Meta quote introduction sent" : task.kind === "hold_text" ? "Virtual quote introduction sent" :
        task.kind === "manual_booking" ? "Confirmed booking notice sent" : "Appointment confirmation text sent",
    });
    if (task.kind === "confirmation") {
      await queueTask({
        lead_id: lead.id, kind: "no_reply_escalation", dedupe_key: `no_reply:${lead.id}:${task.payload.appointment_at}`,
        scheduled_for: new Date(Math.max(Date.now(), Date.parse(String(task.payload.appointment_at)) - 3 * 3_600_000)).toISOString(),
        payload: { appointment_at: task.payload.appointment_at },
      });
    }
    return "sent";
  } catch (error) {
    // A timeout may occur after Twilio accepted the message. Never replay an
    // uncertain send automatically; keep it visible for delivery review.
    await finish("failed", { ...task.payload, error: error instanceof Error ? error.message : "SMS outcome unknown" });
    console.error("[canes] lead message failed", id, error);
    return "failed";
  }
}

export async function bookManualAppointment(leadId: string, appointmentIso: string, settings: CanesSettings) {
  const { data, error } = await canesDb().rpc("book_lead_appointment_locked", {
    p_lead_id: leadId, p_appointment_at: appointmentIso,
  });
  if (error) return { ok: false, notice: "The appointment could not be saved. Please retry." };
  const result = data as { outcome: string; task_id: string | null; sms: string } | null;
  if (!result || result.outcome === "not_found") return { ok: false, notice: "Lead not found." };
  if (!result.task_id) return {
    ok: true,
    notice: result.sms === "no_phone" ? "Appointment confirmed. Add a phone number to send a booking text." :
      result.sms === "opted_out" ? "Appointment confirmed. This customer opted out of texts." :
      "Appointment confirmed. No text was sent for a past visit.",
  };
  let sent: LeadMessageResult;
  try {
    sent = await sendLeadMessageTask(result.task_id, settings);
  } catch (error) {
    console.error("[canes] booking saved; message dispatch unavailable", leadId, error);
    return { ok: true, notice: "Appointment confirmed. The booking text is queued, but delivery could not be checked. Review the inbox before retrying." };
  }
  return {
    ok: true,
    notice: sent === "sent" ? "Appointment confirmed. Booking text sent." :
      sent === "failed" ? "Appointment confirmed, but the booking text could not be sent. Check the inbox before retrying." :
      sent === "deferred" ? "Appointment confirmed. Booking text queued until texting hours." :
      "Appointment confirmed. The booking text is already queued, sent, or superseded.",
  };
}
