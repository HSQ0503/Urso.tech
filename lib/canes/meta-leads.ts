import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { findLeadByPhone, logLeadEvent } from "@/lib/canes/inbound";
import { queueVirtualQuote } from "@/lib/canes/lead-messaging";
import { getSettings } from "@/lib/canes/data";
import { notifyColdLead } from "@/lib/canes/notify";
import { pushMetaLeadNoPhone, pushNewLead } from "@/lib/canes/push-events";
import { alertOwner } from "@/lib/canes/twilio";
import { fmtPhone, type Lead } from "@/lib/canes/types";
import {
  leadgenIdsFromPayload,
  parseInstantFormFields,
  type InstantFormFields,
} from "@/lib/canes/meta-form";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export type MetaLeadIngest = {
  handled: "created" | "existing" | "no_phone" | "duplicate" | "busy";
  leadId?: string;
};

export type MetaGraphLead = {
  id?: string;
  field_data?: unknown;
};

export async function fetchMetaLead(leadgenId: string): Promise<MetaGraphLead> {
  const token = process.env.CANES_META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("CANES_META_PAGE_ACCESS_TOKEN is not set.");
  const version = process.env.CANES_META_GRAPH_VERSION ?? "v21.0";
  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}` +
    `?fields=id,created_time,ad_id,form_id,field_data` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta Graph responded ${res.status}`);
  return (await res.json()) as MetaGraphLead;
}

