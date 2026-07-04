import Link from "next/link";
import { CheckCircle2, MapPin, Phone } from "lucide-react";
import { getAgenda, getOverview } from "@/lib/canes/data";
import { ET, fmtEt, fmtPhone, SOURCE_LABEL, type Lead } from "@/lib/canes/types";
import { WaitTimer } from "@/app/CanesPressure/components/overview/wait-timer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

const leadHref = (id: string) => `/CanesPressure/leads/${id}`;
const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[var(--cp-muted)]">
      {label}
      {count !== undefined && count > 0 && (
        <span className="cp-chip bg-[var(--cp-brand-soft)] text-[var(--cp-brand-deep)]">{count}</span>
      )}
    </h2>
  );
}

function CallQueueCard({ lead }: { lead: Lead }) {
  return (
    <div className="cp-card cp-card-hover overflow-hidden">
      <div className="cp-waterline" />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{lead.name ?? fmtPhone(lead.phone)}</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--cp-muted)]">
            {lead.service ?? "Service not listed"} · {SOURCE_LABEL[lead.source]}
          </p>
        </div>
        <WaitTimer createdAt={lead.created_at} />
        <div className="flex items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-primary flex-1 sm:flex-none">
              <Phone size={16} strokeWidth={2.2} />
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

  const todayKey = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const nextDay = agenda.find((g) => g.day !== todayKey);

  const stats = [
    { label: "Open leads", value: counts.open },
    { label: "Hot", value: counts.hot },
    { label: "Cold", value: counts.cold },
    { label: "Won this week", value: counts.wonThisWeek },
  ];

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="cp-waterline mb-3 w-14" />
          <h1 className="cp-display text-[22px]">Today</h1>
          <p className="text-[13.5px] text-[var(--cp-muted)]">{dateLine}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="cp-card px-3.5 py-2.5">
              <p className="text-[19px] font-semibold leading-tight">{s.value}</p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-[var(--cp-muted)]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </header>

      {/* Call queue, the hero */}
      <section>
        {coldNeedingCall.length > 0 ? (
          <>
            <SectionTitle label="Call these now" count={coldNeedingCall.length} />
            <div className="mt-2 flex flex-col gap-3">
              {coldNeedingCall.map((lead) => (
                <CallQueueCard key={lead.id} lead={lead} />
              ))}
            </div>
          </>
        ) : (
          <div
            className="cp-card flex items-center gap-2.5 px-4 py-3"
            style={{
              background: "color-mix(in srgb, var(--cp-good-bg) 55%, white)",
              borderColor: "color-mix(in srgb, var(--cp-good) 25%, var(--cp-line))",
            }}
          >
            <CheckCircle2 size={18} strokeWidth={2.2} className="shrink-0 text-[var(--cp-good)]" />
            <p className="text-[13.5px] font-medium text-[var(--cp-good)]">
              No quotes waiting - every lead has been called.
            </p>
          </div>
        )}
      </section>

      {/* Unconfirmed + follow-ups share a row on desktop */}
      {(unconfirmedToday.length > 0 || followUpsDue.length > 0) && (
        <div className="grid gap-7 md:grid-cols-2">
          {unconfirmedToday.length > 0 && (
            <section>
              <SectionTitle label="Unconfirmed visits" count={unconfirmedToday.length} />
              <div className="mt-2 flex flex-col gap-2">
                {unconfirmedToday.map((lead) => (
                  <div
                    key={lead.id}
                    className="cp-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                    style={{
                      background: "color-mix(in srgb, var(--cp-warn-bg) 45%, white)",
                      borderColor: "color-mix(in srgb, var(--cp-warn) 25%, var(--cp-line))",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold">
                        {lead.name ?? fmtPhone(lead.phone)}
                      </p>
                      <p className="mt-0.5 text-[13px] text-[var(--cp-muted)]">
                        {fmtEt(lead.appointment_at)}
                      </p>
                    </div>
                    <span
                      className="cp-chip self-start sm:self-auto"
                      style={{ background: "var(--cp-warn-bg)", color: "var(--cp-warn)" }}
                    >
                      No YES yet
                    </span>
                    <div className="flex items-center gap-2">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-sm">
                          <Phone size={14} strokeWidth={2.2} />
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
              <div className="cp-card mt-2 divide-y divide-[var(--cp-line)]">
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
        <SectionTitle label="Today's visits" count={todayAgenda.length} />
        {todayAgenda.length > 0 ? (
          <div className="cp-card mt-2 divide-y divide-[var(--cp-line)]">
            {todayAgenda.map((lead) => {
              const confirmed = lead.status === "confirmed";
              return (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-[70px] shrink-0 text-[14px] font-semibold">
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
                      <MapPin size={15} strokeWidth={2.2} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[13.5px] text-[var(--cp-muted)]">
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
