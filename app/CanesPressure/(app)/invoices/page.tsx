import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePagePermission } from "@/lib/canes/access";
import { listInvoices } from "@/lib/canes/invoices";
import {
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  fmtEt,
  fmtMoney,
  invoiceBalanceCents,
  type Invoice,
} from "@/lib/canes/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices" };

const TABS = ["all", "due", "paid", "void"] as const;
type Tab = (typeof TABS)[number];

const EMPTY_COPY: Record<Tab, string> = {
  all: "No invoices yet. Complete a job on the schedule to bill it.",
  due: "Nothing outstanding — you're all caught up.",
  paid: "No paid invoices yet.",
  void: "No voided invoices.",
};

function matchesTab(i: Invoice, tab: Tab): boolean {
  if (tab === "all") return i.status !== "void";
  if (tab === "due") return i.status !== "void" && invoiceBalanceCents(i) > 0;
  if (tab === "paid") return i.status === "paid";
  return i.status === "void";
}

// The client-facing milestone that matters on a list row: what the CUSTOMER
// has (or hasn't) done with the bill, latest event first.
function clientMilestone(i: Invoice): { text: string; cls: string } | null {
  const d = (iso: string) => fmtEt(iso, { month: "short", day: "numeric" });
  if (i.voided_at) return { text: `Voided ${d(i.voided_at)}`, cls: "text-[var(--cp-faint)]" };
  if (i.paid_at) return { text: `Paid ${d(i.paid_at)}`, cls: "text-[var(--cp-good)]" };
  if (i.viewed_at) return { text: `Viewed ${d(i.viewed_at)}`, cls: "text-[var(--cp-muted)]" };
  if (i.sent_at) return { text: `Sent ${d(i.sent_at)}, not viewed yet`, cls: "text-[var(--cp-faint)]" };
  return null;
}

