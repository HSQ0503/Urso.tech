import Link from "next/link";
import { Flame, MapPin, Phone, Snowflake } from "lucide-react";
import { getAgenda } from "@/lib/canes/data";
import { fmtEt, fmtPhone } from "@/lib/canes/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule" };

const mapsHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

export default async function SchedulePage() {
  const agenda = await getAgenda(14);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="cp-waterline mb-3 w-14" />
        <h1 className="cp-display text-[22px]">Schedule</h1>
        <p className="text-[13.5px] text-[var(--cp-muted)]">
          Estimate visits - confirmed means the customer replied YES
        </p>
      </header>

      {agenda.length === 0 ? (
        <div className="cp-card px-4 py-6 text-[13.5px] text-[var(--cp-muted)]">
          No estimate visits booked yet. Hot leads and phone closes land here automatically.
        </div>
      ) : (
        agenda.map(({ day, leads }) => (
          <section key={day}>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[var(--cp-muted)]">
              {day}
            </h2>
            <div className="cp-card mt-2 divide-y divide-[var(--cp-line)]">
              {leads.map((lead) => {
                const confirmed = lead.status === "confirmed";
                return (
                  <div key={lead.id} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-[70px] shrink-0 text-[14px] font-semibold">
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
                        {lead.type === "hot" ? (
                          <Flame size={12} strokeWidth={2.4} />
                        ) : (
                          <Snowflake size={12} strokeWidth={2.4} />
                        )}
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
                          <MapPin size={15} strokeWidth={2.2} />
                        </a>
                      )}
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="cp-btn cp-btn-sm px-2.5"
                          aria-label={`Call ${fmtPhone(lead.phone)}`}
                        >
                          <Phone size={15} strokeWidth={2.2} />
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
