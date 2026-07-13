import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
} from "lucide-react";
import { requireTechnicianActor } from "@/lib/canes/crew-auth";
import { getTechnicianWeek } from "@/lib/canes/crew-data";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/canes/types";
import type { TechnicianJob } from "@/lib/canes/crew-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "My week" };

const ET = "America/New_York";

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function etDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function statusStyle(status: JobStatus): React.CSSProperties {
  if (["completed", "invoiced", "paid"].includes(status)) {
    return { background: "var(--cp-good-bg)", color: "var(--cp-good)" };
  }
  if (status === "canceled") {
    return { background: "var(--cp-danger-bg)", color: "var(--cp-danger)" };
  }
  if (status === "in_progress") {
    return { background: "var(--cp-brand-soft)", color: "var(--cp-brand-deep)" };
  }
  return { background: "var(--cp-cold-bg)", color: "var(--cp-cold)" };
}

function technicianStatusLabel(status: JobStatus): string {
  return ["completed", "invoiced", "paid"].includes(status)
    ? "Complete"
    : JOB_STATUS_LABEL[status];
}

function JobCard({ job }: { job: TechnicianJob }) {
  const required = job.items.filter((item) => item.required);
  const done = required.filter((item) => item.done).length;
  return (
    <Link
      href={`/CanesPressure/crew/jobs/${job.id}`}
      className="cp-card cp-card-hover block cursor-pointer overflow-hidden rounded-xl focus-visible:outline-offset-2"
    >
      <div className="flex min-h-[136px] items-stretch">
        <span className="w-1 shrink-0" style={{ background: job.crewColor }} aria-hidden />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-semibold leading-tight">
                {job.jobName ?? "Scheduled service"}
              </p>
              <p className="mt-1 truncate text-[13px] text-[var(--cp-muted)]">
                {job.customerName ?? "Customer"}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide"
              style={statusStyle(job.status)}
            >
              {technicianStatusLabel(job.status)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-[13px] text-[var(--cp-muted)] sm:grid-cols-2">
            <span className="flex items-center gap-2">
              <Clock3 aria-hidden size={15} className="shrink-0 text-[var(--cp-faint)]" />
              {job.scheduledAt ? formatTime(job.scheduledAt) : "Time pending"}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <MapPin aria-hidden size={15} className="shrink-0 text-[var(--cp-faint)]" />
              <span className="truncate">{job.jobAddress ?? "Address pending"}</span>
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--cp-line)] pt-3">
            <span className="flex items-center gap-2 text-[12px] font-medium text-[var(--cp-muted)]">
              <CheckCircle2 aria-hidden size={15} />
              {required.length ? `${done} of ${required.length} required steps` : "No required steps"}
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-[var(--cp-faint)]" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function TechnicianWeekPage() {
  const actor = await requireTechnicianActor();
  const week = await getTechnicianWeek(actor);
  const completed = week.jobs.filter((job) => ["completed", "invoiced", "paid"].includes(job.status)).length;
  const days = Array.from({ length: 7 }, (_, index) => addDays(week.startDate, index));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="cp-mono">{actor.crewNames.join(" · ")}</p>
        <h1 className="cp-display mt-1 text-[30px] leading-tight sm:text-[34px]">
          My week<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <p className="mt-1.5 text-[14px] text-[var(--cp-muted)]">
          {dateFromKey(week.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
          {" – "}
          {dateFromKey(week.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="cp-card rounded-xl p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cp-cold-bg)] text-[var(--cp-cold)]">
            <CalendarDays aria-hidden size={18} />
          </span>
          <p className="mt-3 text-[24px] font-semibold leading-none">{week.jobs.length}</p>
          <p className="mt-1 text-[12px] text-[var(--cp-muted)]">Assigned jobs · {completed} complete</p>
        </div>
        <div className="cp-card rounded-xl p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cp-good-bg)] text-[var(--cp-good)]">
            <Clock3 aria-hidden size={18} />
          </span>
          <p className="mt-3 text-[24px] font-semibold leading-none">{formatMinutes(week.minutesWorked)}</p>
          <p className="mt-1 text-[12px] text-[var(--cp-muted)]">Your tracked hours only</p>
        </div>
      </section>

      <div className="flex flex-col gap-7">
        {days.map((dateKey) => {
          const jobs = week.jobs.filter(
            (job) => job.scheduledAt && etDateKey(job.scheduledAt) === dateKey,
          );
          const date = dateFromKey(dateKey);
          return (
            <section key={dateKey}>
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-[15px] font-semibold">
                  {date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}
                </h2>
                <span className="cp-mono">
                  {date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                </span>
              </div>
              {jobs.length ? (
                <div className="grid gap-3">{jobs.map((job) => <JobCard key={job.id} job={job} />)}</div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--cp-line-strong)] px-4 py-5 text-center text-[13px] text-[var(--cp-faint)]">
                  No jobs assigned.
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
