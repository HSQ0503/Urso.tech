import { canesDb } from "@/lib/canes/supabase";
import { etLocalToIso, type JobStatus } from "@/lib/canes/types";
import type {
  TechnicianActor,
  TechnicianJob,
  TechnicianJobItem,
  TechnicianWeek,
} from "@/lib/canes/crew-types";

type SafeJobRow = {
  id: string;
  status: JobStatus;
  customer_name: string | null;
  customer_phone: string | null;
  job_name: string | null;
  job_address: string | null;
  scheduled_at: string | null;
  ends_at: string | null;
  duration_minutes: number;
  arrival_window_minutes: number;
  gate_code: string | null;
  site_notes: string | null;
  notes: string | null;
  crew_id: string;
};

type SafeItemRow = {
  id: string;
  job_id: string;
  position: number;
  name: string;
  description: string | null;
  quantity: number | string;
  done: boolean;
  required: boolean;
  technician_note: string | null;
  blocked: boolean;
  completed_at: string | null;
};

type TimeEntryRow = {
  job_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
};

type CrewRow = { id: string; name: string; color: string };

const SAFE_JOB_COLUMNS = [
  "id",
  "status",
  "customer_name",
  "customer_phone",
  "job_name",
  "job_address",
  "scheduled_at",
  "ends_at",
  "duration_minutes",
  "arrival_window_minutes",
  "gate_code",
  "site_notes",
  "notes",
  "crew_id",
].join(", ");

const SAFE_ITEM_COLUMNS = [
  "id",
  "job_id",
  "position",
  "name",
  "description",
  "quantity",
  "done",
  "required",
  "technician_note",
  "blocked",
  "completed_at",
].join(", ");

function etDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function currentTechnicianWeek(): {
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
} {
  const today = etDateKey();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startDate = addDays(today, mondayOffset);
  const endExclusive = addDays(startDate, 7);
  return {
    startDate,
    endDate: addDays(startDate, 6),
    startIso: etLocalToIso(`${startDate}T00:00`),
    endIso: etLocalToIso(`${endExclusive}T00:00`),
  };
}

function minutesFor(entries: TimeEntryRow[]): number {
  const now = Date.now();
  return entries.reduce((total, entry) => {
    const start = new Date(entry.checked_in_at).getTime();
    const end = entry.checked_out_at ? new Date(entry.checked_out_at).getTime() : now;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return total;
    return total + Math.floor((end - start) / 60_000);
  }, 0);
}

function mapItem(row: SafeItemRow): TechnicianJobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    position: row.position,
    name: row.name,
    description: row.description,
    quantity: Number(row.quantity),
    done: row.done,
    required: row.required,
    technicianNote: row.technician_note,
    blocked: row.blocked,
    completedAt: row.completed_at,
  };
}

async function hydrateJobs(
  actor: TechnicianActor,
  jobs: SafeJobRow[],
): Promise<TechnicianJob[]> {
  if (jobs.length === 0) return [];
  const db = canesDb();
  const jobIds = jobs.map((job) => job.id);
  const crewIds = [...new Set(jobs.map((job) => job.crew_id))];
  const [{ data: rawItems, error: itemError }, { data: rawCrews, error: crewError }, { data: rawTime, error: timeError }] =
    await Promise.all([
      db
        .from("job_items")
        .select(SAFE_ITEM_COLUMNS)
        .in("job_id", jobIds)
        .order("position", { ascending: true }),
      db.from("crews").select("id, name, color").in("id", crewIds),
      db
        .from("job_time_entries")
        .select("job_id, checked_in_at, checked_out_at")
        .eq("account_id", actor.accountId)
        .in("job_id", jobIds),
    ]);
  if (itemError) throw new Error(`Crew checklist read failed: ${itemError.message}`);
  if (crewError) throw new Error(`Crew read failed: ${crewError.message}`);
  if (timeError) throw new Error(`Crew hours read failed: ${timeError.message}`);

  const itemsByJob = new Map<string, TechnicianJobItem[]>();
  for (const row of (rawItems ?? []) as unknown as SafeItemRow[]) {
    const item = mapItem(row);
    itemsByJob.set(item.jobId, [...(itemsByJob.get(item.jobId) ?? []), item]);
  }
  const crewById = new Map(
    ((rawCrews ?? []) as CrewRow[]).map((crew) => [crew.id, crew]),
  );
  const entriesByJob = new Map<string, TimeEntryRow[]>();
  for (const entry of (rawTime ?? []) as TimeEntryRow[]) {
    entriesByJob.set(entry.job_id, [
      ...(entriesByJob.get(entry.job_id) ?? []),
      entry,
    ]);
  }

  return jobs.map((job) => {
    const crew = crewById.get(job.crew_id);
    const entries = entriesByJob.get(job.id) ?? [];
    const open = entries.find((entry) => !entry.checked_out_at);
    const technicianStatus: JobStatus = ["invoiced", "paid"].includes(job.status)
      ? "completed"
      : job.status;
    return {
      id: job.id,
      status: technicianStatus,
      customerName: job.customer_name,
      customerPhone: job.customer_phone,
      jobName: job.job_name,
      jobAddress: job.job_address,
      scheduledAt: job.scheduled_at,
      endsAt: job.ends_at,
      durationMinutes: job.duration_minutes,
      arrivalWindowMinutes: job.arrival_window_minutes,
      gateCode: job.gate_code,
      siteNotes: job.site_notes,
      notes: job.notes,
      crewId: job.crew_id,
      crewName: crew?.name ?? "Assigned crew",
      crewColor: crew?.color ?? "#0b6aa2",
      items: itemsByJob.get(job.id) ?? [],
      minutesWorked: minutesFor(entries),
      checkedInAt: open?.checked_in_at ?? null,
    };
  });
}

export async function getTechnicianWeek(
  actor: TechnicianActor,
): Promise<TechnicianWeek> {
  const bounds = currentTechnicianWeek();
  const db = canesDb();
  const [jobsResult, timeResult] = await Promise.all([
    db
      .from("jobs")
      .select(SAFE_JOB_COLUMNS)
      .in("crew_id", actor.crewIds)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", bounds.startIso)
      .lt("scheduled_at", bounds.endIso)
      .order("scheduled_at", { ascending: true }),
    db
      .from("job_time_entries")
      .select("job_id, checked_in_at, checked_out_at")
      .eq("account_id", actor.accountId)
      .gte("checked_in_at", bounds.startIso)
      .lt("checked_in_at", bounds.endIso),
  ]);
  if (jobsResult.error) {
    throw new Error(`Crew schedule read failed: ${jobsResult.error.message}`);
  }
  if (timeResult.error) {
    throw new Error(`Crew hours read failed: ${timeResult.error.message}`);
  }
  const jobs = await hydrateJobs(
    actor,
    (jobsResult.data ?? []) as unknown as SafeJobRow[],
  );
  return {
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    jobs,
    minutesWorked: minutesFor((timeResult.data ?? []) as TimeEntryRow[]),
  };
}

export async function getTechnicianJob(
  actor: TechnicianActor,
  jobId: string,
): Promise<TechnicianJob | null> {
  const { data, error } = await canesDb()
    .from("jobs")
    .select(SAFE_JOB_COLUMNS)
    .eq("id", jobId)
    .in("crew_id", actor.crewIds)
    .maybeSingle();
  if (error) throw new Error(`Crew job read failed: ${error.message}`);
  if (!data) return null;
  const [job] = await hydrateJobs(actor, [data as unknown as SafeJobRow]);
  return job ?? null;
}
