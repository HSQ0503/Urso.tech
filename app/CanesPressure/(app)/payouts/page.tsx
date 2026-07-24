import Link from "next/link";
import { computePayouts, fmtMinutes, getTeamHours, listTeamMembers, parsePayoutRange } from "@/lib/canes/payouts";
import { listCrews } from "@/lib/canes/estimates";
import { fmtEt, fmtMoney, TEAM_ROLE_LABEL, type PayoutLine, type PayoutRangeKey, type TeamRole } from "@/lib/canes/types";
import { SplitEditor } from "@/app/CanesPressure/components/payouts/split-editor";
import { TeamManager } from "@/app/CanesPressure/components/payouts/team-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

// Payouts (Phase 5) — the money question Sebastian cares about most: after the
// bills are paid, what does each person actually take home. The waterfall and
// per-person cut are pure server-rendered .cp-* (computePayouts does the math in
// lib/canes/payouts.ts); the team + split controls are client islands that call
// the server actions and router.refresh. Range-scoped by URL like Insights.

const RANGE_TABS: { key: PayoutRangeKey; short: string }[] = [
  { key: "day", short: "Day" },
  { key: "week", short: "Week" },
  { key: "month", short: "Month" },
  { key: "year", short: "Year" },
];

// Owner first, then partner, ops manager, workers — so the owner's take-home is
// always the headline no matter what order the roster is stored in.
const ROLE_ORDER: Record<TeamRole, number> = { owner: 0, partner: 1, ops_manager: 2, worker: 3 };

const initials = (name: string) => (name.trim().split(/\s+/)[0] || "?").slice(0, 2).toUpperCase();

function CardTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="cp-label">{label}</p>
      <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">{title}</h2>
    </div>
  );
}

// One rung of the waterfall. `kind` decides the weight/tone:
//   base = the starting collected line; deduct = a subtraction (renders "− $x");
//   subtotal = gross profit (ruled off above); total = distributable (headline).
function FlowRow({
  label,
  sub,
  cents,
  kind,
}: {
  label: string;
  sub?: string;
  cents: number;
  kind: "base" | "deduct" | "subtotal" | "total";
}) {
  const neg = cents < 0;
  const display = kind === "deduct" ? `− ${fmtMoney(Math.abs(cents))}` : fmtMoney(cents);

  if (kind === "total") {
    return (
      <div className="mt-1 flex items-end justify-between gap-3 border-t-2 border-[var(--cp-line-strong)] pt-3">
        <div>
          <p className="text-[15px] font-semibold leading-tight">{label}</p>
          {sub && <p className="mt-0.5 text-[12px] text-[var(--cp-faint)]">{sub}</p>}
        </div>
        <span
          className="shrink-0 text-[22px] font-extrabold leading-none tabular-nums"
          style={{ color: neg ? "var(--cp-warn)" : "var(--cp-good)" }}
        >
          {display}
        </span>
      </div>
    );
  }

  if (kind === "subtotal") {
    return (
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--cp-line)] pt-3">
        <div>
          <span className="text-[14px] font-semibold">{label}</span>
          {sub && <span className="ml-2 text-[12px] text-[var(--cp-faint)]">{sub}</span>}
        </div>
        <span
          className="shrink-0 text-[15px] font-bold tabular-nums"
          style={neg ? { color: "var(--cp-warn)" } : undefined}
        >
          {display}
        </span>
      </div>
    );
  }

  const muted = kind === "deduct";
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <span className={`text-[13.5px] ${muted ? "text-[var(--cp-muted)]" : "font-medium"}`}>{label}</span>
        {sub && <span className="ml-2 text-[12px] text-[var(--cp-faint)]">{sub}</span>}
      </div>
      <span
        className={`shrink-0 tabular-nums ${muted ? "text-[13.5px] text-[var(--cp-muted)]" : "text-[14px] font-semibold"}`}
      >
        {display}
      </span>
    </div>
  );
}

