"use client";

import { useState, useTransition } from "react";
import {
  CalendarClock,
  CircleSlash,
  MapPin,
  Phone,
  Undo2,
  X,
} from "lucide-react";
import {
  assignJob,
  moveJob,
  scheduleJob,
  setJobStatus,
  unscheduleJob,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  etLocalToIso,
  fmtEt,
  fmtMoney,
  fmtPhone,
  JOB_STATUS_LABEL,
  type Crew,
  type JobInvoiceSummary,
  type JobStatus,
  type JobWithItems,
} from "@/lib/canes/types";
import { isCompleteWhen, SchedulePicker } from "../leads/schedule-picker";
import { JobBilling } from "./job-billing";

// Job detail sheet (plan §4.3) — the single control surface for a job, reused
// as the entire mobile scheduling UX. Reuses the contact-rail Row pattern, the
// SchedulePicker, and the disposition useAction/Notice inline-notice pattern.

type Feedback = { ok: boolean; text: string } | null;

function useAction() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onOk?.();
    });
  }
  return { isPending, feedback, run };
}

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

function initials(name: string | null): string {
  if (!name) return "#";
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#").slice(0, 2);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12.5px] text-[var(--cp-faint)]">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}

const DURATIONS = [60, 90, 120, 180, 240, 300] as const;

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function scheduleSummary(job: JobWithItems): string {
  if (!job.scheduled_at) return "Not scheduled";
  const start = fmtEt(job.scheduled_at);
  const end = job.ends_at
    ? fmtEt(job.ends_at, { hour: "numeric", minute: "2-digit" })
    : "";
  return end ? `${start} – ${end}` : start;
}

export function JobDetailSheet({
  job,
  crews,
  invoice,
  onClose,
}: {
  job: JobWithItems;
  crews: Crew[];
  invoice?: JobInvoiceSummary | null;
  onClose: () => void;
}) {
  const { isPending, feedback, run } = useAction();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState<number>(job.duration_minutes || 120);
  const [pickCrew, setPickCrew] = useState<string>(job.crew_id ?? "");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const placed = job.scheduled_at !== null;
  const terminal =
    job.status === "completed" ||
    job.status === "invoiced" ||
    job.status === "paid" ||
    job.status === "canceled";

  const mapsHref = job.job_address
    ? `https://maps.google.com/?q=${encodeURIComponent(job.job_address)}`
    : null;

  return (
    <div className="cp-card flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-line)] px-4 py-3">
        <p className="text-[13px] font-semibold">Job details</p>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--cp-muted)] hover:bg-[var(--cp-hover)]"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="cp-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* Identity */}
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8ebee] text-[15px] font-semibold text-[var(--cp-muted)]">
            {initials(job.customer_name)}
          </span>
          <p className="mt-2.5 text-[15px] font-semibold leading-tight">
            {job.customer_name ?? "Unnamed job"}
          </p>
          {job.job_name && (
            <p className="mt-0.5 text-[12.5px] text-[var(--cp-muted)]">{job.job_name}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">
              {JOB_STATUS_LABEL[job.status]}
            </span>
            {job.crew && (
              <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">
                <span
                  className="cp-crew-dot"
                  style={{ ["--cp-crew" as string]: job.crew.color }}
                />
                {job.crew.name}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {job.customer_phone ? (
            <a href={`tel:${job.customer_phone}`} className="cp-btn cp-btn-sm">
              <Phone size={14} strokeWidth={2} /> Call
            </a>
          ) : (
            <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">No phone</span>
          )}
          {mapsHref ? (
            <a href={mapsHref} target="_blank" rel="noreferrer" className="cp-btn cp-btn-sm">
              <MapPin size={14} strokeWidth={2} /> Maps
            </a>
          ) : (
            <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">No address</span>
          )}
        </div>

        {/* Properties */}
        <div className="cp-divider mt-4 pt-3">
          <Row label="Customer">{job.customer_name ?? "—"}</Row>
          <Row label="Phone">
            {job.customer_phone ? (
              <a href={`tel:${job.customer_phone}`} className="tabular-nums hover:underline">
                {fmtPhone(job.customer_phone)}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Service">{job.job_name ?? "—"}</Row>
          <Row label="Total">
            <span className="tabular-nums">{fmtMoney(job.total_cents)}</span>
          </Row>
          <Row label="Crew">
            {job.crew ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="cp-crew-dot"
                  style={{ ["--cp-crew" as string]: job.crew.color }}
                />
                {job.crew.name}
              </span>
            ) : (
              <span className="text-[var(--cp-faint)]">Unassigned</span>
            )}
          </Row>
          <Row label="Schedule">
            <span className="tabular-nums">{scheduleSummary(job)}</span>
          </Row>
          {job.arrival_window_minutes > 0 && job.scheduled_at && (
            <Row label="Arrival window">
              <span className="tabular-nums">
                {fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" })}–
                {fmtEt(
                  new Date(
                    new Date(job.scheduled_at).getTime() + job.arrival_window_minutes * 60_000,
                  ).toISOString(),
                  { hour: "numeric", minute: "2-digit" },
                )}
              </span>
            </Row>
          )}
        </div>

        {/* Address */}
        {job.job_address && (
          <div className="cp-divider mt-2 pt-3">
            <p className="text-[12.5px] text-[var(--cp-faint)]">Address</p>
            <p className="mt-1 text-[13px] font-medium leading-snug">{job.job_address}</p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
              >
                <MapPin size={13} strokeWidth={2} /> Open in Maps
              </a>
            )}
          </div>
        )}

        {/* Gate code */}
        {job.gate_code && (
          <div className="cp-divider mt-2 pt-3">
            <p className="text-[12.5px] text-[var(--cp-faint)]">Gate code</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums tracking-wide">
              {job.gate_code}
            </p>
          </div>
        )}

        {/* Site notes */}
        {job.site_notes && (
          <div className="cp-divider mt-2 pt-3">
            <p className="text-[12.5px] text-[var(--cp-faint)]">Site notes</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
              {job.site_notes}
            </p>
          </div>
        )}

        {/* Line items */}
        <div className="cp-divider mt-2 pt-3">
          <p className="text-[12.5px] text-[var(--cp-faint)]">Line items</p>
          {job.items.length === 0 ? (
            <p className="mt-1 text-[13px] text-[var(--cp-muted)]">No line items on this job.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {job.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13px]">
                    {item.quantity !== 1 && (
                      <span className="text-[var(--cp-faint)] tabular-nums">
                        {item.quantity}×{" "}
                      </span>
                    )}
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-[var(--cp-muted)]">
                    {fmtMoney(item.line_total_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Controls ─────────────────────────────────────────────── */}

        {!terminal && (
          <div className="cp-divider mt-4 pt-3 space-y-3">
            {/* Reschedule / schedule */}
            {!rescheduleOpen ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="cp-btn cp-btn-sm"
                  disabled={isPending}
                  onClick={() => {
                    setDuration(job.duration_minutes || 120);
                    setPickCrew(job.crew_id ?? "");
                    setRescheduleOpen(true);
                  }}
                >
                  <CalendarClock size={14} strokeWidth={2} />
                  {placed ? "Reschedule" : "Schedule"}
                </button>
                {placed && (
                  <button
                    type="button"
                    className="cp-btn cp-btn-sm"
                    disabled={isPending}
                    onClick={() => run(() => unscheduleJob(job.id), onClose)}
                  >
                    <Undo2 size={14} strokeWidth={2} /> Unschedule
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <SchedulePicker value={when} onChange={setWhen} />

                <div>
                  <p className="cp-label">Duration</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="cp-slot"
                        data-selected={d === duration}
                        onClick={() => setDuration(d)}
                      >
                        {durationLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="cp-label">Crew</p>
                  <select
                    className="cp-select"
                    value={pickCrew}
                    onChange={(e) => setPickCrew(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cp-btn cp-btn-primary cp-btn-sm flex-1"
                    disabled={!isCompleteWhen(when) || isPending}
                    onClick={() => {
                      const iso = etLocalToIso(when);
                      const crewId = pickCrew || null;
                      run(
                        () =>
                          placed
                            ? moveJob(job.id, iso, duration, crewId)
                            : scheduleJob(job.id, iso, duration, crewId),
                        () => {
                          setRescheduleOpen(false);
                          setWhen("");
                        },
                      );
                    }}
                  >
                    {isPending ? "Saving..." : placed ? "Move job" : "Schedule job"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn-sm"
                    disabled={isPending}
                    onClick={() => {
                      setRescheduleOpen(false);
                      setWhen("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Assign crew (quick, without rescheduling) */}
            {!rescheduleOpen && (
              <div>
                <p className="cp-label">Assign crew</p>
                <select
                  className="cp-select"
                  value={job.crew_id ?? ""}
                  disabled={isPending}
                  onChange={(e) => run(() => assignJob(job.id, e.target.value || null))}
                >
                  <option value="">Unassigned</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Status */}
            <div>
              <p className="cp-label">Status</p>
              <select
                className="cp-select"
                value={job.status}
                disabled={isPending}
                onChange={(e) => {
                  const next = e.target.value as JobStatus;
                  if (next === "canceled") {
                    setCancelOpen(true);
                    return;
                  }
                  run(() => setJobStatus(job.id, next));
                }}
              >
                {(Object.keys(JOB_STATUS_LABEL) as JobStatus[]).map((s) => (
                  <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>

            {/* Cancel / no-show with a required reason */}
            {!cancelOpen ? (
              <button
                type="button"
                className="cp-btn cp-btn-sm cp-btn-danger w-full"
                disabled={isPending}
                onClick={() => setCancelOpen(true)}
              >
                <CircleSlash size={14} strokeWidth={2} /> Cancel / no-show
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  className="cp-input"
                  placeholder="Reason (required) — e.g. no-show, rescheduled by customer"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cp-btn cp-btn-sm cp-btn-danger flex-1"
                    disabled={isPending || !reason.trim()}
                    onClick={() =>
                      run(
                        () => setJobStatus(job.id, "canceled", reason.trim()),
                        () => {
                          setCancelOpen(false);
                          setReason("");
                        },
                      )
                    }
                  >
                    {isPending ? "Canceling..." : "Confirm cancel"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn-sm"
                    disabled={isPending}
                    onClick={() => {
                      setCancelOpen(false);
                      setReason("");
                    }}
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Billing — completion → invoice → card/cash payment (Phase 2.5). Shown
            for every job that isn't canceled; drives the whole money flow. */}
        {job.status !== "canceled" && <JobBilling job={job} invoice={invoice ?? null} />}

        {job.status === "canceled" && (
          <div className="cp-divider mt-4 pt-3">
            <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
              This job is canceled and can no longer be rescheduled.
              {job.canceled_reason && (
                <>
                  {" "}
                  <span className="font-medium text-[var(--cp-ink)]">Reason:</span>{" "}
                  {job.canceled_reason}
                </>
              )}
            </p>
          </div>
        )}

        <div className="mt-3">
          <Notice value={feedback} />
        </div>
      </div>
    </div>
  );
}
