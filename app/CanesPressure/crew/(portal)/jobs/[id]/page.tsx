import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  KeyRound,
  MapPin,
  Navigation,
  Phone,
  StickyNote,
  UserRound,
} from "lucide-react";
import { requireTechnicianActor } from "@/lib/canes/crew-auth";
import { getTechnicianJob } from "@/lib/canes/crew-data";
import { fmtPhone, JOB_STATUS_LABEL, type JobStatus } from "@/lib/canes/types";
import { TechnicianJobControls } from "./job-controls";

export const dynamic = "force-dynamic";

const ET = "America/New_York";

function formatSchedule(iso: string | null): string {
  if (!iso) return "Schedule pending";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} hr ${remainder} min` : `${remainder} min`;
}

function technicianStatusLabel(status: JobStatus): string {
  return ["completed", "invoiced", "paid"].includes(status)
    ? "Complete"
    : JOB_STATUS_LABEL[status];
}

export default async function TechnicianJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireTechnicianActor();
  const { id } = await params;
  const job = await getTechnicianJob(actor, id);
  if (!job) notFound();
  const directions = job.jobAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.jobAddress)}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/CanesPressure/crew"
          className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
        >
          <ArrowLeft aria-hidden size={17} />
          My week
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="cp-mono">{job.crewName}</p>
            <h1 className="cp-display mt-1 text-[28px] leading-tight sm:text-[34px]">
              {job.jobName ?? "Scheduled service"}<span className="text-[var(--cp-brand)]">.</span>
            </h1>
          </div>
          <span className="rounded-full bg-[var(--cp-cold-bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--cp-cold)]">
            {technicianStatusLabel(job.status)}
          </span>
        </div>
      </header>

      <section className="cp-card overflow-hidden rounded-xl">
        <div className="grid sm:grid-cols-2">
          <div className="flex gap-3 border-b border-[var(--cp-line)] p-4 sm:border-b-0 sm:border-r">
            <UserRound aria-hidden size={19} className="mt-0.5 shrink-0 text-[var(--cp-faint)]" />
            <div className="min-w-0">
              <p className="cp-mono">Customer</p>
              <p className="mt-1 text-[15px] font-semibold">{job.customerName ?? "Name pending"}</p>
              <p className="mt-0.5 text-[13px] text-[var(--cp-muted)]">{fmtPhone(job.customerPhone)}</p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <CalendarClock aria-hidden size={19} className="mt-0.5 shrink-0 text-[var(--cp-faint)]" />
            <div>
              <p className="cp-mono">Scheduled</p>
              <p className="mt-1 text-[14px] font-semibold">{formatSchedule(job.scheduledAt)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--cp-muted)]">
                <Clock3 aria-hidden size={14} />
                {job.durationMinutes} minutes · {formatMinutes(job.minutesWorked)} tracked
              </p>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--cp-line)] p-4">
          <div className="flex gap-3">
            <MapPin aria-hidden size={19} className="mt-0.5 shrink-0 text-[var(--cp-faint)]" />
            <div className="min-w-0 flex-1">
              <p className="cp-mono">Service address</p>
              <p className="mt-1 text-[14px] font-semibold">{job.jobAddress ?? "Address pending"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={job.customerPhone ? `tel:${job.customerPhone}` : undefined}
              aria-disabled={!job.customerPhone}
              className="cp-btn min-h-12 cursor-pointer aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              <Phone aria-hidden size={17} />
              Call customer
            </a>
            <a
              href={directions ?? undefined}
              aria-disabled={!directions}
              target="_blank"
              rel="noreferrer"
              className="cp-btn min-h-12 cursor-pointer aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              <Navigation aria-hidden size={17} />
              Directions
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 px-1">
          <p className="cp-mono">Site information</p>
          <h2 className="mt-1 text-[18px] font-semibold">Know before you start</h2>
        </div>
        <div className="cp-card divide-y divide-[var(--cp-line)] overflow-hidden rounded-xl">
          <div className="flex gap-3 p-4">
            <KeyRound aria-hidden size={18} className="mt-0.5 shrink-0 text-[var(--cp-faint)]" />
            <div>
              <p className="cp-mono">Gate or access code</p>
              <p className="mt-1 text-[14px] font-semibold">{job.gateCode || "None provided"}</p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <StickyNote aria-hidden size={18} className="mt-0.5 shrink-0 text-[var(--cp-faint)]" />
            <div>
              <p className="cp-mono">Site notes and instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--cp-ink)]">
                {job.siteNotes || job.notes || "No special instructions were added."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <TechnicianJobControls job={job} />
    </div>
  );
}
