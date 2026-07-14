import Link from "next/link";
import { CheckCircle2, ChevronRight, MapPin, Phone } from "lucide-react";
import { getAgenda, getOverview } from "@/lib/canes/data";
import { getScheduleBoard } from "@/lib/canes/estimates";
import { ET, etLocalToIso, fmtEt, fmtPhone, SOURCE_LABEL, type JobStatus, type Lead } from "@/lib/canes/types";
import { CustomerAvatar } from "@/app/CanesPressure/components/customers/avatar";
import { MoneyRow } from "@/app/CanesPressure/components/overview/money-row";
import { RecentActivity } from "@/app/CanesPressure/components/overview/recent-activity";
import { WaitTimer } from "@/app/CanesPressure/components/overview/wait-timer";
import { WorkflowStrip } from "@/app/CanesPressure/components/overview/workflow-strip";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

// Terminal job statuses — mirrors actions.ts / estimates.ts (module-private
// there, so kept local). A terminal job can keep its scheduled_at, so the
// Today card must drop these or a canceled job would show as work for the day.
const TERMINAL_JOB_STATUSES: JobStatus[] = ["completed", "invoiced", "paid", "canceled"];

const leadHref = (id: string) => `/CanesPressure/leads/${id}`;
const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

// The ET calendar date an instant falls on ("YYYY-MM-DD").
const etYmd = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold">
      {label}
      {count !== undefined && count > 0 && (
        <span className="cp-chip bg-[var(--cp-brand-soft)] text-[var(--cp-brand-deep)]">
          {count}
        </span>
      )}
    </h2>
  );
}

function CallQueueCard({ lead }: { lead: Lead }) {
  return (
    <div className="cp-card cp-card-hover">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{lead.name ?? fmtPhone(lead.phone)}</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--cp-muted)]">
            {lead.service ?? "Service not listed"} · {SOURCE_LABEL[lead.source]}
          </p>
        </div>
        <div className="self-start sm:self-center">
          <WaitTimer createdAt={lead.created_at} />
        </div>
        <div className="flex items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-primary flex-1 sm:flex-none">
              <Phone size={16} strokeWidth={2} />
              Call
            </a>
          )}
          <Link href={leadHref(lead.id)} className="cp-btn cp-btn-sm">
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Mobile iOS grouped-list rows (md:hidden trees) ───────────────────────────

// A queue lead as an inset-list row: avatar + name/sub, trailing wait timer and
// a round Call tap target. The whole row links to the lead; the Call button
// stops propagation via being a sibling anchor with its own href.
function MobileQueueRow({ lead }: { lead: Lead }) {
  return (
    <div className="cp-list-row">
      <CustomerAvatar name={lead.name} />
      <Link href={leadHref(lead.id)} className="min-w-0 flex-1">
        <p className="cp-list-title truncate">{lead.name ?? fmtPhone(lead.phone)}</p>
        <p className="cp-list-sub truncate">
          {lead.service ?? "Service not listed"} · {SOURCE_LABEL[lead.source]}
        </p>
      </Link>
      <WaitTimer createdAt={lead.created_at} />
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          aria-label={`Call ${lead.name ?? fmtPhone(lead.phone)}`}
          className="cp-icon-btn cp-icon-btn-primary h-11 w-11"
        >
          <Phone size={16} strokeWidth={2} />
        </a>
      )}
    </div>
  );
}

// A past-due / unconfirmed / follow-up lead row — avatar + name/sub, trailing
// value (appt time or chip text) then a chevron into the lead.
function MobileLeadRow({
  lead,
  sub,
  trailing,
}: {
  lead: Lead;
  sub: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Link href={leadHref(lead.id)} className="cp-list-row">
      <CustomerAvatar name={lead.name} />
      <div className="min-w-0 flex-1">
        <p className="cp-list-title truncate">{lead.name ?? fmtPhone(lead.phone)}</p>
        <p className="cp-list-sub truncate">{sub}</p>
      </div>
      {trailing}
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </Link>
  );
}

