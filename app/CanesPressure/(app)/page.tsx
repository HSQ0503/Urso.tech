import Link from "next/link";
import { CheckCircle2, MapPin, Phone } from "lucide-react";
import { getAgenda, getOverview } from "@/lib/canes/data";
import { ET, fmtEt, fmtPhone, SOURCE_LABEL, type Lead } from "@/lib/canes/types";
import { WaitTimer } from "@/app/CanesPressure/components/overview/wait-timer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

const leadHref = (id: string) => `/CanesPressure/leads/${id}`;
const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

function SectionTitle({ label, count, tone }: { label: string; count?: number; tone?: "danger" }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold">
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`cp-chip ${
            tone === "danger"
              ? "bg-[var(--cp-danger-bg)] text-[var(--cp-danger)]"
              : "bg-[var(--cp-brand-soft)] text-[var(--cp-brand-deep)]"
          }`}
        >
          {count}
        </span>
      )}
    </h2>
  );
}

function CallQueueCard({ lead }: { lead: Lead }) {
  return (
    <div className="cp-card cp-card-hover cp-urgent">
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

export default async function TodayPage() {
  const [overview, agenda] = await Promise.all([getOverview(), getAgenda(2)]);
  const { coldNeedingCall, unconfirmedToday, todayAgenda, followUpsDue, counts } = overview;

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

  const stats = [
    { label: "Open leads", value: counts.open, topline: "cp-topline-brand", href: "/CanesPressure/leads?f=open" },
    { label: "Hot", value: counts.hot, topline: "cp-topline-hot", href: "/CanesPressure/leads?f=hot" },
    { label: "Cold to call", value: counts.cold, topline: "cp-topline-cold", href: "/CanesPressure/leads?f=cold" },
    { label: "Won this week", value: counts.wonThisWeek, topline: "cp-topline-good", href: "/CanesPressure/leads?f=won" },
  ];

  const confirmedToday = todayAgenda.filter((l) => l.status === "confirmed").length;
  const pendingToday = todayAgenda.length - confirmedToday;

  return (
    <div className="flex flex-col gap-7">
      {/* Header — date line + greeting, Jobber-style */}
      <header>
        <p className="text-[13px] text-[var(--cp-muted)]">{dateLine}</p>
        <h1 className="cp-display mt-0.5 text-[26px]">{greeting}, Sebastian</h1>
      </header>

      {/* Pipeline at a glance — each card opens its leads view */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="cp-card cp-card-hover overflow-hidden">
              <span className={`cp-topline ${s.topline}`} />
              <div className="px-4 pb-3.5 pt-3">
                <p className="text-[22px] font-bold leading-tight tabular-nums">{s.value}</p>
                <p className="mt-0.5 whitespace-nowrap text-[12.5px] font-medium text-[var(--cp-muted)]">
                  {s.label}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Call queue, the hero */}
      <section>
        {coldNeedingCall.length > 0 ? (
          <>
            <SectionTitle label="Call these now" count={coldNeedingCall.length} tone="danger" />
            <div className="mt-2.5 flex flex-col gap-2.5">
              {coldNeedingCall.map((lead) => (
                <CallQueueCard key={lead.id} lead={lead} />
              ))}
            </div>
          </>
        ) : (
          <div className="cp-card cp-done flex items-center gap-2.5 px-4 py-3">
            <CheckCircle2 size={18} strokeWidth={2} className="shrink-0 text-[var(--cp-good)]" />
            <p className="text-[14px] font-medium">No quotes waiting - every lead has been called.</p>
          </div>
        )}
      </section>

      {/* Unconfirmed + follow-ups share a row on desktop */}
      {(unconfirmedToday.length > 0 || followUpsDue.length > 0) && (
        <div className="grid gap-7 md:grid-cols-2">
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

      {/* Today's visits */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle label="Today's visits" count={todayAgenda.length} />
          <div className="flex items-center gap-2">
            {todayAgenda.length > 0 && (
              <>
                <span className="cp-chip cp-status-confirmed">{confirmedToday} confirmed</span>
                {pendingToday > 0 && (
                  <span className="cp-chip cp-status-appt">{pendingToday} pending</span>
                )}
              </>
            )}
            <Link href="/CanesPressure/schedule" className="cp-btn cp-btn-sm">
              View schedule
            </Link>
          </div>
        </div>
        {todayAgenda.length > 0 ? (
          <div className="cp-card mt-2.5 divide-y divide-[var(--cp-line)]">
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
          <p className="mt-2.5 text-[13.5px] text-[var(--cp-muted)]">
            No visits on the calendar today.
          </p>
        )}
        {nextDay && nextDay.leads.length > 0 && (
          <p className="mt-2 text-[12.5px] text-[var(--cp-muted)]">
            {nextDay.day}: {nextDay.leads.length} visit{nextDay.leads.length === 1 ? "" : "s"} booked.{" "}
            <Link href="/CanesPressure/schedule" className="font-medium text-[var(--cp-brand-deep)] hover:underline">
              View schedule
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
