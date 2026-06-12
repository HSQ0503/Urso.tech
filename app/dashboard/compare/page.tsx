import {
  parseScope,
  parseCompareMode,
  parseComparePreset,
  parseCompareMetric,
  scopeLabel,
} from "@/components/dashboard/data";
import {
  getCompareData,
  resolveCompareRanges,
  compareBounds,
  type CompareRange,
} from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  Delta,
  Legend,
  CompareBars,
  CompareDiverging,
  ComparePace,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { CompareControls } from "@/components/dashboard/compare-controls";
import { ChartInfo } from "@/components/dashboard/chart-info";

// The comparison engine: any entity set × any metric × any two periods. Each
// mode gets the visual built for its question — stores: side-by-side columns +
// a day-by-day pace overlay; groomers: ranked paired bars; products: a
// winners/losers chart of what moved. Honesty rules (day-matched presets,
// length warnings, weekday labels, history-edge notes) surface inline.
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ mode?: string; preset?: string; metric?: string; a?: string; b?: string; store?: string }> }) {
  const sp = await searchParams;
  const mode = parseCompareMode(sp.mode);
  const preset = parseComparePreset(sp.preset);
  const metricKey = parseCompareMetric(mode, sp.metric);
  const scope = parseScope(sp.store);
  const { a, b, warnings } = resolveCompareRanges(preset, sp.a, sp.b);
  const bounds = compareBounds();
  const data = await getCompareData(mode, metricKey, a, b, scope);

  const revDelta = data.revenue.b > 0 ? (data.revenue.a - data.revenue.b) / data.revenue.b : null;
  const scopeNote = mode !== "stores" && scope !== "all" ? ` · ${scopeLabel(scope)}` : "";
  const fmt = (n: number) => (data.format === "money" ? fmtMoney(Math.round(n)) : data.format === "pct" ? pct(n) : Math.round(n).toLocaleString());

  // Charts receive pre-scaled values (rates ×100 to match the "pct" format
  // token convention); the table keeps raw values and its own formatting.
  const scale = data.format === "pct" ? 100 : 1;
  const scaled = data.rows.map((r) => ({ name: r.name, a: r.a == null ? null : r.a * scale, b: r.b == null ? null : r.b * scale }));
  const maxScaled = Math.max(0, ...scaled.flatMap((r) => [r.a ?? 0, r.b ?? 0]));
  const chartFormat = data.format === "pct" ? ("pct" as const) : data.format === "money" ? (maxScaled >= 10_000 ? ("moneyK" as const) : ("money" as const)) : ("number" as const);
  const movers = (data.movers ?? []).map((m) => ({ name: m.name, delta: m.delta * scale }));
  const maxDelta = Math.max(0, ...movers.map((d) => Math.abs(d.delta)));
  const deltaFormat = data.format === "pct" ? ("pct" as const) : data.format === "money" ? (maxDelta >= 10_000 ? ("moneyK" as const) : ("money" as const)) : ("number" as const);
  const legend = [
    { label: `Now · ${rangeLabel(a, true)}`, color: "#fe5100" },
    { label: `Before · ${rangeLabel(b, true)}`, color: "var(--color-series)" },
  ];
  const entityLabel = mode === "stores" ? "Store" : mode === "groomers" ? "Groomer" : "Item";

  return (
    <div className="animate-stage-in space-y-6">
      <PageHeader
        eyebrow={`Compare · ${rangeLabel(a)} vs ${rangeLabel(b)}${scopeNote}`}
        title="Compare anything"
        sub="Stores, groomers, or products across any two periods — this month against last, this time last year, or any two dates. The period picker below drives this page; the month filter in the top bar does not apply here."
      />

      <CompareControls key={`${a.start}${a.end}${b.start}${b.end}`} mode={mode} preset={preset} metric={metricKey} a={a} b={b} minDate={bounds.min} maxDate={bounds.max} />

      {warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-2 text-[13px] leading-[1.5] text-ink-dim">
          <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-orange" />
          {w}
        </p>
      ))}

      {/* Headline: revenue across the two periods, always */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3">
        <Period label="This period" range={a} value={data.revenue.a} days={data.days.a} accent />
        <Period label="Compared against" range={b} value={data.revenue.b} days={data.days.b} />
        <div className="col-span-2 bg-cell p-4 md:col-span-1">
          <Micro>Revenue change</Micro>
          <div className="mt-2.5 flex items-baseline gap-2.5">
            <span className="text-[26px] font-medium leading-none tracking-[-0.02em]">
              {revDelta == null ? "—" : `${revDelta >= 0 ? "+" : "−"}${Math.abs(revDelta * 100).toFixed(1)}%`}
            </span>
            {data.days.a !== data.days.b && <span className="text-[11.5px] text-ink-dim">totals · lengths differ</span>}
          </div>
          {data.days.a !== data.days.b && data.revenue.b > 0 && (
            <div className="mt-2 text-[12px] text-ink-dim">
              Per day: {fmtMoney(Math.round(data.revenue.a / data.days.a))} vs {fmtMoney(Math.round(data.revenue.b / data.days.b))}
            </div>
          )}
        </div>
      </section>

      {/* What stands out */}
      {data.insights.length > 0 && (
        <Card className="flex flex-col gap-3">
          <Micro className="!text-orange">What stands out</Micro>
          <ul className="space-y-2">
            {data.insights.map((s, i) => (
              <li key={i} className="text-[14px] leading-[1.55] text-ink">{s}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Mode-specific visuals */}
      {mode === "stores" && (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <div className="mb-1 flex items-center gap-1.5">
              <Micro>{data.metricLabel} · by store</Micro>
              <ChartInfo id="compareTable" />
            </div>
            <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">Side by side</h2>
            <CompareBars data={scaled} labelA={`Now · ${rangeLabel(a, true)}`} labelB={`Before · ${rangeLabel(b, true)}`} format={chartFormat} />
            <div className="mt-3"><Legend items={legend} /></div>
          </Card>
          {data.pace && (
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>Revenue pace · running total by day</Micro>
                <ChartInfo id="comparePace" />
              </div>
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">Is this period ahead or behind?</h2>
              <ComparePace a={data.pace.a} b={data.pace.b} labelA={`Now · ${rangeLabel(a, true)}`} labelB={`Before · ${rangeLabel(b, true)}`} />
              <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-dim">
                Each line adds up revenue day by day. When the orange line sits above the dashed one, this period is ahead of the comparison at the same point.
              </p>
            </Card>
          )}
        </section>
      )}

      {mode === "groomers" && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Micro>{data.metricLabel} · per groomer</Micro>
            <ChartInfo id="compareTable" />
          </div>
          <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">Now vs before, ranked</h2>
          <CompareBars layout="rows" data={scaled} labelA={`Now · ${rangeLabel(a, true)}`} labelB={`Before · ${rangeLabel(b, true)}`} format={chartFormat} />
          <div className="mt-3"><Legend items={legend} /></div>
        </Card>
      )}

      {mode === "products" && movers.length > 0 && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Micro>{data.metricLabel} · biggest moves between periods</Micro>
            <ChartInfo id="compareDiverging" />
          </div>
          <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">Winners and losers</h2>
          <CompareDiverging data={movers} format={deltaFormat} />
          <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-dim">
            {data.pointDelta
              ? "The biggest margin moves across every item, in percentage points — right improved, left slipped. Changes under 1 point are left out."
              : "The biggest moves across every item — right of the line sold more than in the comparison period, left sold less. Small changes are left out; the table below has the exact figures for your top sellers."}
          </p>
        </Card>
      )}

      {/* Exact figures */}
      <Card pad={false}>
        <div className="px-5 pb-1 pt-5">
          <Micro>Exact figures · {data.metricLabel.toLowerCase()}</Micro>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                <th className="px-5 py-3 text-left font-normal">{entityLabel}</th>
                <th className="px-5 py-3 text-right font-normal">Before · {rangeLabel(b, true)}</th>
                <th className="px-5 py-3 text-right font-normal">Now · {rangeLabel(a, true)}</th>
                <th className="px-5 py-3 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key} className="border-t border-edge transition-colors hover:bg-raise">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-ink">{r.name}</span>
                      {r.tag && <Tag tone="muted">{r.tag}</Tag>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-ink-dim">{r.b == null ? "—" : fmt(r.b)}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink">{r.a == null ? "—" : fmt(r.a)}</td>
                  <td className="px-5 py-3 text-right">
                    <Change a={r.a} b={r.b} points={data.pointDelta} />
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr className="border-t border-edge">
                  <td colSpan={4} className="px-5 py-8 text-center text-[13.5px] text-ink-dim">
                    No data in these periods — try widening the dates (history starts Jun 16, 2025).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data.notes.map((n, i) => (
        <p key={i} className="-mt-2 text-[12.5px] leading-[1.5] text-ink-dimmer">{n}</p>
      ))}
    </div>
  );
}

// Single days carry the weekday — a Tuesday losing to a Saturday is a calendar
// fact, not a performance story.
function rangeLabel(r: CompareRange, short = false): string {
  const day = (iso: string, weekday: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...(weekday ? { weekday: "short" as const } : {}),
      month: "short",
      day: "numeric",
      ...(short ? {} : { year: "numeric" as const }),
    }).format(new Date(`${iso}T00:00:00Z`));
  if (r.start === r.end) return day(r.start, true);
  const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
  const startFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(sameYear || short ? {} : { year: "numeric" as const }) }).format(new Date(`${r.start}T00:00:00Z`));
  return `${startFmt} – ${day(r.end, false)}`;
}