export default async function TodayPage() {
  const todayYmd = etYmd(new Date());
  const rangeStart = etLocalToIso(`${todayYmd}T00:00`);

  const [overview, agenda, board] = await Promise.all([
    getOverview(),
    getAgenda(2),
    getScheduleBoard(rangeStart, 1),
  ]);
  const { coldNeedingCall, unconfirmedToday, todayAgenda, followUpsDue, pastDueVisits, counts } =
    overview;

  // Today's ET scheduled jobs in time order — the crew's work for the day.
  const todayJobs = board
    .filter(
      (j) =>
        j.scheduled_at &&
        etYmd(j.scheduled_at) === todayYmd &&
        !TERMINAL_JOB_STATUSES.includes(j.status),
    )
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const confirmedJobs = todayJobs.filter((j) => j.status === "confirmed").length;
  const scheduledJobs = todayJobs.length - confirmedJobs;

  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const hourEt =
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(
        new Date(),
      ),
    ) % 24;
  const greeting = hourEt < 12 ? "Good morning" : hourEt < 17 ? "Good afternoon" : "Good evening";

  const todayKey = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const nextDay = agenda.find((g) => g.day !== todayKey);

  const confirmedToday = todayAgenda.filter((l) => l.status === "confirmed").length;
  const pendingToday = todayAgenda.length - confirmedToday;

  return (
    <div className="flex flex-col gap-7">
      {/* Header — mono date line + Fraunces greeting with the orange period */}
      <header>
        <p className="cp-mono">{dateLine}</p>
        <h1 className="cp-display mt-1 text-[30px]">
          <em>{greeting.split(" ")[0]}</em> {greeting.split(" ")[1]}, Sebastian
          <span className="text-[var(--cp-brand)]">.</span>
        </h1>
      </header>

      {/* The whole pipeline in one strip — leads through invoices */}
      <WorkflowStrip pipeline={overview.pipeline} counts={counts} />

      {/* Call queue, the hero — urgency lives in the red group label, not the cards */}
      {/* Mobile — inset list, one tappable row per lead */}
      <section className="md:hidden">
        {coldNeedingCall.length > 0 ? (
          <>
            <p className="cp-list-header cp-group-danger">
              Call these now — {coldNeedingCall.length}
            </p>
            <div className="cp-list">
              {coldNeedingCall.map((lead) => (
                <MobileQueueRow key={lead.id} lead={lead} />
              ))}
            </div>
          </>
        ) : (
          <div className="cp-list flex items-center gap-2.5 px-4 py-3.5">
            <CheckCircle2 size={18} strokeWidth={2} className="shrink-0 text-[var(--cp-good)]" />
            <p className="text-[14px] font-medium">All caught up. Every new lead has been called.</p>
          </div>
        )}
      </section>

      {/* Desktop — the hero card queue, unchanged */}
      <section className="hidden md:block">
        {coldNeedingCall.length > 0 ? (
          <>
            <h2 className="cp-group-label cp-group-danger">
              Call these now — {coldNeedingCall.length}
            </h2>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {coldNeedingCall.map((lead) => (
                <CallQueueCard key={lead.id} lead={lead} />
              ))}
            </div>
          </>
        ) : (
          <div className="cp-card flex items-center gap-2.5 px-4 py-3">
            <CheckCircle2 size={18} strokeWidth={2} className="shrink-0 text-[var(--cp-good)]" />
            <p className="text-[14px] font-medium">All caught up. Every new lead has been called.</p>
          </div>
        )}
      </section>

      {/* Past-due visits — the appointment came and went with no disposition */}
      {pastDueVisits.length > 0 && (
        <>
          {/* Mobile — inset list */}
          <section className="md:hidden">
            <p className="cp-list-header cp-group-brand">
              Past due visits — {pastDueVisits.length}
            </p>
            <div className="cp-list">
              {pastDueVisits.map((lead) => (
                <MobileLeadRow
                  key={lead.id}
                  lead={lead}
                  sub={`${lead.service ?? "Estimate visit"} · was ${fmtEt(lead.appointment_at)}`}
                />
              ))}
            </div>
          </section>

          {/* Desktop — card, unchanged */}
          <section className="hidden md:block">
            <h2 className="cp-group-label cp-group-brand">
              Past due visits — {pastDueVisits.length}
            </h2>
            <div className="cp-card mt-2.5 divide-y divide-[var(--cp-line)]">
              {pastDueVisits.map((lead) => (
                <div
                  key={lead.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">
                      {lead.name ?? fmtPhone(lead.phone)}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-[var(--cp-muted)]">
                      {lead.service ?? "Estimate visit"} · was {fmtEt(lead.appointment_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-sm">
                        <Phone size={14} strokeWidth={2} />
                        Call
                      </a>
                    )}
                    <Link href={leadHref(lead.id)} className="cp-btn cp-btn-sm">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Unconfirmed + follow-ups — inset lists stacked on mobile */}
      {(unconfirmedToday.length > 0 || followUpsDue.length > 0) && (
        <div className="flex flex-col gap-7 md:hidden">
          {unconfirmedToday.length > 0 && (
            <section>
              <p className="cp-list-header">Unconfirmed visits — {unconfirmedToday.length}</p>
              <div className="cp-list">
                {unconfirmedToday.map((lead) => (
                  <MobileLeadRow
                    key={lead.id}
                    lead={lead}
                    sub={fmtEt(lead.appointment_at)}
                    trailing={<span className="cp-chip cp-status-appt">No YES yet</span>}
                  />
                ))}
              </div>
            </section>
          )}
          {followUpsDue.length > 0 && (
            <section>
              <p className="cp-list-header">Follow-ups due — {followUpsDue.length}</p>
              <div className="cp-list">
                {followUpsDue.map((lead) => (
                  <MobileLeadRow
                    key={lead.id}
                    lead={lead}
                    sub={`${lead.service ?? SOURCE_LABEL[lead.source]} · last activity ${fmtEt(
                      lead.last_activity_at,
                      { month: "short", day: "numeric" },
                    )}`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Unconfirmed + follow-ups share a row on desktop */}
      {(unconfirmedToday.length > 0 || followUpsDue.length > 0) && (
        <div className="hidden gap-7 md:grid md:grid-cols-2">
          {unconfirmedToday.length > 0 && (
            <section>
              <SectionTitle label="Unconfirmed visits" count={unconfirmedToday.length} />
              <div className="mt-2.5 flex flex-col gap-2.5">
                {unconfirmedToday.map((lead) => (
                  <div
                    key={lead.id}
                    className="cp-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold">
                        {lead.name ?? fmtPhone(lead.phone)}
                      </p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-[var(--cp-muted)]">
                        {fmtEt(lead.appointment_at)}
                      </p>
                    </div>
                    <span className="cp-chip cp-status-appt self-start sm:self-auto">No YES yet</span>
                    <div className="flex items-center gap-2">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-sm">
                          <Phone size={14} strokeWidth={2} />
                          Call
                        </a>
                      )}
                      <Link href={leadHref(lead.id)} className="cp-btn cp-btn-sm">
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {followUpsDue.length > 0 && (
            <section>
              <SectionTitle label="Follow-ups due" count={followUpsDue.length} />
              <div className="cp-card mt-2.5 divide-y divide-[var(--cp-line)]">
                {followUpsDue.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">
                        {lead.name ?? fmtPhone(lead.phone)}
                      </p>
                      <p className="truncate text-[12.5px] text-[var(--cp-muted)]">
                        {lead.service ?? SOURCE_LABEL[lead.source]} · last activity{" "}
                        {fmtEt(lead.last_activity_at, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <Link href={leadHref(lead.id)} className="cp-btn cp-btn-sm shrink-0">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Today's visits — inset list on mobile */}
      <section className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1.5">
          <p className="cp-list-header !p-0">
            Today&apos;s visits · {todayAgenda.length} total · {confirmedToday} confirmed
          </p>
          <Link
            href="/CanesPressure/schedule"
            className="text-[13px] font-semibold text-[var(--cp-brand-deep)]"
          >
            Schedule
          </Link>
        </div>
        {todayAgenda.length > 0 ? (
          <div className="cp-list">
            {todayAgenda.map((lead) => {
              const confirmed = lead.status === "confirmed";
              return (
                <Link key={lead.id} href={leadHref(lead.id)} className="cp-list-row">
                  <span className="w-[58px] shrink-0 text-[14px] font-semibold tabular-nums">
                    {fmtEt(lead.appointment_at, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="cp-list-title truncate">{lead.name ?? fmtPhone(lead.phone)}</p>
                    <p className="cp-list-sub truncate">{lead.service ?? "Estimate visit"}</p>
                  </div>
                  <span
                    className={`cp-chip ${confirmed ? "cp-status-confirmed" : "cp-status-appt"}`}
                  >
                    {confirmed ? "Confirmed" : "Pending"}
                  </span>
                  <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="cp-list">
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">
              No visits on the calendar today.
            </p>
          </div>
        )}
        {nextDay && nextDay.leads.length > 0 && (
          <p className="mt-2 px-1.5 text-[12.5px] text-[var(--cp-muted)]">
            {nextDay.day}: {nextDay.leads.length} visit{nextDay.leads.length === 1 ? "" : "s"} booked.
          </p>
        )}
      </section>

      {/* Today's visits — summary strip inside the card, Jobber-style */}
      <section className="hidden md:block">
        <SectionTitle label="Today's visits" />
        <div className="cp-card mt-2.5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
            {[
              { label: "Total", value: todayAgenda.length },
              { label: "Confirmed", value: confirmedToday },
              { label: "Pending", value: pendingToday },
            ].map((s) => (
              <div key={s.label}>
                <p className="cp-mono">{s.label}</p>
                <p className="mt-0.5 text-[18px] font-bold leading-tight tabular-nums">{s.value}</p>
              </div>
            ))}
            <Link href="/CanesPressure/schedule" className="cp-btn cp-btn-sm ml-auto">
              View schedule
            </Link>
          </div>
          <div className="cp-divider" />
          {todayAgenda.length > 0 ? (
            <div className="divide-y divide-[var(--cp-line)]">
              {todayAgenda.map((lead) => {
              const confirmed = lead.status === "confirmed";
              return (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-[70px] shrink-0 text-[14px] font-semibold tabular-nums">
                    {fmtEt(lead.appointment_at, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={leadHref(lead.id)}
                      className="block truncate text-[14px] font-medium hover:underline"
                    >
                      {lead.name ?? fmtPhone(lead.phone)}
                    </Link>
                    <p className="truncate text-[12.5px] text-[var(--cp-muted)]">
                      {lead.service ?? "Estimate visit"}
                    </p>
                  </div>
                  <span className={`cp-chip ${confirmed ? "cp-status-confirmed" : "cp-status-appt"}`}>
                    {confirmed ? "Confirmed" : "Pending"}
                  </span>
                  {lead.address && (
                    <a
                      href={mapsHref(lead.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="cp-btn cp-btn-sm px-2.5"
                      aria-label={`Open ${lead.address} in Maps`}
                    >
                      <MapPin size={15} strokeWidth={2} />
                    </a>
                  )}
                </div>
              );
            })}
            </div>
          ) : (
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">
              No visits on the calendar today.
            </p>
          )}
        </div>
        {nextDay && nextDay.leads.length > 0 && (
          <p className="mt-2 text-[12.5px] text-[var(--cp-muted)]">
            {nextDay.day}: {nextDay.leads.length} visit{nextDay.leads.length === 1 ? "" : "s"} booked.{" "}
            <Link href="/CanesPressure/schedule" className="font-medium text-[var(--cp-brand-deep)] hover:underline">
              View schedule
            </Link>
          </p>
        )}
      </section>

      {/* Today's jobs — inset list on mobile, crew dot leading each row */}
      <section className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1.5">
          <p className="cp-list-header !p-0">
            Today&apos;s jobs · {todayJobs.length} total · {confirmedJobs} confirmed
          </p>
          <Link
            href={`/CanesPressure/schedule?start=${todayYmd}`}
            className="text-[13px] font-semibold text-[var(--cp-brand-deep)]"
          >
            Schedule
          </Link>
        </div>
        {todayJobs.length > 0 ? (
          <div className="cp-list">
            {todayJobs.map((job) => {
              const confirmed = job.status === "confirmed";
              return (
                <Link
                  key={job.id}
                  href="/CanesPressure/schedule"
                  className="cp-list-row"
                >
                  <span className="w-[58px] shrink-0 text-[14px] font-semibold tabular-nums">
                    {fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="cp-list-title flex items-center gap-2 truncate">
                      <span
                        className="cp-crew-dot shrink-0"
                        style={
                          job.crew
                            ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties)
                            : undefined
                        }
                      />
                      <span className="truncate">{job.customer_name ?? "Customer"}</span>
                    </p>
                    <p className="cp-list-sub truncate">
                      {job.job_name ?? "Job"}
                      {job.crew ? ` · ${job.crew.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`cp-chip ${confirmed ? "cp-status-confirmed" : "cp-status-appt"}`}
                  >
                    {confirmed ? "Confirmed" : "Scheduled"}
                  </span>
                  <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="cp-list">
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">
              No jobs on the calendar today.
            </p>
          </div>
        )}
      </section>

      {/* Today's jobs — the crew's washes for the day; jobs get their own strip,
          distinct from the visits card above (two calendar objects, never conflated) */}
      <section className="hidden md:block">
        <SectionTitle label="Today's jobs" />
        <div className="cp-card mt-2.5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
            {[
              { label: "Total", value: todayJobs.length },
              { label: "Confirmed", value: confirmedJobs },
              { label: "Scheduled", value: scheduledJobs },
            ].map((s) => (
              <div key={s.label}>
                <p className="cp-mono">{s.label}</p>
                <p className="mt-0.5 text-[18px] font-bold leading-tight tabular-nums">{s.value}</p>
              </div>
            ))}
            <Link href={`/CanesPressure/schedule?start=${todayYmd}`} className="cp-btn cp-btn-sm ml-auto">
              Open schedule
            </Link>
          </div>
          <div className="cp-divider" />
          {todayJobs.length > 0 ? (
            <div className="divide-y divide-[var(--cp-line)]">
              {todayJobs.map((job) => {
                const confirmed = job.status === "confirmed";
                return (
                  <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-[70px] shrink-0 text-[14px] font-semibold tabular-nums">
                      {fmtEt(job.scheduled_at, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/CanesPressure/schedule"
                        className="flex items-center gap-2 truncate text-[14px] font-medium hover:underline"
                      >
                        <span
                          className="cp-crew-dot shrink-0"
                          style={
                            job.crew
                              ? ({ ["--cp-crew"]: job.crew.color } as React.CSSProperties)
                              : undefined
                          }
                        />
                        <span className="truncate">{job.customer_name ?? "Customer"}</span>
                      </Link>
                      <p className="truncate text-[12.5px] text-[var(--cp-muted)]">
                        {job.job_name ?? "Job"}
                        {job.crew ? ` · ${job.crew.name}` : ""}
                      </p>
                    </div>
                    <span className={`cp-chip ${confirmed ? "cp-status-confirmed" : "cp-status-appt"}`}>
                      {confirmed ? "Confirmed" : "Scheduled"}
                    </span>
                    {job.job_address && (
                      <a
                        href={mapsHref(job.job_address)}
                        target="_blank"
                        rel="noreferrer"
                        className="cp-btn cp-btn-sm px-2.5"
                        aria-label={`Open ${job.job_address} in Maps`}
                      >
                        <MapPin size={15} strokeWidth={2} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">
              No jobs on the calendar today.
            </p>
          )}
        </div>
      </section>

      {/* Money row — the week in dollars */}
      <MoneyRow money={overview.money} />

      {/* Recent activity — the last 8 events across the pipeline */}
      <RecentActivity items={overview.recentActivity} />
    </div>
  );
}
