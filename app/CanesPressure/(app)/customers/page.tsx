import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { listCustomers } from "@/lib/canes/customers";
import { fmtEt, fmtMoney, fmtPhone, type CustomerSummary } from "@/lib/canes/types";
import { CustomerAvatar } from "@/app/CanesPressure/components/customers/avatar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

// Jobber client-list blueprint: one search box (server-side via ?q=), one
// table-like card. Rows collapse into stacked cards below md.

const GRID = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_140px_120px_130px]";

function CustomerRow({ customer }: { customer: CustomerSummary }) {
  const lastJob = customer.last_job_at
    ? fmtEt(customer.last_job_at, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  return (
    <Link
      href={`/CanesPressure/customers/${customer.id}`}
      className="block px-4 py-3 transition-colors hover:bg-[var(--cp-hover)]"
    >
      <div className={`flex items-center gap-3 md:grid ${GRID}`}>
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <CustomerAvatar name={customer.name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[14px] font-semibold">{customer.name ?? "No name"}</p>
              {customer.archived && (
                <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-faint)]">Archived</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--cp-muted)] md:hidden">
              {customer.primary_address ?? "No address on file"}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-[var(--cp-faint)] md:hidden">
              {fmtPhone(customer.phone)} · Last job {lastJob}
            </p>
          </div>
        </div>
        <p className="hidden truncate text-[13px] text-[var(--cp-muted)] md:block">
          {customer.primary_address ?? "—"}
        </p>
        <p className="hidden truncate text-[13px] tabular-nums text-[var(--cp-muted)] md:block">
          {fmtPhone(customer.phone)}
        </p>
        <p className="hidden text-[13px] tabular-nums text-[var(--cp-muted)] md:block">{lastJob}</p>
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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const customers = await listCustomers(query || undefined);
  const archivedCount = customers.filter((c) => c.archived).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">
            Customers<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] tabular-nums text-[var(--cp-muted)]">
            {query
              ? `${customers.length} match${customers.length === 1 ? "" : "es"} for "${query}"`
              : `${customers.length} customer${customers.length === 1 ? "" : "s"}${archivedCount > 0 ? ` · ${archivedCount} archived` : ""}`}
          </p>
        </div>
        <Link href="/CanesPressure/customers/new" className="cp-btn cp-btn-primary">
          <Plus size={16} strokeWidth={2} />
          New customer
        </Link>
      </div>

      {/* GET form keeps the page a server component; the URL is the filter. */}
      <form method="get" className="mt-5">
        <div className="relative w-full sm:max-w-[340px]">
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

      <div className="mt-4">
        {customers.length === 0 ? (
          <div className="cp-card flex flex-col items-center gap-2 px-6 py-12 text-center">
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
          <div className="cp-card overflow-hidden">
            <div className={`hidden border-b border-[var(--cp-line)] px-4 py-2 md:grid md:gap-3 ${GRID}`}>
              <span className="cp-mono">Customer</span>
              <span className="cp-mono">Property</span>
              <span className="cp-mono">Phone</span>
              <span className="cp-mono">Last job</span>
              <span className="cp-mono text-right">Lifetime</span>
            </div>
            <div className="divide-y divide-[var(--cp-line)]">
              {customers.map((c) => (
                <CustomerRow key={c.id} customer={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