// A ranked per-person row: avatar + name + role, the basis beneath, the exact
// amount on the right, and a meter tracking their cut against the top earner.
function PayoutRow({ line, max }: { line: PayoutLine; max: number }) {
  const neg = line.amount_cents < 0;
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="cp-avatar">{initials(line.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[13.5px] font-medium">{line.name}</span>
              <span className="shrink-0 text-[11.5px] text-[var(--cp-faint)]">{TEAM_ROLE_LABEL[line.role]}</span>
            </span>
            <span
              className="shrink-0 text-[14px] font-semibold tabular-nums"
              style={neg ? { color: "var(--cp-warn)" } : undefined}
            >
              {fmtMoney(line.amount_cents)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[var(--cp-muted)]">{line.basis}</p>
        </div>
      </div>
      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-[2px] bg-[var(--cp-bg)]">
        <div
          className="h-full rounded-[2px]"
          style={{
            width: `${Math.max(2, Math.min(100, (line.amount_cents / max) * 100))}%`,
            background: line.role === "owner" ? "var(--cp-brand)" : "var(--cp-cold)",
          }}
        />
      </div>
    </div>
  );
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; hours?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rangeKey = parsePayoutRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const hoursMemberId = Array.isArray(sp.hours) ? sp.hours[0] : (sp.hours ?? null);
  const [summary, team, crews, hours] = await Promise.all([
    computePayouts(rangeKey),
    listTeamMembers(),
    listCrews(true),
    getTeamHours(),
  ]);

  const splitMembers = team.filter((m) => m.comp_type === "profit_split");

  const sortedLines = [...summary.lines].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.amount_cents - a.amount_cents,
  );
  const ownerLine = sortedLines.find((l) => l.role === "owner") ?? null;
  const restLines = ownerLine ? sortedLines.filter((l) => l !== ownerLine) : sortedLines;
  const maxLine = Math.max(1, ...restLines.map((l) => l.amount_cents));

  return (
    <div className="flex flex-col gap-6">
      {/* Header + range tabs — mobile: iOS title + full-width segmented control */}
      <header className="md:hidden">
        <h1 className="cp-ios-title">
          Payouts<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">Everyone&rsquo;s cut of the profit.</p>
        <div className="cp-seg cp-seg-ios mt-4 flex w-full">
          {RANGE_TABS.map((r) => (
            <Link
              key={r.key}
              href={`/CanesPressure/payouts?range=${r.key}${hoursMemberId ? `&hours=${hoursMemberId}` : ""}`}
              className="cp-seg-btn flex-1"
              data-active={r.key === rangeKey}
            >
              {r.short}
            </Link>
          ))}
        </div>
      </header>

      {/* Header + range tabs — desktop */}
      <header className="hidden flex-wrap items-end justify-between gap-3 md:flex">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">
            Payouts<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">Everyone&rsquo;s cut of the profit.</p>
        </div>
        <div className="cp-seg">
          {RANGE_TABS.map((r) => (
            <Link
              key={r.key}
              href={`/CanesPressure/payouts?range=${r.key}${hoursMemberId ? `&hours=${hoursMemberId}` : ""}`}
              className="cp-seg-btn min-w-[56px]"
              data-active={r.key === rangeKey}
            >
              {r.short}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* 1 — The waterfall */}
        <div className="cp-card p-4 sm:p-5">
          <CardTitle label="The waterfall" title={`Profit for ${summary.rangeLabel}`} />
          <div className="mt-4">
            <FlowRow label="Collected" sub="money received" cents={summary.collectedCents} kind="base" />
            <FlowRow label="Job expenses" sub="materials, gas, dump fees" cents={-summary.jobExpensesCents} kind="deduct" />
            <FlowRow label="Overhead" sub="insurance, truck, subscriptions" cents={-summary.overheadCents} kind="deduct" />
            <FlowRow label="Labor" sub="hourly crew" cents={-summary.laborCents} kind="deduct" />
            <FlowRow label="Gross profit" cents={summary.grossProfitCents} kind="subtotal" />
            <FlowRow label="Ops-manager share" sub="taken off gross" cents={-summary.opsShareCents} kind="deduct" />
            <FlowRow
              label="Distributable"
              sub="split between owner and partner"
              cents={summary.distributableCents}
              kind="total"
            />
          </div>
        </div>

        {/* 2 — Per-person payouts */}
        <div className="cp-card flex flex-col p-4 sm:p-5">
          <CardTitle label="Take-home" title="Each person's cut" />
          {sortedLines.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-10 text-center text-[13px] text-[var(--cp-muted)]">
              Add your split to see payouts.
            </p>
          ) : (
            <>
              {ownerLine && (
                <div className="mt-4 flex items-center gap-3 rounded-lg bg-[var(--cp-brand-soft)] p-3">
                  <span className="cp-avatar" style={{ background: "var(--cp-brand-fill)", color: "#fff" }}>
                    {initials(ownerLine.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="cp-mono" style={{ color: "var(--cp-brand-deep)" }}>{ownerLine.name} · take-home</p>
                    <p className="mt-0.5 text-[12px] text-[var(--cp-muted)]">{ownerLine.basis}</p>
                  </div>
                  <span
                    className="shrink-0 text-[24px] font-extrabold leading-none tabular-nums"
                    style={{ color: ownerLine.amount_cents < 0 ? "var(--cp-warn)" : "var(--cp-brand-deep)" }}
                  >
                    {fmtMoney(ownerLine.amount_cents)}
                  </span>
                </div>
              )}
              {restLines.length > 0 && (
                <div className="mt-2 divide-y divide-[var(--cp-line)]">
                  {restLines.map((l) => (
                    <PayoutRow key={l.member_id} line={l} max={maxLine} />
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11.5px] leading-snug text-[var(--cp-faint)]">
                Payout labor is still estimated from scheduled job durations; the
                Hours worked section below shows the crew&apos;s real check-ins.
              </p>
            </>
          )}
        </div>
      </section>

      {/* 3 — Hours, from real crew check-ins (tamper-proof: portal stamps,
          not self-reported numbers). ?hours=<memberId> expands the audit list. */}
      <section className="cp-card p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Hours worked</h2>
          <p className="cp-mono">From crew check-ins</p>
        </div>
        {hours.truncated && (
          <p className="mt-1 text-[11.5px] leading-snug text-[var(--cp-faint)]">
            Showing the most recent check-ins only — all-time totals exclude older history.
          </p>
        )}
        <div className="mt-3 divide-y divide-[var(--cp-line)]">
          {hours.members.map((h) => {
            const open = hoursMemberId === h.member.id;
            return (
              <div key={h.member.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={
                    open
                      ? `/CanesPressure/payouts?range=${rangeKey}`
                      : `/CanesPressure/payouts?range=${rangeKey}&hours=${h.member.id}`
                  }
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {h.member.name}
                      {h.onClockJobName && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--cp-good)]">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cp-good)]" />
                          On the clock — {h.onClockJobName}
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-[var(--cp-muted)]">
                      {TEAM_ROLE_LABEL[h.member.role]}
                      {!h.hasAccount && " · no portal account — hours aren't tracked"}
                    </span>
                  </span>
                  {h.hasAccount && (
                    <span className="grid shrink-0 grid-cols-4 gap-x-4 text-right tabular-nums">
                      {(
                        [
                          ["Today", h.todayMinutes],
                          ["Week", h.weekMinutes],
                          ["Month", h.monthMinutes],
                          ["All time", h.allTimeMinutes],
                        ] as const
                      ).map(([label, mins]) => (
                        <span key={label}>
                          <span className="cp-mono block">{label}</span>
                          <span className="block text-[13.5px] font-semibold">{fmtMinutes(mins)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
                {open && h.hasAccount && (
                  <div className="mt-2.5 rounded-md border border-[var(--cp-line)] bg-[var(--cp-bg)] px-3 py-2">
                    {h.entries.length === 0 ? (
                      <p className="py-1 text-[12.5px] text-[var(--cp-muted)]">
                        No check-ins yet — hours appear the first time they check in on a job.
                      </p>
                    ) : (
                      <ul className="divide-y divide-[var(--cp-line)]">
                        {h.entries.map((e) => (
                          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">
                              {e.customerName ?? "Customer"} · {e.jobName}
                            </span>
                            <span className="cp-mono tabular-nums">
                              {fmtEt(e.checkedInAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              {" → "}
                              {e.checkedOutAt
                                ? fmtEt(e.checkedOutAt, { hour: "numeric", minute: "2-digit" })
                                : "on the clock"}
                            </span>
                            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">
                              {fmtMinutes(e.minutes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 — Team + split */}
      {splitMembers.length > 0 && <SplitEditor members={splitMembers} />}
      <TeamManager team={team} crews={crews} />
    </div>
  );
}
