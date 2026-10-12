import Link from "next/link";
import { requireOwnerPage } from "@/lib/canes/access";
import { getMoneyReport, parseMoneyPeriod } from "@/lib/canes/money";
import { fmtEt, fmtMoney, type MoneyTab } from "@urso/types";
import { MoneyForms } from "../../components/money-forms";

export const dynamic = "force-dynamic";
const tabs: MoneyTab[] = [
  "services",
  "marketing",
  "workers",
  "expenses",
  "payments",
];
function Bar({
  label,
  cents,
  max,
  detail,
}: {
  label: string;
  cents: number;
  max: number;
  detail?: string;
}) {
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <strong>{label}</strong>
        <span className="tabular-nums">{fmtMoney(cents)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded bg-[var(--cp-hover)]"
        aria-hidden="true"
      >
        <div
          className="h-full rounded bg-[var(--cp-brand)]"
          style={{
            width: `${Math.min(100, (Math.max(0, cents) / Math.max(1, max)) * 100)}%`,
          }}
        />
      </div>
      {detail ? (
        <p className="text-xs leading-5 text-[var(--cp-muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string }>;
}) {
  await requireOwnerPage();
  const params = await searchParams,
    period = parseMoneyPeriod(params.period);
  const tab = tabs.includes(params.tab as MoneyTab)
    ? (params.tab as MoneyTab)
    : "services";
  const report = await getMoneyReport(period);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-3xl">Money</h1>
          <p className="mt-1 text-sm text-[var(--cp-muted)]">
            {report.label} · Eastern time
          </p>
        </div>
        <a
          className="cp-btn min-h-11"
          href={`/api/v1/canes/money/export?period=${period}&tab=${tab}`}
        >
          Export CSV
        </a>
      </header>
      <nav className="flex gap-2" aria-label="Reporting period">
        {["week", "month", "year"].map((value) => (
          <Link
            key={value}
            href={`?period=${value}&tab=${tab}`}
            className={`cp-btn min-h-11 ${period === value ? "cp-btn-primary" : ""}`}
          >
            This {value}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Cash collected", report.cash.collectedCents],
          ["Cash spent", report.cash.spentCents],
          ["Net cash", report.cash.netCents],
        ].map(([label, cents]) => (
          <div key={label} className="cp-card p-4">
            <p className="text-sm text-[var(--cp-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {fmtMoney(Number(cents))}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--cp-muted)]">
        Cash follows payment dates, net of refunds. Worker payments count once
        as spending.{" "}
        {report.cash.undatedJobCostCents > 0
          ? `${fmtMoney(report.cash.undatedJobCostCents)} of job costs need a paid date and are excluded from cash spent.`
          : ""}
      </p>
      <nav
        className="flex flex-wrap gap-2 border-b border-[var(--cp-line)] pb-3"
        aria-label="Money views"
      >
        {tabs.map((value) => (
          <Link
            key={value}
            href={`?period=${period}&tab=${value}`}
            aria-current={tab === value ? "page" : undefined}
            className={`cp-btn min-h-11 capitalize ${tab === value ? "cp-btn-primary" : ""}`}
          >
            {value}
          </Link>
        ))}
      </nav>
      {tab === "services" ? (
        <section className="cp-card p-4">
          <h2 className="font-semibold">Collections by service</h2>
          <p className="mt-1 text-sm text-[var(--cp-muted)]">
            Collections exclude tax. Profitability uses the value and costs of
            work completed in this period; unpaid work can be included. Costs
            include approved labor, not a second deduction for paying it.
            Missing costs are not estimates of zero cost.
          </p>
          {report.undatedCompletedJobs ? (
            <p className="mt-2 text-sm text-[var(--cp-warn)]">
              {report.undatedCompletedJobs} completed work orders need their
              actual completion date before they appear in period profitability.
            </p>
          ) : null}
          {report.services.map((service) => (
            <Bar
              key={service.key}
              label={service.name}
              cents={service.collectedCents}
              max={Math.max(
                ...report.services.map((row) => row.collectedCents),
              )}
              detail={`Completed work value ${fmtMoney(service.revenueCents)} · recorded costs ${fmtMoney(service.costCents)} (${fmtMoney(service.allocatedCostCents)} allocated) · margin after recorded costs ${fmtMoney(service.profitCents)}`}
            />
          ))}
          {!report.services.length ? (
            <p className="py-4 text-sm text-[var(--cp-muted)]">
              No service activity in this period.
            </p>
          ) : null}
        </section>
      ) : null}
      {tab === "marketing" ? (
        <section className="cp-card p-4">
          <h2 className="font-semibold">Marketing return</h2>
          <p className="mt-1 text-sm text-[var(--cp-muted)]">
            Period ROAS = attributed collections, after refunds and excluding
            tax, divided by paid marketing spend in this period. Booked work is
            separate. This is not an acquisition-cohort return.
          </p>
          {report.marketing.map((channel) => (
            <Bar
              key={channel.id}
              label={channel.name}
              cents={channel.collectedCents}
              max={Math.max(
                ...report.marketing.map((row) => row.collectedCents),
              )}
              detail={`Spend ${fmtMoney(channel.spendCents)} · ROAS ${channel.roas === null ? "N/A" : `${channel.roas.toFixed(2)}×`} · booked ${fmtMoney(channel.bookedCents)}`}
            />
          ))}
        </section>
      ) : null}
      {tab === "workers" ? (
        <section className="space-y-3">
          <p className="text-sm text-[var(--cp-muted)]">
            Approved time and collected upsells create earnings. Recording a
            payment is bookkeeping; it does not transfer money.
          </p>
          {report.workers.map((worker) => (
            <div key={worker.id} className="cp-card p-4">
              <h2 className="font-semibold">{worker.name}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <span>
                  Earned this period
                  <br />
                  <strong className="tabular-nums">
                    {fmtMoney(worker.periodEarnedCents)}
                  </strong>
                </span>
                <span>
                  Outstanding, all time
                  <br />
                  <strong className="tabular-nums">
                    {fmtMoney(worker.unpaidCents)}
                  </strong>
                </span>
                <span>
                  Approved hours this period
                  <br />
                  <strong>{worker.hours.toFixed(2)}</strong>
                </span>
                <span>
                  Recorded payments, all time
                  <br />
                  <strong>{fmtMoney(worker.recordedPaidCents)}</strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--cp-muted)]">
                {worker.rate
                  ? `${fmtMoney(worker.rate.hourly_cents)}/hour · ${worker.rate.commission_bps / 100}% upsell commission`
                  : "Set an effective rate before approving hours."}{" "}
                {worker.unallocatedPaidCents
                  ? `${fmtMoney(worker.unallocatedPaidCents)} in historical or unallocated payments is retained separately.`
                  : ""}
              </p>
            </div>
          ))}
          <Link className="cp-btn min-h-11" href="/CanesPressure/expenses">
            Record worker payment / payment history
          </Link>
          <details className="cp-card p-4">
            <summary className="cursor-pointer font-semibold">
              Earnings history
            </summary>
            {report.earnings.map((earning) => (
              <div
                key={earning.id}
                className="mt-3 border-t border-[var(--cp-line)] pt-3 text-sm"
              >
                <strong>
                  {
                    report.workers.find(
                      (worker) => worker.id === earning.employee_id,
                    )?.name
                  }{" "}
                  · {fmtMoney(earning.amount_cents)}
                </strong>
                <p className="text-[var(--cp-muted)]">
                  {earning.earned_on} · {earning.kind} · {earning.reason}
                </p>
              </div>
            ))}
          </details>
        </section>
      ) : null}
      {tab === "expenses" ? (
        <section className="cp-card p-4">
          <h2 className="font-semibold">Paid spending by category</h2>
          {report.expenses.map((expense) => (
            <Bar
              key={expense.category}
              label={expense.category}
              cents={expense.cents}
              max={Math.max(...report.expenses.map((row) => row.cents))}
            />
          ))}
          {!report.expenses.length ? (
            <p className="py-4 text-sm text-[var(--cp-muted)]">
              No dated spending in this period.
            </p>
          ) : null}
          <Link className="cp-btn mt-3 min-h-11" href="/CanesPressure/expenses">
            Manage expenses and receipts
          </Link>
        </section>
      ) : null}
      {tab === "payments" ? (
        <section className="cp-card divide-y divide-[var(--cp-line)] px-4">
          {report.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <strong className="capitalize">{payment.method}</strong>
                <p className="text-[var(--cp-muted)]">
                  {fmtEt(payment.at)} · {payment.provider}
                  {payment.cents < 0 ? " · Refund" : ""}
                </p>
              </div>
              <span className="tabular-nums">{fmtMoney(payment.cents)}</span>
            </div>
          ))}
          {!report.payments.length ? (
            <p className="py-4 text-sm text-[var(--cp-muted)]">
              No payment movements in this period.
            </p>
          ) : null}
        </section>
      ) : null}
      <MoneyForms report={report} tab={tab} />
      <Link href="/CanesPressure/money/import" className="cp-btn min-h-11">
        Import historical ledger
      </Link>
    </div>
  );
}
