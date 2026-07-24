import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireOwnerPage } from "@/lib/canes/access";
import { listBusinessExpenses, monthlyEquivalentCents } from "@/lib/canes/overhead";
import { listJobExpensesInRange } from "@/lib/canes/expenses";
import { listJobs } from "@/lib/canes/estimates";
import { fmtEt, fmtMoney, type Job, type JobExpense } from "@/lib/canes/types";
import { OverheadManager } from "@/app/CanesPressure/components/expenses/overhead-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses" };

// Expenses (Phase 5) — one place for Sebastian's money going OUT. The headline
// is his own overhead (subscriptions, insurance, truck, marketing) normalized to
// a true monthly number; below it, a read-only roll-up of the per-job costs his
// crews log on the job sheet. Server-rendered in the .cp-* system; the overhead
// list + add form is one client island (OverheadManager) that re-reads on write.

const JOB_WINDOW_DAYS = 60;

// A per-job cost group for the read-only roll-up.
type JobCostGroup = { jobId: string; name: string; totalCents: number; lines: JobExpense[] };

function jobLabel(job: Job | undefined): string {
  return job?.customer_name ?? job?.job_name ?? "Job";
}

function groupByJob(expenses: JobExpense[], jobs: Job[]): JobCostGroup[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const groups = new Map<string, JobCostGroup>();
  for (const e of expenses) {
    const g: JobCostGroup =
      groups.get(e.job_id) ??
      { jobId: e.job_id, name: jobLabel(byId.get(e.job_id)), totalCents: 0, lines: [] };
    g.totalCents += e.amount_cents;
    g.lines.push(e);
    groups.set(e.job_id, g);
  }
  const list = [...groups.values()].sort((a, b) => b.totalCents - a.totalCents);
  for (const g of list) g.lines.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return list;
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="cp-label">{label}</p>
      <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">{title}</h2>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border-b border-r border-[var(--cp-line)] px-4 pb-3.5 pt-3.5">
      <p className="cp-mono whitespace-nowrap">{label}</p>
      <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">{sub}</p>
    </div>
  );
}

export default async function ExpensesPage() {
  await requireOwnerPage();
  const now = new Date();
  const endIso = now.toISOString();
  const startIso = new Date(now.getTime() - JOB_WINDOW_DAYS * 86_400_000).toISOString();

  const [businessExpenses, jobExpenses, jobs] = await Promise.all([
    listBusinessExpenses(),
    listJobExpensesInRange(startIso, endIso),
    listJobs(),
  ]);

  const monthlyOverheadCents = businessExpenses.reduce((sum, e) => sum + monthlyEquivalentCents(e), 0);
  const recurringCount = businessExpenses.filter((e) => e.recurring).length;

  const jobGroups = groupByJob(jobExpenses, jobs);
  const totalJobCents = jobExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const windowLabel = "last 60 days";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="cp-display text-[28px] leading-[1.08] md:text-[24px] md:leading-tight">
          Expenses<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          What the business costs to run — overhead you carry, plus what each job spends.
        </p>
      </header>

      {/* Headline: true monthly overhead */}
      <section className="cp-card overflow-hidden rounded-xl md:rounded-md">
        <div className="-mb-px -mr-px grid grid-cols-2">
          <StatTile
            label="Monthly overhead"
            value={fmtMoney(monthlyOverheadCents)}
            sub="recurring costs, normalized to /mo"
          />
          <StatTile
            label="Active subscriptions"
            value={String(recurringCount)}
            sub={recurringCount === 1 ? "recurring cost" : "recurring costs"}
          />
        </div>
      </section>

      {/* Section 1 — my expenses (overhead) */}
      <section className="flex flex-col gap-4">
        <SectionHead label="My expenses" title="Overhead & subscriptions" />
        <OverheadManager expenses={businessExpenses} />
      </section>

      {/* Section 2 — job costs (read-only roll-up) */}
      <section className="flex flex-col gap-4">
        <SectionHead label="Job costs" title={`Logged on jobs, ${windowLabel}`} />

        <div className="cp-card overflow-hidden rounded-xl md:rounded-md">
          {jobGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <Receipt size={20} strokeWidth={2} className="text-[var(--cp-faint)]" />
              <p className="text-[14px] font-semibold">No job costs in the {windowLabel}</p>
              <p className="text-[13px] text-[var(--cp-muted)]">
                Add job costs from the job&rsquo;s billing panel.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--cp-line)]">
                {jobGroups.map((g) => (
                  <div key={g.jobId} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/CanesPressure/schedule?job=${g.jobId}`}
                        className="truncate text-[14px] font-semibold hover:text-[var(--cp-brand-deep)] hover:underline"
                      >
                        {g.name}
                      </Link>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                        {fmtMoney(g.totalCents)}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {g.lines.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-baseline justify-between gap-3 text-[12.5px] text-[var(--cp-muted)]"
                        >
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate">{l.category}</span>
                            {l.note && <span className="truncate text-[var(--cp-faint)]">{l.note}</span>}
                          </span>
                          <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                            <span className="text-[var(--cp-faint)]">
                              {fmtEt(l.created_at, { month: "short", day: "numeric" })}
                            </span>
                            <span className="font-medium text-[var(--cp-ink)]">{fmtMoney(l.amount_cents)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--cp-line)] bg-[var(--cp-bg)] px-4 py-3">
                <span className="text-[13px] font-medium text-[var(--cp-muted)]">
                  Total job costs, {windowLabel}
                </span>
                <span className="text-[15px] font-bold tabular-nums">{fmtMoney(totalJobCents)}</span>
              </div>
            </>
          )}
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--cp-faint)]">
          These are logged on each job from its billing panel, so this view is read-only. Open a job to
          add or remove its costs.
        </p>
      </section>
    </div>
  );
}
