import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Mail, MessageSquare, Phone } from "lucide-react";
import { getCustomer } from "@/lib/canes/customers";
import { listCrews } from "@/lib/canes/estimates";
import {
  ESTIMATE_STATUS_CLASS,
  ESTIMATE_STATUS_LABEL,
  ET,
  fmtEt,
  fmtMoney,
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  invoiceBalanceCents,
  JOB_STATUS_LABEL,
  SOURCE_LABEL,
  type CustomerDetail,
  type Invoice,
  type Job,
  type JobStatus,
} from "@/lib/canes/types";
import { CustomerAvatar } from "@/app/CanesPressure/components/customers/avatar";
import {
  ContactInfoCard,
  EditContactButton,
  EditContactQuick,
} from "@/app/CanesPressure/components/customers/contact-info-card";
import { CreateWork } from "@/app/CanesPressure/components/customers/create-work";
import { DeleteCustomerCard } from "@/app/CanesPressure/components/customers/delete-customer";
import { NotesCard } from "@/app/CanesPressure/components/customers/notes-card";
import { PropertiesCard } from "@/app/CanesPressure/components/customers/properties-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

const TABS = ["jobs", "estimates", "invoices"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  jobs: "Jobs",
  estimates: "Estimates",
  invoices: "Invoices",
};

const EMPTY_COPY: Record<Tab, string> = {
  jobs: "No jobs yet. Book one from Create new.",
  estimates: "No estimates yet. Start one from Create new.",
  invoices: "No invoices yet. They appear when jobs are billed.",
};

// Job statuses reuse the shared chip tones (no dedicated class map exists).
const JOB_CHIP: Record<JobStatus, string> = {
  unscheduled: "bg-[var(--cp-bg)] text-[var(--cp-muted)]",
  scheduled: "bg-[var(--cp-cold-bg)] text-[var(--cp-cold)]",
  confirmed: "bg-[var(--cp-good-bg)] text-[var(--cp-good)]",
  in_progress: "bg-[var(--cp-warn-bg)] text-[var(--cp-warn)]",
  completed: "bg-[var(--cp-good-bg)] text-[var(--cp-good)]",
  invoiced: "bg-[var(--cp-cold-bg)] text-[var(--cp-cold)]",
  paid: "bg-[var(--cp-good)] text-white",
  canceled: "bg-[var(--cp-bg)] text-[var(--cp-faint)]",
};

// The schedule board pages by ET calendar date — link a job to its day.
function etYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Where a job row should take the owner. Live jobs deep-link into the schedule
// (the board only paints non-terminal jobs); billed jobs go to their invoice;
// completed-but-unbilled and canceled jobs have no destination, so no link.
function jobHref(job: Job, invoices: Invoice[]): string | null {
  switch (job.status) {
    case "unscheduled":
      return "/CanesPressure/schedule";
    case "scheduled":
    case "confirmed":
    case "in_progress":
      return job.scheduled_at
        ? `/CanesPressure/schedule?job=${job.id}&start=${etYmd(job.scheduled_at)}`
        : "/CanesPressure/schedule";
    case "invoiced":
    case "paid": {
      const invoice = invoices.find((i) => i.job_id === job.id && i.status !== "void");
      return invoice ? `/CanesPressure/invoices/${invoice.id}` : null;
    }
    default:
      // completed (not billed yet) / canceled — nowhere useful to land.
      return null;
  }
}

// Desktop history row — frozen (only rendered inside WorkHistory's desktop tree).
function HistoryRow({
  href,
  title,
  chip,
  chipClass,
  sub,
  amount,
  amountSub,
}: {
  href: string | null;
  title: string;
  chip: string;
  chipClass: string;
  sub: string;
  amount: string;
  amountSub?: string;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[14px] font-semibold">{title}</p>
          <span className={`cp-chip ${chipClass}`}>{chip}</span>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-[var(--cp-muted)]">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold tabular-nums">{amount}</p>
        {amountSub && (
          <p className="mt-0.5 text-[12px] tabular-nums text-[var(--cp-warn)]">{amountSub}</p>
        )}
      </div>
    </div>
  );
  if (!href) return <div className="px-4 py-3">{body}</div>;
  return (
    <Link href={href} className="block px-4 py-3 transition-colors hover:bg-[var(--cp-hover)]">
      {body}
    </Link>
  );
}

