"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import {
  ET,
  etLocalToIso,
  fmtEt,
  type CalendarEvent,
  type Crew,
  type JobWithItems,
  type Lead,
} from "@/lib/canes/types";
import { readDrag, writeDrag } from "./unscheduled-tray";

// ── ET day helpers ───────────────────────────────────────────────────────────
// Every day walk anchors at UTC noon of an ET calendar day, the exact idiom
// SchedulePicker uses, so stepping day-by-day never drifts an hour across a DST
// boundary. A drop composes `${ymd}T${hhmm}` and runs it through etLocalToIso —
// never raw epoch math on a column origin.

export type CalDay = { ymd: string; anchor: Date };

// The ET calendar date ("YYYY-MM-DD") an instant falls on.
export function etYmd(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Today's ET calendar date as a UTC-noon anchor.
export function etTodayAnchor(): Date {
  return new Date(`${etYmd(new Date())}T12:00:00Z`);
}

// The ET "HH:mm" wall time an instant shows.
export function etHm(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

// Walk `count` ET days forward from an anchor (UTC-noon of some ET day).
export function walkDays(anchor: Date, count: number): CalDay[] {
  const out: CalDay[] = [];
  for (let i = 0; i < count; i++) {
    const a = new Date(anchor.getTime() + i * 86_400_000);
    out.push({ ymd: a.toISOString().slice(0, 10), anchor: a });
  }
  return out;
}

// Compose an ET wall-time ISO from a dropped day + a time-of-day.
export function composeDropIso(ymd: string, timeOfDay: string | null): string {
  return etLocalToIso(`${ymd}T${timeOfDay ?? "09:00"}`);
}

const DOW = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dayHeadLabel(day: CalDay, todayYmd: string): { dow: string; sub: string } {
  return {
    dow: day.ymd === todayYmd ? "Today" : DOW.format(day.anchor),
    sub: MONTH_DAY.format(day.anchor),
  };
}

// A coarse height class by duration — v1 uses buckets, not a pixel-per-minute
// grid (see plan D2). Longer jobs read as taller blocks without a true timeline.
function durationTone(minutes: number): string {
  if (minutes >= 240) return "min-h-[74px]";
  if (minutes >= 150) return "min-h-[58px]";
  return "min-h-[44px]";
}

function timeWindow(job: JobWithItems): string {
  if (!job.scheduled_at) return "";
  const start = fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" });
  if (!job.ends_at) return start;
  const end = fmtEt(job.ends_at, { hour: "numeric", minute: "2-digit" });
  return `${start}–${end}`;
}

// ── Building blocks ──────────────────────────────────────────────────────────

function JobBlock({
  job,
  conflicted,
  onOpen,
}: {
  job: JobWithItems;
  conflicted: boolean;
  onOpen: (job: JobWithItems) => void;
}) {
  const unassigned = !job.crew;
  return (
    <button
      type="button"
      className={`cp-job-block ${durationTone(job.duration_minutes)} ${conflicted ? "cp-conflict" : ""}`}
      data-unassigned={unassigned}
      style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
      draggable
      onDragStart={(e) =>
        writeDrag(e, {
          type: "job",
          id: job.id,
          timeOfDay: job.scheduled_at ? etHm(job.scheduled_at) : null,
          durationMinutes: job.duration_minutes,
          crewId: job.crew_id,
        })
      }
      onClick={() => onOpen(job)}
    >
      <span className="font-semibold tabular-nums leading-tight">{timeWindow(job)}</span>
      <span className="truncate leading-tight">{job.customer_name ?? "Customer"}</span>
      <span className="flex items-center gap-1.5 truncate leading-tight text-[var(--cp-muted)]">
        <span
          className="cp-crew-dot"
          style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
        />
        <span className="truncate">{job.job_name ?? job.crew?.name ?? "Assign crew"}</span>
      </span>
    </button>
  );
}

function VisitChip({ visit }: { visit: Lead }) {
  return (
    <span className="cp-visit-chip" title={visit.name ?? "Estimate visit"}>
      <span className="tabular-nums">
        {fmtEt(visit.appointment_at, { hour: "numeric", minute: "2-digit" })}
      </span>
      <span className="truncate">{visit.name ?? "Visit"}</span>
    </span>
  );
}

function EventBand({ event }: { event: CalendarEvent }) {
  return (
    <div className="cp-event-band" title={event.notes ?? undefined}>
      {event.all_day
        ? event.title
        : `${event.title} · ${fmtEt(event.starts_at, { hour: "numeric", minute: "2-digit" })}`}
    </div>
  );
}

// ── Grouping ─────────────────────────────────────────────────────────────────

type DayBuckets = {
  jobs: Map<string, JobWithItems[]>;
  visits: Map<string, Lead[]>;
  events: Map<string, CalendarEvent[]>;
};

function bucketByDay(
  jobs: JobWithItems[],
  visits: Lead[],
  events: CalendarEvent[],
): DayBuckets {
  const jobsByDay = new Map<string, JobWithItems[]>();
  for (const j of jobs) {
    if (!j.scheduled_at) continue;
    const k = etYmd(j.scheduled_at);
    (jobsByDay.get(k) ?? jobsByDay.set(k, []).get(k)!).push(j);
  }
  const visitsByDay = new Map<string, Lead[]>();
  for (const v of visits) {
    if (!v.appointment_at) continue;
    const k = etYmd(v.appointment_at);
    (visitsByDay.get(k) ?? visitsByDay.set(k, []).get(k)!).push(v);
  }
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = etYmd(e.starts_at);
    (eventsByDay.get(k) ?? eventsByDay.set(k, []).get(k)!).push(e);
  }
  return { jobs: jobsByDay, visits: visitsByDay, events: eventsByDay };
}

// A job overlaps another placed job on the same crew, half-open window. Mirrors
// the server's findConflictNotice so the warn outline matches the action's notice.
function conflictSet(jobs: JobWithItems[]): Set<string> {
  const bad = new Set<string>();
  const placed = jobs.filter((j) => j.scheduled_at && j.ends_at && j.crew_id);
  for (let i = 0; i < placed.length; i++) {
    for (let k = i + 1; k < placed.length; k++) {
      const a = placed[i];
      const b = placed[k];
      if (a.crew_id !== b.crew_id) continue;
      if (a.scheduled_at! < b.ends_at! && b.scheduled_at! < a.ends_at!) {
        bad.add(a.id);
        bad.add(b.id);
      }
    }
  }
  return bad;
}

// ── Day column (the shared drop target) ──────────────────────────────────────

function DayColumn({
  day,
  todayYmd,
  buckets,
  conflicts,
  dropActiveYmd,
  onOpenJob,
  onOpenDay,
  onDropJob,
  setDropActive,
  wide = false,
}: {
  day: CalDay;
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  dropActiveYmd: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenDay: (ymd: string) => void;
  onDropJob: (ymd: string) => (e: React.DragEvent) => void;
  setDropActive: (ymd: string | null) => void;
  wide?: boolean;
}) {
  const head = dayHeadLabel(day, todayYmd);
  const dayJobs = (buckets.jobs.get(day.ymd) ?? []).slice().sort((a, b) =>
    (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
  );
  const dayVisits = buckets.visits.get(day.ymd) ?? [];
  const dayEvents = buckets.events.get(day.ymd) ?? [];

  return (
    <div
      className="cp-cal-col"
      data-today={day.ymd === todayYmd}
      data-dropactive={dropActiveYmd === day.ymd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropActiveYmd !== day.ymd) setDropActive(day.ymd);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(null);
      }}
      onDrop={onDropJob(day.ymd)}
    >
      <button
        type="button"
        className="cp-cal-col-head flex items-baseline justify-between gap-1 text-left"
        onClick={() => onOpenDay(day.ymd)}
      >
        <span>{head.dow}</span>
        <span className="text-[11px] font-medium text-[var(--cp-faint)]">{head.sub}</span>
      </button>

      {dayEvents.map((e) => (
        <EventBand key={e.id} event={e} />
      ))}

      {dayVisits.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cp-faint)]">
            Estimate visits
          </span>
          <div className="flex flex-wrap gap-1">
            {dayVisits.map((v) => (
              <VisitChip key={v.id} visit={v} />
            ))}
          </div>
        </div>
      )}

      {dayJobs.length === 0 && dayVisits.length === 0 && dayEvents.length === 0 && (
        <p className={`text-[11.5px] text-[var(--cp-faint)] ${wide ? "py-2" : ""}`}>
          {wide ? "Nothing scheduled. Drag a job here." : "—"}
        </p>
      )}

      {dayJobs.map((job) => (
        <JobBlock key={job.id} job={job} conflicted={conflicts.has(job.id)} onOpen={onOpenJob} />
      ))}
    </div>
  );
}

