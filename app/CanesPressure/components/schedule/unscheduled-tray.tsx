"use client";

import { MapPin } from "lucide-react";
import { fmtMoney, type JobWithItems } from "@/lib/canes/types";

// The Unscheduled Tray: approved-but-unplaced jobs waiting to be scheduled —
// the funnel's payoff made visible. On md+ each card is an HTML5-draggable
// source; a drop onto a calendar day column calls scheduleJob. On mobile the
// same card is a tap target (the workspace wraps it in a button that opens the
// SchedulePicker sheet), so the card presentation stays presentation-only and
// reusable across both surfaces.

// dataTransfer payload every drag source stashes and every drop target reads.
export type DragPayload = {
  type: "job";
  id: string;
  // The job's current time-of-day ("HH:mm" ET) so a day-only drop keeps its
  // hour; unscheduled jobs have none, so the board falls back to a default.
  timeOfDay: string | null;
  durationMinutes: number;
  crewId: string | null;
};

export const DRAG_MIME = "application/x-canes-job";

export function writeDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function readDrag(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as DragPayload;
    return p && p.type === "job" && typeof p.id === "string" ? p : null;
  } catch {
    return null;
  }
}

// The card body, shared by the draggable tray (md+) and the mobile tap list.
// Presentation only — the parent supplies the drag/click wrapper.
export function TrayCardBody({ job }: { job: JobWithItems }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold leading-tight">
          {job.customer_name ?? "Customer"}
        </span>
        <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[var(--cp-muted)]">
          {fmtMoney(job.total_cents)}
        </span>
      </div>
      {job.job_name && (
        <span className="truncate text-[12px] text-[var(--cp-muted)]">{job.job_name}</span>
      )}
      {job.job_address && (
        <span className="flex items-center gap-1 truncate text-[11.5px] text-[var(--cp-faint)]">
          <MapPin size={11} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{job.job_address}</span>
        </span>
      )}
    </>
  );
}

export function UnscheduledTray({
  jobs,
  onCardClick,
}: {
  jobs: JobWithItems[];
  // Opens the job detail sheet (desktop keyboard/a11y fallback to drag).
  onCardClick: (job: JobWithItems) => void;
}) {
  return (
    <aside className="cp-card flex h-full min-h-0 flex-col p-3">
      <header className="flex items-baseline justify-between gap-2 pb-2.5">
        <h2 className="text-[14px] font-semibold">Unscheduled</h2>
        <span className="text-[12px] font-semibold tabular-nums text-[var(--cp-muted)]">
          {jobs.length}
        </span>
      </header>

      {jobs.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--cp-faint)]">
          Nothing waiting. Approved estimates land here to be scheduled.
        </p>
      ) : (
        <div className="cp-scroll flex min-h-0 flex-col gap-2 overflow-y-auto">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="cp-tray-card"
              draggable
              onDragStart={(e) =>
                writeDrag(e, {
                  type: "job",
                  id: job.id,
                  timeOfDay: null,
                  durationMinutes: job.duration_minutes,
                  crewId: job.crew_id,
                })
              }
              onClick={() => onCardClick(job)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCardClick(job);
                }
              }}
            >
              <TrayCardBody job={job} />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
