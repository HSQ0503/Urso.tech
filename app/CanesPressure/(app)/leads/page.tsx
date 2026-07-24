import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import { requirePagePermission } from "@/lib/canes/access";
import { listLeads } from "@/lib/canes/data";
import {
  fmtEt,
  fmtPhone,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type Lead,
  type LeadType,
} from "@/lib/canes/types";
import { LeadAvatar } from "@/app/CanesPressure/components/leads/lead-avatar";
import { NewLead } from "@/app/CanesPressure/components/leads/new-lead";
import { WaitTimer } from "@/app/CanesPressure/components/leads/wait-timer";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "open", "hot", "cold", "won", "lost"] as const;
type Filter = (typeof FILTERS)[number];

const TAB_LABEL: Record<Filter, string> = {
  all: "All",
  open: "Open",
  hot: "Hot",
  cold: "Cold",
  won: "Won",
  lost: "Lost",
};

const EMPTY_COPY: Record<Filter, string> = {
  all: "No leads yet. Add the first one with the button above.",
  open: "No open leads right now.",
  hot: "No hot leads waiting. Hot leads arrive with an appointment already set.",
  cold: "No cold leads to call. New virtual quotes will land here.",
  won: "No won jobs on the board yet.",
  lost: "No lost leads.",
};

function TypeBadge({ type }: { type: LeadType }) {
  return type === "hot" ? (
    <span className="cp-chip cp-badge-hot">Hot</span>
  ) : (
    <span className="cp-chip cp-badge-cold">Cold</span>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-card cp-card-hover block p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{lead.name ?? fmtPhone(lead.phone)}</span>
        <TypeBadge type={lead.type} />
        <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
      </div>
      <p className="mt-1 truncate text-[14px] text-[var(--cp-muted)]">
        {[lead.service, lead.address].filter(Boolean).join(" · ") || "No service details yet"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--cp-faint)]">
        <span>{SOURCE_LABEL[lead.source]}</span>
        <span className="tabular-nums">{fmtPhone(lead.phone)}</span>
        {lead.appointment_at && (
          <span className="inline-flex items-center gap-1 tabular-nums text-[var(--cp-muted)]">
            <Calendar size={13} strokeWidth={2} />
            {fmtEt(lead.appointment_at)}
          </span>
        )}
        {lead.parse_confidence !== null && lead.parse_confidence < 0.8 && (
          <span className="cp-chip bg-[var(--cp-warn-bg)] text-[var(--cp-warn)]">Review parse</span>
        )}
        {lead.type === "cold" && lead.status === "new" && <WaitTimer createdAt={lead.created_at} />}
      </div>
    </Link>
  );
}

