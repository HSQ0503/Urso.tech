import Link from "next/link";
import { ChevronRight, Plus, Repeat, Search, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/canes/access";
import { listCustomers } from "@/lib/canes/customers";
import { getRecurringInsights } from "@/lib/canes/growth";
import { fmtEt, fmtMoney, fmtPhone, type CustomerSummary } from "@/lib/canes/types";
import { CustomerAvatar } from "@/app/CanesPressure/components/customers/avatar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

// Jobber client-list blueprint: one search box (server-side via ?q=), one
// table-like card. Desktop keeps the frozen grid table; mobile (md:hidden)
// renders a single iOS inset list of avatar rows.

const GRID = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_140px_120px_130px]";

function lastJobLabel(customer: CustomerSummary): string {
  return customer.last_job_at
    ? fmtEt(customer.last_job_at, { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

// Desktop table row — frozen. Only rendered inside the hidden md:block tree.
function CustomerRow({ customer, recurring }: { customer: CustomerSummary; recurring: boolean }) {
  const lastJob = lastJobLabel(customer);
  return (
    <Link
      href={`/CanesPressure/customers/${customer.id}`}
      className="block px-4 py-3 transition-colors hover:bg-[var(--cp-hover)]"
    >
      <div className={`grid items-center gap-3 ${GRID}`}>
        <div className="flex min-w-0 flex-none items-center gap-3">
          <CustomerAvatar name={customer.name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[14px] font-semibold">{customer.name ?? "No name"}</p>
              {recurring && (
                <span className="cp-chip bg-[var(--cp-good-bg)] text-[var(--cp-good)]">Recurring</span>
              )}
              {customer.archived && (
                <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-faint)]">Archived</span>
              )}
            </div>
          </div>
        </div>
        <p className="truncate text-[13px] text-[var(--cp-muted)]">
          {customer.primary_address ?? "—"}
        </p>
        <p className="truncate text-[13px] tabular-nums text-[var(--cp-muted)]">
          {fmtPhone(customer.phone)}
        </p>
        <p className="text-[13px] tabular-nums text-[var(--cp-muted)]">{lastJob}</p>
        <div className="shrink-0 text-right">
          <p className="text-[14px] font-semibold tabular-nums">{fmtMoney(customer.lifetime_cents)}</p>
          {customer.open_balance_cents > 0 && (
            <span className="cp-chip mt-1 bg-[var(--cp-warn-bg)] tabular-nums text-[var(--cp-warn)]">
              {fmtMoney(customer.open_balance_cents)} due
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Mobile iOS row — avatar, name (+ archived chip), address, phone·last job,
// trailing lifetime money + "$X due" chip, chevron.
function CustomerListRow({ customer, recurring }: { customer: CustomerSummary; recurring: boolean }) {
  const lastJob = lastJobLabel(customer);
  return (
    <Link href={`/CanesPressure/customers/${customer.id}`} className="cp-list-row">
      <CustomerAvatar name={customer.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="cp-list-title truncate">{customer.name ?? "No name"}</span>
          {recurring && (
            <span className="cp-chip shrink-0 bg-[var(--cp-good-bg)] text-[var(--cp-good)]">Recurring</span>
          )}
          {customer.archived && (
            <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-faint)]">Archived</span>
          )}
        </div>
        <p className="cp-list-sub truncate">{customer.primary_address ?? "No address on file"}</p>
        <p className="cp-list-sub truncate tabular-nums">
          {fmtPhone(customer.phone)} · Last job {lastJob}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold tabular-nums">{fmtMoney(customer.lifetime_cents)}</p>
        {customer.open_balance_cents > 0 && (
          <span className="cp-chip mt-1 bg-[var(--cp-warn-bg)] tabular-nums text-[var(--cp-warn)]">
            {fmtMoney(customer.open_balance_cents)} due
          </span>
        )}
      </div>
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </Link>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePagePermission("customers");
  const sp = await searchParams;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const [customers, recurring] = await Promise.all([
    listCustomers(query || undefined),
    getRecurringInsights(),
  ]);
  const recurringIds = new Set(recurring.recurringCustomerIds);
  const planCount = recurring.rows.length;
  const archivedCount = customers.filter((c) => c.archived).length;

  const countLine = query
    ? `${customers.length} match${customers.length === 1 ? "" : "es"} for "${query}"`
    : `${customers.length} customer${customers.length === 1 ? "" : "s"}${archivedCount > 0 ? ` · ${archivedCount} archived` : ""}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="cp-display text-[28px] leading-[1.08] md:text-[24px] md:leading-tight">
            Customers<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] tabular-nums text-[var(--cp-muted)]">{countLine}</p>
        </div>
        {/* Round + on mobile; the full pill button returns at md+. */}
        <Link
          href="/CanesPressure/customers/new"
          aria-label="New customer"
          className="cp-icon-btn cp-icon-btn-primary md:hidden"
        >
          <Plus size={20} strokeWidth={2} />
        </Link>
        <Link
          href="/CanesPressure/customers/new"
          className="cp-btn cp-btn-primary hidden md:inline-flex"
        >
          <Plus size={16} strokeWidth={2} />
          New customer
        </Link>
      </div>

      {/* GET form keeps the page a server component; the URL is the filter. */}
      <form method="get" className="mt-5">
        {/* iOS filled search on mobile */}
        <div className="cp-search-wrap md:hidden">
          <Search size={16} strokeWidth={2} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            className="cp-input-ios"
            placeholder="Search name, phone, or address"
            aria-label="Search customers"
          />
        </div>
        {/* Desktop bordered search — frozen */}
        <div className="relative hidden w-full sm:max-w-[340px] md:block">
          <Search
            size={15}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-faint)]"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            className="cp-input cp-search"
            placeholder="Search name, phone, or address"
            aria-label="Search customers"
          />
        </div>
      </form>

      {/* Recurring plans at a glance — "which of my customers repeat". Rows
          below carry the matching Recurring chip. */}
      <div className="cp-card mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold">
          <Repeat size={14} strokeWidth={2} className="text-[var(--cp-brand-deep)]" />
          Recurring plans
        </span>
        {planCount > 0 ? (
          <span className="text-[13px] tabular-nums text-[var(--cp-muted)]">
            {planCount} active plan{planCount === 1 ? "" : "s"} · est.{" "}
            {fmtMoney(recurring.mrrCents)}/month
          </span>
        ) : (
          <span className="text-[13px] text-[var(--cp-faint)]">
            None yet — set a job to repeat from the job editor.
          </span>
        )}
      </div>

      <div className="mt-4">
        {customers.length === 0 ? (
          <div className="cp-card flex flex-col items-center gap-2 rounded-xl px-6 py-12 text-center md:rounded-md">
            <Users size={20} strokeWidth={2} className="text-[var(--cp-faint)]" />
            {query ? (
              <>
                <p className="text-[14px] font-semibold">No customers match &quot;{query}&quot;</p>
                <Link
                  href="/CanesPressure/customers"
                  className="text-[13px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                >
                  Clear search
                </Link>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold">No customers yet</p>
                <p className="text-[13.5px] text-[var(--cp-muted)]">
                  Customers appear here when estimates are approved, or add one yourself.
                </p>
                <Link href="/CanesPressure/customers/new" className="cp-btn cp-btn-primary mt-2">
                  <Plus size={16} strokeWidth={2} />
                  New customer
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: one iOS inset list of avatar rows */}
            <div className="cp-list md:hidden">
              {customers.map((c) => (
                <CustomerListRow key={c.id} customer={c} recurring={recurringIds.has(c.id)} />
              ))}
            </div>

            {/* Desktop: frozen table card */}
            <div className="cp-card hidden overflow-hidden md:block">
              <div className={`grid gap-3 border-b border-[var(--cp-line)] px-4 py-2 ${GRID}`}>
                <span className="cp-mono">Customer</span>
                <span className="cp-mono">Property</span>
                <span className="cp-mono">Phone</span>
                <span className="cp-mono">Last job</span>
                <span className="cp-mono text-right">Lifetime</span>
              </div>
              <div className="divide-y divide-[var(--cp-line)]">
                {customers.map((c) => (
                  <CustomerRow key={c.id} customer={c} recurring={recurringIds.has(c.id)} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
