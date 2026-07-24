"use client";

import { useMemo } from "react";
import {
  ET,
  etLocalToIso,
  fmtEt,
  fmtMoney,
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

// Minutes-of-day (0..1439) an instant shows in ET, derived from its wall clock
// via etHm — never local getHours, so it stays correct across DST boundaries.
export function etMinutesOfDay(iso: string): number {
  const [h, m] = etHm(iso).split(":").map(Number);
  return h * 60 + m;
}

// "HH:mm" (ET wall time) for a minutes-of-day value, for composing a drop ISO.
function hhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DOW = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dayHeadLabel(day: CalDay, todayYmd: string): { dow: string; sub: string } {
  return {
    dow: day.ymd === todayYmd ? "Today" : DOW.format(day.anchor),
    sub: MONTH_DAY.format(day.anchor),
  };
}

function timeWindow(job: JobWithItems): string {
  if (!job.scheduled_at) return "";
  const start = fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" });
  if (!job.ends_at) return start;
  const end = fmtEt(job.ends_at, { hour: "numeric", minute: "2-digit" });
  return `${start}–${end}`;
}

const ACTIVE_JOB_STATUSES = ["scheduled", "confirmed", "in_progress"];

function isFinishedJob(job: JobWithItems): boolean {
  return ["completed", "invoiced", "paid"].includes(job.status);
}

// Markate-style combined day revenue: the sum of the day's bucketed job totals.
// Buckets are already crew-filtered, so the number follows the crew filter.
function dayRevenueCents(buckets: DayBuckets, ymd: string): number {
  return (buckets.jobs.get(ymd) ?? []).reduce((sum, j) => sum + j.total_cents, 0);
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
  const placed = jobs.filter(
    (job) =>
      job.scheduled_at &&
      job.ends_at &&
      job.crew_id &&
      ACTIVE_JOB_STATUSES.includes(job.status),
  );
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

// ── Timeline grid (Day / Week true time-axis) ────────────────────────────────
// A pixel-per-minute vertical grid. The visible window defaults to 7:00–19:00
// but expands to include anything (job/visit/event) that starts earlier or ends
// later on the visible days. Everything places absolutely by ET minutes-of-day.

// What the toolbar's All | Jobs | Quotes toggle filters the grid to.
export type ContentKind = "all" | "jobs" | "quotes";

const PX_PER_MIN = 0.9; // 12h window ≈ 648px; hour rules land on clean 54px steps
const DEFAULT_WIN_START = 7 * 60; // 7:00
const DEFAULT_WIN_END = 19 * 60; // 19:00
const SNAP_MIN = 15;

// A job block and an estimate-visit block share the timeline column; both carry
// their ET minutes-of-day span so they pack into shared overlap lanes.
type TimedItem =
  | { kind: "job"; job: JobWithItems; start: number; end: number }
  | { kind: "visit"; visit: Lead; start: number; end: number };

// A calendar_event's ET minutes-of-day span, clamped to the visible day. Events
// can be all-day or cross midnight, so an event on a given ymd is shown for the
// portion that falls within that day (00:00 for a day it started before).
function eventSpanForDay(event: CalendarEvent, ymd: string): { start: number; end: number } | null {
  if (event.all_day) return null; // all-day events render as a top band, not a timed block
  const startYmd = etYmd(event.starts_at);
  const endInstant = new Date(new Date(event.ends_at).getTime() - 60_000);
  const start = startYmd === ymd ? etMinutesOfDay(event.starts_at) : 0;
  const end = etYmd(endInstant) === ymd ? etMinutesOfDay(event.ends_at) : 1440;
  if (end <= start) return null;
  return { start, end };
}

// The [start,end) window (minutes-of-day) to render for a set of days, expanded
// past the 7–19 default to fit anything that spills outside it.
function computeWindow(
  days: CalDay[],
  buckets: DayBuckets,
): { start: number; end: number } {
  let start = DEFAULT_WIN_START;
  let end = DEFAULT_WIN_END;
  for (const day of days) {
    for (const j of buckets.jobs.get(day.ymd) ?? []) {
      if (!j.scheduled_at) continue;
      const s = etMinutesOfDay(j.scheduled_at);
      start = Math.min(start, s);
      end = Math.max(end, s + (j.duration_minutes || 0));
    }
    for (const v of buckets.visits.get(day.ymd) ?? []) {
      if (!v.appointment_at) continue;
      const s = etMinutesOfDay(v.appointment_at);
      start = Math.min(start, s);
      end = Math.max(end, s + 60);
    }
    for (const e of buckets.events.get(day.ymd) ?? []) {
      const span = eventSpanForDay(e, day.ymd);
      if (!span) continue;
      start = Math.min(start, span.start);
      end = Math.max(end, span.end);
    }
  }
  // Snap to the hour outward, keep a sane floor of one hour of height.
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(1440, Math.ceil(end / 60) * 60);
  if (end - start < 60) end = Math.min(1440, start + 60);
  return { start, end };
}

// Pack overlapping items into side-by-side sub-columns so none fully occludes
// another. Greedy interval coloring within a cluster: within a maximal run of
// mutually-chained overlaps, each item takes the first lane free at its start,
// and every item in the cluster shares the cluster's lane count for its width.
type Placed<T> = { item: T; start: number; end: number; lane: number; lanes: number };

function packOverlaps<T>(
  items: T[],
  span: (item: T) => { start: number; end: number },
): Placed<T>[] {
  const sorted = items
    .map((item) => ({ item, ...span(item) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Placed<T>[] = [];
  let cluster: { item: T; start: number; end: number; lane: number }[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = cluster.reduce((max, c) => Math.max(max, c.lane + 1), 0);
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) flush();
    // First lane whose current occupant has ended by this item's start.
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -Infinity, c.end);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > s.start) lane++;
    cluster.push({ item: s.item, start: s.start, end: s.end, lane });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  if (cluster.length) flush();
  return out;
}

// Geometry for a placed item within the window: absolute top/height/left/width.
function blockStyle(
  p: { start: number; end: number; lane: number; lanes: number },
  winStart: number,
): React.CSSProperties {
  const top = (p.start - winStart) * PX_PER_MIN;
  const height = Math.max(16, (p.end - p.start) * PX_PER_MIN);
  const widthPct = 100 / p.lanes;
  return {
    top,
    height,
    left: `calc(${p.lane * widthPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
  };
}

const HOUR_LABEL = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" });

function hourLabel(minutes: number): string {
  // Format via a UTC-noon-anchored date so it never touches the device zone.
  return HOUR_LABEL.format(new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), 0, 0)));
}

function TimeGridColumn({
  day,
  todayYmd,
  buckets,
  conflicts,
  contentKind,
  win,
  nowMinutes,
  dropActiveYmd,
  onOpenJob,
  onOpenVisit,
  onDropJob,
  setDropActive,
}: {
  day: CalDay;
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  contentKind: ContentKind;
  win: { start: number; end: number };
  nowMinutes: number | null;
  dropActiveYmd: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenVisit: (visit: Lead) => void;
  onDropJob: (ymd: string, timeOfDay: string) => (e: React.DragEvent) => void;
  setDropActive: (ymd: string | null) => void;
}) {
  const showJobs = contentKind !== "quotes";
  const showVisits = contentKind !== "jobs";

  // Jobs and visits share one column, so pack them together into a single set of
  // overlap clusters — a job and a visit at the same time then split into
  // side-by-side lanes instead of stacking and occluding each other.
  const timedItems: TimedItem[] = [
    ...(showJobs
      ? (buckets.jobs.get(day.ymd) ?? [])
          .filter((j) => j.scheduled_at)
          .map((job): TimedItem => {
            const start = etMinutesOfDay(job.scheduled_at!);
            return { kind: "job", job, start, end: start + Math.max(SNAP_MIN, job.duration_minutes || 0) };
          })
      : []),
    ...(showVisits
      ? (buckets.visits.get(day.ymd) ?? [])
          .filter((v) => v.appointment_at)
          .map((visit): TimedItem => {
            const start = etMinutesOfDay(visit.appointment_at!);
            return { kind: "visit", visit, start, end: start + 60 };
          })
      : []),
  ];
  const placements = packOverlaps(timedItems, (t) => ({ start: t.start, end: t.end }));

  // Events always show (they are the ground the day is scheduled on). Timed
  // events place by their span; all-day events pin to a band at the window top
  // so they aren't lost off the axis.
  const dayEvents = buckets.events.get(day.ymd) ?? [];
  const allDayEvents = dayEvents.filter((e) => e.all_day);
  const timedEvents = dayEvents
    .map((e) => ({ e, span: eventSpanForDay(e, day.ymd) }))
    .filter((x): x is { e: CalendarEvent; span: { start: number; end: number } } => x.span !== null);

  const hourLines: number[] = [];
  for (let m = Math.ceil(win.start / 60) * 60; m <= win.end; m += 60) hourLines.push(m);

  // Drop → time: the pointer's Y within the scrollable column maps to a minute,
  // snapped to 15. The workspace composes ET wall time from ymd + this via
  // etLocalToIso, so we only need to hand a fresh time-of-day up on the payload.
  const dropAtY = (ymd: string) => (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const raw = win.start + y / PX_PER_MIN;
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    onDropJob(ymd, hhmm(snapped))(e);
  };

  return (
    <div
      className="cp-timegrid-col"
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
      onDrop={dropAtY(day.ymd)}
    >
      {hourLines.map((m) => (
        <div
          key={m}
          className="cp-timegrid-hour"
          style={{ top: (m - win.start) * PX_PER_MIN }}
        />
      ))}

      {allDayEvents.map((e, i) => (
        <div
          key={e.id}
          className="cp-timegrid-event"
          style={{ top: 2 + i * 18, left: 2, right: 2, height: 16 }}
          title={e.notes ?? undefined}
        >
          {e.title}
        </div>
      ))}

      {timedEvents.map(({ e, span }) => (
        <div
          key={e.id}
          className="cp-timegrid-event"
          style={blockStyle({ ...span, lane: 0, lanes: 1 }, win.start)}
          title={e.notes ?? undefined}
        >
          {e.title}
        </div>
      ))}

      {placements.map((p) => {
        const style = blockStyle(p, win.start);
        if (p.item.kind === "job") {
          const job = p.item.job;
          const finished = isFinishedJob(job);
          return (
            <button
              key={`job-${job.id}`}
              type="button"
              className={`cp-timegrid-block ${conflicts.has(job.id) ? "cp-conflict" : ""}`}
              data-unassigned={!job.crew}
              data-finished={finished}
              style={{
                ...style,
                ...(job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : {}),
              }}
              draggable={!finished}
              onDragStart={(ev) => {
                if (finished) return;
                writeDrag(ev, {
                  type: "job",
                  id: job.id,
                  timeOfDay: job.scheduled_at ? etHm(job.scheduled_at) : null,
                  durationMinutes: job.duration_minutes,
                  crewId: job.crew_id,
                });
              }}
              onClick={() => onOpenJob(job)}
            >
              <span className="cp-timegrid-block-time tabular-nums">{timeWindow(job)}</span>
              <span className="truncate">
                {job.customer_name ?? "Customer"}
                {finished ? " · Complete" : ""}
              </span>
              <span className="cp-timegrid-block-crew truncate">
                <span
                  className="cp-crew-dot"
                  style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
                />
                <span className="truncate">{job.crew?.name ?? "Assign crew"}</span>
              </span>
            </button>
          );
        }
        const visit = p.item.visit;
        return (
          <button
            key={`visit-${visit.id}`}
            type="button"
            className="cp-timegrid-visit"
            style={style}
            title={`Quote · ${visit.name ?? "Estimate visit"}`}
            onClick={() => onOpenVisit(visit)}
          >
            <span className="tabular-nums">
              {fmtEt(visit.appointment_at, { hour: "numeric", minute: "2-digit" })}
            </span>
            <span className="truncate">Quote · {visit.name ?? "Visit"}</span>
          </button>
        );
      })}

      {nowMinutes !== null && (
        <div className="cp-timegrid-now" style={{ top: (nowMinutes - win.start) * PX_PER_MIN }} />
      )}
    </div>
  );
}

function TimeGrid({
  days,
  todayYmd,
  buckets,
  conflicts,
  contentKind,
  dropActiveYmd,
  onOpenJob,
  onOpenVisit,
  onOpenDay,
  onDropJob,
  setDropActive,
}: {
  days: CalDay[];
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  contentKind: ContentKind;
  dropActiveYmd: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenVisit: (visit: Lead) => void;
  onOpenDay: (ymd: string) => void;
  onDropJob: (ymd: string, timeOfDay: string) => (e: React.DragEvent) => void;
  setDropActive: (ymd: string | null) => void;
}) {
  const win = useMemo(() => computeWindow(days, buckets), [days, buckets]);
  const winHeight = (win.end - win.start) * PX_PER_MIN;

  // "Now" line: only when today is in view and inside the window.
  const nowMinutes = useMemo(() => {
    if (!days.some((d) => d.ymd === todayYmd)) return null;
    const m = etMinutesOfDay(new Date().toISOString());
    return m >= win.start && m <= win.end ? m : null;
  }, [days, todayYmd, win.start, win.end]);

  const hourLines: number[] = [];
  for (let m = Math.ceil(win.start / 60) * 60; m <= win.end; m += 60) hourLines.push(m);

  // Window height feeds the gutter + every column via --cp-winh; block tops and
  // heights are computed in px inline (blockStyle), so the axis math lives in TS.
  const gridVars = { ["--cp-winh"]: `${winHeight}px` } as React.CSSProperties;

  return (
    <div className="cp-timegrid" style={gridVars}>
      <div className="cp-timegrid-head">
        <div className="cp-timegrid-headspacer" />
        <div className="cp-timegrid-daycols">
          {days.map((day) => {
            const head = dayHeadLabel(day, todayYmd);
            const revenue = dayRevenueCents(buckets, day.ymd);
            return (
              <button
                key={day.ymd}
                type="button"
                // flex-col utilities override the .cp-timegrid-dayhead row so
                // the revenue chip sits under the date; $0 days stay quiet.
                className="cp-timegrid-dayhead flex-col items-stretch gap-0.5"
                data-today={day.ymd === todayYmd}
                onClick={() => onOpenDay(day.ymd)}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span>{head.dow}</span>
                  <span className="cp-timegrid-dayhead-sub">{head.sub}</span>
                </span>
                {revenue > 0 && (
                  <span className="text-[10px] font-semibold tabular-nums tracking-normal text-[var(--cp-ink)]">
                    {fmtMoney(revenue)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cp-timegrid-body cp-scroll">
        <div className="cp-timegrid-gutter">
          {hourLines.map((m) => (
            <span
              key={m}
              className="cp-timegrid-hourlabel"
              style={{ top: (m - win.start) * PX_PER_MIN }}
            >
              {hourLabel(m)}
            </span>
          ))}
        </div>
        <div className="cp-timegrid-cols">
          {days.map((day) => (
            <TimeGridColumn
              key={day.ymd}
              day={day}
              todayYmd={todayYmd}
              buckets={buckets}
              conflicts={conflicts}
              contentKind={contentKind}
              win={win}
              nowMinutes={nowMinutes}
              dropActiveYmd={dropActiveYmd}
              onOpenJob={onOpenJob}
              onOpenVisit={onOpenVisit}
              onDropJob={onDropJob}
              setDropActive={setDropActive}
            />
          ))}
        </div>
      </div>
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
  dropActiveYmd,
  onOpenDay,
  onDropJob,
  setDropActive,
}: {
  anchor: Date;
  todayYmd: string;
  buckets: DayBuckets;
  conflicts: Set<string>;
  crewFilter: string | null;
  dropActiveYmd: string | null;
  onOpenDay: (ymd: string) => void;
  onDropJob: (ymd: string) => (e: React.DragEvent) => void;
  setDropActive: (ymd: string | null) => void;
}) {
  const days = useMemo(() => monthGridDays(anchor), [anchor]);
  const monthIdx = anchor.getUTCMonth();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_HEADS.map((w) => (
          <span key={w} className="cp-mono text-center">
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
          const dayVisits = (buckets.visits.get(day.ymd) ?? []).slice().sort((a, b) =>
            (a.appointment_at ?? "").localeCompare(b.appointment_at ?? ""),
          );
          const eventCount = (buckets.events.get(day.ymd) ?? []).length;
          const shown = dayJobs.slice(0, 3);
          const more = dayJobs.length - shown.length;
          const shownVisits = dayVisits.slice(0, 2);
          const moreVisits = dayVisits.length - shownVisits.length;
          const revenue = dayRevenueCents(buckets, day.ymd);
          return (
            <button
              key={day.ymd}
              type="button"
              className="cp-cal-col gap-1 text-left"
              data-today={day.ymd === todayYmd}
              data-dropactive={dropActiveYmd === day.ymd}
              // minHeight inline: .cp-cal-col's 160px is unlayered CSS and
              // beats a min-h-* utility; month cells want a compact 92px.
              style={{ opacity: inMonth ? 1 : 0.5, minHeight: 92 }}
              onClick={() => onOpenDay(day.ymd)}
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
              <span className="cp-cal-col-head">{day.anchor.getUTCDate()}</span>
              {revenue > 0 && (
                <span className="text-[10.5px] font-semibold tabular-nums leading-none">
                  {fmtMoney(revenue)}
                </span>
              )}
              {shown.map((job) => (
                <span
                  key={job.id}
                  className="truncate rounded-[3px] border-l-2 px-1 py-0.5 text-[10.5px] leading-tight"
                  style={{
                    // Crew colors come from the DB; the unassigned fallback
                    // stays a token so no raw hex leaks into TSX.
                    ["--cp-crew" as string]: job.crew?.color,
                    borderColor: "var(--cp-crew, var(--cp-muted))",
                    background:
                      "color-mix(in srgb, var(--cp-crew, var(--cp-muted)) 8%, var(--cp-surface))",
                    outline: conflicts.has(job.id) ? "1.5px solid var(--cp-warn)" : undefined,
                    opacity: isFinishedJob(job) ? 0.66 : 1,
                  }}
                >
                  {job.customer_name ?? "Job"}{isFinishedJob(job) ? " · Done" : ""}
                </span>
              ))}
              {more > 0 && (
                <span className="text-[10px] font-semibold text-[var(--cp-faint)]">+{more} more</span>
              )}
              {shownVisits.map((v) => (
                <span key={v.id} className="cp-cal-visit-chip">
                  Quote · {v.name ?? "Visit"}
                </span>
              ))}
              {(moreVisits > 0 || eventCount > 0) && (
                <span className="text-[10px] leading-tight text-[var(--cp-faint)]">
                  {moreVisits > 0 && `+${moreVisits} more quote${moreVisits === 1 ? "" : "s"}`}
                  {moreVisits > 0 && eventCount > 0 && " · "}
                  {eventCount > 0 && `${eventCount} event${eventCount === 1 ? "" : "s"}`}
                </span>
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
  contentKind,
  dropActiveYmd,
  onOpenJob,
  onOpenVisit,
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
  // All | Jobs | Quotes toggle: which objects the timeline shows.
  contentKind: ContentKind;
  dropActiveYmd: string | null;
  onOpenJob: (job: JobWithItems) => void;
  onOpenVisit: (visit: Lead) => void;
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

  // Native-drop wrapper (bucket views): parse the payload, hand the day up. The
  // dropped day keeps the dragged job's own time-of-day.
  const dropHandler = (ymd: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(null);
    onDropJob(ymd, readDrag(e));
  };

  // Timeline drop wrapper: the column resolves a snapped time-of-day from the
  // drop Y, which overrides the payload's own time so the drop sets the hour.
  const gridDropHandler = (ymd: string, timeOfDay: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(null);
    const payload = readDrag(e);
    onDropJob(ymd, payload ? { ...payload, timeOfDay } : payload);
  };

  if (view === "month") {
    return (
      <MonthGrid
        anchor={anchor}
        todayYmd={todayYmd}
        buckets={buckets}
        conflicts={conflicts}
        crewFilter={crewFilter}
        dropActiveYmd={dropActiveYmd}
        onOpenDay={onOpenDay}
        onDropJob={dropHandler}
        setDropActive={setDropActive}
      />
    );
  }

  if (view === "day") {
    const day: CalDay = { ymd: dayAnchor.toISOString().slice(0, 10), anchor: dayAnchor };
    const head = dayHeadLabel(day, todayYmd);
    const label = `${head.dow} · ${head.sub}`;
    // Run-sheet entry stays a Day-view affordance (the parent relies on
    // onOpenRunSheet); it hands over the same filtered+sorted day jobs.
    const dayJobs = (buckets.jobs.get(day.ymd) ?? []).slice().sort((a, b) =>
      (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
    );
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-end">
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
        <TimeGrid
          days={[day]}
          todayYmd={todayYmd}
          buckets={buckets}
          conflicts={conflicts}
          contentKind={contentKind}
          dropActiveYmd={dropActiveYmd}
          onOpenJob={onOpenJob}
          onOpenVisit={onOpenVisit}
          onOpenDay={onOpenDay}
          onDropJob={gridDropHandler}
          setDropActive={setDropActive}
        />
      </div>
    );
  }

  const week = walkDays(anchor, 7);
  return (
    <TimeGrid
      days={week}
      todayYmd={todayYmd}
      buckets={buckets}
      conflicts={conflicts}
      contentKind={contentKind}
      dropActiveYmd={dropActiveYmd}
      onOpenJob={onOpenJob}
      onOpenVisit={onOpenVisit}
      onOpenDay={onOpenDay}
      onDropJob={gridDropHandler}
      setDropActive={setDropActive}
    />
  );
}
