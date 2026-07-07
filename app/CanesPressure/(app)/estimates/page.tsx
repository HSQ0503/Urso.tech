import Link from "next/link";
import { Plus } from "lucide-react";
import { listEstimates } from "@/lib/canes/estimates";
import {
  ESTIMATE_STATUS_CLASS,
  ESTIMATE_STATUS_LABEL,
  fmtEt,
  fmtMoney,
  type Estimate,
  type EstimateStatus,
} from "@/lib/canes/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estimates" };

// Status tabs are a superset key: "all" plus the five statuses an operator
// actually filters by day to day (expired rides under the list but isn't a tab).
const TABS = ["all", "draft", "sent", "viewed", "approved", "declined"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  approved: "Approved",
  declined: "Declined",
};

const SORTS = ["new", "old", "amount"] as const;
type Sort = (typeof SORTS)[number];

const SORT_LABEL: Record<Sort, string> = {
  new: "Newest first",
  old: "Oldest first",
  amount: "Highest amount",
};

const EMPTY_COPY: Record<Tab, string> = {
  all: "No estimates yet. Start one from a lead or with New estimate.",
  draft: "No drafts in progress.",
  sent: "Nothing waiting on the customer right now.",
  viewed: "No estimates have been opened by a customer yet.",
  approved: "No approved estimates yet.",
  declined: "No declined estimates.",
};

function matchesTab(e: Estimate, tab: Tab): boolean {
  return tab === "all" || e.status === (tab as EstimateStatus);
}

function EstimateRow({ estimate }: { estimate: Estimate }) {
  return (
    <Link
      href={`/CanesPressure/estimates/${estimate.id}`}
      className="cp-card cp-card-hover block p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-semibold">{estimate.number}</span>
            <span className={`cp-chip ${ESTIMATE_STATUS_CLASS[estimate.status]}`}>
              {ESTIMATE_STATUS_LABEL[estimate.status]}
            </span>
          </div>
          <p className="mt-1 truncate text-[14px]">
            {estimate.customer_name ?? "No customer name"}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--cp-muted)]">
            {estimate.job_address ?? "No job address"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-[15px] font-semibold">{fmtMoney(estimate.total_cents)}</p>
          <p className="mt-1 tabular-nums text-[12.5px] text-[var(--cp-faint)]">
            {fmtEt(estimate.created_at)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; sort?: string | string[] }>;
}) {
  const { status, sort } = await searchParams;
  const rawStatus = Array.isArray(status) ? status[0] : status;
  const rawSort = Array.isArray(sort) ? sort[0] : sort;
  const tab: Tab = TABS.includes(rawStatus as Tab) ? (rawStatus as Tab) : "all";
  const activeSort: Sort = SORTS.includes(rawSort as Sort) ? (rawSort as Sort) : "new";

  // One fetch (already created_at desc) covers the rows and every tab count.
  const all = await listEstimates();
  const counts = Object.fromEntries(
    TABS.map((key) => [key, all.filter((e) => matchesTab(e, key)).length]),
  ) as Record<Tab, number>;

  const rows = [...all.filter((e) => matchesTab(e, tab))].sort((a, b) => {
    if (activeSort === "amount") return b.total_cents - a.total_cents;
    const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return activeSort === "old" ? cmp : -cmp;
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">Estimates</h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
            Every quote you have drafted, sent, and closed.
          </p>
        </div>
        <Link href="/CanesPressure/estimates/new" className="cp-btn cp-btn-primary">
          <Plus size={16} strokeWidth={2} />
          New estimate
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((key) => {
            const active = key === tab;
            const href =
              activeSort === "new"
                ? `/CanesPressure/estimates?status=${key}`
                : `/CanesPressure/estimates?status=${key}&sort=${activeSort}`;
            return (
              <Link
                key={key}
                href={href}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-[var(--cp-line-strong)] bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_1px_2px_rgba(12,43,63,0.06)]"
                    : "border-transparent text-[var(--cp-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-ink)]"
                }`}
              >
                {TAB_LABEL[key]}
                <span className={`tabular-nums ${active ? "text-[var(--cp-muted)]" : "text-[var(--cp-faint)]"}`}>
                  {counts[key]}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Sort is a plain GET form so the page stays a server component and the
            URL stays the source of truth; the button re-filters server-side. */}
        <form method="get" className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="status" value={tab} />
          <select name="sort" defaultValue={activeSort} className="cp-select w-auto" aria-label="Sort estimates">
            {SORTS.map((key) => (
              <option key={key} value={key}>{SORT_LABEL[key]}</option>
            ))}
          </select>
          <button type="submit" className="cp-btn cp-btn-sm">Sort</button>
        </form>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="cp-card px-4 py-10 text-center text-[13.5px] text-[var(--cp-muted)]">
            {EMPTY_COPY[tab]}
          </div>
        ) : (
          rows.map((estimate) => <EstimateRow key={estimate.id} estimate={estimate} />)
        )}
      </div>
    </div>
  );
}