// iOS grouped-list row: avatar, name + status chips, service·source sub, and a
// trailing WAITING timer or appointment time before the chevron.
function MobileLeadRow({ lead }: { lead: Lead }) {
  const sub = [lead.service, SOURCE_LABEL[lead.source]].filter(Boolean).join(" · ");
  const waiting = lead.type === "cold" && lead.status === "new";
  return (
    <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-list-row">
      <LeadAvatar name={lead.name ?? fmtPhone(lead.phone)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="cp-list-title truncate">{lead.name ?? fmtPhone(lead.phone)}</span>
          <TypeBadge type={lead.type} />
        </div>
        <p className="cp-list-sub truncate">
          {sub || "No service details yet"}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {lead.appointment_at ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-[var(--cp-muted)]">
            <Calendar size={12} strokeWidth={2} />
            {fmtEt(lead.appointment_at, { month: "short", day: "numeric", hour: "numeric" })}
          </span>
        ) : waiting ? (
          <WaitTimer createdAt={lead.created_at} />
        ) : (
          <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
        )}
      </div>
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </Link>
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string | string[] }>;
}) {
  await requirePagePermission("leads");
  const { f } = await searchParams;
  const raw = Array.isArray(f) ? f[0] : f;
  const filter: Filter = FILTERS.includes(raw as Filter) ? (raw as Filter) : "open";

  // One fetch covers the rows and every tab count. The subsets mirror the
  // listLeads filter mapping: open/hot/cold exclude won and lost.
  const all = await listLeads();
  const open = all.filter((l) => l.status !== "won" && l.status !== "lost");
  const subsets: Record<Filter, Lead[]> = {
    all,
    open,
    hot: open.filter((l) => l.type === "hot"),
    cold: open.filter((l) => l.type === "cold"),
    won: all.filter((l) => l.status === "won"),
    lost: all.filter((l) => l.status === "lost"),
  };
  const rows = subsets[filter];

  // Urgency is a red group header above plain cards (the Jobber "Overdue"
  // move), not a colored card edge.
  const needsCall = (l: Lead) => l.type === "cold" && l.status === "new" && !l.opted_out;
  const callNow = rows.filter(needsCall);
  const rest = rows.filter((l) => !needsCall(l));

  return (
    <div>
      {/* ── Mobile: iOS grouped-list presentation ─────────────────────────── */}
      <div className="md:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="cp-ios-title">
              Leads<span className="text-[var(--cp-brand)]">.</span>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
              Vendor texts, website requests, and referrals.
            </p>
          </div>
          <NewLead variant="icon" />
        </div>

        {/* Filter row: horizontally scrollable iOS segmented control. */}
        <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="cp-seg cp-seg-ios w-max">
            {FILTERS.map((key) => (
              <Link
                key={key}
                href={`/CanesPressure/leads?f=${key}`}
                className="cp-seg-btn"
                data-active={key === filter}
              >
                {TAB_LABEL[key]}
                <span className="tabular-nums opacity-70">{subsets[key].length}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <div className="cp-list px-4 py-10 text-center text-[13.5px] text-[var(--cp-muted)]">
              {EMPTY_COPY[filter]}
            </div>
          ) : (
            <div className="space-y-5">
              {callNow.length > 0 && (
                <div>
                  <p className="cp-list-header text-[var(--cp-danger)]">Call these now · {callNow.length}</p>
                  <div className="cp-list">
                    {callNow.map((lead) => (
                      <MobileLeadRow key={lead.id} lead={lead} />
                    ))}
                  </div>
                </div>
              )}
              {rest.length > 0 && (
                <div>
                  {callNow.length > 0 && (
                    <p className="cp-list-header">Everything else · {rest.length}</p>
                  )}
                  <div className="cp-list">
                    {rest.map((lead) => (
                      <MobileLeadRow key={lead.id} lead={lead} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop (md+): the shipped card list — do not alter ────────────── */}
      <div className="hidden md:block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">
            Leads<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
            Vendor texts, website requests, and referrals in one pipeline.
          </p>
        </div>
        <NewLead />
      </div>

      <div className="mt-5 flex flex-wrap gap-1">
        {FILTERS.map((key) => {
          const active = key === filter;
          return (
            <Link
              key={key}
              href={`/CanesPressure/leads?f=${key}`}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                active
                  ? "border-[var(--cp-line-strong)] bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_1px_2px_rgba(12,43,63,0.06)]"
                  : "border-transparent text-[var(--cp-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-ink)]"
              }`}
            >
              {TAB_LABEL[key]}
              <span className={`tabular-nums ${active ? "text-[var(--cp-muted)]" : "text-[var(--cp-faint)]"}`}>
                {subsets[key].length}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="cp-card px-4 py-10 text-center text-[13.5px] text-[var(--cp-muted)]">
            {EMPTY_COPY[filter]}
          </div>
        ) : (
          <>
            {callNow.length > 0 && (
              <>
                <p className="cp-group-label cp-group-danger pt-1">
                  Call these now — {callNow.length}
                </p>
                {callNow.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </>
            )}
            {rest.length > 0 && (
              <>
                {callNow.length > 0 && (
                  <p className="cp-group-label pt-3">Everything else — {rest.length}</p>
                )}
                {rest.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
