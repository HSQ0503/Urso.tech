"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CallButton } from "../call-button";
import {
  CalendarClock,
  Check,
  CircleSlash,
  FileText,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import {
  assignJob,
  moveJob,
  scheduleJob,
  setJobStatus,
  unscheduleJob,
  updateJobDetails,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  addJobChecklistItem,
  removeJobChecklistItem,
} from "@/app/CanesPressure/crew-owner-actions";
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
import { SheetShell } from "./sheet-shell";

// Job detail sheet — the single control surface for a job, rendered in the
// shared .cp-sheet shell (bottom sheet on mobile, right panel on desktop).
// Blocks: header (who + status + $), contact, job facts, links into the
// paper trail, then the scheduling controls and the billing flow.

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="cp-mono shrink-0">{label}</span>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editGateCode, setEditGateCode] = useState("");
  const [editSiteNotes, setEditSiteNotes] = useState("");
  const [newChecklistStep, setNewChecklistStep] = useState("");
  const [newChecklistRequired, setNewChecklistRequired] = useState(true);

  const placed = job.scheduled_at !== null;
  const terminal =
    job.status === "completed" ||
    job.status === "invoiced" ||
    job.status === "paid" ||
    job.status === "canceled";

  const mapsHref = job.job_address
    ? `https://maps.google.com/?q=${encodeURIComponent(job.job_address)}`
    : null;
  const textHref = job.customer_phone
    ? `/CanesPressure/inbox?t=${encodeURIComponent(job.customer_phone)}`
    : null;
  const hasLinks = Boolean(job.estimate_id || invoice || job.contact_id);

  return (
    <SheetShell title="Job" onClose={onClose}>
      {/* Header: who + status + money */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-tight">
            {job.customer_name ?? "Unnamed job"}
          </p>
          {job.job_name && (
            <p className="mt-0.5 text-[12.5px] text-[var(--cp-muted)]">{job.job_name}</p>
          )}
        </div>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {fmtMoney(job.total_cents)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <CallButton phone={job.customer_phone} className="cp-btn cp-btn-sm" showFeedback={false} />
        {textHref ? (
          <Link href={textHref} className="cp-btn cp-btn-sm">
            <MessageSquare size={14} strokeWidth={2} /> Text
          </Link>
        ) : (
          <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">Text</span>
        )}
        {mapsHref ? (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="cp-btn cp-btn-sm">
            <MapPin size={14} strokeWidth={2} /> Directions
          </a>
        ) : (
          <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">Directions</span>
        )}
      </div>

      {/* Contact */}
      <div className="cp-divider mt-4 pt-3">
        <p className="cp-group-label">Contact</p>
        <Row label="Phone">
          {job.customer_phone ? (
            <a href={`tel:${job.customer_phone}`} className="tabular-nums hover:underline">
              {fmtPhone(job.customer_phone)}
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Email">
          {job.customer_email ? (
            <a href={`mailto:${job.customer_email}`} className="break-all hover:underline">
              {job.customer_email}
            </a>
          ) : (
            "—"
          )}
        </Row>
        {job.job_address && (
          <div className="py-1.5">
            <p className="text-[13px] font-medium leading-snug">{job.job_address}</p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
              >
                <MapPin size={13} strokeWidth={2} /> Open in Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* Job facts */}
      <div className="cp-divider mt-3 pt-3">
        <div className="flex items-center justify-between">
          <p className="cp-group-label">Job</p>
          {!detailsOpen && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
              disabled={isPending}
              onClick={() => {
                setEditNotes(job.notes ?? "");
                setEditGateCode(job.gate_code ?? "");
                setEditSiteNotes(job.site_notes ?? "");
                setDetailsOpen(true);
              }}
            >
              <Pencil size={12} strokeWidth={2} /> Edit
            </button>
          )}
        </div>
        <Row label="Duration">
          <span className="tabular-nums">{durationLabel(job.duration_minutes)}</span>
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
        {!detailsOpen && job.gate_code && (
          <Row label="Gate code">
            <span className="tabular-nums tracking-wide">{job.gate_code}</span>
          </Row>
        )}

        {/* Line items */}
        {job.items.some((item) => !item.checklist_only) && (
          <ul className="mt-1.5 space-y-1.5 border-t border-[var(--cp-line)] pt-2">
            {job.items.filter((item) => !item.checklist_only).map((item) => (
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

        {!detailsOpen && job.site_notes && (
          <div className="mt-2 border-t border-[var(--cp-line)] pt-2">
            <p className="cp-mono">Site notes</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
              {job.site_notes}
            </p>
          </div>
        )}

        {!detailsOpen && job.notes && (
          <div className="mt-2 border-t border-[var(--cp-line)] pt-2">
            <p className="cp-mono">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
              {job.notes}
            </p>
          </div>
        )}

        {/* Inline edit for the on-site facts; reads swap out while open so the
            sheet never shows two copies of the same field. */}
        {detailsOpen && (
          <div className="mt-2 space-y-2.5 border-t border-[var(--cp-line)] pt-2">
            <div>
              <p className="cp-label">Gate code</p>
              <input
                className="cp-input"
                value={editGateCode}
                onChange={(e) => setEditGateCode(e.target.value)}
                placeholder="e.g. #4482"
              />
            </div>
            <div>
              <p className="cp-label">Site notes</p>
              <textarea
                className="cp-textarea"
                rows={2}
                value={editSiteNotes}
                onChange={(e) => setEditSiteNotes(e.target.value)}
                placeholder="Access, pets, hazards..."
              />
            </div>
            <div>
              <p className="cp-label">Notes</p>
              <textarea
                className="cp-textarea"
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Anything the crew should know..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="cp-btn cp-btn-primary cp-btn-sm flex-1"
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      updateJobDetails(job.id, {
                        notes: editNotes,
                        gateCode: editGateCode,
                        siteNotes: editSiteNotes,
                      }),
                    () => setDetailsOpen(false),
                  )
                }
              >
                {isPending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="cp-btn cp-btn-sm"
                disabled={isPending}
                onClick={() => setDetailsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Crew checklist: sold service items are the base steps; the owner can
          append procedural steps without putting them on the customer invoice. */}
      <div className="cp-divider mt-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="cp-group-label">Crew checklist</p>
          <span className="cp-mono">
            {job.items.filter((item) => item.done).length}/{job.items.length} complete
          </span>
        </div>

        {job.items.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {job.items.map((item) => {
              const required = item.required ?? true;
              return (
                <li
                  key={item.id}
                  className="flex min-h-11 items-start gap-2.5 rounded-md border border-[var(--cp-line)] px-3 py-2.5"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                    style={
                      item.done
                        ? {
                            background: "var(--cp-good-bg)",
                            borderColor: "var(--cp-good)",
                            color: "var(--cp-good)",
                          }
                        : { borderColor: "var(--cp-line-strong)" }
                    }
                    aria-label={item.done ? "Complete" : "Incomplete"}
                  >
                    {item.done && <Check aria-hidden size={13} strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--cp-faint)]">
                      {required ? "Required" : "Optional"}
                      {item.blocked ? " · Blocked by technician" : ""}
                      {!item.checklist_only ? " · Service item" : ""}
                    </span>
                  </span>
                  {item.checklist_only && !terminal && (
                    <button
                      type="button"
                      className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-[var(--cp-faint)] transition-colors hover:bg-[var(--cp-danger-bg)] hover:text-[var(--cp-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-brand)]"
                      disabled={isPending}
                      aria-label={`Remove ${item.name}`}
                      onClick={() => run(() => removeJobChecklistItem(item.id))}
                    >
                      <Trash2 aria-hidden size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[12.5px] text-[var(--cp-faint)]">No checklist steps yet.</p>
        )}

        {!terminal && (
          <form
            className="mt-3 space-y-2.5 rounded-md bg-[var(--cp-bg)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newChecklistStep.trim()) return;
              run(
                () =>
                  addJobChecklistItem({
                    jobId: job.id,
                    name: newChecklistStep,
                    required: newChecklistRequired,
                  }),
                () => {
                  setNewChecklistStep("");
                  setNewChecklistRequired(true);
                },
              );
            }}
          >
            <div>
              <label className="cp-label" htmlFor={`checklist-step-${job.id}`}>Add step</label>
              <input
                id={`checklist-step-${job.id}`}
                className="cp-input min-h-11"
                value={newChecklistStep}
                onChange={(event) => setNewChecklistStep(event.target.value)}
                placeholder="Connect water supply"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12.5px] font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--cp-brand-fill)]"
                  checked={newChecklistRequired}
                  onChange={(event) => setNewChecklistRequired(event.target.checked)}
                />
                Required before completion
              </label>
              <button
                type="submit"
                className="cp-btn cp-btn-primary min-h-11 cursor-pointer"
                disabled={isPending || !newChecklistStep.trim()}
              >
                <Plus aria-hidden size={15} />
                {isPending ? "Adding…" : "Add step"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Links into the paper trail */}
      {hasLinks && (
        <div className="cp-divider mt-3 pt-3">
          <p className="cp-group-label">Links</p>
          <div className="mt-2 flex flex-col gap-2">
            {job.estimate_id && (
              <Link
                href={`/CanesPressure/estimates/${job.estimate_id}`}
                className="cp-btn cp-btn-sm" style={{ justifyContent: "flex-start" }}
              >
                <FileText size={14} strokeWidth={2} /> Open estimate
              </Link>
            )}
            {invoice && (
              <Link
                href={`/CanesPressure/invoices/${invoice.id}`}
                className="cp-btn cp-btn-sm" style={{ justifyContent: "flex-start" }}
              >
                <Receipt size={14} strokeWidth={2} /> Open invoice {invoice.number}
              </Link>
            )}
            {job.contact_id && (
              <Link
                href={`/CanesPressure/customers/${job.contact_id}`}
                className="cp-btn cp-btn-sm" style={{ justifyContent: "flex-start" }}
              >
                <UserRound size={14} strokeWidth={2} /> View customer
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Scheduling controls ─────────────────────────────────────── */}

      {!terminal && (
        <div className="cp-divider mt-4 space-y-3 pt-3">
          <p className="cp-group-label">Manage</p>

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
                placeholder="Reason (required), e.g. no-show or customer rescheduled"
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

      {/* Billing — completion → invoice → card/cash payment. Shown for every
          job that isn't canceled; drives the whole money flow. */}
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
    </SheetShell>
  );
}
