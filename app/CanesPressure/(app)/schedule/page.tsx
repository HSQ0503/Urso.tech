import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { getAgenda } from "@/lib/canes/data";
import { ET, fmtEt, fmtPhone } from "@/lib/canes/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule" };

const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

// getAgenda groups by this exact key; the week strip must match it.
const dayKeyFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  weekday: "long",
  month: "short",
  day: "numeric",
});

export default async function SchedulePage() {
  const agenda = await getAgenda(14);
  const countByDay = new Map(agenda.map((g) => [g.day, g.leads.length]));

  // The next 7 ET days, empty ones included, so the week reads at a glance.
  const nowMs = new Date().getTime();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nowMs + i * 86_400_000);
    const key = dayKeyFmt.format(d);
    const [weekday, rest] = key.split(", ");
    return {
      key,
      dow: weekday.slice(0, 3),
      dayNum: rest.split(" ")[1],
      count: countByDay.get(key) ?? 0,
      isToday: i === 0,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="cp-display text-[24px]">Schedule</h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Estimate visits - confirmed means the customer replied YES
        </p>
      </header>

      {/* Week at a glance */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.map((d) => {
          const cell = (
            <>
              <span
                className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                  d.isToday ? "text-[var(--cp-brand-deep)]" : "text-[var(--cp-faint)]"
                }`}
              >
                {d.dow}
              </span>
              <span className="text-[16px] font-bold leading-tight tabular-nums">{d.dayNum}</span>
              <span
                className={`mt-0.5 text-[10.5px] font-medium tabular-nums ${
                  d.count > 0 ? "text-[var(--cp-brand-deep)]" : "text-transparent"
                }`}
              >
                {d.count > 0 ? `${d.count} visit${d.count === 1 ? "" : "s"}` : "0"}
              </span>
            </>
          );
          const base = "flex flex-col items-center rounded-md border px-1 py-2 text-center";
          return d.count > 0 ? (
            <a
              key={d.key}
              href={`#${d.key.replace(/[^a-zA-Z0-9]/g, "-")}`}
              className={`${base} cp-card-hover ${
                d.isToday
                  ? "border-[var(--cp-brand)] bg-[var(--cp-brand-soft)]"
                  : "border-[var(--cp-line)] bg-[var(--cp-surface)]"
              }`}
            >
              {cell}
            </a>
          ) : (
            <div
              key={d.key}
              className={`${base} ${
                d.isToday
                  ? "border-[var(--cp-brand)] bg-[var(--cp-brand-soft)]"
                  : "border-[var(--cp-line)] bg-[var(--cp-surface)] opacity-60"
              }`}
            >
              {cell}
            </div>
          );
        })}
      </div>

      {agenda.length === 0 ? (
        <div className="cp-card px-4 py-6 text-[13.5px] text-[var(--cp-muted)]">
          No estimate visits booked yet. Hot leads and phone closes land here automatically.
        </div>
      ) : (
        agenda.map(({ day, leads }) => (
          <section key={day} id={day.replace(/[^a-zA-Z0-9]/g, "-")} className="scroll-mt-4">
            <h2 className="text-[15px] font-semibold">{day}</h2>
            <div className="cp-card mt-2.5 divide-y divide-[var(--cp-line)]">
              {leads.map((lead) => {
                const confirmed = lead.status === "confirmed";
                return (
                  <div key={lead.id} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-[70px] shrink-0 text-[14px] font-semibold tabular-nums">
                        {fmtEt(lead.appointment_at, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/CanesPressure/leads/${lead.id}`}
                          className="block truncate text-[14px] font-medium hover:underline"
                        >
                          {lead.name ?? fmtPhone(lead.phone)}
                        </Link>
                        <p className="truncate text-[12.5px] text-[var(--cp-muted)]">
                          {lead.service ?? "Estimate visit"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-[82px] sm:pl-0">
                      <span className={`cp-chip ${lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}>
                        {lead.type === "hot" ? "Hot" : "Cold"}
                      </span>
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
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="cp-btn cp-btn-sm px-2.5"
                          aria-label={`Call ${fmtPhone(lead.phone)}`}
                        >
                          <Phone size={15} strokeWidth={2} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
