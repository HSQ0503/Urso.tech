import { fmtEt, fmtMoney, RECURRENCE_LABEL } from "@/lib/canes/types";
import type { AllTimeProfit, RecurringInsights, ReviewLeaderboard } from "@/lib/canes/growth";

// Growth sections (0015) for the Insights page — all-time net profit, recurring
// revenue, and the review leaderboard. Server-rendered flat HTML in the .cp-*
// system, matching the page's card idioms; no client JS.

function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="cp-label">{label}</p>
      <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">{title}</h2>
    </div>
  );
}

// ── All-time profit strip ────────────────────────────────────────────────────
// Collected − job costs − overhead − labor = net profit, whole-ledger. Same
// segmented-cell layout as the range KPI strip above it.

export function AllTimeProfitStrip({ profit }: { profit: AllTimeProfit }) {
  const cells = [
    { label: "Collected", cents: profit.collectedCents, sub: "all payments received" },
    { label: "− Job costs", cents: profit.jobExpensesCents, sub: "logged per job" },
    { label: "− Overhead", cents: profit.overheadCents, sub: "recurring business costs" },
    { label: "− Labor", cents: profit.laborCents, sub: "hourly crew time" },
  ];
  const net = profit.netProfitCents;
  return (
    <section className="cp-card overflow-hidden rounded-xl md:rounded-md">
      <div className="border-b border-[var(--cp-line)] px-4 pb-3 pt-3.5">
        <SectionTitle label="All time" title="Net profit since day one" />
      </div>
      <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="border-b border-r border-[var(--cp-line)] px-4 pb-3.5 pt-3.5">
            <p className="cp-mono whitespace-nowrap">{c.label}</p>
            <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums">{fmtMoney(c.cents)}</p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">{c.sub}</p>
          </div>
        ))}
        <div className="border-b border-r border-[var(--cp-line)] px-4 pb-3.5 pt-3.5">
          <p className="cp-mono whitespace-nowrap">= Net profit</p>
          <p
            className="mt-1 text-[22px] font-bold leading-tight tabular-nums"
            style={{ color: net >= 0 ? "var(--cp-good)" : "var(--cp-warn)" }}
          >
            {fmtMoney(net)}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">what the business kept</p>
        </div>
      </div>
      {profit.truncated && (
        <p className="border-t border-[var(--cp-line)] px-4 py-2 text-[11.5px] text-[var(--cp-faint)]">
          Payment history exceeded the fetch window — the oldest payments aren&rsquo;t counted here.
        </p>
      )}
    </section>
  );
}

// ── Recurring revenue ────────────────────────────────────────────────────────

const DUE_OPTS = { month: "short", day: "numeric", year: "numeric" } as const;
const PLAN_LIMIT = 8;

export function RecurringRevenueCard({ recurring }: { recurring: RecurringInsights }) {
  const { rows, mrrCents, months } = recurring;
  const max = Math.max(1, ...months.map((m) => m.cents));
  const chartHasMoney = months.some((m) => m.cents > 0);
  const shown = rows.slice(0, PLAN_LIMIT);

  return (
    <div className="cp-card p-4">
      <SectionTitle label="Recurring revenue" title="Repeat plans" />
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[26px] font-bold leading-none tabular-nums">{fmtMoney(mrrCents)}</span>
        <span className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
          est. monthly value of active plans
        </span>
      </div>

      <div className="mt-4">
        {chartHasMoney ? (
          <>
            <div className="flex h-[88px] items-end gap-1">
              {months.map((m) => (
                <div key={m.key} className="flex h-full flex-1 items-end" title={`${m.label} — ${fmtMoney(m.cents)}`}>
                  <div
                    className="w-full rounded-[2px]"
                    style={{
                      height: `${Math.max(2, Math.round((m.cents / max) * 100))}%`,
                      background: m.cents > 0 ? "var(--cp-brand)" : "var(--cp-line-strong)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              {months.map((m, i) => (
                <span key={m.key} className="flex-1 text-center text-[9px] leading-tight text-[var(--cp-faint)]">
                  {i % 2 === 1 ? m.label : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-[var(--cp-faint)]">
              Collected on recurring jobs, by month — last 12 months.
            </p>
          </>
        ) : (
          <p className="py-4 text-center text-[13px] text-[var(--cp-muted)]">
            Nothing collected on recurring jobs yet.
          </p>
        )}
      </div>

      <div className="cp-divider mt-3 pt-3">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--cp-muted)]">
            No active plans yet — set a repeat cadence on a job and it shows up here.
          </p>
        ) : (
          <div className="divide-y divide-[var(--cp-line)]">
            {shown.map((r) => (
              <div key={r.job.id} className="py-2 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {r.job.customer_name ?? r.job.job_name ?? "Unnamed job"}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {fmtMoney(r.job.total_cents)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-[11.5px] text-[var(--cp-faint)]">
                  <span>{RECURRENCE_LABEL[r.recurrence]}</span>
                  <span className={r.overdue ? "font-medium text-[var(--cp-warn)]" : ""}>
                    {r.nextDueIso
                      ? r.overdue
                        ? `Overdue — ${fmtEt(r.nextDueIso, DUE_OPTS)}`
                        : `Next ${fmtEt(r.nextDueIso, DUE_OPTS)}`
                      : "Not scheduled yet"}
                  </span>
                </div>
              </div>
            ))}
            {rows.length > PLAN_LIMIT && (
              <p className="pt-2 text-[11.5px] text-[var(--cp-faint)]">
                + {rows.length - PLAN_LIMIT} more plan{rows.length - PLAN_LIMIT === 1 ? "" : "s"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review leaderboard ───────────────────────────────────────────────────────

export function ReviewLeaderboardCard({ leaderboard }: { leaderboard: ReviewLeaderboard }) {
  const { rows, totalApproved } = leaderboard;
  return (
    <div className="cp-card p-4">
      <SectionTitle label="Reviews" title="Review leaderboard" />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--cp-muted)]">
          No approved review rewards yet — approve them on invoices and credit the worker who earned them.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="cp-mono pb-2 text-left font-normal">Worker</th>
                  <th className="cp-mono pb-2 text-right font-normal">Google</th>
                  <th className="cp-mono pb-2 text-right font-normal">Facebook</th>
                  <th className="cp-mono pb-2 text-right font-normal">Follows</th>
                  <th className="cp-mono pb-2 text-right font-normal">Total</th>
                  <th className="cp-mono pb-2 text-right font-normal">Reward given</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cp-line)]">
                {rows.map((r) => (
                  <tr key={r.memberId ?? "uncredited"}>
                    <td className={`py-2 pr-3 font-medium ${r.memberId ? "" : "text-[var(--cp-faint)]"}`}>
                      {r.name}
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.counts.google_review || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.counts.facebook_review || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.counts.social_follow || "—"}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{r.totalCount}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-[var(--cp-muted)]">
                      {fmtMoney(r.rewardCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] leading-snug text-[var(--cp-faint)]">
            Approved rewards only — reward given is the customer discount earned by that worker&rsquo;s ask.{" "}
            {totalApproved} approved total.
          </p>
        </>
      )}
    </div>
  );
}