async function runMetaEffect(
  leadgenId: string,
  effectKey: string,
  effect: () => Promise<void>,
): Promise<void> {
  const db = canesDb();
  const { data, error } = await db.rpc("claim_meta_leadgen_effect", {
    p_leadgen_id: leadgenId,
    p_effect_key: effectKey,
  });
  if (error) throw new Error(`meta lead effect claim failed: ${error.message}`);
  if (data !== true) return;
  try {
    await effect();
    const { error: finishError } = await db.rpc("finish_meta_leadgen_effect", {
      p_leadgen_id: leadgenId,
      p_effect_key: effectKey,
      p_error: null,
    });
    if (finishError) {
      console.error(`[canes] meta lead effect completion failed: ${finishError.message}`);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const { error: finishError } = await db.rpc("finish_meta_leadgen_effect", {
      p_leadgen_id: leadgenId,
      p_effect_key: effectKey,
      p_error: message,
    });
    if (finishError) {
      console.error(`[canes] meta lead effect failure record failed: ${finishError.message}`);
    }
    throw caught;
  }
}

async function finishReceipt(
  leadgenId: string,
  outcome: string,
  leadId: string | null,
): Promise<void> {
  const { error } = await canesDb().rpc("finish_meta_leadgen", {
    p_leadgen_id: leadgenId,
    p_outcome: outcome,
    p_lead_id: leadId,
  });
  if (error) throw new Error(`meta lead receipt failed: ${error.message}`);
}

async function notifyNewMetaLead(lead: Lead, leadgenId: string, fields: InstantFormFields) {
  const named = { ...lead, name: lead.name || fields.name || null };
  await runMetaEffect(leadgenId, "created-event", async () => {
    await logLeadEvent(
      lead.id,
      "created",
      "Lead created from a Meta Instant Form",
      `meta:${leadgenId}:created`,
    );
  });
  await runMetaEffect(leadgenId, "owner-email", async () => {
    await notifyColdLead(named, `meta:${leadgenId}`);
  });
  await runMetaEffect(leadgenId, "owner-push", async () => {
    await pushNewLead(named, "meta_ads", `meta:${leadgenId}`);
  });
  await runMetaEffect(leadgenId, "owner-sms", async () => {
    const result = await alertOwner(
      `New Meta ads lead from ${named.name ?? fmtPhone(lead.phone)}. ` +
        `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      { alreadyPushed: true },
    );
    if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
  });
  await runMetaEffect(leadgenId, "hold-text", async () => {
    await queueVirtualQuote(named, await getSettings());
  });
}

async function notifyExistingMetaLead(lead: Lead, leadgenId: string, fields: InstantFormFields) {
  const named = { ...lead, name: lead.name || fields.name || null };
  await runMetaEffect(leadgenId, "existing-owner-push", async () => {
    await pushNewLead(named, "meta_ads", `meta:${leadgenId}`);
  });
  await runMetaEffect(leadgenId, "existing-owner-sms", async () => {
    const result = await alertOwner(
      `New Meta ads form from ${named.name ?? fmtPhone(lead.phone)}. ` +
        `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      { alreadyPushed: true },
    );
    if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
  });
}

async function createMetaLead(
  phone: string,
  fields: InstantFormFields,
  leadgenId: string,
): Promise<Lead> {
  const note = ["Meta Instant Form.", fields.notes].filter(Boolean).join("\n");
  const db = canesDb();
  const { data, error } = await db
    .from("leads")
    .insert({
      type: "cold",
      status: "new",
      source: "meta_ads",
      phone,
      name: fields.name || null,
      email: fields.email || null,
      address: fields.address || null,
      service: fields.service || null,
      notes: note || null,
      raw_message: fields.notes || "Meta Instant Form",
      meta_leadgen_id: leadgenId,
    })
    .select("*")
    .single();
  if (!error && data) return data as Lead;
  if (error?.code === "23505") {
    const { data: byLeadgen, error: leadgenError } = await db
      .from("leads")
      .select("*")
      .eq("meta_leadgen_id", leadgenId)
      .maybeSingle();
    if (leadgenError) throw new Error(`meta lead lookup failed: ${leadgenError.message}`);
    if (byLeadgen) return byLeadgen as Lead;
    const existing = await findLeadByPhone(phone);
    if (existing) return existing;
  }
  throw new Error(`meta lead insert failed: ${error?.message ?? "no lead"}`);
}

export async function ingestMetaLeadgen(
  leadgenId: string,
  deps: { fetchLead?: (id: string) => Promise<MetaGraphLead> } = {},
): Promise<MetaLeadIngest> {
  if (!canesConfigured()) throw new Error("Canes is not configured.");
  const { data: claim, error: claimError } = await canesDb().rpc("claim_meta_leadgen", {
    p_leadgen_id: leadgenId,
  });
  if (claimError) throw new Error(`meta lead claim failed: ${claimError.message}`);
  if (claim === "completed") return { handled: "duplicate" };
  if (claim === "busy") return { handled: "busy" };

  const graph = await (deps.fetchLead ?? fetchMetaLead)(leadgenId);
  const fields = parseInstantFormFields(graph.field_data);

  if (!fields.phone) {
    await runMetaEffect(leadgenId, "no-phone-push", async () => {
      await pushMetaLeadNoPhone({
        leadgenId,
        name: fields.name || null,
        email: fields.email || null,
      });
    });
    await finishReceipt(leadgenId, "no_phone", null);
    return { handled: "no_phone" };
  }

  const existing = await findLeadByPhone(fields.phone);
  if (existing) {
    const { error: updateError } = await canesDb().rpc("apply_meta_lead_existing_update", {
      p_leadgen_id: leadgenId,
      p_lead_id: existing.id,
      p_name: fields.name,
      p_email: fields.email,
      p_address: fields.address,
      p_service: fields.service,
      p_note: ["Meta Instant Form.", fields.notes].filter(Boolean).join("\n"),
      p_set_source: existing.source === "other",
    });
    if (updateError) throw new Error(`meta lead update failed: ${updateError.message}`);
    await notifyExistingMetaLead(existing, leadgenId, fields);
    await finishReceipt(leadgenId, "existing", existing.id);
    return { handled: "existing", leadId: existing.id };
  }

  const lead = await createMetaLead(fields.phone, fields, leadgenId);
  if (lead.meta_leadgen_id !== leadgenId) {
    const { error: updateError } = await canesDb().rpc("apply_meta_lead_existing_update", {
      p_leadgen_id: leadgenId,
      p_lead_id: lead.id,
      p_name: fields.name,
      p_email: fields.email,
      p_address: fields.address,
      p_service: fields.service,
      p_note: ["Meta Instant Form.", fields.notes].filter(Boolean).join("\n"),
      p_set_source: lead.source === "other",
    });
    if (updateError) throw new Error(`meta lead update failed: ${updateError.message}`);
    await notifyExistingMetaLead(lead, leadgenId, fields);
    await finishReceipt(leadgenId, "existing", lead.id);
    return { handled: "existing", leadId: lead.id };
  }

  await notifyNewMetaLead(lead, leadgenId, fields);
  await finishReceipt(leadgenId, "created", lead.id);
  return { handled: "created", leadId: lead.id };
}

export async function ingestMetaLeadgenPayload(payload: unknown): Promise<MetaLeadIngest[]> {
  const ids = leadgenIdsFromPayload(payload);
  const results: MetaLeadIngest[] = [];
  for (const id of ids) {
    results.push(await ingestMetaLeadgen(id));
  }
  return results;
}
