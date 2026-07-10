"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Plus,
  Wrench,
} from "lucide-react";
import {
  moveJob,
  scheduleJob,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  etLocalToIso,
  fmtEt,
  fmtMoney,
  type CalendarEvent,
  type Crew,
  type JobInvoiceSummary,
  type JobWithItems,
  type Lead,
} from "@/lib/canes/types";
import {
  SchedulePicker,
  isCompleteWhen,
} from "@/app/CanesPressure/components/leads/schedule-picker";
import { JobDetailSheet } from "./job-detail-sheet";
import { VisitSheet } from "./visit-sheet";
import { DayRunSheet } from "./day-run-sheet";
import { CreateEventSheet } from "./create-event-sheet";
import { CreateJobSheet } from "./create-job-sheet";
import { SheetShell, useSheetBehavior } from "./sheet-shell";
import {
  CalendarBoard,
  composeDropIso,
  etTodayAnchor,
  etYmd,
  walkDays,
  type CalDay,
  type CalView,
} from "./calendar-board";
import {
  UnscheduledTray,
  type DragPayload,
} from "./unscheduled-tray";

// The scheduler's client owner. One data set, two renderings:
//   • md+ : the Unscheduled Tray + the drag-drop CalendarBoard.
//   • <md : a Jobber-style grouped list — sticky week strip, UNSCHEDULED /
//           TODAY / TOMORROW / THIS WEEK groups, a create FAB. No drag on a
//           phone; tray jobs keep tap-to-schedule (SchedulePicker sheet).
// The board is optimistic: a drop moves the card locally via useOptimistic, then
// startTransition dispatches scheduleJob/moveJob. On {ok:false} (incl. the DEMO
// sentinel) the reducer's base reverts to server truth on the next render and the
// notice surfaces inline. revalidatePath re-syncs; we never hand-patch a cache.

// ── Optimistic reducer ───────────────────────────────────────────────────────
// The optimistic layer only needs to reflect placement so the calendar/tray
// re-render instantly; server truth reconciles on the action's revalidate.

type OptMove =
  | { kind: "place"; jobId: string; scheduledIso: string; durationMinutes: number; crewId: string | null }
  | { kind: "unplace"; jobId: string };

type Board = { scheduled: JobWithItems[]; unscheduled: JobWithItems[] };

function applyMove(board: Board, move: OptMove, crews: Crew[]): Board {
  const all = [...board.scheduled, ...board.unscheduled];
  const job = all.find((j) => j.id === move.jobId);
  if (!job) return board;

  if (move.kind === "unplace") {
    const next: JobWithItems = {
      ...job,
      scheduled_at: null,
      ends_at: null,
      status: "unscheduled",
    };
    return {
      scheduled: board.scheduled.filter((j) => j.id !== job.id),
      unscheduled: [next, ...board.unscheduled.filter((j) => j.id !== job.id)],
    };
  }

  // Resolve the crew from the roster so a cross-crew drop paints the right
  // color immediately instead of flashing the unassigned slate.
  const crew = move.crewId ? crews.find((c) => c.id === move.crewId) ?? null : null;
  const endIso = new Date(
    new Date(move.scheduledIso).getTime() + move.durationMinutes * 60_000,
  ).toISOString();
  const resetsToScheduled =
    job.status === "unscheduled" || job.status === "scheduled" || job.status === "confirmed";
  const next: JobWithItems = {
    ...job,
    scheduled_at: move.scheduledIso,
    ends_at: endIso,
    duration_minutes: move.durationMinutes,
    crew_id: move.crewId,
    crew,
    status: resetsToScheduled ? "scheduled" : job.status,
    ...(resetsToScheduled ? { confirmed_at: null } : {}),
  };
  return {
    scheduled: [...board.scheduled.filter((j) => j.id !== job.id), next],
    unscheduled: board.unscheduled.filter((j) => j.id !== job.id),
  };
}

// ── Week / day nav ───────────────────────────────────────────────────────────
// All walks anchor at the UTC-noon ET day (SchedulePicker's idiom), retiring the
// old nowMs + i*86_400_000 local-ms walk that drifted at DST.

const WEEK_TITLE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function weekTitle(anchor: Date): string {
  const end = new Date(anchor.getTime() + 6 * 86_400_000);
  return `${WEEK_TITLE.format(anchor)} – ${WEEK_TITLE.format(end)}`;
}

