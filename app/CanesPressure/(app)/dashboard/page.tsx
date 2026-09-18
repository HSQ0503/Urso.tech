import { requireOwnerPage } from "@/lib/canes/access";
import { getRevenueSummary } from "@/lib/canes/revenue";
import { fmtMoney } from "@urso/types";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  await requireOwnerPage();
  const revenue = await getRevenueSummary();
  const max = Math.max(
    1,
    ...revenue.recurring.months.map((month) => Math.abs(month.recurringCents)),
  );
  return (
    <div className="space-y-6">
      <h1 className="cp-display text-3xl">Revenue</h1>
      <p className="text-sm">
        Money collected, less refunds. All reporting periods use Eastern time.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {revenue.windows.map((window) => (
          <section key={window.key} className="cp-card p-5">
            <h2 className="cp-mono">{window.label}</h2>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {fmtMoney(window.collectedCents)}
            </p>
          </section>
        ))}
      </div>
      <section className="cp-card space-y-4 p-5">
        <h2 className="text-xl font-semibold">Recurring revenue</h2>
        <div className="flex flex-wrap gap-8">
          <p>
            Annual recurring value
            <strong className="block text-2xl">
              {fmtMoney(revenue.recurring.arrCents)}
            </strong>
          </p>
          <p>
            Monthly recurring value
            <strong className="block text-2xl">
              {fmtMoney(revenue.recurring.mrrCents)}
            </strong>
          </p>
          <p>
            Active plans
            <strong className="block text-2xl">
              {revenue.recurring.activePlans}
            </strong>
          </p>
        </div>
        <p className="text-sm">
          Recurring plan value is separate from the collections below.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          {revenue.recurring.months.map((month) => (
            <div key={month.key} className="flex flex-col justify-end gap-2">
              <span className="text-xs tabular-nums">
                {fmtMoney(month.recurringCents)}
              </span>
              <div
                aria-hidden
                style={{
                  height: Math.max(
                    2,
                    (Math.abs(month.recurringCents) / max) * 120,
                  ),
                  background:
                    month.recurringCents < 0
                      ? "var(--cp-danger)"
                      : "var(--cp-brand)",
                }}
              />
              <span className="text-xs">{month.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