// iOS grouped-list row (md:hidden mobile tree): number + customer, status chip,
// trailing total (or amount due) + chevron.
function MobileInvoiceRow({ invoice }: { invoice: Invoice }) {
  const balance = invoiceBalanceCents(invoice);
  const owed = balance > 0 && invoice.status !== "void";
  const milestone = clientMilestone(invoice);
  return (
    <Link href={`/CanesPressure/invoices/${invoice.id}`} className="cp-list-row">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="cp-list-title tabular-nums">{invoice.number}</span>
          <span className={`cp-chip ${INVOICE_STATUS_CLASS[invoice.status]}`}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </span>
        </div>
        <p className="cp-list-sub truncate">{invoice.customer_name ?? "No customer name"}</p>
        {milestone && (
          <p className={`truncate text-[12px] tabular-nums ${milestone.cls}`}>{milestone.text}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-semibold tabular-nums">{fmtMoney(invoice.total_cents)}</p>
        {owed && (
          <p className="text-[12px] font-semibold tabular-nums text-[var(--cp-warn)]">
            {fmtMoney(balance)} due
          </p>
        )}
      </div>
      <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />
    </Link>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const balance = invoiceBalanceCents(invoice);
  const owed = balance > 0 && invoice.status !== "void";
  const milestone = clientMilestone(invoice);
  return (
    <Link href={`/CanesPressure/invoices/${invoice.id}`} className="cp-card cp-card-hover block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-semibold">{invoice.number}</span>
            <span className={`cp-chip ${INVOICE_STATUS_CLASS[invoice.status]}`}>
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
            {milestone && (
              <span className={`text-[12px] font-medium tabular-nums ${milestone.cls}`}>
                {milestone.text}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[14px]">{invoice.customer_name ?? "No customer name"}</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--cp-muted)]">
            {invoice.job_name ?? invoice.job_address ?? "—"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-[15px] font-semibold">{fmtMoney(invoice.total_cents)}</p>
          <p className="mt-1 tabular-nums text-[12.5px] text-[var(--cp-faint)]">
            {owed ? (
              <span className="font-semibold text-[var(--cp-warn)]">{fmtMoney(balance)} due</span>
            ) : (
              fmtEt(invoice.created_at, { month: "short", day: "numeric" })
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}

type InvoiceTotals = {
  all: number;
  due: number;
  paid: number;
};

function InvoiceSummary({
  totals,
  tab,
  voidCount,
}: {
  totals: InvoiceTotals;
  tab: Tab;
  voidCount: number;
}) {
  const items = [
    { key: "all" as const, label: "All", amount: totals.all, tone: "text-[var(--cp-ink)]" },
    { key: "due" as const, label: "Due", amount: totals.due, tone: "text-[var(--cp-warn)]" },
    { key: "paid" as const, label: "Paid", amount: totals.paid, tone: "text-[var(--cp-good)]" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" aria-label="Invoice totals and filters">
        {items.map((item) => {
          const active = tab === item.key;
          return (
            <Link
              key={item.key}
              href={`/CanesPressure/invoices?status=${item.key}`}
              className={`cp-card cp-card-hover flex min-h-[78px] min-w-0 flex-col items-center justify-center p-2 text-center ${
                active ? "ring-1 ring-inset ring-[var(--cp-line-strong)]" : ""
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="cp-mono uppercase">{item.label}</span>
              <span className={`mt-1 w-full truncate text-[13px] font-semibold tabular-nums sm:text-[16px] md:text-[19px] ${item.tone}`}>
                {fmtMoney(item.amount)}
              </span>
            </Link>
          );
        })}
      </div>
      {voidCount > 0 && (
        <div className="mt-2 flex justify-end">
          <Link
            href="/CanesPressure/invoices?status=void"
            className={`inline-flex min-h-8 items-center rounded-md px-2 text-[12px] font-semibold transition-colors hover:bg-[var(--cp-hover)] ${
              tab === "void" ? "text-[var(--cp-ink)]" : "text-[var(--cp-faint)]"
            }`}
            aria-current={tab === "void" ? "page" : undefined}
          >
            Voided · {voidCount}
          </Link>
        </div>
      )}
    </div>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requirePagePermission("invoices");
  const { status } = await searchParams;
  const raw = Array.isArray(status) ? status[0] : status;
  const normalized = raw === "unpaid" ? "due" : raw;
  const tab: Tab = TABS.includes(normalized as Tab) ? (normalized as Tab) : "all";

  const all = await listInvoices();
  const counts = Object.fromEntries(
    TABS.map((key) => [key, all.filter((i) => matchesTab(i, key)).length]),
  ) as Record<Tab, number>;

  const liveInvoices = all.filter((invoice) => invoice.status !== "void");
  const totals: InvoiceTotals = {
    all: liveInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0),
    due: liveInvoices.reduce((sum, invoice) => sum + invoiceBalanceCents(invoice), 0),
    paid: liveInvoices.reduce(
      (sum, invoice) => sum + Math.min(invoice.total_cents, Math.max(0, invoice.amount_paid_cents)),
      0,
    ),
  };

  const rows = all
    .filter((i) => matchesTab(i, tab))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div>
      {/* ── Mobile: iOS screen with Markate-style monetary filters. ── */}
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="cp-ios-title">
              Invoices<span className="text-[var(--cp-brand)]">.</span>
            </h1>
            <p className="cp-mono mt-1">{counts.all} total</p>
          </div>
        </div>

        <div className="mt-4">
          <InvoiceSummary totals={totals} tab={tab} voidCount={counts.void} />
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <div className="cp-list px-4 py-10 text-center text-[13.5px] text-[var(--cp-muted)]">
              {EMPTY_COPY[tab]}
            </div>
          ) : (
            <div className="cp-list">
              {rows.map((invoice) => (
                <MobileInvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop (md+). ── */}
      <div className="hidden md:block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">
            Invoices<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
            Every bill you have sent and collected. Bill a job from the schedule.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <InvoiceSummary totals={totals} tab={tab} voidCount={counts.void} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="cp-card px-4 py-10 text-center text-[13.5px] text-[var(--cp-muted)]">
            {EMPTY_COPY[tab]}
          </div>
        ) : (
          rows.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)
        )}
      </div>
      </div>
    </div>
  );
}