function Period({ label, range, value, days, accent }: { label: string; range: CompareRange; value: number; days: number; accent?: boolean }) {
  return (
    <div className="bg-cell p-4">
      <Micro className={accent ? "!text-orange" : undefined}>{label}</Micro>
      <div className="mt-2.5 text-[26px] font-medium leading-none tracking-[-0.02em]">{fmtMoney(Math.round(value), true)}</div>
      <div className="mt-2 text-[12px] text-ink-dim">
        {rangeLabel(range)} · {days} {days === 1 ? "day" : "days"}
      </div>
    </div>
  );
}

function Change({ a, b, points }: { a: number | null; b: number | null; points: boolean }) {
  if (a != null && (b == null || b === 0)) return <Tag tone="orange">New</Tag>;
  if ((a == null || a === 0) && b != null && b > 0) return <Tag tone="muted">No sales</Tag>;
  if (a == null || b == null || b === 0) return <span className="font-mono text-[12px] text-ink-dimmer">—</span>;
  if (points) {
    const d = (a - b) * 100;
    const good = d >= 0;
    return (
      <span className="font-mono text-[12px] tabular-nums" style={{ color: good ? "var(--color-good)" : "#fe5100" }}>
        {good ? "+" : "−"}{Math.abs(d).toFixed(1)} pts
      </span>
    );
  }
  return <Delta value={(a - b) / b} />;
}
