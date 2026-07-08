import Link from "next/link";
import { FileText, Receipt, Users, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Overview } from "@/lib/canes/data";
import { fmtMoney } from "@/lib/canes/types";

// The whole pipeline in one segmented card (Jobber's home pattern) — the only
// place toplines survive in v3. Each column is one link into its work surface.

type Drill = { text: string; tone?: "danger" };

type Column = {
  label: string;
  icon: LucideIcon;
  topline: string;
  href: string;
  count: number;
  figure: string | null;
  action: string;
  drills: Drill[];
};

export function WorkflowStrip({
  pipeline,
  counts,
}: {
  pipeline: Overview["pipeline"];
  counts: Overview["counts"];
}) {
  const { leads, quotes, jobs, invoices } = pipeline;
  const columns: Column[] = [
    {
      label: "Leads",
      icon: Users,
      topline: "cp-topline-slate",
      href: "/CanesPressure/leads?f=open",
      count: counts.open,
      figure: null,
      action: `${leads.newCount} new`,
      drills: [{ text: `${leads.hotCount} hot` }],
    },
    {
      label: "Quotes",
      icon: FileText,
      topline: "cp-topline-brand",
      href: "/CanesPressure/estimates",
      count: quotes.awaitingCount,
      figure: fmtMoney(quotes.awaitingCents),
      action: `${quotes.awaitingCount} awaiting approval`,
      drills: [{ text: `${quotes.declinedRecentCount} declined recently` }],
    },
    {
      label: "Jobs",
      icon: Wrench,
      topline: "cp-topline-cold",
      href: "/CanesPressure/schedule",
      count: jobs.unscheduledCount + jobs.activeCount,
      figure: fmtMoney(jobs.unscheduledCents),
      action: `${jobs.unscheduledCount} to schedule`,
      drills: [{ text: `${jobs.activeCount} active` }],
    },
    {
      label: "Invoices",
      icon: Receipt,
      topline: "cp-topline-good",
      href: "/CanesPressure/invoices?status=unpaid",
      count: invoices.outstandingCount,
      figure: null,
      action: `${fmtMoney(invoices.outstandingCents)} outstanding`,
      drills: [
        {
          text: `${invoices.overdueCount} overdue`,
          tone: invoices.overdueCount > 0 ? "danger" : undefined,
        },
      ],
    },
  ];

  return (
    <section className="cp-card overflow-hidden">
      <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4">
        {columns.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border-b border-r border-[var(--cp-line)] transition-colors hover:bg-[var(--cp-hover)]"
          >
            <span className={`cp-topline ${c.topline}`} />
            <div className="px-4 pb-3.5 pt-3">
              <p className="cp-mono flex items-center gap-1.5">
                <c.icon size={13} strokeWidth={2} />
                {c.label}
              </p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[24px] font-bold leading-tight tabular-nums">{c.count}</span>
                {c.figure && (
                  <span className="text-[12.5px] font-medium tabular-nums text-[var(--cp-muted)]">
                    {c.figure}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums">{c.action}</p>
              {c.drills.map((d) => (
                <p
                  key={d.text}
                  className={`mt-0.5 text-[12.5px] tabular-nums ${
                    d.tone === "danger"
                      ? "font-medium text-[var(--cp-danger)]"
                      : "text-[var(--cp-muted)]"
                  }`}
                >
                  {d.text}
                </p>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
