import Link from "next/link";
import { CalendarClock, MapPin, Phone, SquareArrowOutUpRight, UserRound } from "lucide-react";
import {
  fmtEt,
  fmtMoney,
  fmtPhone,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type Contact,
  type Lead,
  type ThreadKind,
} from "@/lib/canes/types";

// Contact details rail — the inbox's third pane on wide screens,
// OpenPhone-style: identity block, quick actions, then lead properties for
// lead threads or the job-history summary for customer threads.

// Slim history the page derives from getCustomer() for customer threads.
export type CustomerHistory = {
  jobsCount: number;
  lifetimeCents: number;
  openBalanceCents: number;
  lastJobAt: string | null;
};

// Plain initials avatar (OpenPhone-style), never an icon in a brand circle.
function initials(name: string | null): string {
  if (!name) return "#";
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#").slice(0, 2);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="cp-mono shrink-0">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}

export function ContactRail({
  peerPhone,
  kind,
  lead,
  contact,
  history,
}: {
  peerPhone: string;
  kind: ThreadKind;
  lead: Lead | null;
  contact: Contact | null;
  history: CustomerHistory | null;
}) {
  if (kind === "vendor") {
    return (
      <div className="cp-scroll flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <span className="cp-avatar" style={{ width: 48, height: 48, fontSize: 15 }}>
            LV
          </span>
          <p className="mt-2.5 text-[15px] font-semibold leading-tight">Lead vendor</p>
          <p className="mt-0.5 text-[12.5px] tabular-nums text-[var(--cp-muted)]">
            {fmtPhone(peerPhone)}
          </p>
          <span className="cp-chip mt-2 bg-[var(--cp-bg)] text-[var(--cp-muted)]">Vendor</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <a href={`tel:${peerPhone}`} className="cp-btn cp-btn-sm">
            <Phone size={14} strokeWidth={2} /> Call
          </a>
        </div>
        <div className="cp-divider mt-4 pt-3">
          <p className="text-[12.5px] leading-relaxed text-[var(--cp-muted)]">
            New lead texts from this number are parsed into lead cards automatically. The
            customers each get their own conversation and lead page.
          </p>
        </div>
      </div>
    );
  }

  const isCustomer = kind === "customer";
  const name = contact?.name ?? lead?.name ?? null;

  return (
    <div className="cp-scroll flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        <span className="cp-avatar" style={{ width: 48, height: 48, fontSize: 15 }}>
          {initials(name)}
        </span>
        <p className="mt-2.5 text-[15px] font-semibold leading-tight">
          {name ?? fmtPhone(peerPhone)}
        </p>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-[var(--cp-muted)]">
          {fmtPhone(peerPhone)}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {isCustomer && (
            <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">Customer</span>
          )}
          {!isCustomer && lead && (
            <>
              <span className={`cp-chip ${lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}>
                {lead.type === "hot" ? "Hot" : "Cold"}
              </span>
              <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>
                {STATUS_LABEL[lead.status]}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`tel:${peerPhone}`} className="cp-btn cp-btn-sm">
          <Phone size={14} strokeWidth={2} /> Call
        </a>
        {isCustomer && contact ? (
          <Link href={`/CanesPressure/customers/${contact.id}`} className="cp-btn cp-btn-sm">
            <UserRound size={14} strokeWidth={2} /> View profile
          </Link>
        ) : lead ? (
          <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-btn cp-btn-sm">
            <SquareArrowOutUpRight size={14} strokeWidth={2} /> Open lead
          </Link>
        ) : (
          <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">No lead</span>
        )}
      </div>

      {/* Customer job history */}
      {isCustomer && (
        <>
          <div className="cp-divider mt-4 pt-3">
            <p className="cp-mono">Job history</p>
            {history ? (
              <>
                <p className="mt-1.5 text-[13.5px] font-semibold tabular-nums">
                  {history.jobsCount} {history.jobsCount === 1 ? "job" : "jobs"} ·{" "}
                  {fmtMoney(history.lifetimeCents)} lifetime
                </p>
                {history.lastJobAt && (
                  <Row label="Last job">
                    {fmtEt(history.lastJobAt, { month: "short", day: "numeric", year: "numeric" })}
                  </Row>
                )}
                {history.openBalanceCents > 0 && (
                  <Row label="Open balance">
                    <span className="tabular-nums text-[var(--cp-warn)]">
                      {fmtMoney(history.openBalanceCents)}
                    </span>
                  </Row>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-[var(--cp-muted)]">No jobs yet.</p>
            )}
          </div>
          {(contact?.email || contact?.notes) && (
            <div className="cp-divider mt-2 pt-3">
              {contact.email && (
                <Row label="Email">
                  <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                    {contact.email}
                  </a>
                </Row>
              )}
              {contact.notes && (
                <>
                  <p className="cp-mono mt-1.5">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
                    {contact.notes}
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Lead properties */}
      {!isCustomer && lead && (
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
              <p className="cp-mono">Address</p>
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
              <p className="cp-mono">Notes</p>
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
