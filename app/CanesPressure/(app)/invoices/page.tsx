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

const TABS = ["all", "unpaid", "paid", "void"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = { all: "All", unpaid: "Unpaid", paid: "Paid", void: "Void" };

const EMPTY_COPY: Record<Tab, string> = {
  all: "No invoices yet. Complete a job on the schedule to bill it.",
  unpaid: "Nothing outstanding — you're all caught up.",
  paid: "No paid invoices yet.",
  void: "No voided invoices.",
};

function matchesTab(i: Invoice, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "unpaid") return i.status === "draft" || i.status === "sent" || i.status === "viewed";
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

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requirePagePermission("invoices");
  const { status } = await searchParams;
  const raw = Array.isArray(status) ? status[0] : status;
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "all";

  const all = await listInvoices();
  const counts = Object.fromEntries(
    TABS.map((key) => [key, all.filter((i) => matchesTab(i, key)).length]),
  ) as Record<Tab, number>;

  const outstanding = all
    .filter((i) => i.status !== "void" && i.status !== "paid")
    .reduce((sum, i) => sum + invoiceBalanceCents(i), 0);

  const rows = all
    .filter((i) => matchesTab(i, tab))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div>
      {/* ── Mobile: iOS screen. Invoices are billed from the schedule, so the
          header carries the outstanding total instead of a create action. ── */}
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="cp-ios-title">
              Invoices<span className="text-[var(--cp-brand)]">.</span>
            </h1>
            <p className="cp-mono mt-1">{all.length} total</p>
          </div>
          {outstanding > 0 && (
            <div className="shrink-0 text-right">
              <p className="cp-mono">Outstanding</p>
              <p className="text-[18px] font-semibold tabular-nums text-[var(--cp-warn)]">
                {fmtMoney(outstanding)}
              </p>
            </div>
          )}
        </div>

        <div className="cp-scroll mt-4 -mx-1 overflow-x-auto px-1">
          <div className="cp-seg cp-seg-ios w-max">
            {TABS.map((key) => (
              <Link
                key={key}
                href={`/CanesPressure/invoices?status=${key}`}
                className="cp-seg-btn"
                data-active={key === tab}
              >
                {TAB_LABEL[key]}
                <span className="tabular-nums">{counts[key]}</span>
              </Link>
            ))}
          </div>
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

      {/* ── Desktop (md+): unchanged, frozen. ── */}
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
        {outstanding > 0 && (
          <div className="cp-card px-4 py-2.5 text-right">
            <p className="cp-mono">Outstanding</p>
            <p className="tabular-nums text-[18px] font-semibold text-[var(--cp-warn)]">
              {fmtMoney(outstanding)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-1">
        {TABS.map((key) => {
          const active = key === tab;
          return (
            <Link
              key={key}
              href={`/CanesPressure/invoices?status=${key}`}
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
