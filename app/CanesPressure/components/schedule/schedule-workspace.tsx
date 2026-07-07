"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import {
  moveJob,
  scheduleJob,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  etLocalToIso,
  fmtEt,
  type CalendarEvent,
  type Crew,
  type JobWithItems,
  type Lead,
} from "@/lib/canes/types";
import {
  SchedulePicker,
  isCompleteWhen,
} from "@/app/CanesPressure/components/leads/schedule-picker";
import { JobDetailSheet } from "./job-detail-sheet";
import { DayRunSheet } from "./day-run-sheet";
import { CreateEventSheet } from "./create-event-sheet";
import {
  CalendarBoard,
  composeDropIso,
  etYmd,
  walkDays,
  type CalDay,
  type CalView,
} from "./calendar-board";
import {
  TrayCardBody,
  UnscheduledTray,
  type DragPayload,
} from "./unscheduled-tray";

// The scheduler's client owner. One data set, two renderings:
//   • md+ : the Unscheduled Tray + the drag-drop CalendarBoard.
//   • <md : a stacked ET-day agenda + a collapsible "Unscheduled (N)" section
//           with tap-to-schedule (SchedulePicker sheet) — no drag on a phone.
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

function applyMove(board: Board, move: OptMove): Board {
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

  const crew = move.crewId
    ? (job.crew && job.crew.id === move.crewId ? job.crew : null)
    : null;
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

type ViewState = { view: CalView; anchor: Date; dayAnchor: Date };

// ── Mobile agenda ────────────────────────────────────────────────────────────

const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

export function ScheduleWorkspace({
  jobs,
  unscheduled,
  visits,
  crews,
  events,
  view: viewProp,
  startYmd,
  rangeDays,
}: {
  jobs: JobWithItems[];
  unscheduled: JobWithItems[];
  visits: Lead[];
  crews: Crew[];
  events: CalendarEvent[];
  view: CalView;
  startYmd: string;
  rangeDays: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [board, applyOptimistic] = useOptimistic<Board, OptMove>(
    { scheduled: jobs, unscheduled },
    applyMove,
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

  // Sheets (UI-B). Exactly one open at a time.
  const [detailJob, setDetailJob] = useState<JobWithItems | null>(null);
  const [runSheet, setRunSheet] = useState<{ jobs: JobWithItems[]; crew: Crew | null; dayLabel: string } | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);

  // Mobile scheduling sheet + collapsible tray.
  const [scheduleTarget, setScheduleTarget] = useState<JobWithItems | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);

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
  function openDay(ymd: string) {
    navigate("day", ymd);
  }

  const rangeTitle =
    view.view === "day"
      ? DAY_TITLE.format(view.dayAnchor)
      : view.view === "month"
        ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(view.anchor)
        : weekTitle(view.anchor);

  // Mobile agenda: the visible ET days with their jobs + visits, grouped.
  const agendaDays = useMemo(() => {
    const days: CalDay[] = walkDays(new Date(`${startYmd}T12:00:00Z`), rangeDays);
    const todayYmd = etYmd(new Date());
    return days.map((day) => {
      const dayJobs = board.scheduled
        .filter((j) => j.scheduled_at && etYmd(j.scheduled_at) === day.ymd)
        .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
      const dayVisits = visits.filter((v) => v.appointment_at && etYmd(v.appointment_at) === day.ymd);
      return { day, todayYmd, jobs: dayJobs, visits: dayVisits };
    }).filter((g) => g.jobs.length > 0 || g.visits.length > 0);
  }, [board.scheduled, visits, startYmd, rangeDays]);

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
        <UnscheduledTray jobs={board.unscheduled} onCardClick={setDetailJob} />

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
              <span className="ml-1 text-[13px] font-semibold tabular-nums">{rangeTitle}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex rounded-md border border-[var(--cp-line)] p-0.5">
                {(["day", "week", "month"] as CalView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="cp-slot h-[26px] min-w-[52px] px-2 text-[12px] capitalize"
                    data-selected={view.view === v}
                    onClick={() => navigate(v, startYmd)}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <select
                className="cp-select h-[30px] w-auto min-w-[120px] py-0 text-[12.5px]"
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
            onOpenJob={setDetailJob}
            onOpenRunSheet={(sheetJobs, crew, dayLabel) => setRunSheet({ jobs: sheetJobs, crew, dayLabel })}
            onDropJob={handleDrop}
            onOpenDay={openDay}
            setDropActive={setDropActiveYmd}
          />
        </div>
      </div>

      {/* ── Mobile (<md): stacked agenda + collapsible tray + tap-to-schedule ─ */}
      <div className="flex flex-col gap-3 md:hidden">
        <button
          type="button"
          className="cp-card flex items-center justify-between px-3 py-2.5 text-left"
          onClick={() => setTrayOpen((v) => !v)}
        >
          <span className="text-[13.5px] font-semibold">Unscheduled ({board.unscheduled.length})</span>
          <ChevronRight
            size={16}
            strokeWidth={2}
            className={`text-[var(--cp-muted)] transition-transform ${trayOpen ? "rotate-90" : ""}`}
          />
        </button>
        {trayOpen && (
          <div className="flex flex-col gap-2">
            {board.unscheduled.length === 0 ? (
              <p className="px-1 text-[12.5px] text-[var(--cp-faint)]">
                Nothing waiting. Approved estimates land here to be scheduled.
              </p>
            ) : (
              board.unscheduled.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="cp-tray-card text-left"
                  onClick={() => setScheduleTarget(job)}
                >
                  <TrayCardBody job={job} />
                  <span className="mt-1 text-[11.5px] font-semibold text-[var(--cp-brand-deep)]">
                    Tap to schedule
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="cp-divider pt-3">
          {agendaDays.length === 0 ? (
            <p className="text-[13px] text-[var(--cp-faint)]">Nothing scheduled in the next two weeks.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {agendaDays.map(({ day, todayYmd, jobs: dayJobs, visits: dayVisits }) => (
                <section key={day.ymd} className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold">
                    {day.ymd === todayYmd ? "Today" : DAY_TITLE.format(day.anchor)}
                  </h3>
                  {dayVisits.map((v) => (
                    <div key={v.id} className="cp-visit-chip w-full justify-start">
                      <span className="tabular-nums">
                        {fmtEt(v.appointment_at, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className="truncate">{v.name ?? "Estimate visit"}</span>
                    </div>
                  ))}
                  {dayJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className="cp-job-block"
                      data-unassigned={!job.crew}
                      style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
                      onClick={() => setDetailJob(job)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold tabular-nums">
                          {fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--cp-muted)]">
                          <span
                            className="cp-crew-dot"
                            style={job.crew ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties) : undefined}
                          />
                          {job.crew?.name ?? "Assign crew"}
                        </span>
                      </div>
                      <span className="text-[13px] font-semibold">{job.customer_name ?? "Customer"}</span>
                      {job.job_name && <span className="text-[12px] text-[var(--cp-muted)]">{job.job_name}</span>}
                      {job.job_address && (
                        <a
                          href={mapsHref(job.job_address)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--cp-brand-deep)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MapPin size={12} strokeWidth={2} /> Maps
                        </a>
                      )}
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sheets ─────────────────────────────────────────────────────────── */}
      {detailJob && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
          onClick={() => setDetailJob(null)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <JobDetailSheet job={detailJob} crews={crews} onClose={() => setDetailJob(null)} />
          </div>
        </div>
      )}
      {runSheet && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 print:static print:overflow-visible print:bg-transparent print:p-0"
          onClick={() => setRunSheet(null)}
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
                onClick={() => setRunSheet(null)}
              >
                Close
              </button>
            </div>
            <DayRunSheet jobs={runSheet.jobs} crew={runSheet.crew} dayLabel={runSheet.dayLabel} />
          </div>
        </div>
      )}
      {createEventOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
          onClick={() => setCreateEventOpen(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CreateEventSheet crews={crews} onClose={() => setCreateEventOpen(false)} />
          </div>
        </div>
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

// ── Mobile tap-to-schedule sheet ─────────────────────────────────────────────
// Reuses SchedulePicker (proven, ET-aware) plus a crew picker and a duration
// stepper. Also the desktop keyboard/a11y fallback path to drag.

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center"
      onClick={onClose}
    >
      <div
        className="cp-card w-full max-w-md rounded-b-none rounded-t-xl p-4 md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2 pb-2">
          <h2 className="text-[15px] font-semibold">Schedule job</h2>
          <button
            type="button"
            className="text-[13px] font-semibold text-[var(--cp-muted)] hover:underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="pb-3 text-[13px] text-[var(--cp-muted)]">
          {job.customer_name ?? "Customer"}
          {job.job_name ? ` · ${job.job_name}` : ""}
        </p>

        <SchedulePicker value={when} onChange={setWhen} />

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold">Crew</label>
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
          <label className="text-[12.5px] font-semibold">Duration</label>
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
      </div>
    </div>
  );
}