// ── Month grid ───────────────────────────────────────────────────────────────

const MONTH_TITLE = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Mon–Sun weeks covering the month that `anchor` (UTC-noon ET day) lands in.
function monthGridDays(anchor: Date): CalDay[] {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1, 12, 0, 0));
  // JS getUTCDay: 0=Sun..6=Sat → shift so Monday=0.
  const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first.getTime() - lead * 86_400_000);
  return walkDays(gridStart, 42);
}

function MonthGrid({
  anchor,
  todayYmd,
  buckets,
  conflicts,
  crewFilter,
  onOpenDay,
}: {
  anchor: Date;
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  crewFilter: string | null;
  onOpenDay: (ymd: string) => void;
}) {
  const days = useMemo(() => monthGridDays(anchor), [anchor]);
  const monthIdx = anchor.getUTCMonth();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_HEADS.map((w) => (
          <span
            key={w}
            className="text-center text-[10.5px] font-semibold uppercase tracking-wide text-[var(--cp-faint)]"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const inMonth = day.anchor.getUTCMonth() === monthIdx;
          const dayJobs = (buckets.jobs.get(day.ymd) ?? []).slice().sort((a, b) =>
            (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
          );
          const shown = dayJobs.slice(0, 3);
          const more = dayJobs.length - shown.length;
          return (
            <button
              key={day.ymd}
              type="button"
              className="cp-cal-col min-h-[92px] gap-1 text-left"
              data-today={day.ymd === todayYmd}
              style={{ opacity: inMonth ? 1 : 0.5 }}
              onClick={() => onOpenDay(day.ymd)}
            >
              <span className="cp-cal-col-head">{day.anchor.getUTCDate()}</span>
              {shown.map((job) => (
                <span
                  key={job.id}
                  className="truncate rounded-[3px] border-l-2 px-1 py-0.5 text-[10.5px] leading-tight"
                  style={{
                    borderColor: job.crew?.color ?? "#3e4a56",
                    background: `color-mix(in srgb, ${job.crew?.color ?? "#3e4a56"} 8%, var(--cp-surface))`,
                    outline: conflicts.has(job.id) ? "1.5px solid var(--cp-warn)" : undefined,
                  }}
                >
                  {job.customer_name ?? "Job"}
                </span>
              ))}
              {more > 0 && (
                <span className="text-[10px] font-semibold text-[var(--cp-faint)]">+{more} more</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-[var(--cp-faint)]">
        {MONTH_TITLE.format(anchor)}
        {crewFilter ? " · filtered by crew" : ""}
      </p>
    </div>
  );
}

// ── Day view = run-sheet entry ───────────────────────────────────────────────

const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

function DayView({
  day,
  todayYmd,
  buckets,
  conflicts,
  dropActiveYmd,
  crews,
  crewFilter,
  onOpenJob,
  onOpenRunSheet,
  onDropJob,
  setDropActive,
}: {
  day: CalDay;
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  dropActiveYmd: string | null;
  crews: Crew[];
  crewFilter: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenRunSheet: (jobs: JobWithItems[], crew: Crew | null, dayLabel: string) => void;
  onDropJob: (ymd: string) => (e: React.DragEvent) => void;
  setDropActive: (ymd: string | null) => void;
}) {
  const dayJobs = (buckets.jobs.get(day.ymd) ?? []).slice().sort((a, b) =>
    (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
  );
  const dayVisits = buckets.visits.get(day.ymd) ?? [];
  const dayEvents = buckets.events.get(day.ymd) ?? [];
  const label = `${dayHeadLabel(day, todayYmd).dow} · ${dayHeadLabel(day, todayYmd).sub}`;

  return (
    <div
      className="cp-cal-col"
      data-today={day.ymd === todayYmd}
      data-dropactive={dropActiveYmd === day.ymd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropActiveYmd !== day.ymd) setDropActive(day.ymd);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(null);
      }}
      onDrop={onDropJob(day.ymd)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold">{label}</span>
        <button
          type="button"
          className="cp-btn cp-btn-sm"
          disabled={dayJobs.length === 0}
          onClick={() => {
            const crew = crewFilter ? crews.find((c) => c.id === crewFilter) ?? null : null;
            onOpenRunSheet(dayJobs, crew, label);
          }}
        >
          Run sheet
        </button>
      </div>

      {dayEvents.map((e) => (
        <EventBand key={e.id} event={e} />
      ))}

      {dayVisits.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cp-faint)]">
            Estimate visits
          </span>
          <div className="flex flex-wrap gap-1">
            {dayVisits.map((v) => (
              <VisitChip key={v.id} visit={v} />
            ))}
          </div>
        </div>
      )}

      {dayJobs.length === 0 ? (
        <p className="py-3 text-[12.5px] text-[var(--cp-faint)]">
          Nothing scheduled. Drag a job here, or tap one in the tray to book it.
        </p>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          {dayJobs.map((job) => (
            <div
              key={job.id}
              className={`cp-job-block ${conflicts.has(job.id) ? "cp-conflict" : ""}`}
              data-unassigned={!job.crew}
              style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold tabular-nums">{timeWindow(job)}</span>
                <button
                  type="button"
                  className="text-[11.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                  onClick={() => onOpenJob(job)}
                >
                  Details
                </button>
              </div>
              <span className="text-[13px] font-semibold">{job.customer_name ?? "Customer"}</span>
              {job.job_name && <span className="text-[12px] text-[var(--cp-muted)]">{job.job_name}</span>}
              {job.job_address && (
                <a
                  href={mapsHref(job.job_address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin size={12} strokeWidth={2} /> {job.job_address}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────

export type CalView = "day" | "week" | "month";

export function CalendarBoard({
  view,
  anchor,
  dayAnchor,
  jobs,
  visits,
  events,
  crews,
  crewFilter,
  dropActiveYmd,
  onOpenJob,
  onOpenRunSheet,
  onDropJob,
  onOpenDay,
  setDropActive,
}: {
  view: CalView;
  // Week range start (UTC-noon ET anchor of the first visible day).
  anchor: Date;
  // The single day shown in Day view (UTC-noon ET anchor).
  dayAnchor: Date;
  jobs: JobWithItems[];
  visits: Lead[];
  events: CalendarEvent[];
  crews: Crew[];
  crewFilter: string | null;
  dropActiveYmd: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenRunSheet: (jobs: JobWithItems[], crew: Crew | null, dayLabel: string) => void;
  // Composes ET wall-time from the dropped day + the dragged job's time-of-day.
  onDropJob: (ymd: string, payload: ReturnType<typeof readDrag>) => void;
  onOpenDay: (ymd: string) => void;
  setDropActive: (ymd: string | null) => void;
}) {
  const todayYmd = useMemo(() => etYmd(new Date()), []);

  const filteredJobs = useMemo(
    () => (crewFilter ? jobs.filter((j) => j.crew_id === crewFilter) : jobs),
    [jobs, crewFilter],
  );
  const buckets = useMemo(
    () => bucketByDay(filteredJobs, visits, events),
    [filteredJobs, visits, events],
  );
  // Conflicts computed across the unfiltered set so a filtered-out clash still warns.
  const conflicts = useMemo(() => conflictSet(jobs), [jobs]);

  // Native-drop wrapper: parse the payload, hand the day + payload up.
  const dropHandler = (ymd: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(null);
    onDropJob(ymd, readDrag(e));
  };

  if (view === "month") {
    return (
      <MonthGrid
        anchor={anchor}
        todayYmd={todayYmd}
        buckets={buckets}
        conflicts={conflicts}
        crewFilter={crewFilter}
        onOpenDay={onOpenDay}
      />
    );
  }

  if (view === "day") {
    const day: CalDay = { ymd: dayAnchor.toISOString().slice(0, 10), anchor: dayAnchor };
    return (
      <DayView
        day={day}
        todayYmd={todayYmd}
        buckets={buckets}
        conflicts={conflicts}
        dropActiveYmd={dropActiveYmd}
        crews={crews}
        crewFilter={crewFilter}
        onOpenJob={onOpenJob}
        onOpenRunSheet={onOpenRunSheet}
        onDropJob={dropHandler}
        setDropActive={setDropActive}
      />
    );
  }

  const week = walkDays(anchor, 7);
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-7">
      {week.map((day) => (
        <DayColumn
          key={day.ymd}
          day={day}
          todayYmd={todayYmd}
          buckets={buckets}
          conflicts={conflicts}
          dropActiveYmd={dropActiveYmd}
          onOpenJob={onOpenJob}
          onOpenDay={onOpenDay}
          onDropJob={dropHandler}
          setDropActive={setDropActive}
        />
      ))}
    </div>
  );
}
