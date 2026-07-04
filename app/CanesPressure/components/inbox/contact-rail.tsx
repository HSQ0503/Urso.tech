import Link from "next/link";
import { CalendarClock, MapPin, Phone, SquareArrowOutUpRight } from "lucide-react";
import {
  fmtEt,
  fmtPhone,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type Lead,
} from "@/lib/canes/types";

// Contact details rail — the inbox's third pane on wide screens,
// OpenPhone-style: identity block, quick actions, then lead properties.

// Plain initials avatar (OpenPhone-style), never an icon in a brand circle.
function initials(name: string | null): string {
  if (!name) return "#";
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#").slice(0, 2);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12.5px] text-[var(--cp-faint)]">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}

export function ContactRail({ peerPhone, lead }: { peerPhone: string; lead: Lead | null }) {
  return (
    <div className="cp-scroll flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8ebee] text-[15px] font-semibold text-[var(--cp-muted)]">
          {initials(lead?.name ?? null)}
        </span>
        <p className="mt-2.5 text-[15px] font-semibold leading-tight">
          {lead?.name ?? fmtPhone(peerPhone)}
        </p>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-[var(--cp-muted)]">
          {fmtPhone(peerPhone)}
        </p>
        {lead && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className={`cp-chip ${lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}>
              {lead.type === "hot" ? "Hot" : "Cold"}
            </span>
            <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`tel:${peerPhone}`} className="cp-btn cp-btn-sm">
          <Phone size={14} strokeWidth={2} /> Call
        </a>
        {lead ? (
          <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-btn cp-btn-sm">
            <SquareArrowOutUpRight size={14} strokeWidth={2} /> Open lead
          </Link>
        ) : (
          <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">No lead</span>
        )}
      </div>

      {/* Properties */}
      {lead && (
        <>
          <div className="cp-divider mt-4 pt-3">
            <Row label="Service">{lead.service ?? "—"}</Row>
            <Row label="Source">{SOURCE_LABEL[lead.source]}</Row>
            <Row label="Received">{fmtEt(lead.created_at, { month: "short", day: "numeric" })}</Row>
            {lead.appointment_at && (
              <Row label="Visit">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <CalendarClock size={13} strokeWidth={2} className="text-[var(--cp-muted)]" />
                  {fmtEt(lead.appointment_at)}
                </span>
              </Row>
            )}
          </div>
          {lead.address && (
            <div className="cp-divider mt-2 pt-3">
              <p className="text-[12.5px] text-[var(--cp-faint)]">Address</p>
              <p className="mt-1 text-[13px] font-medium leading-snug">{lead.address}</p>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
              >
                <MapPin size={13} strokeWidth={2} /> Open in Maps
              </a>
            </div>
          )}
          {lead.notes && (
            <div className="cp-divider mt-2 pt-3">
              <p className="text-[12.5px] text-[var(--cp-faint)]">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
                {lead.notes}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
