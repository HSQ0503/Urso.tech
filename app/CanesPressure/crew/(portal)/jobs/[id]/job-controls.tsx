"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Save,
  Undo2,
} from "lucide-react";
import {
  checkInToJob,
  checkOutFromJob,
  completeTechnicianJob,
  saveChecklistItemNote,
  setChecklistItemBlocked,
  setChecklistItemDone,
  type CrewActionResult,
} from "@/app/CanesPressure/crew-actions";
import type { TechnicianJob, TechnicianJobItem } from "@/lib/canes/crew-types";

function Notice({ result }: { result: CrewActionResult | null }) {
  if (!result?.notice) return null;
  return (
    <p
      role="status"
      className="text-[12.5px] font-medium"
      style={{ color: result.ok ? "var(--cp-good)" : "var(--cp-danger)" }}
    >
      {result.notice}
    </p>
  );
}

function ChecklistControl({ item }: { item: TechnicianJobItem }) {
  const [note, setNote] = useState(item.technicianNote ?? "");
  const [result, setResult] = useState<CrewActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<CrewActionResult>) => {
    setResult(null);
    startTransition(async () => setResult(await action()));
  };

  return (
    <article className="cp-card overflow-hidden rounded-xl">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={
              item.blocked
                ? { background: "var(--cp-danger-bg)", color: "var(--cp-danger)" }
                : item.done
                  ? { background: "var(--cp-good-bg)", color: "var(--cp-good)" }
                  : { background: "var(--cp-hover)", color: "var(--cp-faint)" }
            }
          >
            {item.blocked ? <AlertTriangle aria-hidden size={16} /> : item.done ? <Check aria-hidden size={17} /> : <Clock3 aria-hidden size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold">{item.name}</h3>
                {item.description && (
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-muted)]">{item.description}</p>
                )}
              </div>
              {item.required && <span className="cp-mono">Required</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            className={`cp-btn min-h-11 cursor-pointer ${item.done ? "" : "cp-btn-primary"}`}
            onClick={() => run(() => setChecklistItemDone(item.id, !item.done))}
          >
            {item.done ? <Undo2 aria-hidden size={16} /> : <CheckCircle2 aria-hidden size={16} />}
            {item.done ? "Reopen" : "Complete"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="cp-btn min-h-11 cursor-pointer"
            style={item.blocked ? { color: "var(--cp-danger)" } : undefined}
            onClick={() => run(() => setChecklistItemBlocked(item.id, !item.blocked))}
          >
            <AlertTriangle aria-hidden size={16} />
            {item.blocked ? "Clear issue" : "Report issue"}
          </button>
        </div>

        <div className="mt-4 border-t border-[var(--cp-line)] pt-4">
          <label className="cp-label" htmlFor={`note-${item.id}`}>Technician note</label>
          <textarea
            id={`note-${item.id}`}
            className="cp-textarea min-h-20 text-[16px]"
            value={note}
            maxLength={1000}
            placeholder="Add a site note or explain an issue…"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
            <Notice result={result} />
            <button
              type="button"
              disabled={pending || note === (item.technicianNote ?? "")}
              className="cp-btn ml-auto min-h-11 cursor-pointer"
              onClick={() => run(() => saveChecklistItemNote(item.id, note))}
            >
              <Save aria-hidden size={15} />
              {pending ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function TechnicianJobControls({ job }: { job: TechnicianJob }) {
  const [result, setResult] = useState<CrewActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const required = job.items.filter((item) => item.required);
  const canComplete = required.every((item) => item.done && !item.blocked);
  const terminal = ["completed", "invoiced", "paid", "canceled"].includes(job.status);
  const run = (action: () => Promise<CrewActionResult>) => {
    setResult(null);
    startTransition(async () => setResult(await action()));
  };

  return (
    <div className="flex flex-col gap-6">
      {!terminal && (
        <section className="cp-card rounded-xl p-4">
          <h2 className="text-[15px] font-semibold">Time on site</h2>
          <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
            {job.checkedInAt ? "You are checked in. Your hours are being tracked." : "Check in when you arrive at the property."}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={pending}
              className={`cp-btn min-h-12 cursor-pointer sm:min-w-40 ${job.checkedInAt ? "" : "cp-btn-primary"}`}
              onClick={() => run(() => job.checkedInAt ? checkOutFromJob(job.id) : checkInToJob(job.id))}
            >
              {job.checkedInAt ? <LogOut aria-hidden size={17} /> : <LogIn aria-hidden size={17} />}
              {pending ? "Updating…" : job.checkedInAt ? "Check out" : "Check in"}
            </button>
            <Notice result={result} />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="cp-mono">Job checklist</p>
            <h2 className="mt-1 text-[18px] font-semibold">Required work</h2>
          </div>
          <span className="text-[12px] font-medium text-[var(--cp-muted)]">
            {required.filter((item) => item.done).length}/{required.length} complete
          </span>
        </div>
        {job.items.length ? (
          <div className="grid gap-3">{job.items.map((item) => <ChecklistControl key={item.id} item={item} />)}</div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--cp-line-strong)] p-5 text-center text-[13px] text-[var(--cp-faint)]">
            No checklist items were added to this job.
          </div>
        )}
      </section>

      {!terminal && (
        <section className="cp-card rounded-xl p-4">
          <h2 className="text-[15px] font-semibold">Finish job</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-muted)]">
            Every required item must be complete and have no blocked issue before the job can be finished.
          </p>
          <button
            type="button"
            disabled={pending || !canComplete}
            className="cp-btn cp-btn-primary mt-4 min-h-12 w-full cursor-pointer text-[15px] sm:w-auto sm:min-w-48"
            onClick={() => run(() => completeTechnicianJob(job.id))}
          >
            <CheckCircle2 aria-hidden size={18} />
            {pending ? "Finishing…" : "Mark job complete"}
          </button>
          {!canComplete && (
            <p className="mt-2 text-[12px] text-[var(--cp-faint)]">Complete or resolve every required item first.</p>
          )}
        </section>
      )}
    </div>
  );
}
