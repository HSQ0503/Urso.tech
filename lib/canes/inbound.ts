import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings } from "@/lib/canes/data";
import {
  alertOwner,
  fillTemplate,
  isConfirmation,
  isOptOut,
  nextAllowedSendTime,
  sendCanesSms,
  validateSignature,
} from "@/lib/canes/twilio";
import { parseVendorMessage, type ParsedLead } from "@/lib/canes/parse";
import { notifyColdLead } from "@/lib/canes/notify";
import { fmtEt, fmtPhone, toE164 } from "@/lib/canes/types";
import type { CanesSettings, Job, Lead } from "@/lib/canes/types";

// The shared inbound-SMS pipeline. Both the Twilio webhook and the dev
// simulator funnel through processInboundSms so the routing rules (opt-out →
// vendor → known lead → organic) live in exactly one place.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export type InboundOutcome = {
  handled:
    | "unconfigured"
    | "opt_out"
    | "vendor"
    | "vendor_unparsed"
    | "confirmed"
    | "reply"
    | "new_lead";
  leadIds: string[];
  notes: string[];
};

export async function processInboundSms(params: {
  from: string;
  body: string;
  messageSid?: string;
  mediaUrls?: string[];
}): Promise<InboundOutcome> {
  const { body, messageSid, mediaUrls } = params;
  const from = toE164(params.from) ?? params.from;

  if (!canesConfigured()) {
    console.warn("[canes] inbound sms dropped: Canes Supabase is not configured");
    return { handled: "unconfigured", leadIds: [], notes: ["Canes Supabase is not configured; nothing stored."] };
  }

  // STOP always wins, no matter who sent it.
  if (isOptOut(body)) return handleOptOut(from, body, messageSid, mediaUrls);

  const settings = await getSettings();
  const vendorPhones = settings.lead_vendor_phones.filter(Boolean).map((p) => toE164(p) ?? p);
  if (vendorPhones.includes(from)) return handleVendorText(from, body, messageSid, mediaUrls, settings);

  const lead = await findLeadByPhone(from);
  if (lead) return handleLeadReply(lead, from, body, messageSid, mediaUrls, settings);

  return handleOrganicText(from, body, messageSid, mediaUrls);
}

// ── Branch a: opt-out ────────────────────────────────────────────────────────

async function handleOptOut(
  from: string,
  body: string,
  sid?: string,
  media?: string[],
): Promise<InboundOutcome> {
  const db = canesDb();
  let lead = await findLeadByPhone(from);
  if (lead) {
    await db
      .from("leads")
      .update({ opted_out: true, last_activity_at: new Date().toISOString() })
      .eq("id", lead.id);
  } else {
    // Unknown number: keep a stub lead so the opt-out is remembered. Future
    // vendor-parsed leads for this phone find it by phone and inherit the
    // flag, so no automation ever texts this number again.
    const { data, error } = await db
      .from("leads")
      .insert({
        phone: from,
        type: "cold",
        status: "lost",
        lost_reason: "Opted out",
        opted_out: true,
        source: "other",
      })
      .select("*")
      .single();
    if (error) console.error(`[canes] opt-out stub lead insert failed for ${from}: ${error.message}`);
    lead = (data as Lead | null) ?? null;
  }
  await storeInbound({ leadId: lead?.id ?? null, peer: from, body, sid, media });
  if (lead) await logLeadEvent(lead.id, "opt_out", "Customer texted STOP; automated texts disabled");
  console.log(`[canes] opt-out recorded for ${from}`);
  return { handled: "opt_out", leadIds: lead ? [lead.id] : [], notes: ["Opt-out recorded."] };
}

// ── Branch b: lead vendor text ───────────────────────────────────────────────

