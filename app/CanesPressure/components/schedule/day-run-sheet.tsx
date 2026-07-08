"use client";

import { KeyRound, MapPin, Phone, Printer, Square } from "lucide-react";
import {
  fmtEt,
  fmtMoney,
  fmtPhone,
  type Crew,
  type JobItem,
  type JobWithItems,
} from "@/lib/canes/types";

// Day run sheet (plan §4.2) — the printable per-crew field sheet that replaces
// Sebastian's hand-copied per-job Google Doc. Everything the crew needs on site
// lives here: customer + tel, time window, address + maps, gate code, the
// line-item checklist, and site notes. A "Print / share" affordance drops into
// a print-clean layout. The two-object distinction survives grayscale, so this
// prints legibly in black and white.

function timeWindow(job: JobWithItems): string {
  if (!job.scheduled_at) return "Unscheduled";
  const start = fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" });
  const end = job.ends_at
    ? fmtEt(job.ends_at, { hour: "numeric", minute: "2-digit" })
    : "";
  return end ? `${start} – ${end}` : start;
}

function arrivalWindow(job: JobWithItems): string | null {
  if (!job.scheduled_at || job.arrival_window_minutes <= 0) return null;
  const start = fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" });
  const end = fmtEt(
    new Date(new Date(job.scheduled_at).getTime() + job.arrival_window_minutes * 60_000).toISOString(),
    { hour: "numeric", minute: "2-digit" },
  );
  return `${start}–${end}`;
}

function byTime(a: JobWithItems, b: JobWithItems): number {
  const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
  const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
  return at - bt;
}

function ItemRow({ item }: { item: JobItem }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <Square
        size={15}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-[var(--cp-line-strong)]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          {item.quantity !== 1 && (
            <span className="tabular-nums text-[var(--cp-muted)]">{item.quantity}× </span>
          )}
          {item.name}
        </p>
        {item.description && (
          <p className="text-[12px] leading-snug text-[var(--cp-faint)]">{item.description}</p>
        )}
      </div>
    </li>
  );
}

function RunCard({ job, index }: { job: JobWithItems; index: number }) {
  const mapsHref = job.job_address
    ? `https://maps.google.com/?q=${encodeURIComponent(job.job_address)}`
    : null;
  const arrival = arrivalWindow(job);

  return (
    <article className="cp-card break-inside-avoid p-4">
      {/* Head: order number + time window + customer */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--cp-faint)]">
            {index + 1}.
          </span>
          <p className="min-w-0 truncate text-[15px] font-semibold">
            {job.customer_name ?? "Unnamed job"}
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
          {timeWindow(job)}
        </span>
      </div>

      {job.job_name && (
        <p className="mt-0.5 pl-6 text-[12.5px] text-[var(--cp-muted)]">{job.job_name}</p>
      )}
      {arrival && (
        <p className="mt-0.5 pl-6 text-[12.5px] text-[var(--cp-muted)] tabular-nums">
          Arrives {arrival}
        </p>
      )}

      <div className="mt-3 space-y-2 pl-6">
        {/* Phone */}
        {job.customer_phone && (
          <p className="flex items-center gap-2 text-[13px]">
            <Phone size={14} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
            <a href={`tel:${job.customer_phone}`} className="tabular-nums hover:underline">
              {fmtPhone(job.customer_phone)}
            </a>
          </p>
        )}

        {/* Address + maps */}
        {job.job_address && (
          <div className="flex items-start gap-2 text-[13px]">
            <MapPin size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-muted)]" />
            <span className="min-w-0">
              {job.job_address}
              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 whitespace-nowrap text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline print:hidden"
                >
                  Open in Maps
                </a>
              )}
            </span>
          </div>
        )}

        {/* Gate code — prominent, the single most-forgotten field */}
        {job.gate_code && (
          <div className="flex items-center gap-2">
            <KeyRound size={14} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
            <span className="text-[12.5px] text-[var(--cp-faint)]">Gate code</span>
            <span className="rounded border border-[var(--cp-line-strong)] px-1.5 py-0.5 text-[14px] font-semibold tabular-nums tracking-wide">
              {job.gate_code}
            </span>
          </div>
        )}
      </div>

      {/* Line-item checklist */}
      {job.items.length > 0 && (
        <div className="mt-3 border-t border-[var(--cp-line)] pt-2 pl-6">
          <p className="cp-mono">Work</p>
          <ul className="mt-1">
            {job.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {/* Site notes */}
      {job.site_notes && (
        <div className="mt-3 border-t border-[var(--cp-line)] pt-2 pl-6">
          <p className="cp-mono">Site notes</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
            {job.site_notes}
          </p>
        </div>
      )}
    </article>
  );
}

export function DayRunSheet({
  jobs,
  crew,
  dayLabel,
}: {
  jobs: JobWithItems[];
  crew: Crew | null;
  dayLabel: string;
}) {
  const ordered = [...jobs].sort(byTime);
  const total = ordered.reduce((sum, j) => sum + j.total_cents, 0);

  return (
    <section className="space-y-3">
      {/* Header + print affordance */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {crew && (
            <span className="cp-crew-dot" style={{ ["--cp-crew" as string]: crew.color }} />
          )}
          <div>
            <p className="text-[15px] font-semibold leading-tight">
              {crew ? crew.name : "All crews"}
            </p>
            <p className="text-[12.5px] text-[var(--cp-muted)]">{dayLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <span className="text-[12.5px] tabular-nums text-[var(--cp-faint)]">
            {ordered.length} {ordered.length === 1 ? "job" : "jobs"} ·{" "}
            <span className="font-medium text-[var(--cp-muted)]">{fmtMoney(total)}</span>
          </span>
          <button
            type="button"
            className="cp-btn cp-btn-sm"
            onClick={() => window.print()}
            disabled={ordered.length === 0}
          >
            <Printer size={14} strokeWidth={2} /> Print / share
          </button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="cp-card px-4 py-8 text-center">
          <p className="text-[13px] text-[var(--cp-muted)]">
            No jobs scheduled for {crew ? crew.name : "any crew"} on this day.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((job, i) => (
            <RunCard key={job.id} job={job} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