// Mobile iOS history row — inside a cp-list, ends in a chevron when linked.
function HistoryListRow({
  href,
  title,
  chip,
  chipClass,
  sub,
  amount,
  amountSub,
}: {
  href: string | null;
  title: string;
  chip: string;
  chipClass: string;
  sub: string;
  amount: string;
  amountSub?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="cp-list-title truncate">{title}</span>
          <span className={`cp-chip shrink-0 ${chipClass}`}>{chip}</span>
        </div>
        <p className="cp-list-sub truncate tabular-nums">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold tabular-nums">{amount}</p>
        {amountSub && (
          <p className="mt-0.5 text-[12px] tabular-nums text-[var(--cp-warn)]">{amountSub}</p>
        )}
      </div>
      {href && <ChevronRight className="cp-list-chev" size={18} strokeWidth={2} />}
    </>
  );
  if (!href) return <div className="cp-list-row">{inner}</div>;
  return (
    <Link href={href} className="cp-list-row">
      {inner}
    </Link>
  );
}

// A rendered history entry, breakpoint-agnostic (the row components branch).
type HistoryEntry = {
  key: string;
  href: string | null;
  title: string;
  chip: string;
  chipClass: string;
  sub: string;
  amount: string;
  amountSub?: string;
};

function historyEntries(detail: CustomerDetail, tab: Tab): HistoryEntry[] {
  if (tab === "jobs") {
    return detail.jobs.map((job) => ({
      key: job.id,
      href: jobHref(job, detail.invoices),
      title: job.job_name ?? "Job",
      chip: JOB_STATUS_LABEL[job.status],
      chipClass: JOB_CHIP[job.status],
      sub: job.scheduled_at
        ? `${fmtEt(job.scheduled_at)}${job.job_address ? ` · ${job.job_address}` : ""}`
        : job.job_address ?? "Not scheduled yet",
      amount: fmtMoney(job.total_cents),
    }));
  }
  if (tab === "estimates") {
    return detail.estimates.map((estimate) => ({
      key: estimate.id,
      href: `/CanesPressure/estimates/${estimate.id}`,
      title: estimate.number,
      chip: ESTIMATE_STATUS_LABEL[estimate.status],
      chipClass: ESTIMATE_STATUS_CLASS[estimate.status],
      sub: `${fmtEt(estimate.created_at, { month: "short", day: "numeric", year: "numeric" })}${estimate.job_name ? ` · ${estimate.job_name}` : ""}`,
      amount: fmtMoney(estimate.total_cents),
    }));
  }
  return detail.invoices.map((invoice) => {
    const balance = invoiceBalanceCents(invoice);
    return {
      key: invoice.id,
      href: `/CanesPressure/invoices/${invoice.id}`,
      title: invoice.number,
      chip: INVOICE_STATUS_LABEL[invoice.status],
      chipClass: INVOICE_STATUS_CLASS[invoice.status],
      sub: `${fmtEt(invoice.created_at, { month: "short", day: "numeric", year: "numeric" })}${invoice.job_name ? ` · ${invoice.job_name}` : ""}`,
      amount: fmtMoney(invoice.total_cents),
      amountSub:
        balance > 0 && (invoice.status === "sent" || invoice.status === "viewed")
          ? `${fmtMoney(balance)} due`
          : undefined,
    };
  });
}

