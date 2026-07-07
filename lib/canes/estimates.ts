import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import {
  DEMO_CATALOG,
  DEMO_ESTIMATES,
  DEMO_ESTIMATE_ITEMS,
  DEMO_JOBS,
} from "@/lib/canes/fixtures";
import type {
  CatalogItem,
  Estimate,
  EstimateItem,
  EstimateStatus,
  EstimateWithItems,
  Job,
  JobStatus,
} from "@/lib/canes/types";

// Reads for the Canes estimate/job layer. Mirrors lib/canes/data.ts: every read
// has an isDemo() fixtures fallback; list reads throw on hard error, single
// reads use .maybeSingle() and return null. Writes live in actions.ts. The
// enqueue helpers self-guard on canesConfigured() and are insert-only through
// the tasks table's unique dedupe_key.

export async function listEstimates(filter?: {
  leadId?: string;
  status?: EstimateStatus;
}): Promise<Estimate[]> {
  let rows: Estimate[];
  if (isDemo()) {
    rows = [...DEMO_ESTIMATES];
  } else {
    const { data, error } = await canesDb()
      .from("estimates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`listEstimates: ${error.message}`);
    rows = (data ?? []) as Estimate[];
  }
  if (filter?.leadId) rows = rows.filter((e) => e.lead_id === filter.leadId);
  if (filter?.status) rows = rows.filter((e) => e.status === filter.status);
  return rows;
}

export async function getEstimate(id: string): Promise<Estimate | null> {
  if (isDemo()) return DEMO_ESTIMATES.find((e) => e.id === id) ?? null;
  const { data } = await canesDb().from("estimates").select("*").eq("id", id).maybeSingle();
  return (data as Estimate | null) ?? null;
}

export async function getEstimateByToken(token: string): Promise<Estimate | null> {
  if (isDemo()) return DEMO_ESTIMATES.find((e) => e.public_token === token) ?? null;
  const { data } = await canesDb()
    .from("estimates")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  return (data as Estimate | null) ?? null;
}

export async function getEstimateItems(estimateId: string): Promise<EstimateItem[]> {
  if (isDemo()) {
    return DEMO_ESTIMATE_ITEMS.filter((i) => i.estimate_id === estimateId).sort(
      (a, b) => a.position - b.position,
    );
  }
  const { data, error } = await canesDb()
    .from("estimate_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`getEstimateItems: ${error.message}`);
  return (data ?? []) as EstimateItem[];
}

export async function getEstimateWithItems(id: string): Promise<EstimateWithItems | null> {
  const estimate = await getEstimate(id);
  if (!estimate) return null;
  const items = await getEstimateItems(id);
  return { ...estimate, items };
}

export async function listCatalog(activeOnly = false): Promise<CatalogItem[]> {
  let rows: CatalogItem[];
  if (isDemo()) {
    rows = [...DEMO_CATALOG];
  } else {
    const { data, error } = await canesDb()
      .from("service_catalog")
      .select("*")
      .order("position", { ascending: true })
      .limit(500);
    if (error) throw new Error(`listCatalog: ${error.message}`);
    rows = (data ?? []) as CatalogItem[];
  }
  if (activeOnly) rows = rows.filter((c) => c.active);
  return rows;
}

export async function listJobs(status?: JobStatus): Promise<Job[]> {
  let rows: Job[];
  if (isDemo()) {
    rows = [...DEMO_JOBS];
  } else {
    const { data, error } = await canesDb()
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`listJobs: ${error.message}`);
    rows = (data ?? []) as Job[];
  }
  if (status) rows = rows.filter((j) => j.status === status);
  return rows;
}

// Atomic-ish estimate numbering via the estimate_counters row. The unique
// constraint on estimates.number is the real backstop against a collision;
// this reads the current value and advances the counter, formatting EST-000001.
// (Single-operator business: contention is effectively nil.)
export async function nextEstimateNumber(): Promise<string> {
  if (isDemo()) return `EST-${String(DEMO_ESTIMATES.length + 1).padStart(6, "0")}`;
  const db = canesDb();
  const { data, error } = await db
    .from("estimate_counters")
    .select("next_value")
    .eq("id", "estimate")
    .maybeSingle();
  if (error || !data) throw new Error(`nextEstimateNumber: ${error?.message ?? "counter missing"}`);
  const n = Number(data.next_value);
  const { error: updErr } = await db
    .from("estimate_counters")
    .update({ next_value: n + 1 })
    .eq("id", "estimate");
  if (updErr) throw new Error(`nextEstimateNumber advance: ${updErr.message}`);
  return `EST-${String(n).padStart(6, "0")}`;
}

// Queue the estimate_send SMS task (drained by the cron outbox). Insert-only on
// dedupe_key so a re-send never resurrects a task that already ran.
export async function enqueueEstimateSend(estimate: Estimate): Promise<boolean> {
  if (!canesConfigured()) return false;
  const { data, error } = await canesDb()
    .from("tasks")
    .upsert(
      {
        lead_id: estimate.lead_id,
        kind: "estimate_send",
        dedupe_key: `estimate_send:${estimate.id}`,
        scheduled_for: new Date().toISOString(),
        status: "pending",
        payload: { estimate_id: estimate.id, token: estimate.public_token },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error(`[canes] estimate_send enqueue failed for ${estimate.id}: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// Queue the day-2 and day-5 follow-up reminders. Insert-only on dedupe_key.
export async function enqueueEstimateReminders(estimate: Estimate): Promise<void> {
  if (!canesConfigured()) return;
  const db = canesDb();
  const now = Date.now();
  const stages = [
    { key: `estimate_reminder:${estimate.id}:d2`, at: now + 2 * 86_400_000 },
    { key: `estimate_reminder:${estimate.id}:d5`, at: now + 5 * 86_400_000 },
  ];
  for (const stage of stages) {
    const { error } = await db.from("tasks").upsert(
      {
        lead_id: estimate.lead_id,
        kind: "estimate_reminder",
        dedupe_key: stage.key,
        scheduled_for: new Date(stage.at).toISOString(),
        status: "pending",
        payload: { estimate_id: estimate.id, token: estimate.public_token },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (error) {
      console.error(`[canes] estimate_reminder enqueue failed for ${estimate.id}: ${error.message}`);
    }
  }
}