const DAY_TITLE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DOW_SHORT = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type ViewState = { view: CalView; anchor: Date; dayAnchor: Date };

type DayGroup = { day: CalDay; jobs: JobWithItems[]; visits: Lead[]; events: CalendarEvent[] };

// The ET days an event covers, as an inclusive ymd range. ends_at is a
// half-open bound (the all-day creator writes next-day 00:00), so pull the end
// back a minute before taking its ET date — otherwise every all-day event
// would bleed one day past its span.
function eventYmdRange(event: CalendarEvent): { start: string; end: string } {
  const start = etYmd(event.starts_at);
  const end = etYmd(new Date(new Date(event.ends_at).getTime() - 60_000));
  return { start, end: end < start ? start : end };
}

export function ScheduleWorkspace({
  jobs,
  unscheduled,
  visits,
  crews,
  events,
  invoices,
  view: viewProp,
  startYmd,
  initialJobId = null,
}: {
  jobs: JobWithItems[];
  unscheduled: JobWithItems[];
  visits: Lead[];
  crews: Crew[];
  events: CalendarEvent[];
  invoices: Record<string, JobInvoiceSummary>;
  view: CalView;
  startYmd: string;
  initialJobId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [board, applyOptimistic] = useOptimistic<Board, OptMove>(
    { scheduled: jobs, unscheduled },
    (b, m) => applyMove(b, m, crews),
  );

  // View + anchor derive from the URL-backed props so paging re-fetches the
  // window (the page reads searchParams → refetches → re-renders us). The anchor
  // is the UTC-noon of the ET start day, SchedulePicker's DST-safe idiom.
  const anchor = useMemo(() => new Date(`${startYmd}T12:00:00Z`), [startYmd]);
  const view: ViewState = { view: viewProp, anchor, dayAnchor: anchor };

  // Push a new (view, start) to the URL; the server refetches the visible range.
  function navigate(nextView: CalView, nextYmd: string) {
    startTransition(() => {
      router.push(`/CanesPressure/schedule?view=${nextView}&start=${nextYmd}`);
    });
  }

  const [crewFilter, setCrewFilter] = useState<string | null>(null);
  const [dropActiveYmd, setDropActiveYmd] = useState<string | null>(null);

  // Sheets. Exactly one open at a time. The job sheet tracks an id and derives
  // the live record from (revalidated) props, so status and billing state
  // refresh after actions. But "Complete & bill" makes the job terminal and
  // refresh() drops it from the board mid-flow — so every board resolution is
  // cached, and when the lookup fails the sheet renders from that snapshot,
  // keeping the payment chooser mounted until the owner closes it.
  // ?job= deep link opens the sheet once, as initial state — never an effect,
  // so closing it doesn't fight the URL. An id outside the window finds no job
  // (and has no snapshot) and simply renders nothing.
  const [detailJobId, setDetailJobId] = useState<string | null>(initialJobId);
  const boardDetailJob = detailJobId
    ? [...board.scheduled, ...board.unscheduled].find((j) => j.id === detailJobId) ?? null
    : null;
  const [detailSnapshot, setDetailSnapshot] = useState<{
    job: JobWithItems;
    invoice: JobInvoiceSummary | null;
  } | null>(null);
  // Sync during render (React's adjust-state-on-props-change idiom, not an
  // effect). The source is the server props, not the optimistic board: prop
  // identities are stable between refreshes, so the identity guard converges
  // in one extra render — the optimistic reducer rebuilds objects while a
  // transition is pending and would keep the guard firing.
  const propsDetailJob = detailJobId
    ? [...jobs, ...unscheduled].find((j) => j.id === detailJobId) ?? null
    : null;
  if (propsDetailJob) {
    const propsInvoice = invoices[propsDetailJob.id] ?? null;
    if (detailSnapshot?.job !== propsDetailJob || detailSnapshot.invoice !== propsInvoice) {
      setDetailSnapshot({ job: propsDetailJob, invoice: propsInvoice });
    }
  }
  const detailJob =
    boardDetailJob ??
    (detailJobId && detailSnapshot?.job.id === detailJobId ? detailSnapshot.job : null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const activeVisit = visitId ? visits.find((v) => v.id === visitId) ?? null : null;
  const [runSheet, setRunSheet] = useState<{ jobs: JobWithItems[]; crew: Crew | null; dayLabel: string } | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  // Mobile: tap-to-schedule target + the week strip's day filter.
  const [scheduleTarget, setScheduleTarget] = useState<JobWithItems | null>(null);
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);

  // Run an action optimistically, revert-by-reconcile on failure via the notice.
  function dispatch(move: OptMove, fn: () => Promise<ActionResult>) {
    setNotice(null);
    startTransition(async () => {
      applyOptimistic(move);
      const res = await fn();
      if (res.notice) setNotice({ ok: res.ok, text: res.notice });
      // On {ok:false} the optimistic layer is discarded and the base (server
      // truth, re-fetched by revalidatePath) is what renders next.
    });
  }

  function handleDrop(ymd: string, payload: DragPayload | null) {
    if (!payload) return;
    const scheduledIso = composeDropIso(ymd, payload.timeOfDay);
    const fromTray = board.unscheduled.some((j) => j.id === payload.id);
    dispatch(
      { kind: "place", jobId: payload.id, scheduledIso, durationMinutes: payload.durationMinutes, crewId: payload.crewId },
      fromTray
        ? () => scheduleJob(payload.id, scheduledIso, payload.durationMinutes, payload.crewId)
        : () => moveJob(payload.id, scheduledIso, payload.durationMinutes, payload.crewId),
    );
  }

  function goToday() {
    setSelectedDayYmd(null);
    navigate(view.view, etYmd(new Date()));
  }
  function step(delta: number) {
    let next: Date;
    if (view.view === "month") {
      // Calendar-month arithmetic so the step lands on the 1st of the next
      // month, not a fixed 30 days that drifts across month lengths.
      next = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1, 12, 0, 0),
      );
    } else {
      const span = view.view === "day" ? 1 : 7;
      next = new Date(anchor.getTime() + delta * span * 86_400_000);
    }
    navigate(view.view, etYmd(next));
  }
  // Mobile pages a week at a time regardless of the desktop view choice.
  function stepWeek(delta: number) {
    setSelectedDayYmd(null);
    navigate(view.view, etYmd(new Date(anchor.getTime() + delta * 7 * 86_400_000)));
  }
  function openDay(ymd: string) {
    navigate("day", ymd);
  }

  const rangeTitle =
    view.view === "day"
      ? DAY_TITLE.format(view.dayAnchor)
      : view.view === "month"
        ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(view.anchor)
        : weekTitle(view.anchor);

  // ── Mobile week data ─────────────────────────────────────────────────────
  const todayYmd = etYmd(new Date());
  const tomorrowYmd = etYmd(new Date(etTodayAnchor().getTime() + 86_400_000));

  const weekData: DayGroup[] = useMemo(() => {
    return walkDays(new Date(`${startYmd}T12:00:00Z`), 7).map((day) => ({
      day,
      jobs: board.scheduled
        .filter((j) => j.scheduled_at && etYmd(j.scheduled_at) === day.ymd)
        .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
      visits: visits.filter((v) => v.appointment_at && etYmd(v.appointment_at) === day.ymd),
      // Events show on every day they overlap — the mobile FAB creates them,
      // so the mobile list must render them or a save reads as failed.
      events: events.filter((e) => {
        const range = eventYmdRange(e);
        return range.start <= day.ymd && day.ymd <= range.end;
      }),
    }));
  }, [board.scheduled, visits, events, startYmd]);

  const weekHasToday = weekData.some((d) => d.day.ymd === todayYmd);

  // Groups for the list: a selected day shows alone; otherwise TODAY, TOMORROW,
  // then the rest of the visible week (labeled by range when paged elsewhere).
  const mobileGroups = useMemo(() => {
    const dayLabel = (d: DayGroup) =>
      d.day.ymd === todayYmd
        ? "Today"
        : d.day.ymd === tomorrowYmd
          ? "Tomorrow"
          : `${DOW_SHORT.format(d.day.anchor)} · ${MONTH_DAY.format(d.day.anchor)}`;

    if (selectedDayYmd) {
      const picked = weekData.filter((d) => d.day.ymd === selectedDayYmd);
      return picked.map((d) => ({ label: dayLabel(d), days: [d], showDow: false }));
    }

    const withContent = weekData.filter(
      (d) => d.jobs.length > 0 || d.visits.length > 0 || d.events.length > 0,
    );
    const groups: { label: string; days: DayGroup[]; showDow: boolean }[] = [];
    const today = withContent.filter((d) => d.day.ymd === todayYmd);
    const tomorrow = withContent.filter((d) => d.day.ymd === tomorrowYmd);
    const rest = withContent.filter((d) => d.day.ymd !== todayYmd && d.day.ymd !== tomorrowYmd);
    if (today.length) groups.push({ label: "Today", days: today, showDow: false });
    if (tomorrow.length) groups.push({ label: "Tomorrow", days: tomorrow, showDow: false });
    if (rest.length)
      groups.push({
        label: weekHasToday ? "This week" : `Week of ${MONTH_DAY.format(anchor)}`,
        days: rest,
        showDow: true,
      });
    return groups;
  }, [weekData, selectedDayYmd, todayYmd, tomorrowYmd, weekHasToday, anchor]);

  const mobileEmpty = mobileGroups.every((g) =>
    g.days.every((d) => d.jobs.length === 0 && d.visits.length === 0 && d.events.length === 0),
  );

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p
          className={`text-[12.5px] font-medium leading-snug ${notice.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}
          role="status"
        >
          {notice.text}
        </p>
      )}

      {/* ── Desktop (md+): tray + drag-drop board ─────────────────────────── */}
      <div className="hidden gap-4 md:grid md:grid-cols-[minmax(220px,260px)_1fr]">
        <UnscheduledTray jobs={board.unscheduled} onCardClick={(j) => setDetailJobId(j.id)} />

        <div className="flex min-w-0 flex-col gap-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button type="button" className="cp-btn cp-btn-sm" onClick={goToday}>
                Today
              </button>
              <button type="button" className="cp-btn cp-btn-sm" onClick={() => step(-1)} aria-label="Previous">
                <ChevronLeft size={15} strokeWidth={2} />
              </button>
              <button type="button" className="cp-btn cp-btn-sm" onClick={() => step(1)} aria-label="Next">
                <ChevronRight size={15} strokeWidth={2} />
              </button>
              <span className="cp-display ml-1.5 text-[16px] tabular-nums">{rangeTitle}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="cp-seg">
                {(["day", "week", "month"] as CalView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="cp-seg-btn capitalize"
                    data-active={view.view === v}
                    onClick={() => navigate(v, startYmd)}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* min-h-0: height loses to .cp-select's 38px min-height no
                  matter the layer order, so zero it for the h-[30px] compact
                  size to actually match the 30px cp-btn-sm toolbar buttons. */}
              <select
                className="cp-select h-[30px] min-h-0 w-auto min-w-[120px] py-0 text-[12.5px]"
                value={crewFilter ?? ""}
                onChange={(e) => setCrewFilter(e.target.value || null)}
              >
                <option value="">All crews</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button type="button" className="cp-btn cp-btn-sm" onClick={() => setCreateEventOpen(true)}>
                <CalendarPlus size={14} strokeWidth={2} /> Event
              </button>
            </div>
          </div>

          <CalendarBoard
            view={view.view}
            anchor={view.anchor}
            dayAnchor={view.dayAnchor}
            jobs={board.scheduled}
            visits={visits}
            events={events}
            crews={crews}
            crewFilter={crewFilter}
            dropActiveYmd={dropActiveYmd}
            onOpenJob={(j) => setDetailJobId(j.id)}
            onOpenVisit={(v) => setVisitId(v.id)}
            onOpenRunSheet={(sheetJobs, crew, dayLabel) => setRunSheet({ jobs: sheetJobs, crew, dayLabel })}
            onDropJob={handleDrop}
            onOpenDay={openDay}
            setDropActive={setDropActiveYmd}
          />
        </div>
      </div>

      {/* ── Mobile (<md): week strip + grouped list + create FAB ──────────── */}
      <div className="flex flex-col gap-4 md:hidden">
        {/* Sticky week strip: paging + 7 tappable day chips with counts */}
        <div className="sticky top-0 z-30 -mx-4 border-b border-[var(--cp-line)] bg-[var(--cp-bg)] px-4 pb-2.5 pt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="cp-display text-[15px] tabular-nums">{weekTitle(anchor)}</span>
            {/* min-h/w-10 (40px) over cp-btn-sm's 30px: these are the primary
                thumb targets for paging on a phone, and at 30px a tap aimed at
                "next" too easily lands on "previous". */}
            <div className="flex items-center gap-1">
              <button type="button" className="cp-btn cp-btn-sm min-h-10" onClick={goToday}>
                Today
              </button>
              <button
                type="button"
                className="cp-btn cp-btn-sm min-h-10 min-w-10"
                onClick={() => stepWeek(-1)}
                aria-label="Previous week"
              >
                <ChevronLeft size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="cp-btn cp-btn-sm min-h-10 min-w-10"
                onClick={() => stepWeek(1)}
                aria-label="Next week"
              >
                <ChevronRight size={15} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="mt-2 flex gap-1">
            {weekData.map(({ day, jobs: dayJobs, visits: dayVisits, events: dayEvents }) => {
              const count = dayJobs.length + dayVisits.length + dayEvents.length;
              const isToday = day.ymd === todayYmd;
              const selected = selectedDayYmd === day.ymd;
              return (
                <button
                  key={day.ymd}
                  type="button"
                  className="cp-slot min-h-11 min-w-0 flex-1"
                  // Inline because .cp-slot's 10px side padding is unlayered
                  // CSS and beats Tailwind utilities; 7 chips need 4px to fit.
                  style={{ paddingInline: 4 }}
                  data-selected={selected}
                  onClick={() => setSelectedDayYmd(selected ? null : day.ymd)}
                >
                  <span className={`tabular-nums ${isToday && !selected ? "text-[var(--cp-brand-deep)]" : ""}`}>
                    {day.anchor.getUTCDate()}
                  </span>
                  <span className="cp-slot-sub tabular-nums">
                    {DOW_SHORT.format(day.anchor)}
                    {count > 0 ? ` · ${count}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Unscheduled group — tap a row to schedule it */}
        {board.unscheduled.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="cp-list-header cp-group-brand">
              Unscheduled · {board.unscheduled.length}
            </p>
            <div className="cp-list">
              {board.unscheduled.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="cp-list-row"
                  onClick={() => setScheduleTarget(job)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="cp-list-title flex items-center gap-1.5">
                      <span className="truncate">{job.customer_name ?? "Customer"}</span>
                    </span>
                    {job.job_name && (
                      <span className="cp-list-sub block truncate">{job.job_name}</span>
                    )}
                    <span className="mt-0.5 block text-[11.5px] font-semibold text-[var(--cp-brand-deep)]">
                      Tap to schedule
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {fmtMoney(job.total_cents)}
                  </span>
                  <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Day groups */}
        {mobileGroups.length === 0 || mobileEmpty ? (
          <p className="text-[13px] text-[var(--cp-faint)]">
            {selectedDayYmd ? "Nothing on this day." : "Nothing scheduled this week."}
          </p>
        ) : (
          mobileGroups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <p className="cp-list-header">{group.label}</p>
              <div className="cp-list">
                {group.days.map((d) => {
                  const dow = group.showDow ? DOW_SHORT.format(d.day.anchor) : null;
                  return [
                    ...d.events.map((ev) => (
                      <MobileEventRow key={ev.id} event={ev} dow={dow} />
                    )),
                    ...d.visits.map((v) => (
                      <MobileVisitRow
                        key={v.id}
                        visit={v}
                        dow={dow}
                        onOpen={() => setVisitId(v.id)}
                      />
                    )),
                    ...d.jobs.map((job) => (
                      <MobileJobRow
                        key={job.id}
                        job={job}
                        dow={dow}
                        onOpen={() => setDetailJobId(job.id)}
                      />
                    )),
                  ];
                })}
              </div>
            </section>
          ))
        )}

        {/* Create FAB → Job / Event menu */}
        <button
          type="button"
          className="cp-fab fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40"
          onClick={() => setCreateMenuOpen(true)}
          aria-label="Create"
        >
          <Plus size={24} strokeWidth={2} />
        </button>
      </div>

      {/* ── Sheets ─────────────────────────────────────────────────────────── */}
      {detailJob && (
        <JobDetailSheet
          job={detailJob}
          crews={crews}
          // Live map first (refresh keeps it fresh even for terminal jobs),
          // snapshot as the fallback so billing state survives the unmount gap.
          invoice={invoices[detailJob.id] ?? detailSnapshot?.invoice ?? null}
          onClose={() => {
            setDetailJobId(null);
            setDetailSnapshot(null);
          }}
        />
      )}
      {activeVisit && <VisitSheet visit={activeVisit} onClose={() => setVisitId(null)} />}
      {runSheet && (
        <RunSheetOverlay
          jobs={runSheet.jobs}
          crew={runSheet.crew}
          dayLabel={runSheet.dayLabel}
          onClose={() => setRunSheet(null)}
        />
      )}
      {createEventOpen && <CreateEventSheet crews={crews} onClose={() => setCreateEventOpen(false)} />}
      {createJobOpen && <CreateJobSheet crews={crews} onClose={() => setCreateJobOpen(false)} />}
      {createMenuOpen && (
        <SheetShell title="Create" onClose={() => setCreateMenuOpen(false)}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="cp-card cp-card-hover flex items-center gap-3 px-3.5 py-3 text-left"
              onClick={() => {
                setCreateMenuOpen(false);
                setCreateJobOpen(true);
              }}
            >
              <Wrench size={16} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">Job</span>
                <span className="block text-[12px] text-[var(--cp-muted)]">
                  Add a manual job for a customer
                </span>
              </span>
            </button>
            <button
              type="button"
              className="cp-card cp-card-hover flex items-center gap-3 px-3.5 py-3 text-left"
              onClick={() => {
                setCreateMenuOpen(false);
                setCreateEventOpen(true);
              }}
            >
              <CalendarPlus size={16} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">Event</span>
                <span className="block text-[12px] text-[var(--cp-muted)]">
                  Block time, time off, or a holiday
                </span>
              </span>
            </button>
          </div>
        </SheetShell>
      )}
      {scheduleTarget && (
        <MobileScheduleSheet
          job={scheduleTarget}
          crews={crews}
          isPending={isPending}
          onClose={() => setScheduleTarget(null)}
          onSchedule={(scheduledIso, durationMinutes, crewId) => {
            dispatch(
              { kind: "place", jobId: scheduleTarget.id, scheduledIso, durationMinutes, crewId },
              () => scheduleJob(scheduleTarget.id, scheduledIso, durationMinutes, crewId),
            );
            setScheduleTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── Run sheet overlay ────────────────────────────────────────────────────────
// Utilities-only frame (not .cp-sheet): canes.css is unlayered so Tailwind's
// print: variants cannot override the sheet's position:fixed — a plain overlay
// keeps the run sheet printable as a full document.

function RunSheetOverlay({
  jobs,
  crew,
  dayLabel,
  onClose,
}: {
  jobs: JobWithItems[];
  crew: Crew | null;
  dayLabel: string;
  onClose: () => void;
}) {
  useSheetBehavior(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 print:static print:overflow-visible print:bg-transparent print:p-0"
      onClick={onClose}
    >
      <div
        className="cp-card w-full max-w-lg p-4 print:max-w-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2 pb-2 print:hidden">
          <h2 className="text-[15px] font-semibold">Run sheet</h2>
          <button
            type="button"
            className="text-[13px] font-semibold text-[var(--cp-muted)] hover:underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <DayRunSheet jobs={jobs} crew={crew} dayLabel={dayLabel} />
      </div>
    </div>
  );
}

// ── Mobile list rows ─────────────────────────────────────────────────────────
// iOS inset-list rows sharing one .cp-list card. The two-object discipline
// survives via the leading marker: a solid crew dot for a job, a hollow ring
// for an estimate visit, a muted square for a non-bookable calendar event.

function MobileJobRow({
  job,
  dow,
  onOpen,
}: {
  job: JobWithItems;
  dow: string | null;
  onOpen: () => void;
}) {
  const time = job.scheduled_at
    ? fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" })
    : "—";
  return (
    <button type="button" className="cp-list-row" onClick={onOpen}>
      <span
        className="cp-crew-dot"
        style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="cp-list-title block truncate">
          {job.customer_name ?? "Customer"}
        </span>
        <span className="cp-list-sub flex items-center gap-1.5">
          <span className="shrink-0 tabular-nums">
            {dow ? `${dow} · ${time}` : time}
          </span>
          {job.job_name && (
            <>
              <span className="shrink-0 text-[var(--cp-faint)]">·</span>
              <span className="truncate">{job.job_name}</span>
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums">
        {fmtMoney(job.total_cents)}
      </span>
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </button>
  );
}

// A calendar event (time off / block / holiday) as a muted, non-interactive
// list row — the "unavailable ground" reading, hatched marker instead of a crew
// dot so it never reads as a bookable job.
function MobileEventRow({ event, dow }: { event: CalendarEvent; dow: string | null }) {
  const time = event.all_day
    ? "All day"
    : fmtEt(event.starts_at, { hour: "numeric", minute: "2-digit" });
  return (
    <div className="cp-list-row" title={event.notes ?? undefined}>
      <span className="inline-block h-2 w-2 shrink-0 rounded-[2px] bg-[var(--cp-line-strong)]" />
      <span className="min-w-0 flex-1">
        <span className="cp-list-title block truncate text-[var(--cp-muted)]">
          {event.title}
        </span>
        <span className="cp-list-sub block truncate tabular-nums">
          {dow ? `${dow} · ${time}` : time}
        </span>
      </span>
    </div>
  );
}

// An estimate visit as a list row — hollow crew marker keeps the two-object
// discipline (jobs solid, visits hairline) inside the shared inset list.
function MobileVisitRow({
  visit,
  dow,
  onOpen,
}: {
  visit: Lead;
  dow: string | null;
  onOpen: () => void;
}) {
  const time = fmtEt(visit.appointment_at, { hour: "numeric", minute: "2-digit" });
  return (
    <button type="button" className="cp-list-row" onClick={onOpen}>
      <span className="inline-block h-2 w-2 shrink-0 rounded-full border border-[var(--cp-line-strong)]" />
      <span className="min-w-0 flex-1">
        <span className="cp-list-title flex items-center gap-1.5">
          <span className="truncate">{visit.name ?? "Estimate visit"}</span>
        </span>
        <span className="cp-list-sub flex items-center gap-1.5">
          <span className="shrink-0 tabular-nums">{dow ? `${dow} · ${time}` : time}</span>
          {visit.service && (
            <>
              <span className="shrink-0 text-[var(--cp-faint)]">·</span>
              <span className="truncate">{visit.service}</span>
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-[var(--cp-faint)]">
        Visit
      </span>
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </button>
  );
}

// ── Mobile tap-to-schedule sheet ─────────────────────────────────────────────
// Reuses SchedulePicker (proven, ET-aware) plus a crew picker and a duration
// stepper, inside the shared sheet shell.

const DURATIONS = [60, 90, 120, 180, 240];

function MobileScheduleSheet({
  job,
  crews,
  isPending,
  onClose,
  onSchedule,
}: {
  job: JobWithItems;
  crews: Crew[];
  isPending: boolean;
  onClose: () => void;
  onSchedule: (scheduledIso: string, durationMinutes: number, crewId: string | null) => void;
}) {
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(job.duration_minutes || 120);
  const [crewId, setCrewId] = useState<string | null>(job.crew_id);

  return (
    <SheetShell title="Schedule job" onClose={onClose}>
      <p className="pb-3 text-[13px] text-[var(--cp-muted)]">
        {job.customer_name ?? "Customer"}
        {job.job_name ? ` · ${job.job_name}` : ""}
      </p>

      <SchedulePicker value={when} onChange={setWhen} />

      <div className="mt-3 flex flex-col gap-1">
        <label className="cp-label">Crew</label>
        <select
          className="cp-select"
          value={crewId ?? ""}
          onChange={(e) => setCrewId(e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <label className="cp-label">Duration</label>
        <div className="flex flex-wrap gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              className="cp-slot"
              data-selected={d === duration}
              onClick={() => setDuration(d)}
            >
              {d < 120 ? `${d}m` : `${d / 60}h`}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="cp-btn cp-btn-primary mt-4 w-full"
        disabled={!isCompleteWhen(when) || isPending}
        onClick={() => onSchedule(etLocalToIso(when), duration, crewId)}
      >
        {isPending ? "Scheduling..." : "Schedule"}
      </button>
    </SheetShell>
  );
}
