import Link from "next/link";
import { getInsights, parseRange, RANGES, type RangeKey } from "@/lib/canes/analytics";
import { fmtMoney } from "@/lib/canes/types";
import { CollectedTrend } from "@/app/CanesPressure/components/insights/collected-trend";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

// Insights (Phase 3) — the owner's read on the business. Range-scoped by URL
// (server-driven links, no client state), computed in lib/canes/analytics.ts.
// One recharts island (the collected trend); everything else is flat
// server-rendered HTML in the .cp-* system — Jobber-calm, zero client JS.

const CASH = "var(--cp-good)";
const CARD = "var(--cp-cold)";
const NEUTRAL_BAR = "var(--cp-line-strong)"; // ranking bars; the leader gets brand orange
const LEADER = "var(--cp-brand)";

const fmtMins = (m: number) =>
  m < 60
    ? `${m}m`
    : m < 1440
      ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim()
      : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;

// ── Small server-rendered pieces ─────────────────────────────────────────────

function CardTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="cp-label">{label}</p>
      <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">{title}</h2>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-[var(--cp-muted)]">{children}</p>;
}

// A labeled horizontal meter row — the ranking primitive (flat, no JS).
function MeterRow({
  name,
  sub,
  value,
  pct,
  color,
  dot,
}: {
  name: string;
  sub?: string;
  value: string;
  pct: number; // 0..1 of the row's bar
  color: string;
  dot?: string; // optional crew dot color next to the name
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
          {dot && <span className="cp-crew-dot shrink-0" style={{ ["--cp-crew" as string]: dot }} />}
          <span className="truncate">{name}</span>
          {sub && <span className="shrink-0 text-[11.5px] font-normal text-[var(--cp-faint)]">{sub}</span>}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-[5px] w-full overflow-hidden rounded-[2px] bg-[var(--cp-bg)]">
        <div
          className="h-full rounded-[2px]"
          style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ShareBar({ segments }: { segments: { label: string; cents: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.cents, 0);
  if (total === 0) return <EmptyLine>No payments in this period.</EmptyLine>;
  const shown = segments.filter((s) => s.cents > 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-[2px]">
        {shown.map((s) => (
          <div key={s.label} style={{ width: `${(s.cents / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2.5 space-y-1.5">
        {shown.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-1.5 text-[var(--cp-muted)]">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums font-medium">
              {fmtMoney(s.cents)}
              <span className="ml-1.5 text-[var(--cp-faint)]">{Math.round((s.cents / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rangeKey = parseRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const d = await getInsights(rangeKey);

  const trendHasMoney = d.trend.some((p) => p.cash > 0 || p.card > 0);
  const short = RANGES[rangeKey].short;

  // Collected delta vs the prior same-length window.
  const prev = d.kpis.collectedPrevCents;
  const deltaPct = prev > 0 ? ((d.kpis.collectedCents - prev) / prev) * 100 : null;

  const kpis = [
    {
      label: "Collected",
      value: fmtMoney(d.kpis.collectedCents),
      sub:
        deltaPct !== null ? (
          <span
            className="font-medium tabular-nums"
            style={{ color: deltaPct >= 0 ? "var(--cp-good)" : "var(--cp-warn)" }}
          >
            {deltaPct >= 0 ? "+" : "−"}
            {Math.abs(deltaPct).toLocaleString("en-US", { maximumFractionDigits: 1 })}% vs prior {short}
          </span>
        ) : (
          <>money actually received</>
        ),
    },
    {
      label: "Outstanding",
      value: fmtMoney(d.kpis.outstandingCents),
      sub: (
        <>
          {d.kpis.outstandingCount} open invoice{d.kpis.outstandingCount === 1 ? "" : "s"}
        </>
      ),
      href: "/CanesPressure/invoices?status=unpaid",
    },
    {
      label: "Won work",
      value: fmtMoney(d.kpis.wonCents),
      sub: (
        <>
          {d.kpis.wonCount} estimate{d.kpis.wonCount === 1 ? "" : "s"} approved
        </>
      ),
    },
    {
      label: "Avg job",
      value: d.kpis.avgJobCents !== null ? fmtMoney(d.kpis.avgJobCents) : "—",
      sub: (
        <>
          {d.kpis.paidJobs} paid job{d.kpis.paidJobs === 1 ? "" : "s"}
        </>
      ),
    },
  ];

  const funnelBase = d.funnel[0]?.count ?? 0;
  const maxCrew = Math.max(1, ...d.revenueByCrew.map((c) => c.cents));
  const maxSvc = Math.max(1, ...d.topServices.map((s) => s.cents));
  const maxSrc = Math.max(1, ...d.sources.map((s) => s.leads));

  const ops = [
    { label: "Jobs completed", value: String(d.ops.completed), sub: d.rangeLabel.toLowerCase() },
    { label: "Canceled / no-show", value: String(d.ops.canceled), sub: d.rangeLabel.toLowerCase() },
    { label: "Waiting to schedule", value: String(d.ops.unscheduled), sub: "in the tray now", href: "/CanesPressure/schedule" },
    { label: "Booked next 7 days", value: String(d.ops.upcomingCount), sub: `${fmtMoney(d.ops.upcomingCents)} on the calendar`, href: "/CanesPressure/schedule" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header + range tabs */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cp-display text-[24px] leading-tight">
            Insights<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
            How the business did — {d.rangeLabel.toLowerCase()}.
          </p>
        </div>
        <div className="cp-seg">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Link
              key={k}
              href={`/CanesPressure/insights?range=${k}`}
              className="cp-seg-btn min-w-[46px]"
              data-active={k === rangeKey}
            >
              {RANGES[k].short}
            </Link>
          ))}
        </div>
      </header>

      {/* KPI strip — one segmented card, mono stat labels. Toplines stay on
          the Today workflow strip only. */}
      <section className="cp-card overflow-hidden">
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4">
          {kpis.map((s) => {
            const inner = (
              <div className="px-4 pb-3.5 pt-3.5">
                <p className="cp-mono whitespace-nowrap">{s.label}</p>
                <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums">{s.value}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">{s.sub}</p>
              </div>
            );
            const cls = "border-b border-r border-[var(--cp-line)]";
            return s.href ? (
              <Link key={s.label} href={s.href} className={`${cls} transition-colors hover:bg-[var(--cp-hover)]`}>
                {inner}
              </Link>
            ) : (
              <div key={s.label} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* Money */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="cp-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle label="Money" title="Collected over time" />
            <div className="flex items-center gap-3 text-[11.5px] text-[var(--cp-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: CASH }} /> Cash
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: CARD }} /> Card
              </span>
            </div>
          </div>
          <div className="mt-3">
            {trendHasMoney ? (
              <CollectedTrend data={d.trend} />
            ) : (
              <div className="flex h-[224px] items-center justify-center">
                <EmptyLine>
                  Nothing collected in this period yet. Payments land here the moment a job is paid.
                </EmptyLine>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="cp-card p-4">
            <CardTitle label="Payment method" title="Cash vs card" />
            <div className="mt-3">
              <ShareBar
                segments={[
                  { label: "Cash", cents: d.methodShare.cash, color: CASH },
                  { label: "Card", cents: d.methodShare.card, color: CARD },
                  { label: "Other", cents: d.methodShare.other, color: NEUTRAL_BAR },
                ]}
              />
            </div>
          </div>

          <div className="cp-card flex-1 p-4">
            <CardTitle label="Per-crew contribution" title="Revenue by crew" />
            <div className="mt-2">
              {d.revenueByCrew.length === 0 ? (
                <EmptyLine>No payments in this period.</EmptyLine>
              ) : (
                d.revenueByCrew.map((c) => (
                  <MeterRow
                    key={c.name}
                    name={c.name}
                    sub={`${c.jobs} job${c.jobs === 1 ? "" : "s"}`}
                    value={fmtMoney(c.cents)}
                    pct={c.cents / maxCrew}
                    color={c.color}
                    dot={c.color}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="cp-card p-4">
          <CardTitle label="Pipeline" title="Lead funnel" />
          <div className="mt-2">
            {funnelBase === 0 ? (
              <EmptyLine>No leads created in this period.</EmptyLine>
            ) : (
              d.funnel.map((stage, i) => (
                <MeterRow
                  key={stage.label}
                  name={stage.label}
                  sub={i > 0 ? `${Math.round((stage.count / funnelBase) * 100)}%` : undefined}
                  value={String(stage.count)}
                  pct={stage.count / funnelBase}
                  color={stage.label === "Won" ? "var(--cp-good)" : "var(--cp-cold)"}
                />
              ))
            )}
          </div>
        </div>

        <div className="cp-card p-4">
          <CardTitle label="Estimates" title="Quote scoreboard" />
          {d.estimates.total === 0 ? (
            <EmptyLine>No estimates created in this period.</EmptyLine>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[26px] font-bold leading-none tabular-nums">
                  {d.estimates.winRatePct !== null ? `${d.estimates.winRatePct}%` : "—"}
                </span>
                <span className="text-[12.5px] text-[var(--cp-muted)]">win rate on decided quotes</span>
              </div>
              <div className="cp-divider mt-3 space-y-1.5 pt-3 text-[13px]">
                <ScoreRow label="Approved" value={`${d.estimates.approved} · ${fmtMoney(d.estimates.approvedCents)}`} strong />
                <ScoreRow label="Awaiting reply" value={String(d.estimates.awaiting)} />
                <ScoreRow label="Declined" value={String(d.estimates.declined)} />
                {d.estimates.expired > 0 && <ScoreRow label="Expired" value={String(d.estimates.expired)} />}
                {d.estimates.drafts > 0 && <ScoreRow label="Still drafts" value={String(d.estimates.drafts)} />}
              </div>
            </>
          )}
        </div>

        <div className="cp-card p-4 md:col-span-2 lg:col-span-1">
          <CardTitle label="Response speed" title="Speed to lead" />
          {d.speedToLead.sampled === 0 && d.speedToLead.uncontacted === 0 ? (
            <EmptyLine>No new quote requests in this period.</EmptyLine>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="whitespace-nowrap text-[26px] font-bold leading-none tabular-nums">
                  {d.speedToLead.medianMinutes !== null ? fmtMins(d.speedToLead.medianMinutes) : "—"}
                </span>
                <span className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
                  median time to first call or text
                </span>
              </div>
              <div className="cp-divider mt-3 space-y-1.5 pt-3 text-[13px]">
                <ScoreRow
                  label="Reached within 15 min"
                  value={d.speedToLead.within15Pct !== null ? `${d.speedToLead.within15Pct}%` : "—"}
                  strong
                />
                <ScoreRow label="Leads measured" value={String(d.speedToLead.sampled)} />
                {d.speedToLead.uncontacted > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--cp-warn)]">Never contacted</span>
                    <span className="font-semibold tabular-nums text-[var(--cp-warn)]">
                      {d.speedToLead.uncontacted}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-[var(--cp-faint)]">
                New quote requests, measured to your first manual text or call. Automated texts don&rsquo;t count.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Sources + services */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="cp-card p-4">
          <CardTitle label="Lead generation" title="Where leads come from" />
          <div className="mt-2">
            {d.sources.length === 0 ? (
              <EmptyLine>No leads created in this period.</EmptyLine>
            ) : (
              d.sources.map((s) => (
                <MeterRow
                  key={s.source}
                  name={s.label}
                  sub={`${s.leads} lead${s.leads === 1 ? "" : "s"}`}
                  value={s.wonCents > 0 ? `${fmtMoney(s.wonCents)} won` : s.won > 0 ? `${s.won} won` : "—"}
                  pct={s.leads / maxSrc}
                  color="var(--cp-muted)"
                />
              ))
            )}
          </div>
        </div>

        <div className="cp-card p-4">
          <CardTitle label="What gets paid for" title="Top services" />
          <div className="mt-2">
            {d.topServices.length === 0 ? (
              <EmptyLine>No paid work in this period yet.</EmptyLine>
            ) : (
              d.topServices.map((s, i) => (
                <MeterRow
                  key={s.name}
                  name={s.name}
                  sub={`×${s.count}`}
                  value={fmtMoney(s.cents)}
                  pct={s.cents / maxSvc}
                  color={i === 0 ? LEADER : NEUTRAL_BAR}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Ops strip */}
      <section className="cp-card overflow-hidden">
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4">
          {ops.map((s) => {
            const inner = (
              <div className="px-4 pb-3.5 pt-3.5">
                <p className="cp-mono whitespace-nowrap">{s.label}</p>
                <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums">{s.value}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">{s.sub}</p>
              </div>
            );
            const cls = "border-b border-r border-[var(--cp-line)]";
            return s.href ? (
              <Link key={s.label} href={s.href} className={`${cls} transition-colors hover:bg-[var(--cp-hover)]`}>
                {inner}
              </Link>
            ) : (
              <div key={s.label} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[12.5px] leading-relaxed text-[var(--cp-faint)]">
        Collected counts money actually received on the payments ledger — not invoices sent. Won work is
        the value of estimates approved in the period; the two meet when the job is done and paid.
      </p>
    </div>
  );
}

function ScoreRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--cp-muted)]">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}