async function handleVendorText(
  from: string,
  body: string,
  sid: string | undefined,
  media: string[] | undefined,
  settings: CanesSettings,
): Promise<InboundOutcome> {
  // Store the raw blob first so nothing is lost if the parse fails.
  await storeInbound({ leadId: null, peer: from, body, sid, media });

  let parsed: ParsedLead[] = [];
  try {
    parsed = await parseVendorMessage(body);
  } catch (err) {
    console.error("[canes] vendor parse failed:", err);
  }

  if (parsed.length === 0) {
    await alertOwner("Vendor text needs manual review. Open the Canes inbox to triage.");
    console.warn(`[canes] vendor text from ${from} produced no leads; left for triage`);
    return { handled: "vendor_unparsed", leadIds: [], notes: ["No leads parsed; raw message kept for triage."] };
  }

  const outcome: InboundOutcome = { handled: "vendor", leadIds: [], notes: [] };
  for (const p of parsed) {
    try {
      const leadId = await upsertVendorLead(p, body, settings);
      if (leadId) outcome.leadIds.push(leadId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[canes] vendor lead handling failed:", msg);
      outcome.notes.push(msg);
    }
  }
  return outcome;
}

async function upsertVendorLead(
  p: ParsedLead,
  rawBody: string,
  settings: CanesSettings,
): Promise<string | null> {
  const db = canesDb();
  const apptIso =
    p.type === "hot" && p.appointment_iso && !Number.isNaN(new Date(p.appointment_iso).getTime())
      ? new Date(p.appointment_iso).toISOString()
      : null;

  let lead = p.phone_e164 ? await findLeadByPhone(p.phone_e164) : null;
  let created = false;

  if (lead) {
    // Vendor re-sent a number we know: only fill the blanks, never overwrite
    // details Sebastian may have corrected by hand.
    const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
    if (!lead.name && p.name) patch.name = p.name;
    if (!lead.address && p.address) patch.address = p.address;
    if (!lead.service && p.service) patch.service = p.service;
    if (!lead.notes && p.notes) patch.notes = p.notes;
    if (apptIso && !lead.appointment_at) {
      patch.appointment_at = apptIso;
      patch.status = "appointment_set";
    }
    const { error } = await db.from("leads").update(patch).eq("id", lead.id);
    if (error) throw new Error(`vendor lead update: ${error.message}`);
    lead = { ...lead, ...patch } as Lead;
    await logLeadEvent(lead.id, "parsed", "Vendor sent this lead again; missing details filled in");
  } else {
    const { data, error } = await db
      .from("leads")
      .insert({
        type: p.type,
        status: apptIso ? "appointment_set" : "new",
        name: p.name,
        phone: p.phone_e164,
        address: p.address,
        service: p.service,
        source: "lead_vendor",
        appointment_at: apptIso,
        notes: p.notes,
        raw_message: rawBody,
        parse_confidence: p.confidence,
      })
      .select("*")
      .single();
    if (error) throw new Error(`vendor lead insert: ${error.message}`);
    lead = data as Lead;
    created = true;
    await logLeadEvent(
      lead.id,
      "created",
      apptIso
        ? `Hot lead parsed from vendor text (visit ${fmtEt(apptIso)})`
        : "Cold lead parsed from vendor text",
    );
  }

  if (p.type === "hot" && lead.appointment_at) {
    await upsertConfirmationTask(lead, settings);
  }

  // Hold text + notifications only fire for brand-new cold leads; a re-sent
  // lead has already been greeted and alerted once.
  if (p.type === "cold" && created) {
    await sendHoldText(lead, settings);
    await notifyColdLead(lead);
    await alertOwner(
      `New quote request: ${lead.name ?? fmtPhone(lead.phone)} - ${lead.service ?? "service TBD"}. ` +
        `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
    );
  }
  return lead.id;
}

async function sendHoldText(lead: Lead, settings: CanesSettings): Promise<void> {
  if (!lead.phone || lead.opted_out) return;
  const body = fillTemplate(settings.templates.hold_text, { name: lead.name });
  const res = await sendCanesSms({ to: lead.phone, body, leadId: lead.id, automated: true });
  if (res.ok) {
    await logLeadEvent(lead.id, "automation", "Hold text sent");
    return;
  }
  if (res.skipped === "quiet_hours") {
    const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
    await canesDb()
      .from("tasks")
      .upsert(
        {
          lead_id: lead.id,
          kind: "hold_text",
          dedupe_key: `hold_text:${lead.id}`,
          scheduled_for: at.toISOString(),
          status: "pending",
          payload: {},
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    await logLeadEvent(lead.id, "automation", `Hold text queued for ${fmtEt(at.toISOString())} (quiet hours)`);
    return;
  }
  console.warn(`[canes] hold text not sent for lead ${lead.id}: ${res.skipped ?? res.error}`);
}

// Schedule the confirmation text at T-minus the configured offset, clamped to
// now for near-term appointments. Insert-only on dedupe_key so a task that
// already ran is never resurrected to pending. Returns true if newly created.
export async function upsertConfirmationTask(lead: Lead, settings: CanesSettings): Promise<boolean> {
  if (!canesConfigured() || !lead.phone || !lead.appointment_at || lead.opted_out) return false;
  const appt = new Date(lead.appointment_at);
  const sendAt = new Date(appt.getTime() - settings.confirmation_offset_hours * 3_600_000);
  const { data, error } = await canesDb()
    .from("tasks")
    .upsert(
      {
        lead_id: lead.id,
        kind: "confirmation",
        dedupe_key: `confirmation:${lead.id}:${appt.toISOString()}`,
        scheduled_for: (sendAt.getTime() < Date.now() ? new Date() : sendAt).toISOString(),
        status: "pending",
        payload: { appointment_at: appt.toISOString() },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error(`[canes] confirmation task upsert failed for lead ${lead.id}: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// ── Branch c: reply from a known lead ────────────────────────────────────────

async function handleLeadReply(
  lead: Lead,
  from: string,
  body: string,
  sid: string | undefined,
  media: string[] | undefined,
  settings: CanesSettings,
): Promise<InboundOutcome> {
  const db = canesDb();
  await storeInbound({ leadId: lead.id, peer: from, body, sid, media });

  if (isConfirmation(body) && lead.status === "appointment_set") {
    const now = new Date().toISOString();
    await db
      .from("leads")
      .update({ status: "confirmed", confirmed_at: now, last_activity_at: now })
      .eq("id", lead.id);
    await db
      .from("tasks")
      .update({ status: "canceled" })
      .eq("lead_id", lead.id)
      .eq("kind", "no_reply_escalation")
      .eq("status", "pending");
    const ack = fillTemplate(settings.templates.confirmation_ack, {
      name: lead.name,
      when: fmtEt(lead.appointment_at),
    });
    await sendCanesSms({ to: from, body: ack, leadId: lead.id, automated: true, force: true });
    await logLeadEvent(lead.id, "confirmed", "Customer replied YES");
    console.log(`[canes] appointment confirmed by ${from}`);
    return { handled: "confirmed", leadIds: [lead.id], notes: ["Appointment confirmed."] };
  }

  // No pending estimate visit to confirm (D4: the visit path above always
  // wins). A YES here confirms the soonest upcoming scheduled job — the one the
  // day-before text was about. Flip jobs.status → confirmed + confirmed_at.
  if (isConfirmation(body)) {
    const { data: jobRow } = await db
      .from("jobs")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const job = jobRow as Job | null;
    if (job) {
      const now = new Date().toISOString();
      await db
        .from("jobs")
        .update({ status: "confirmed", confirmed_at: now })
        .eq("id", job.id)
        .eq("status", "scheduled");
      await db
        .from("leads")
        .update({ last_activity_at: now })
        .eq("id", lead.id);
      const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
      const ack =
        `Thanks${firstName}! You're confirmed for ${fmtEt(job.scheduled_at)}. ` +
        `See you then! - Canes Pressure Washing. Reply STOP to opt out.`;
      await sendCanesSms({ to: from, body: ack, leadId: lead.id, automated: true, force: true });
      await logLeadEvent(lead.id, "confirmed", "Customer confirmed the scheduled job");
      console.log(`[canes] job confirmed by ${from}`);
      return { handled: "confirmed", leadIds: [lead.id], notes: ["Job confirmed."] };
    }
  }

  await logLeadEvent(lead.id, "replied", body.length > 120 ? `${body.slice(0, 117)}...` : body);
  await db.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", lead.id);
  // A known customer asking a question must never sit unseen until the inbox is
  // opened — alert Sebastian the same way an unknown number does. The YES paths
  // above already ack + return, so confirmations never double-ping him.
  const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body;
  await alertOwner(
    `Reply from ${lead.name ?? fmtPhone(lead.phone)}: ${preview} ` +
      `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
  );
  return { handled: "reply", leadIds: [lead.id], notes: [] };
}

// ── Branch d: organic text from an unknown number ────────────────────────────

async function handleOrganicText(
  from: string,
  body: string,
  sid?: string,
  media?: string[],
): Promise<InboundOutcome> {
  const lead = await createOrganicLead(from, { via: "text", context: body });
  await storeInbound({ leadId: lead?.id ?? null, peer: from, body, sid, media });
  return {
    handled: "new_lead",
    leadIds: lead ? [lead.id] : [],
    notes: ["Cold lead created from an unknown number."],
  };
}

// Unknown numbers become cold leads so nothing ever sits unanswered. Shared
// with the voice webhook (missed call from a new number = same treatment).
export async function createOrganicLead(
  phone: string,
  opts: { via: "text" | "call"; context?: string },
): Promise<Lead | null> {
  if (!canesConfigured()) return null;
  const { data, error } = await canesDb()
    .from("leads")
    .insert({
      type: "cold",
      status: "new",
      source: "other",
      name: null,
      phone,
      raw_message: opts.context ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error(`[canes] organic lead insert failed for ${phone}: ${error.message}`);
    return null;
  }
  const lead = data as Lead;
  await logLeadEvent(
    lead.id,
    "created",
    opts.via === "call" ? "Lead created from a missed call" : "Lead created from an inbound text",
  );
  await notifyColdLead(lead);
  await alertOwner(
    `New lead from ${fmtPhone(lead.phone)} (${opts.via === "call" ? "missed call" : "inbound text"}). ` +
      `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
  );
  return lead;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  if (!canesConfigured()) return null;
  const { data } = await canesDb().from("leads").select("*").eq("phone", phone).maybeSingle();
  return (data as Lead | null) ?? null;
}

export async function logLeadEvent(leadId: string, kind: string, detail: string): Promise<void> {
  if (!canesConfigured()) return;
  await canesDb().from("events").insert({ lead_id: leadId, kind, detail });
}

async function storeInbound(p: {
  leadId: string | null;
  peer: string;
  body: string;
  sid?: string;
  media?: string[];
}): Promise<void> {
  const { error } = await canesDb().from("messages").insert({
    lead_id: p.leadId,
    peer_phone: p.peer,
    direction: "in",
    body: p.body,
    media_urls: p.media ?? [],
    automated: false,
    twilio_sid: p.sid ?? null,
  });
  if (error) console.error(`[canes] inbound message insert failed: ${error.message}`);
}

// Shared by the Twilio webhook routes. Twilio signs the externally visible
// URL; Vercel terminates TLS ahead of the function, so rebuild it from
// NEXT_PUBLIC_APP_URL rather than trusting req.url's host. No auth token set
// (Twilio not wired up yet) → let requests through, e.g. local testing.
export function verifyTwilioRequest(req: Request, params: Record<string, string>): boolean {
  const token = process.env.CANES_TWILIO_AUTH_TOKEN;
  if (!token) return true;
  const u = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? u.origin).replace(/\/$/, "");
  return validateSignature(
    token,
    req.headers.get("x-twilio-signature"),
    base + u.pathname + u.search,
    params,
  );
}
