import Link from "next/link";
import { getOverview } from "@/lib/canes/data";
import { accessAllows, getConsoleAccess } from "@/lib/canes/access";
import { fmtEt, fmtMoney, type CrewPermissionKey } from "@urso/types";

export const dynamic = "force-dynamic";
const destinations: {
  label: string;
  href: string;
  description: string;
  permission?: CrewPermissionKey;
  ownerOnly?: boolean;
}[] = [
  {
    label: "Money",
    href: "/money",
    description: "Services, marketing, workers and payments",
    ownerOnly: true,
  },
  {
    label: "Recurring",
    href: "/recurring",
    description: "Scheduled repeat work",
    permission: "estimates",
  },
  {
    label: "Expenses",
    href: "/expenses",
    description: "Business expenses and employee payments",
    ownerOnly: true,
  },
  {
    label: "Leads",
    href: "/leads",
    description: "New enquiries and follow-ups",
    permission: "leads",
  },
  {
    label: "Estimates",
    href: "/estimates",
    description: "Quotes, revisions, and signatures",
    permission: "estimates",
  },
  {
    label: "Invoices",
    href: "/invoices",
    description: "Bills, deposits, and remaining balances",
    permission: "invoices",
  },
  {
    label: "Schedule",
    href: "/schedule",
    description: "Jobs and quote visits",
    permission: "schedule",
  },
  {
    label: "Work orders",
    href: "/jobs",
    description: "All work, newest first",
    permission: "schedule",
  },
  {
    label: "Customers",
    href: "/customers",
    description: "Contact details and work history",
    permission: "customers",
  },
  {
    label: "Settings",
    href: "/settings",
    description: "Business settings",
    ownerOnly: true,
  },
];

export default async function CanesHome() {
  const [overview, access] = await Promise.all([
    getOverview(),
    getConsoleAccess(),
  ]);
  const demo = access.kind === "none";
  const visible = destinations.filter(
    (item) =>
      demo ||
      (item.ownerOnly
        ? access.kind === "owner"
        : item.permission
          ? accessAllows(access, item.permission)
          : true),
  );
  const canSchedule = demo || accessAllows(access, "schedule");
  const canLead = demo || accessAllows(access, "leads");
  const canInvoice = demo || accessAllows(access, "invoices");
  return (
    <div className="space-y-6">
      <header>
        <p className="cp-mono">Canes Pressure Washing</p>
        <h1 className="cp-display mt-2 text-3xl">Home</h1>
        <p className="mt-1 text-sm text-[var(--cp-muted)]">
          Today’s work and what needs attention.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {canSchedule ? (
          <section className="cp-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Today’s work</h2>
              <Link className="cp-btn min-h-11" href="/CanesPressure/schedule">
                Schedule
              </Link>
            </div>
            {(overview.todayJobs ?? []).length ? (
              overview.todayJobs?.map((job) => (
                <Link
                  key={job.id}
                  href={`/CanesPressure/jobs/${job.id}`}
                  className="flex min-h-16 items-center justify-between gap-4 border-t border-[var(--cp-line)] py-3"
                >
                  <span>
                    <strong className="block text-sm">
                      {job.customer_name ?? "Customer"}
                    </strong>
                    <span className="text-sm text-[var(--cp-muted)]">
                      {job.job_name ?? "Service"}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {job.scheduled_at
                      ? fmtEt(job.scheduled_at, {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Unscheduled"}
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-4 text-sm text-[var(--cp-muted)]">
                No work scheduled today.
              </p>
            )}
          </section>
        ) : null}
        <section className="cp-card p-4">
          <h2 className="mb-2 font-semibold">Needs attention</h2>
          {[
            ...(canLead
              ? [
                  {
                    label: "New leads",
                    count: overview.pipeline.leads.newCount,
                    href: "/leads",
                  },
                ]
              : []),
            ...(canSchedule
              ? [
                  {
                    label: "Work to schedule",
                    count: overview.pipeline.jobs.unscheduledCount,
                    href: "/jobs",
                  },
                ]
              : []),
            ...(canInvoice
              ? [
                  {
                    label: "Overdue invoices",
                    count: overview.pipeline.invoices.overdueCount,
                    href: "/invoices",
                  },
                ]
              : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={`/CanesPressure${item.href}`}
              className="flex min-h-12 items-center justify-between border-t border-[var(--cp-line)] text-sm"
            >
              <span>{item.label}</span>
              <strong className="tabular-nums">{item.count}</strong>
            </Link>
          ))}
        </section>
      </div>
      {demo || access.kind === "owner" ? (
        <Link
          href="/CanesPressure/money"
          className="cp-card flex items-center justify-between gap-4 p-4"
        >
          <span className="text-sm text-[var(--cp-muted)]">
            Collected in the last 7 days
          </span>
          <strong className="text-xl tabular-nums">
            {fmtMoney(overview.money.collectedThisWeekCents)}
          </strong>
        </Link>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {visible.map((item) => (
          <Link
            key={item.href}
            href={`/CanesPressure${item.href}`}
            className="cp-card p-4 transition-colors hover:border-[var(--cp-brand)]"
          >
            <h2 className="font-semibold">{item.label}</h2>
            <p className="mt-1 text-sm text-[var(--cp-muted)]">
              {item.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
