import { createHash } from "node:crypto";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings } from "@/lib/canes/data";
import {
  alertOwner,
  fillTemplate,
  isConfirmation,
  isOptIn,
  isOptOut,
  sendCanesSms,
  validateSignature,
} from "@/lib/canes/twilio";
import { queueVirtualQuote, upsertConfirmationTask } from "@/lib/canes/lead-messaging";
export { upsertConfirmationTask } from "@/lib/canes/lead-messaging";
import { parseVendorMessage, type ParsedLead } from "@/lib/canes/parse";
import { notifyColdLead } from "@/lib/canes/notify";
import {
  pushCustomerJobChangeRequest,
  pushCustomerMessage,
  pushNewLead,
} from "@/lib/canes/push-events";
import { fmtEt, fmtPhone, toE164 } from "@/lib/canes/types";
import type { CanesSettings, Job, Lead } from "@/lib/canes/types";

// The shared inbound-SMS pipeline. Both the Twilio webhook and the dev
// simulator funnel through processInboundSms so the routing rules
// (subscription keyword → vendor → known lead → organic) live in one place.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export type InboundOutcome = {
  handled:
    | "unconfigured"
    | "opt_out"
    | "opt_in"
    | "vendor"
    | "vendor_unparsed"
    | "confirmed"
    | "reply"
    | "new_lead"
    | "duplicate"
    | "in_progress"
    | "conflict";
  leadIds: string[];
  notes: string[];
};

type InboundRoute = "opt_out" | "vendor" | "known_lead" | "organic";
type InboundRouteContext = {
  kind?: "appointment_confirmation" | "job_confirmation" | "opt_in" | "reply";
  jobId?: string;
  appointmentAt?: string | null;
  jobScheduledAt?: string | null;
};