// Desktop Work-history card — frozen.
function WorkHistory({ detail, tab, id }: { detail: CustomerDetail; tab: Tab; id: string }) {
  const counts: Record<Tab, number> = {
    jobs: detail.jobs.length,
    estimates: detail.estimates.length,
    invoices: detail.invoices.length,
  };
  const entries = historyEntries(detail, tab);

  return (
    <div className="cp-card overflow-hidden">
      <div className="border-b border-[var(--cp-line)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">Work history</h2>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {TABS.map((key) => {
            const active = key === tab;
            return (
              <Link
                key={key}
                href={`/CanesPressure/customers/${id}?tab=${key}`}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-[var(--cp-line-strong)] bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_1px_2px_rgba(12,43,63,0.06)]"
                    : "border-transparent text-[var(--cp-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-ink)]"
                }`}
              >
                {TAB_LABEL[key]}
                <span className="cp-mono tabular-nums">{counts[key]}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {counts[tab] === 0 ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-[var(--cp-muted)]">{EMPTY_COPY[tab]}</p>
      ) : (
        <div className="divide-y divide-[var(--cp-line)]">
          {entries.map((e) => (
            <HistoryRow
              key={e.key}
              href={e.href}
              title={e.title}
              chip={e.chip}
              chipClass={e.chipClass}
              sub={e.sub}
              amount={e.amount}
              amountSub={e.amountSub}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Mobile WORK section — cp-seg-ios tabs (as links, page stays server-rendered)
// then a cp-list of history rows.
function WorkHistoryMobile({ detail, tab, id }: { detail: CustomerDetail; tab: Tab; id: string }) {
  const counts: Record<Tab, number> = {
    jobs: detail.jobs.length,
    estimates: detail.estimates.length,
    invoices: detail.invoices.length,
  };
  const entries = historyEntries(detail, tab);

  return (
    <div>
      <p className="cp-list-header">Work</p>
      <div className="cp-seg cp-seg-ios flex w-full">
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/CanesPressure/customers/${id}?tab=${key}`}
            scroll={false}
            className="cp-seg-btn flex-1"
            data-active={key === tab}
          >
            {TAB_LABEL[key]}
            <span className="cp-mono tabular-nums">{counts[key]}</span>
          </Link>
        ))}
      </div>
      <div className="mt-2.5">
        {counts[tab] === 0 ? (
          <div className="cp-list">
            <p className="px-4 py-6 text-center text-[13.5px] text-[var(--cp-muted)]">
              {EMPTY_COPY[tab]}
            </p>
          </div>
        ) : (
          <div className="cp-list">
            {entries.map((e) => (
              <HistoryListRow
                key={e.key}
                href={e.href}
                title={e.title}
                chip={e.chip}
                chipClass={e.chipClass}
                sub={e.sub}
                amount={e.amount}
                amountSub={e.amountSub}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "jobs";

  const [detail, crews] = await Promise.all([getCustomer(id), listCrews(true)]);
  if (!detail) notFound();
  const { contact, addresses } = detail;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────
          The shared cards below render once (each is internally responsive);
          only the header + quick actions differ enough to warrant a dual tree.
          Mobile = Telegram contact card; desktop (md+) = frozen inline header. */}

      {/* Mobile back row + centered contact header */}
      <div className="md:hidden">
        <Link
          href="/CanesPressure/customers"
          className="mb-1 inline-flex items-center gap-1 text-[13px] text-[var(--cp-muted)]"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Customers
        </Link>

        <div className="flex flex-col items-center pt-2 text-center">
          <CustomerAvatar name={contact.name} className="h-14 w-14 text-[20px]" />
          <h1 className="cp-display mt-3 text-[24px] leading-tight">
            {contact.name ?? "No name"}
            <span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">
              {SOURCE_LABEL[contact.source]}
            </span>
            {contact.archived && (
              <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-faint)]">Archived</span>
            )}
          </div>
        </div>

        <div className="cp-quick-row mt-4">
          <a
            href={contact.phone ? `tel:${contact.phone}` : undefined}
            aria-disabled={!contact.phone}
            className={`cp-quick ${contact.phone ? "" : "pointer-events-none opacity-40"}`}
          >
            <Phone size={18} strokeWidth={2} />
            Call
          </a>
          {contact.phone ? (
            <Link
              href={`/CanesPressure/inbox?thread=${encodeURIComponent(contact.phone)}`}
              className="cp-quick"
            >
              <MessageSquare size={18} strokeWidth={2} />
              Text
            </Link>
          ) : (
            <span aria-disabled className="cp-quick pointer-events-none opacity-40">
              <MessageSquare size={18} strokeWidth={2} />
              Text
            </span>
          )}
          <a
            href={contact.email ? `mailto:${contact.email}` : undefined}
            aria-disabled={!contact.email}
            className={`cp-quick ${contact.email ? "" : "pointer-events-none opacity-40"}`}
          >
            <Mail size={18} strokeWidth={2} />
            Email
          </a>
          <EditContactQuick />
        </div>
      </div>

      {/* Desktop back row + inline header — frozen */}
      <div className="hidden md:block">
        <Link
          href="/CanesPressure/customers"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
        >
          <ArrowLeft size={15} strokeWidth={2} />
          Customers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CustomerAvatar name={contact.name} />
            <div className="min-w-0">
              <h1 className="cp-display truncate text-[22px] leading-tight">
                {contact.name ?? "No name"}
                <span className="text-[var(--cp-brand)]">.</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">
                  {SOURCE_LABEL[contact.source]}
                </span>
                {contact.archived && (
                  <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-faint)]">Archived</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {contact.phone && (
              <>
                <a href={`tel:${contact.phone}`} className="cp-btn cp-btn-sm">
                  <Phone size={14} strokeWidth={2} />
                  Call
                </a>
                <Link
                  href={`/CanesPressure/inbox?thread=${encodeURIComponent(contact.phone)}`}
                  className="cp-btn cp-btn-sm"
                >
                  <MessageSquare size={14} strokeWidth={2} />
                  Text
                </Link>
              </>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="cp-btn cp-btn-sm">
                <Mail size={14} strokeWidth={2} />
                Email
              </a>
            )}
            <EditContactButton />
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────
          One column below lg (mobile stacks the cards in reading order), the
          frozen two-column grid at lg+. Each card renders once and switches its
          own chrome at md (iOS inset list < md, bordered card ≥ md). Extra top
          margin on mobile only — the header's spacing differs per tree. */}
      <div className="mt-6 grid gap-6 md:mt-5 md:gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6 md:space-y-4">
          <PropertiesCard contactId={contact.id} addresses={addresses} />
          {/* Work: iOS segmented section < md, bordered card ≥ md */}
          <div>
            <div className="md:hidden">
              <WorkHistoryMobile detail={detail} tab={tab} id={id} />
            </div>
            <div className="hidden md:block">
              <WorkHistory detail={detail} tab={tab} id={id} />
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6 md:space-y-4">
          <ContactInfoCard contact={contact} />

          {/* Balance: iOS list < md, bordered card ≥ md */}
          <div>
            <div className="md:hidden">
              <p className="cp-list-header">Balance</p>
              <div className="cp-list">
                <div className="cp-list-row">
                  <span className="cp-list-title flex-1">Lifetime collected</span>
                  <span className="text-[15px] font-semibold tabular-nums">
                    {fmtMoney(detail.payments_total_cents)}
                  </span>
                </div>
                <div className="cp-list-row">
                  <span className="cp-list-title flex-1">Open balance</span>
                  <span
                    className={`text-[15px] font-semibold tabular-nums ${
                      detail.open_balance_cents > 0
                        ? "text-[var(--cp-warn)]"
                        : "text-[var(--cp-muted)]"
                    }`}
                  >
                    {fmtMoney(detail.open_balance_cents)}
                  </span>
                </div>
              </div>
            </div>
            <div className="hidden cp-card p-4 md:block">
              <h2 className="text-[15px] font-semibold">Balance</h2>
              <div className="mt-3 space-y-2.5">
                <div>
                  <p className="cp-mono">Lifetime collected</p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums">
                    {fmtMoney(detail.payments_total_cents)}
                  </p>
                </div>
                <div>
                  <p className="cp-mono">Open balance</p>
                  <p
                    className={`mt-0.5 text-[18px] font-semibold tabular-nums ${
                      detail.open_balance_cents > 0
                        ? "text-[var(--cp-warn)]"
                        : "text-[var(--cp-muted)]"
                    }`}
                  >
                    {fmtMoney(detail.open_balance_cents)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <NotesCard contactId={contact.id} notes={contact.notes} />
          <CreateWork contact={contact} addresses={addresses} crews={crews} />

          {/* Junk / duplicate cleanup — deliberately last on the page. */}
          <DeleteCustomerCard contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}
