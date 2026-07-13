import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import {
  DEMO_CALENDAR_EVENTS,
  DEMO_CATALOG,
  DEMO_CREWS,
  DEMO_ESTIMATES,
  DEMO_ESTIMATE_ITEMS,
  DEMO_JOB_ITEMS,
  DEMO_JOBS,
} from "@/lib/canes/fixtures";
import type {
  CalendarEvent,
  CatalogItem,
  Crew,
  Estimate,
  EstimateItem,
  EstimateStatus,
  EstimateWithItems,
  Job,
  JobItem,
  JobStatus,
  JobWithItems,
} from "@/lib/canes/types";

// Reads for the Canes estimate/job layer. Mirrors lib/canes/data.ts: every read
// has an isDemo() fixtures fallback; list reads throw on hard error, single
// reads use .maybeSingle() and return null. Writes live in actions.ts. The
// enqueue helpers self-guard on canesConfigured() and are insert-only through
// the tasks table's unique dedupe_key.

// Canceled work leaves the active calendar. Completed/invoiced/paid jobs retain
// their original placement so the schedule remains a reliable history of what
// the crews completed that day.
const HIDDEN_SCHEDULE_JOB_STATUSES: JobStatus[] = ["canceled"];

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
      // Scheduled first in time order (nulls last), then newest unscheduled —
      // the calendar/tray reads want time order, not just insertion order.
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`listJobs: ${error.message}`);
    rows = (data ?? []) as Job[];
  }
  if (status) rows = rows.filter((j) => j.status === status);
  return rows;
}

// ── Scheduler readers (Phase 2). Each demo-branches to fixtures; live queries
//    use the 0004 indexes/range filters. getScheduleBoard + getUnscheduledJobs
//    return JobWithItems (job joined to its item snapshot + assigned crew) so a
//    calendar block, its crew color, and the run-sheet checklist come from one
//    object. Jobs carry their line-item snapshot; editing an estimate later
//    never rewrites a dispatched job.

// Attach each job's line-item snapshot + assigned crew. One batched item query,
// one crew map — no N+1.
async function joinJobs(jobs: Job[]): Promise<JobWithItems[]> {
  if (jobs.length === 0) return [];
  const crews = await listCrews();
  const crewById = new Map(crews.map((c) => [c.id, c]));
  if (isDemo()) {
    return jobs.map((job) => ({
      ...job,
      items: DEMO_JOB_ITEMS.filter((i) => i.job_id === job.id).sort((a, b) => a.position - b.position),
      crew: job.crew_id ? crewById.get(job.crew_id) ?? null : null,
    }));
  }
  const ids = jobs.map((j) => j.id);
  const { data, error } = await canesDb()
    .from("job_items")
    .select("*")
    .in("job_id", ids)
    .order("position", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`joinJobs items: ${error.message}`);
  const items = (data ?? []) as JobItem[];
  const byJob = new Map<string, JobItem[]>();
  for (const it of items) byJob.set(it.job_id, [...(byJob.get(it.job_id) ?? []), it]);
  return jobs.map((job) => ({
    ...job,
    items: byJob.get(job.id) ?? [],
    crew: job.crew_id ? crewById.get(job.crew_id) ?? null : null,
  }));
}

// Placed jobs whose scheduled_at falls in [rangeStart, rangeStart + days).
// Finished work stays visible; only canceled work is hidden.
export async function getScheduleBoard(rangeStartIso: string, days = 7): Promise<JobWithItems[]> {
  const start = new Date(rangeStartIso);
  if (Number.isNaN(start.getTime())) return [];
  const endIso = new Date(start.getTime() + days * 86_400_000).toISOString();
  let rows: Job[];
  if (isDemo()) {
    rows = DEMO_JOBS.filter(
      (j) =>
        j.scheduled_at &&
        j.scheduled_at >= start.toISOString() &&
        j.scheduled_at < endIso &&
        !HIDDEN_SCHEDULE_JOB_STATUSES.includes(j.status),
    ).sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string));
  } else {
    const { data, error } = await canesDb()
      .from("jobs")
      .select("*")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", endIso)
      .not("status", "in", `(${HIDDEN_SCHEDULE_JOB_STATUSES.join(",")})`)
      .order("scheduled_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(`getScheduleBoard: ${error.message}`);
    rows = (data ?? []) as Job[];
  }
  return joinJobs(rows);
}

// Approved-but-unplaced jobs, for the tray. Newest first.
export async function getUnscheduledJobs(): Promise<JobWithItems[]> {
  let rows: Job[];
  if (isDemo()) {
    rows = DEMO_JOBS.filter((j) => j.status === "unscheduled").sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  } else {
    const { data, error } = await canesDb()
      .from("jobs")
      .select("*")
      .eq("status", "unscheduled")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`getUnscheduledJobs: ${error.message}`);
    rows = (data ?? []) as Job[];
  }
  return joinJobs(rows);
}

export async function listCrews(activeOnly = false): Promise<Crew[]> {
  let rows: Crew[];
  if (isDemo()) {
    rows = [...DEMO_CREWS];
  } else {
    const { data, error } = await canesDb()
      .from("crews")
      .select("*")
      .order("sort", { ascending: true })
      .limit(100);
    if (error) throw new Error(`listCrews: ${error.message}`);
    rows = (data ?? []) as Crew[];
  }
  if (activeOnly) rows = rows.filter((c) => c.active);
  return rows;
}

export async function getJob(id: string): Promise<Job | null> {
  if (isDemo()) return DEMO_JOBS.find((j) => j.id === id) ?? null;
  const { data } = await canesDb().from("jobs").select("*").eq("id", id).maybeSingle();
  return (data as Job | null) ?? null;
}

export async function listJobItems(jobId: string): Promise<JobItem[]> {
  if (isDemo()) {
    return DEMO_JOB_ITEMS.filter((i) => i.job_id === jobId).sort((a, b) => a.position - b.position);
  }
  const { data, error } = await canesDb()
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`listJobItems: ${error.message}`);
  return (data ?? []) as JobItem[];
}

export async function getJobWithItems(id: string): Promise<JobWithItems | null> {
  const job = await getJob(id);
  if (!job) return null;
  const [joined] = await joinJobs([job]);
  return joined ?? null;
}

// Calendar blocks (holidays / time off / notes) whose starts_at falls in
// [rangeStart, rangeStart + days). Rendered as the muted background band.
export async function listCalendarEvents(rangeStartIso: string, days = 7): Promise<CalendarEvent[]> {
  const start = new Date(rangeStartIso);
  if (Number.isNaN(start.getTime())) return [];
  const endIso = new Date(start.getTime() + days * 86_400_000).toISOString();
  if (isDemo()) {
    return DEMO_CALENDAR_EVENTS.filter(
      (e) => e.starts_at >= start.toISOString() && e.starts_at < endIso,
    ).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  const { data, error } = await canesDb()
    .from("calendar_events")
    .select("*")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", endIso)
    .order("starts_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`listCalendarEvents: ${error.message}`);
  return (data ?? []) as CalendarEvent[];
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