type InboundClaim = {
  state: "acquired" | "completed" | "in_progress" | "conflict";
  route?: InboundRoute | null;
  route_context?: InboundRouteContext | null;
  lead_id?: string | null;
  outcome?: InboundOutcome | null;
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

  // The simulator has no provider event ID, so it intentionally uses the
  // direct path. Every real Twilio delivery has a MessageSid and is claimed
  // before classification or storage. Persisting the route is the important
  // detail: if an organic text creates a lead and the webhook is retried, the
  // retry remains "organic" instead of becoming a known-customer reply.
  if (messageSid) {
    const payloadHash = createHash("sha256")
      .update(JSON.stringify({ from, body, mediaUrls: mediaUrls ?? [] }))
      .digest("hex");
    const db = canesDb();
    const { data, error } = await db.rpc("claim_inbound_sms", {
      p_message_sid: messageSid,
      p_payload_hash: payloadHash,
      p_lease_seconds: 600,
    });
    if (error) throw new Error(`inbound SMS claim failed: ${error.message}`);
    const claim = data as InboundClaim;

    if (claim.state === "completed") {
      return claim.outcome ?? {
        handled: "duplicate",
        leadIds: claim.lead_id ? [claim.lead_id] : [],
        notes: ["Message was already completed."],
      };
    }
    if (claim.state === "in_progress") {
      return { handled: "in_progress", leadIds: claim.lead_id ? [claim.lead_id] : [], notes: ["Message is already processing."] };
    }
    if (claim.state === "conflict") {
      console.error(`[canes] Twilio MessageSid ${messageSid} was reused with a different payload`);
      return { handled: "conflict", leadIds: [], notes: ["MessageSid payload mismatch rejected."] };
    }

    try {
      let route = claim.route ?? null;
      let routeLeadId = claim.lead_id ?? null;
      let routeContext = claim.route_context ?? {};
      let settings: CanesSettings | null = null;

      if (!route) {
        if (isOptOut(body)) {
          route = "opt_out";
          routeLeadId = (await findLeadByPhone(from))?.id ?? null;
        } else if (isOptIn(body)) {
          const lead = await findLeadByPhone(from);
          route = lead ? "known_lead" : "organic";
          routeLeadId = lead?.id ?? null;
          routeContext = { kind: "opt_in" };
        } else {
          settings = await getSettings();
          const vendorPhones = settings.lead_vendor_phones
            .filter(Boolean)
            .map((p) => toE164(p) ?? p);
          if (vendorPhones.includes(from)) {
            route = "vendor";
          } else {
            const lead = await findLeadByPhone(from);
            route = lead ? "known_lead" : "organic";
            routeLeadId = lead?.id ?? null;
            if (lead) {
              if (isConfirmation(body) && lead.status === "appointment_set") {
                routeContext = {
                  kind: "appointment_confirmation",
                  appointmentAt: lead.appointment_at,
                };
              } else if (isConfirmation(body)) {
                const { data: job, error: jobError } = await db
                  .from("jobs")
                  .select("id, scheduled_at")
                  .eq("lead_id", lead.id)
                  .eq("status", "scheduled")
                  .gte("scheduled_at", new Date().toISOString())
                  .order("scheduled_at", { ascending: true, nullsFirst: false })
                  .limit(1)
                  .maybeSingle();
                if (jobError) throw new Error(`confirmation job lookup failed: ${jobError.message}`);
                routeContext = job?.id
                  ? {
                      kind: "job_confirmation",
                      jobId: String(job.id),
                      jobScheduledAt: typeof job.scheduled_at === "string" ? job.scheduled_at : null,
                    }
                  : { kind: "reply" };
              } else {
                routeContext = { kind: "reply" };
              }
            }
          }
        }

        const { data: pinned, error: pinError } = await db.rpc("set_inbound_sms_route", {
          p_message_sid: messageSid,
          p_payload_hash: payloadHash,
          p_route: route,
          p_lead_id: routeLeadId,
          p_route_context: routeContext,
        });
        if (pinError) throw new Error(`inbound SMS route pin failed: ${pinError.message}`);
        route = (pinned as { route: InboundRoute }).route;
        routeLeadId = (pinned as { lead_id?: string | null }).lead_id ?? null;
        routeContext = (pinned as { route_context?: InboundRouteContext }).route_context ?? {};
      }

      // Store the raw message while its pinned classification still reflects
      // the pre-mutation database state. Handler calls below safely attach the
      // final lead ID to this same row through inbound_dedupe_key.
      await storeInbound({ leadId: routeLeadId, peer: from, body, sid: messageSid, media: mediaUrls });

      let outcome: InboundOutcome;
      if (routeContext.kind === "opt_in") {
        outcome = await handleOptIn(from, body, messageSid, mediaUrls, routeLeadId);
      } else if (route === "opt_out") {
        outcome = await handleOptOut(from, body, messageSid, mediaUrls);
      } else if (route === "vendor") {
        outcome = await handleVendorText(
          from,
          body,
          messageSid,
          mediaUrls,
          settings ?? (await getSettings()),
        );
      } else if (route === "known_lead") {
        const lead = routeLeadId ? await findLeadById(routeLeadId) : null;
        if (!lead) {
          outcome = {
            handled: "duplicate",
            leadIds: [],
            notes: ["The lead pinned to this message no longer exists."],
          };
        } else {
          outcome = await handleLeadReply(
            lead,
            from,
            body,
            messageSid,
            mediaUrls,
            settings ?? (await getSettings()),
            routeContext,
          );
        }
      } else {
        outcome = await handleOrganicText(
          from,
          body,
          messageSid,
          mediaUrls,
          routeLeadId,
          payloadHash,
        );
      }

      const { error: finishError } = await db.rpc("finish_inbound_sms", {
        p_message_sid: messageSid,
        p_payload_hash: payloadHash,
        p_outcome: outcome,
        p_error: null,
      });
      if (finishError) throw new Error(`inbound SMS completion failed: ${finishError.message}`);
      return outcome;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const { error: finishError } = await db.rpc("finish_inbound_sms", {
        p_message_sid: messageSid,
        p_payload_hash: payloadHash,
        p_outcome: null,
        p_error: message,
      });
      if (finishError) console.error(`[canes] failed to release inbound SMS claim: ${finishError.message}`);
      throw caught;
    }
  }

  // STOP always wins, no matter who sent it.
  if (isOptOut(body)) return handleOptOut(from, body, messageSid, mediaUrls);
  if (isOptIn(body)) return handleOptIn(from, body, messageSid, mediaUrls);

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
    const { error } = await db
      .from("leads")
      .update({ opted_out: true, last_activity_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (error) throw new Error(`opt-out update failed: ${error.message}`);
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
    if (error?.code === "23505") {
      lead = await findLeadByPhone(from);
      if (!lead) throw new Error(`opt-out lead race recovery failed for ${from}`);
      const { error: updateError } = await db
        .from("leads")
        .update({ opted_out: true, status: "lost", lost_reason: "Opted out" })
        .eq("id", lead.id);
      if (updateError) throw new Error(`opt-out race update failed: ${updateError.message}`);
    } else if (error) {
      throw new Error(`opt-out stub lead insert failed: ${error.message}`);
    } else {
      lead = (data as Lead | null) ?? null;
    }
  }
  const messageId = await storeInbound({ leadId: lead?.id ?? null, peer: from, body, sid, media });
  if (lead && messageId) {
    await pushCustomerMessage({
      messageId: sid ?? messageId,
      peerPhone: from,
      displayName: lead.name,
      optOut: true,
    });
  }
  if (lead) {
    await logLeadEvent(
      lead.id,
      "opt_out",
      "Customer texted STOP; automated texts disabled",
      sid ? `sms:${sid}:opt_out` : undefined,
    );
  }
  console.log(`[canes] opt-out recorded for ${from}`);
  return { handled: "opt_out", leadIds: lead ? [lead.id] : [], notes: ["Opt-out recorded."] };
}

async function handleOptIn(
  from: string,
  body: string,
  sid?: string,
  media?: string[],
  pinnedLeadId?: string | null,
): Promise<InboundOutcome> {
  const db = canesDb();
  let lead = pinnedLeadId ? await findLeadById(pinnedLeadId) : await findLeadByPhone(from);
  if (lead) {
    const restoreOptOutStub = lead.status === "lost" && lead.lost_reason === "Opted out";
    const { data, error } = await db
      .from("leads")
      .update({
        opted_out: false,
        last_activity_at: new Date().toISOString(),
        ...(restoreOptOutStub ? { status: "new", lost_reason: null } : {}),
      })
      .eq("id", lead.id)
      .select("*")
      .single();
    if (error) throw new Error(`opt-in update failed: ${error.message}`);
    lead = data as Lead;
  }

  const messageId = await storeInbound({ leadId: lead?.id ?? null, peer: from, body, sid, media });
  if (lead && messageId) {
    await pushCustomerMessage({
      messageId: sid ?? messageId,
      peerPhone: from,
      displayName: lead.name,
    });
    await logLeadEvent(
      lead.id,
      "opt_in",
      "Customer texted START; automated texts enabled",
      sid ? `sms:${sid}:opt_in` : undefined,
    );
  }
  console.log(`[canes] opt-in recorded for ${from}`);
  return { handled: "opt_in", leadIds: lead ? [lead.id] : [], notes: ["Opt-in recorded."] };
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
  const vendorMessageId = await storeInbound({ leadId: null, peer: from, body, sid, media });

  let parsed: ParsedLead[] = [];
  try {
    parsed = await parseVendorMessage(body);
  } catch (err) {
    console.error("[canes] vendor parse failed:", err);
  }

  if (parsed.length === 0) {
    if (vendorMessageId) {
      await pushCustomerMessage({
        messageId: sid ?? vendorMessageId,
        peerPhone: from,
        displayName: "Lead vendor",
        vendorReview: true,
      });
    }
    await runInboundEffect(sid, "vendor-unparsed-owner-alert", async () => {
      const result = await alertOwner("Vendor text needs manual review. Open the Canes inbox to triage.");
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
    });
    console.warn(`[canes] vendor text from ${from} produced no leads; left for triage`);
    return { handled: "vendor_unparsed", leadIds: [], notes: ["No leads parsed; raw message kept for triage."] };
  }

  const outcome: InboundOutcome = { handled: "vendor", leadIds: [], notes: [] };
  for (const [index, p] of parsed.entries()) {
    try {
      const leadId = await upsertVendorLead(p, body, settings, sid, index);
      if (leadId) outcome.leadIds.push(leadId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[canes] vendor lead handling failed:", msg);
      outcome.notes.push(msg);
    }
  }
  if (outcome.notes.length > 0) {
    throw new Error(`vendor lead processing incomplete: ${outcome.notes.join("; ")}`);
  }
  return outcome;
}

async function upsertVendorLead(
  p: ParsedLead,
  rawBody: string,
  settings: CanesSettings,
  messageSid?: string,
  parsedIndex = 0,
): Promise<string | null> {
  const db = canesDb();
  // An AI fallback must not turn "morning" into an invented appointment time.
  const explicitTime = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b/i.test(rawBody);
  const reliable = Boolean(p.phone_e164) && p.confidence >= 0.8;
  const apptIso =
    reliable && explicitTime && p.type === "hot" && p.appointment_iso &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(p.appointment_iso) &&
    Number.isFinite(Date.parse(p.appointment_iso)) && Date.parse(p.appointment_iso) > Date.now()
      ? new Date(p.appointment_iso).toISOString()
      : null;

  const creationSourceKey = messageSid
    ? `sms:${messageSid}:vendor:${parsedIndex}:created`
    : null;
  let lead = p.phone_e164 ? await findLeadByPhone(p.phone_e164) : null;
  let created = false;
  let createdEventId: string | null = null;
  let recoveredCreation = false;
  // A prior attempt may have committed the lead + creation event and then
  // lost its response before the push outbox was persisted. Treat that exact
  // SID/source key as an unfinished creation, not an ordinary vendor resend;
  // every downstream effect is independently idempotent.
  if (creationSourceKey) {
    const { data: priorCreation, error: priorCreationError } = await db
      .from("events")
      .select("id, lead_id")
      .eq("source_key", creationSourceKey)
      .maybeSingle();
    if (priorCreationError) throw new Error(`vendor creation recovery: ${priorCreationError.message}`);
    if (typeof priorCreation?.id === "string" && typeof priorCreation.lead_id === "string") {
      const { data: recoveredLead, error: recoveredLeadError } = await db
        .from("leads")
        .select("*")
        .eq("id", priorCreation.lead_id)
        .maybeSingle();
      if (recoveredLeadError) throw new Error(`vendor lead recovery: ${recoveredLeadError.message}`);
      if (!recoveredLead) throw new Error("vendor creation event points to a missing lead");
      lead = recoveredLead as Lead;
      created = true;
      createdEventId = priorCreation.id;
      recoveredCreation = true;
    }
  }

  if (!recoveredCreation && lead && ["won", "lost"].includes(lead.status)) {
    // The vendor sent a number whose pipeline already finished — that's a NEW
    // opportunity, not a re-send. One card per number (phone is UNIQUE and
    // threads key on it), so reopen the card with the new ask.
    const opportunityStartedAt = new Date().toISOString();
    const patch: Record<string, unknown> = {
      type: p.type,
      status: apptIso ? "appointment_set" : "new",
      name: p.name ?? lead.name,
      address: p.address ?? lead.address,
      service: p.service ?? null,
      notes: p.notes ?? lead.notes,
      source: "lead_vendor",
      appointment_at: apptIso,
      confirmed_at: null,
      lost_reason: null,
      snoozed_until: null,
      raw_message: rawBody,
      parse_confidence: p.confidence,
      last_activity_at: opportunityStartedAt,
      opportunity_started_at: opportunityStartedAt,
    };
    const { error } = await db.from("leads").update(patch).eq("id", lead.id);
    if (error) throw new Error(`vendor lead reopen: ${error.message}`);
    lead = { ...lead, ...patch } as Lead;
    // Fresh opportunity: greet + notify exactly like a brand-new lead.
    created = true;
    createdEventId = await logLeadEvent(
      lead.id,
      "created",
      `Vendor sent a new inquiry for this number; lead reopened${p.name ? ` for ${p.name}` : ""}`,
      messageSid ? `sms:${messageSid}:vendor:${parsedIndex}:created` : undefined,
    );
  } else if (!recoveredCreation && lead) {
    // Vendor re-sent a number with an ACTIVE lead: only fill the blanks, never
    // overwrite details Sebastian may have corrected by hand.
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

    const newName = p.name?.trim();
    const oldName = lead.name?.trim();
    if (newName && oldName && newName.toLowerCase() !== oldName.toLowerCase()) {
      const matchedLead = lead;
      // Different person, same number, mid-pipeline — never clobber the active
      // lead, but never swallow it silently either: timeline + page the owner.
      await logLeadEvent(
        lead.id,
        "parsed",
        `Vendor sent a new lead for this number under a different name: ${newName} (${p.service ?? "service TBD"})`,
        messageSid ? `sms:${messageSid}:vendor:${parsedIndex}:different-name` : undefined,
      );
      await runInboundEffect(messageSid, `vendor-${parsedIndex}-different-name-alert`, async () => {
        const result = await alertOwner(
          `Heads up: vendor sent a new lead (${newName} - ${p.service ?? "service TBD"}) but ` +
            `${fmtPhone(matchedLead.phone)} already belongs to ${oldName}. ` +
            `Open: ${APP_URL}/CanesPressure/leads/${matchedLead.id}`,
        );
        if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
      });
    } else {
      await logLeadEvent(
        lead.id,
        "parsed",
        "Vendor sent this lead again; missing details filled in",
        messageSid ? `sms:${messageSid}:vendor:${parsedIndex}:parsed` : undefined,
      );
    }
  } else if (!recoveredCreation) {
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
    createdEventId = await logLeadEvent(
      lead.id,
      "created",
      apptIso
        ? `Hot lead parsed from vendor text (visit ${fmtEt(apptIso)})`
        : "Cold lead parsed from vendor text",
      messageSid ? `sms:${messageSid}:vendor:${parsedIndex}:created` : undefined,
    );
  }

  if (!lead) throw new Error("vendor lead was not created or recovered");

  if (!reliable || (p.type === "hot" && !apptIso)) {
    await logLeadEvent(lead.id, "parsed", "Vendor lead needs review before an automatic text can be sent.",
      messageSid ? `sms:${messageSid}:vendor:${parsedIndex}:review` : undefined);
    await runInboundEffect(messageSid, `vendor-${parsedIndex}-review`, async () => {
      const result = await alertOwner("A vendor lead needs its phone number or appointment details checked. Open the Canes inbox.");
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
    });
  }

  if (reliable && apptIso && p.type === "hot" && lead.appointment_at) {
    await upsertConfirmationTask(lead, settings, true);
  }

  if (created) await pushNewLead(lead, "new_lead", createdEventId);

  // Hold text + notifications only fire for brand-new cold leads; a re-sent
  // lead has already been greeted and alerted once.
  if (p.type === "cold" && created && reliable) {
    await runInboundEffect(messageSid, `vendor-${parsedIndex}-hold-text`, async () => {
      await queueVirtualQuote(lead, settings);
    });
    await runInboundEffect(messageSid, `vendor-${parsedIndex}-owner-email`, async () => {
      await notifyColdLead(lead, messageSid ? `${messageSid}-${parsedIndex}` : createdEventId ?? lead.id);
    });
    await runInboundEffect(messageSid, `vendor-${parsedIndex}-owner-sms`, async () => {
      const result = await alertOwner(
        `New quote request: ${lead.name ?? fmtPhone(lead.phone)} - ${lead.service ?? "service TBD"}. ` +
          `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      );
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
    });
  }
  return lead.id;
}

// ── Branch c: reply from a known lead ────────────────────────────────────────

async function handleLeadReply(
  lead: Lead,
  from: string,
  body: string,
  sid: string | undefined,
  media: string[] | undefined,
  settings: CanesSettings,
  routeContext?: InboundRouteContext,
): Promise<InboundOutcome> {
  const db = canesDb();
  const messageId = await storeInbound({ leadId: lead.id, peer: from, body, sid, media });
  const scheduleRequest = looksLikeScheduleRequest(body);
  if (messageId) {
    await pushCustomerMessage({
      messageId: sid ?? messageId,
      peerPhone: from,
      displayName: lead.name,
      rescheduleRequest: scheduleRequest,
    });
    if (scheduleRequest) {
      await notifyUpcomingJobChangeRequest(lead, sid ?? messageId, body);
    }
  }

  const staleConfirmation = async (detail: string): Promise<InboundOutcome> => {
    await logLeadEvent(
      lead.id,
      "confirmation_stale",
      detail,
      sid ? `sms:${sid}:confirmation-stale` : undefined,
    );
    await runInboundEffect(sid, "stale-confirmation-owner-alert", async () => {
      const result = await alertOwner(
        `${lead.name ?? fmtPhone(lead.phone)} replied YES, but the appointment/job changed before confirmation could be applied. ` +
          `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      );
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
    });
    return { handled: "reply", leadIds: [lead.id], notes: [detail] };
  };

  const appointmentConfirmation = routeContext?.kind
    ? routeContext.kind === "appointment_confirmation"
    : isConfirmation(body) && lead.status === "appointment_set";
  if (appointmentConfirmation) {
    if (sid && routeContext?.kind === "appointment_confirmation") {
      if (!routeContext.appointmentAt) {
        return staleConfirmation("Pinned appointment had no scheduled timestamp.");
      }
      const { data: confirmationState, error: confirmationError } = await db.rpc(
        "confirm_inbound_appointment",
        {
          p_message_sid: sid,
          p_lead_id: lead.id,
          p_expected_at: routeContext.appointmentAt,
        },
      );
      if (confirmationError) {
        throw new Error(`appointment confirmation failed: ${confirmationError.message}`);
      }
      if (confirmationState === "stale") {
        return staleConfirmation("Appointment was canceled, rescheduled, or already changed.");
      }
    } else {
      const now = new Date().toISOString();
      const { data: confirmedLead, error: confirmError } = await db
        .from("leads")
        .update({ status: "confirmed", confirmed_at: now, last_activity_at: now })
        .eq("id", lead.id)
        .eq("status", "appointment_set")
        .select("id")
        .maybeSingle();
      if (confirmError) throw new Error(`appointment confirmation failed: ${confirmError.message}`);
      if (!confirmedLead) {
        return staleConfirmation("Appointment was canceled, rescheduled, or already changed.");
      }
      const { error: cancelTaskError } = await db
        .from("tasks")
        .update({ status: "canceled" })
        .eq("lead_id", lead.id)
        .eq("kind", "no_reply_escalation")
        .eq("status", "pending");
      if (cancelTaskError) {
        throw new Error(`confirmation task cancellation failed: ${cancelTaskError.message}`);
      }
    }
    const ack = fillTemplate(settings.templates.confirmation_ack, {
      name: lead.name,
      when: fmtEt(routeContext?.appointmentAt ?? lead.appointment_at),
    });
    await runInboundEffect(sid, "appointment-confirmation-ack", async () => {
      const result = await sendCanesSms({
        to: from,
        body: ack,
        leadId: lead.id,
        automated: true,
        force: true,
      });
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Confirmation SMS failed");
    });
    if (!sid || routeContext?.kind !== "appointment_confirmation") {
      await logLeadEvent(lead.id, "confirmed", "Customer replied YES");
    }
    console.log(`[canes] appointment confirmed by ${from}`);
    return { handled: "confirmed", leadIds: [lead.id], notes: ["Appointment confirmed."] };
  }

  // No pending estimate visit to confirm (D4: the visit path above always
  // wins). A YES here confirms the soonest upcoming scheduled job — the one the
  // day-before text was about. Flip jobs.status → confirmed + confirmed_at.
  const jobConfirmation = routeContext?.kind
    ? routeContext.kind === "job_confirmation"
    : isConfirmation(body);
  if (jobConfirmation) {
    if (sid && routeContext?.kind === "job_confirmation") {
      if (!routeContext.jobId || !routeContext.jobScheduledAt) {
        return staleConfirmation("Pinned job had incomplete scheduling details.");
      }
      const { data: confirmationState, error: confirmationError } = await db.rpc(
        "confirm_inbound_job",
        {
          p_message_sid: sid,
          p_lead_id: lead.id,
          p_job_id: routeContext.jobId,
          p_expected_at: routeContext.jobScheduledAt,
        },
      );
      if (confirmationError) throw new Error(`job confirmation failed: ${confirmationError.message}`);
      if (confirmationState === "stale") {
        return staleConfirmation("Job was canceled, rescheduled, or already changed.");
      }

      const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
      const ack =
        `Thanks${firstName}! You're confirmed for ${fmtEt(routeContext.jobScheduledAt)}. ` +
        `See you then! - Canes Pressure Washing. Reply STOP to opt out.`;
      await runInboundEffect(sid, "job-confirmation-ack", async () => {
        const result = await sendCanesSms({
          to: from,
          body: ack,
          leadId: lead.id,
          automated: true,
          force: true,
        });
        if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Confirmation SMS failed");
      });
      console.log(`[canes] job confirmed by ${from}`);
      return { handled: "confirmed", leadIds: [lead.id], notes: ["Job confirmed."] };
    }

    let jobQuery = db.from("jobs").select("*");
    if (routeContext?.jobId) {
      jobQuery = jobQuery.eq("id", routeContext.jobId);
    } else {
      jobQuery = jobQuery
        .eq("lead_id", lead.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true, nullsFirst: false });
    }
    const { data: jobRow, error: jobLookupError } = await jobQuery.limit(1).maybeSingle();
    if (jobLookupError) throw new Error(`confirmation job lookup failed: ${jobLookupError.message}`);
    const job = jobRow as Job | null;
    if (job) {
      const expectedScheduledAt = routeContext?.jobScheduledAt ?? job.scheduled_at;
      if (!expectedScheduledAt) {
        return staleConfirmation("Pinned job had no scheduled timestamp.");
      }
      const now = new Date().toISOString();
      const { data: confirmedJob, error: jobConfirmError } = await db
        .from("jobs")
        .update({ status: "confirmed", confirmed_at: now })
        .eq("id", job.id)
        .eq("lead_id", lead.id)
        .eq("status", "scheduled")
        .eq("scheduled_at", expectedScheduledAt)
        .select("*")
        .maybeSingle();
      if (jobConfirmError) throw new Error(`job confirmation failed: ${jobConfirmError.message}`);
      if (!confirmedJob) {
        return staleConfirmation("Job was canceled, rescheduled, or already changed.");
      }
      const { error: leadActivityError } = await db
        .from("leads")
        .update({ last_activity_at: now })
        .eq("id", lead.id);
      if (leadActivityError) throw new Error(`confirmation activity update failed: ${leadActivityError.message}`);
      const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
      const ack =
        `Thanks${firstName}! You're confirmed for ${fmtEt(expectedScheduledAt)}. ` +
        `See you then! - Canes Pressure Washing. Reply STOP to opt out.`;
      await runInboundEffect(sid, "job-confirmation-ack", async () => {
        const result = await sendCanesSms({
          to: from,
          body: ack,
          leadId: lead.id,
          automated: true,
          force: true,
        });
        if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Confirmation SMS failed");
      });
      await logLeadEvent(
        lead.id,
        "confirmed",
        "Customer confirmed the scheduled job",
        sid ? `sms:${sid}:job-confirmed:${job.id}` : undefined,
      );
      console.log(`[canes] job confirmed by ${from}`);
      return { handled: "confirmed", leadIds: [lead.id], notes: ["Job confirmed."] };
    }
    if (routeContext?.kind === "job_confirmation") {
      return staleConfirmation("Pinned job no longer exists.");
    }
  }

  await logLeadEvent(
    lead.id,
    "replied",
    body.length > 120 ? `${body.slice(0, 117)}...` : body,
    sid ? `sms:${sid}:reply` : undefined,
  );
  const { error: activityError } = await db
    .from("leads")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", lead.id);
  if (activityError) throw new Error(`lead activity update failed: ${activityError.message}`);
  // A known customer asking a question must never sit unseen until the inbox is
  // opened — alert Sebastian the same way an unknown number does. The YES paths
  // above already ack + return, so confirmations never double-ping him.
  const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body;
  await runInboundEffect(sid, "known-reply-owner-alert", async () => {
    const result = await alertOwner(
      `Reply from ${lead.name ?? fmtPhone(lead.phone)}: ${preview} ` +
        `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
    );
    if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
  });
  return { handled: "reply", leadIds: [lead.id], notes: [] };
}

// ── Branch d: organic text from an unknown number ────────────────────────────

async function handleOrganicText(
  from: string,
  body: string,
  sid?: string,
  media?: string[],
  claimedLeadId?: string | null,
  payloadHash?: string,
): Promise<InboundOutcome> {
  let lead = claimedLeadId ? await findLeadById(claimedLeadId) : null;
  if (lead) {
    await completeOrganicLead(lead, {
      via: "text",
      eventId: sid,
      inboundMessageSid: sid,
    });
  } else {
    lead = await createOrganicLead(from, {
      via: "text",
      context: body,
      eventId: sid,
      inboundMessageSid: sid,
      throwOnError: true,
      onCreated:
        sid && payloadHash
          ? async (createdLead) => {
              const { error } = await canesDb().rpc("bind_inbound_sms_lead", {
                p_message_sid: sid,
                p_payload_hash: payloadHash,
                p_lead_id: createdLead.id,
              });
              if (error) throw new Error(`organic inbound lead bind failed: ${error.message}`);
            }
          : undefined,
    });
  }

  if (!lead) {
    // A different MessageSid may have won the unique-phone race after this
    // SID pinned its pre-mutation route. That second text is a real customer
    // message, not another new-lead event.
    const concurrentLead = await findLeadByPhone(from);
    if (concurrentLead) {
      return handleLeadReply(concurrentLead, from, body, sid, media, await getSettings());
    }
    throw new Error(`organic inbound lead was not created for ${from}`);
  }
  const messageId = await storeInbound({ leadId: lead.id, peer: from, body, sid, media });
  if (messageId) {
    const scheduleRequest = looksLikeScheduleRequest(body);
    // The first text from an unknown number is both a new opportunity and an
    // inbox message. Keep the call-now lead alert, but also provide the exact
    // thread destination promised for every customer text.
    await pushCustomerMessage({
      messageId: sid ?? messageId,
      peerPhone: from,
      displayName: lead.name,
      rescheduleRequest: scheduleRequest,
    });
    if (scheduleRequest) {
      await notifyUpcomingJobChangeRequest(lead, sid ?? messageId, body);
    }
  }
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
  opts: {
    via: "text" | "call";
    context?: string;
    eventId?: string;
    suppressPush?: boolean;
    inboundMessageSid?: string;
    publicSubmissionKey?: string;
    onCreated?: (lead: Lead) => Promise<void>;
    throwOnError?: boolean;
  },
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
    if (opts.throwOnError && error.code !== "23505") {
      throw new Error(`organic lead insert failed: ${error.message}`);
    }
    console.error(`[canes] organic lead insert failed for ${phone}: ${error.message}`);
    return null;
  }
  const lead = (data as Lead | null) ?? null;
  if (!lead) return null;
  if (opts.onCreated) await opts.onCreated(lead);
  await completeOrganicLead(lead, opts);
  return lead;
}

export async function completeOrganicLead(
  lead: Lead,
  opts: {
    via: "text" | "call";
    eventId?: string;
    suppressPush?: boolean;
    inboundMessageSid?: string;
    publicSubmissionKey?: string;
  },
): Promise<void> {
  const createdEventId = await logLeadEvent(
    lead.id,
    "created",
    opts.via === "call" ? "Lead created from a missed call" : "Lead created from an inbound text",
    opts.eventId ? `${opts.via}:${opts.eventId}:created` : undefined,
  );
  await runIngressEffect(
    opts.inboundMessageSid,
    opts.publicSubmissionKey,
    "organic-owner-email",
    async () => {
      await notifyColdLead(lead, opts.eventId ?? createdEventId ?? lead.id);
    },
  );
  await runIngressEffect(
    opts.inboundMessageSid,
    opts.publicSubmissionKey,
    "organic-owner-sms",
    async () => {
      const result = await alertOwner(
        `New lead from ${fmtPhone(lead.phone)} (${opts.via === "call" ? "missed call" : "inbound text"}). ` +
          `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      );
      if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
    },
  );
  if (!opts.suppressPush) {
    await pushNewLead(
      lead,
      opts.via === "call" ? "missed_call" : "new_lead",
      opts.eventId ?? createdEventId,
    );
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  if (!canesConfigured()) return null;
  const { data, error } = await canesDb().from("leads").select("*").eq("phone", phone).maybeSingle();
  if (error) throw new Error(`lead phone lookup failed: ${error.message}`);
  return (data as Lead | null) ?? null;
}

async function findLeadById(leadId: string): Promise<Lead | null> {
  const { data, error } = await canesDb().from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw new Error(`lead lookup failed: ${error.message}`);
  return (data as Lead | null) ?? null;
}

export async function logLeadEvent(
  leadId: string,
  kind: string,
  detail: string,
  sourceKey?: string,
): Promise<string | null> {
  if (!canesConfigured()) return null;
  const { data, error } = await canesDb()
    .from("events")
    .insert({ lead_id: leadId, kind, detail, source_key: sourceKey ?? null })
    .select("id")
    .single();
  if (error) {
    if (sourceKey && error.code === "23505") {
      const { data: existing, error: lookupError } = await canesDb()
        .from("events")
        .select("id")
        .eq("source_key", sourceKey)
        .maybeSingle();
      if (lookupError) throw new Error(`lead event dedupe lookup failed: ${lookupError.message}`);
      if (typeof existing?.id !== "string") throw new Error("lead event dedupe row disappeared");
      return existing.id;
    }
    if (sourceKey) throw new Error(`lead event insert failed: ${error.message}`);
    console.error(`[canes] lead event insert failed: ${error.message}`);
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

async function storeInbound(p: {
  leadId: string | null;
  peer: string;
  body: string;
  sid?: string;
  media?: string[];
}): Promise<string | null> {
  const db = canesDb();
  const row = {
    lead_id: p.leadId,
    peer_phone: p.peer,
    direction: "in",
    body: p.body,
    media_urls: p.media ?? [],
    automated: false,
    twilio_sid: p.sid ?? null,
    inbound_dedupe_key: p.sid ?? null,
  };
  const { data, error } = await db.from("messages").insert(row).select("id, lead_id").single();
  if (error) {
    if (p.sid && error.code === "23505") {
      const { data: existing, error: lookupError } = await db
        .from("messages")
        .select("id, lead_id")
        .eq("inbound_dedupe_key", p.sid)
        .maybeSingle();
      if (lookupError) throw new Error(`inbound message dedupe lookup failed: ${lookupError.message}`);
      if (existing?.id && p.leadId && !existing.lead_id) {
        const { error: attachError } = await db
          .from("messages")
          .update({ lead_id: p.leadId })
          .eq("id", existing.id)
          .is("lead_id", null);
        if (attachError) throw new Error(`inbound message lead attach failed: ${attachError.message}`);
      }
      if (typeof existing?.id !== "string") throw new Error("inbound message dedupe row disappeared");
      return existing.id;
    }
    console.error(`[canes] inbound message insert failed: ${error.message}`);
    if (p.sid) throw new Error(`inbound message insert failed: ${error.message}`);
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

async function runInboundEffect(
  messageSid: string | undefined,
  effectKey: string,
  effect: () => Promise<void>,
): Promise<void> {
  if (!messageSid) {
    await effect();
    return;
  }

  const db = canesDb();
  const { data, error } = await db.rpc("claim_inbound_sms_effect", {
    p_message_sid: messageSid,
    p_effect_key: effectKey,
  });
  if (error) throw new Error(`inbound effect claim failed: ${error.message}`);
  if (data !== true) return;

  try {
    await effect();
    const { error: finishError } = await db.rpc("finish_inbound_sms_effect", {
      p_message_sid: messageSid,
      p_effect_key: effectKey,
      p_error: null,
    });
    if (finishError) console.error(`[canes] inbound effect completion failed: ${finishError.message}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const { error: finishError } = await db.rpc("finish_inbound_sms_effect", {
      p_message_sid: messageSid,
      p_effect_key: effectKey,
      p_error: message,
    });
    if (finishError) console.error(`[canes] inbound effect failure record failed: ${finishError.message}`);
    throw caught;
  }
}

async function runPublicLeadEffect(
  submissionKey: string,
  effectKey: string,
  effect: () => Promise<void>,
): Promise<void> {
  const db = canesDb();
  const { data, error } = await db.rpc("claim_public_lead_effect", {
    p_submission_key: submissionKey,
    p_effect_key: effectKey,
  });
  if (error) throw new Error(`public lead effect claim failed: ${error.message}`);
  if (data !== true) return;

  try {
    await effect();
    const { error: finishError } = await db.rpc("finish_public_lead_effect", {
      p_submission_key: submissionKey,
      p_effect_key: effectKey,
      p_error: null,
    });
    if (finishError) console.error(`[canes] public lead effect completion failed: ${finishError.message}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const { error: finishError } = await db.rpc("finish_public_lead_effect", {
      p_submission_key: submissionKey,
      p_effect_key: effectKey,
      p_error: message,
    });
    if (finishError) console.error(`[canes] public lead effect failure record failed: ${finishError.message}`);
    throw caught;
  }
}

async function runIngressEffect(
  messageSid: string | undefined,
  submissionKey: string | undefined,
  effectKey: string,
  effect: () => Promise<void>,
): Promise<void> {
  if (messageSid) return runInboundEffect(messageSid, effectKey, effect);
  if (submissionKey) return runPublicLeadEffect(submissionKey, effectKey, effect);
  await effect();
}

export function looksLikeScheduleRequest(body: string): boolean {
  return /\b(reschedul|cancel|move (?:it|the|our)|change (?:it|the|our|my)|different (?:day|date|time)|another (?:day|date|time)|(?:later|earlier)(?:\s+(?:day|date|time))?|instead|push (?:it|the|our|my)?\s*(?:job|appointment|visit)?\s*to|(?:day|date|time|appointment|visit) won(?:'t| not) work|something came up|can(?:not|'t) make|won(?:'t| not) be able)\b/i.test(body);
}

function looksLikeCancellationRequest(body: string): boolean {
  return /\b(cancel|can(?:not|'t) make|won(?:'t| not) be able)\b/i.test(body);
}

async function notifyUpcomingJobChangeRequest(
  lead: Lead,
  messageId: string,
  body: string,
): Promise<void> {
  const { data, error } = await canesDb()
    .from("jobs")
    .select("id, customer_name, job_name, crew_id, status, scheduled_at, ends_at")
    .or(
      lead.phone
        ? `lead_id.eq.${lead.id},customer_phone.eq.${lead.phone}`
        : `lead_id.eq.${lead.id}`,
    )
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(2);
  if (error) throw new Error(`schedule request job lookup failed: ${error.message}`);
  // One exact upcoming job gives Sebastian a safe editor destination. With
  // zero or multiple candidates, the exact inbox-thread notification remains
  // the only alert; guessing could route him to the wrong customer visit.
  if ((data ?? []).length !== 1) return;
  const job = data![0] as Pick<
    Job,
    "id" | "customer_name" | "job_name" | "crew_id" | "status" | "scheduled_at" | "ends_at"
  >;
  await pushCustomerJobChangeRequest({
    id: job.id,
    messageId,
    customerName: job.customer_name ?? lead.name,
    jobName: job.job_name,
    crewId: job.crew_id,
    change: looksLikeCancellationRequest(body) ? "canceled" : "rescheduled",
    expectedJobState: {
      crewId: job.crew_id,
      status: job.status,
      scheduledAt: job.scheduled_at,
      endsAt: job.ends_at,
    },
  });
}

// Shared by the Twilio webhook routes. Twilio signs the externally visible
// URL; Vercel terminates TLS ahead of the function, so rebuild it from
// NEXT_PUBLIC_APP_URL rather than trusting req.url's host. Once the Canes
// database is configured, a missing token is a production misconfiguration,
// not a reason to accept unsigned provider writes.
export function verifyTwilioRequest(req: Request, params: Record<string, string>): boolean {
  const token = process.env.CANES_TWILIO_AUTH_TOKEN;
  if (!token) return !canesConfigured();
  const u = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? u.origin).replace(/\/$/, "");
  return validateSignature(
    token,
    req.headers.get("x-twilio-signature"),
    base + u.pathname + u.search,
    params,
  );
}
