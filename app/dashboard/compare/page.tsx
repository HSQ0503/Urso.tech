import {
  parseScope,
  parseCompareMode,
  parseComparePreset,
  parseCompareMetric,
  scopeLabel,
  type CompareFormat,
} from "@/components/dashboard/data";
import {
  getCompareData,
  getCompareOverview,
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
import Link from "next/link";
import { CompareControls } from "@/components/dashboard/compare-controls";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { getI18n } from "@/lib/i18n.server";

// The comparison engine: any entity set × any metric × any two periods. Each
// mode gets the visual built for its question — stores: side-by-side columns +
// a day-by-day pace overlay; groomers: ranked paired bars; products: a
// winners/losers chart of what moved. Honesty rules (day-matched presets,
// length warnings, weekday labels, history-edge notes) surface inline.
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ mode?: string; preset?: string; metric?: string; a?: string; b?: string; store?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const mode = parseCompareMode(sp.mode);
  const preset = parseComparePreset(sp.preset);
  const metricKey = parseCompareMetric(mode, sp.metric);
  const scope = parseScope(sp.store);
  const { a, bs, warnings } = resolveCompareRanges(preset, sp.a, sp.b);
  const bounds = compareBounds();

  // "All metrics" collapses the entity axis into one small-multiple panel per
  // metric; a single metric keeps the full per-entity drill-down.
  const overview = metricKey === "all" ? await getCompareOverview(mode, a, bs, scope) : null;
  const data = overview ? null : await getCompareData(mode, metricKey, a, bs, scope);

  const b = bs[0]; // primary baseline — deltas, insights and movers read against it
  const extras = bs.slice(1); // older context periods ("each year" / extra custom ranges)
  const revenue = (data ?? overview)!.revenue;
  const dayInfo = (data ?? overview)!.days;
  const revB = revenue.bs[0] ?? 0;
  const revDelta = revB > 0 ? (revenue.a - revB) / revB : null;
  const scopeNote = mode !== "stores" && scope !== "all" ? ` · ${scopeLabel(scope)}` : "";
  const fmt = data ? fmtBy(data.format) : (n: number) => String(n);

  // Charts receive pre-scaled values (rates ×100 to match the "pct" format
  // token convention); the table keeps raw values and its own formatting.
  const scale = data?.format === "pct" ? 100 : 1;
  const scaled = (data?.rows ?? []).map((r) => ({
    name: r.name,
    a: r.a == null ? null : r.a * scale,
    b: r.b == null ? null : r.b * scale,
    more: extras.map((_, i) => (r.more?.[i] == null ? null : r.more[i]! * scale)),
  }));
  const maxScaled = Math.max(0, ...scaled.flatMap((r) => [r.a ?? 0, r.b ?? 0, ...r.more.map((v) => v ?? 0)]));
  const chartFormat = data?.format === "pct" ? ("pct" as const) : data?.format === "money" ? (maxScaled >= 10_000 ? ("moneyK" as const) : ("money" as const)) : ("number" as const);
  const movers = (data?.movers ?? []).map((m) => ({ name: m.name, delta: m.delta * scale }));
  const maxDelta = Math.max(0, ...movers.map((d) => Math.abs(d.delta)));
  const deltaFormat = data?.format === "pct" ? ("pct" as const) : data?.format === "money" ? (maxDelta >= 10_000 ? ("moneyK" as const) : ("money" as const)) : ("number" as const);
  const EXTRA_LEGEND_COLORS = ["var(--color-series-soft)", "var(--color-track)"];
  const extraLabels = extras.map((r) => rangeLabel(r, true));
  const legend = [
    { label: `${t("Now")} · ${rangeLabel(a, true)}`, color: "var(--color-orange)" },
    { label: `${t("Before")} · ${rangeLabel(b, true)}`, color: "var(--color-series)" },
    ...extras.map((r, i) => ({ label: rangeLabel(r, true), color: EXTRA_LEGEND_COLORS[i % EXTRA_LEGEND_COLORS.length] })),
  ];
  const entityLabel = mode === "stores" ? "Store" : mode === "groomers" ? "Groomer" : "Item";
  // Resolved compare periods, handed to the in-page AskAi so chat knows exactly
  // what's being compared (the global month filter doesn't apply on this page).
  const cmp = data
    ? { aLabel: rangeLabel(a, true), aStart: a.start, aEnd: a.end, bLabel: rangeLabel(b, true), bStart: b.start, bEnd: b.end, metric: data.metricLabel }
    : undefined;
  const headlineCols = ["md:grid-cols-3", "md:grid-cols-4", "md:grid-cols-5"][extras.length] ?? "md:grid-cols-3";

  return (
    <div className="animate-stage-in space-y-3">
      <PageHeader
        eyebrow={`${t("Compare")} · ${rangeLabel(a)} ${t("vs")} ${rangeLabel(b)}${scopeNote}`}
        title={t("Compare anything")}
      />

      <CompareControls key={[a, ...bs].map((r) => `${r.start}${r.end}`).join("")} mode={mode} preset={preset} metric={metricKey} a={a} bs={bs} minDate={bounds.min} maxDate={bounds.max} />

      {warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink-dim">
          <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-warn" />
          {w}
        </p>
      ))}

      {/* Headline: revenue across every period, oldest first */}
      <section className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge ${headlineCols}`}>
        {[...extras].reverse().map((r, i) => (
          <Period key={`x${i}`} label={r.start.slice(0, 4)} range={r} value={revenue.bs[extras.length - i]} days={dayInfo.bs[extras.length - i]} t={t} />
        ))}
        <Period label={t("Compared against")} range={b} value={revB} days={dayInfo.bs[0]} t={t} />
        <Period label={t("This period")} range={a} value={revenue.a} days={dayInfo.a} accent t={t} />
        <div className="col-span-2 bg-cell p-4 md:col-span-1">
          <Micro>{t("Revenue change")}{extras.length > 0 ? ` · ${t("vs previous")}` : ""}</Micro>
          <div className="mt-2.5 flex items-baseline gap-2.5">
            <span className="text-2xl font-semibold leading-none tracking-[-0.01em] tabular-nums">
              {revDelta == null ? "—" : `${revDelta >= 0 ? "+" : "−"}${Math.abs(revDelta * 100).toFixed(1)}%`}
            </span>
            {dayInfo.a !== dayInfo.bs[0] && <span className="text-xs text-ink-dim">{t("totals · lengths differ")}</span>}
          </div>
          {dayInfo.a !== dayInfo.bs[0] && revB > 0 && (
            <div className="mt-2 text-xs text-ink-dim">
              {t("Per day")}: {fmtMoney(revenue.a / dayInfo.a)} {t("vs")} {fmtMoney(revB / dayInfo.bs[0])}
            </div>
          )}
        </div>
      </section>

      {/* All metrics: one small-multiple panel per metric, totals per period */}
      {overview && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <Micro>{t("All metrics")} · {t("totals for")} {scopeLabel(scope)}</Micro>
              <h2 className="mt-1.5 text-base font-semibold tracking-[-0.01em]">{t("Every metric, period by period")}</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.metrics.map((m) => (
              <MetricPanel key={m.key} label={t(m.label)} format={m.format} values={m.values} periods={[a, ...bs]} t={t} />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-dimmer">
            {t("Each panel totals the selected scope across the periods, oldest at the top; the chip is the change vs the previous period.")} {t("Pick a single metric above for the per-{entity} breakdown, charts and exact figures.").replace("{entity}", t(entityLabel).toLowerCase())}
          </p>
        </section>
      )}

      {/* What stands out */}
      {data && data.insights.length > 0 && (
        <Card className="flex flex-col gap-3">
          <Micro className="!text-orange">{t("What stands out")}</Micro>
          <ul className="space-y-2">
            {data.insights.map((s, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink">{s}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Mode-specific visuals */}
      {data && mode === "stores" && (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card>
            <div className="mb-1 flex items-center gap-1.5">
              <Micro>{t(data.metricLabel)} · {t("by store")}</Micro>
              <AskAi
                topic={`${data.metricLabel} — store comparison`}
                topicId="compareTable"
                comparison={cmp}
                suggestions={["Which store moved the most?", "Why is one store ahead?"]}
              />
              <ChartInfo id="compareTable" />
            </div>
            <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Side by side")}</h2>
            <CompareBars data={scaled} labelA={`${t("Now")} · ${rangeLabel(a, true)}`} labelB={`${t("Before")} · ${rangeLabel(b, true)}`} moreLabels={extraLabels} format={chartFormat} />
            <div className="mt-3"><Legend items={legend} /></div>
          </Card>
          {data.pace && (
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Revenue pace · running total by day")}</Micro>
                <AskAi
                  topic="Revenue pace vs the comparison period"
                  topicId="comparePace"
                  comparison={cmp}
                  suggestions={["Are we ahead or behind?", "Is the gap from a strong final week?"]}
                />
                <ChartInfo id="comparePace" />
              </div>
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Is this period ahead or behind?")}</h2>
              <ComparePace a={data.pace.a} b={data.pace.bs[0]} more={data.pace.bs.slice(1)} labelA={`${t("Now")} · ${rangeLabel(a, true)}`} labelB={`${t("Before")} · ${rangeLabel(b, true)}`} moreLabels={extraLabels} />
              <p className="mt-3 text-xs leading-relaxed text-ink-dim">
                {t("Each line adds up revenue day by day. When the orange line sits above the dashed one, this period is ahead of the comparison at the same point.")}
              </p>
            </Card>
          )}
        </section>
      )}

      {data && mode === "groomers" && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Micro>{t(data.metricLabel)} · {t("per groomer")}</Micro>
            <AskAi
              topic={`${data.metricLabel} — groomer comparison`}
              topicId="compareTable"
              comparison={cmp}
              suggestions={["Which groomers moved the most?", "Who slipped between periods?"]}
            />
            <ChartInfo id="compareTable" />
          </div>
          <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Now vs before, ranked")}</h2>
          <CompareBars layout="rows" data={scaled} labelA={`${t("Now")} · ${rangeLabel(a, true)}`} labelB={`${t("Before")} · ${rangeLabel(b, true)}`} moreLabels={extraLabels} format={chartFormat} />
          <div className="mt-3"><Legend items={legend} /></div>
        </Card>
      )}

      {data && mode === "products" && movers.length > 0 && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Micro>{t(data.metricLabel)} · {t("biggest moves between periods")}</Micro>
            <AskAi
              topic={`${data.metricLabel} — winners and losers`}
              topicId="compareDiverging"
              comparison={cmp}
              suggestions={["What were the biggest gainers?", "What declined the most?"]}
            />
            <ChartInfo id="compareDiverging" />
          </div>
          <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Winners and losers")}</h2>
          <CompareDiverging data={movers} format={deltaFormat} />
          <p className="mt-3 text-xs leading-relaxed text-ink-dim">
            {data.pointDelta
              ? t("The biggest margin moves across every item, in percentage points — right improved, left slipped. Changes under 1 point are left out.")
              : t("The biggest moves across every item — right of the line sold more than in the comparison period, left sold less. Small changes are left out; the table below has the exact figures for your top sellers.")}
          </p>
        </Card>
      )}

      {/* Exact figures */}
      {data && (
      <Card pad={false}>
        <div className="px-5 pb-1 pt-5">
          <Micro>{t("Exact figures")} · {t(data.metricLabel).toLowerCase()}</Micro>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-dimmer">
                <th className="px-5 py-3 text-left font-normal">{t(entityLabel)}</th>
                {[...extras].reverse().map((r, i) => (
                  <th key={`xh${i}`} className="px-5 py-3 text-right font-normal">{rangeLabel(r, true)} · {r.start.slice(0, 4)}</th>
                ))}
                <th className="px-5 py-3 text-right font-normal">{t("Before")} · {rangeLabel(b, true)}</th>
                <th className="px-5 py-3 text-right font-normal">{t("Now")} · {rangeLabel(a, true)}</th>
                <th className="px-5 py-3 text-right font-normal">{t("Change")}{extras.length > 0 ? ` · ${t("vs previous")}` : ""}</th>
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
                  {extras.map((_, i) => {
                    const v = r.more?.[extras.length - 1 - i] ?? null;
                    return (
                      <td key={`xv${i}`} className="px-5 py-3 text-right font-mono text-ink-dimmer">{v == null ? "—" : fmt(v)}</td>
                    );
                  })}
                  <td className="px-5 py-3 text-right font-mono text-ink-dim">{r.b == null ? "—" : fmt(r.b)}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink">{r.a == null ? "—" : fmt(r.a)}</td>
                  <td className="px-5 py-3 text-right">
                    <Change a={r.a} b={r.b} points={data.pointDelta} t={t} />
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr className="border-t border-edge">
                  <td colSpan={4 + extras.length} className="px-5 py-8 text-center text-sm text-ink-dim">
                    {t("No data in these periods — try widening the dates (history starts {date}).").replace("{date}", new Date(`${bounds.min}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {data && mode === "products" && (
        <p className="-mt-2 text-sm">
          <Link href="/dashboard/products" className="text-orange transition-opacity hover:opacity-80">
            {t("Browse the full product list")} →
          </Link>
        </p>
      )}

      {(data?.notes ?? []).map((n, i) => (
        <p key={i} className="-mt-2 text-xs leading-relaxed text-ink-dimmer">{n}</p>
      ))}
    </div>
  );
}

const fmtBy = (format: CompareFormat) => (n: number) =>
  format === "money" ? fmtMoney(n) : format === "pct" ? pct(n) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

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

// One metric as a small multiple: a bar per period (oldest at the top, focus
// in orange) plus the change vs the previous period. Plain divs — no client
// chart needed at this size, so the overview stays fully server-rendered.
function MetricPanel({ label, format, values, periods, t }: { label: string; format: CompareFormat; values: (number | null)[]; periods: CompareRange[]; t: (s: string) => string }) {
  const f = fmtBy(format);
  const orderedIdx = [...values.keys()].reverse(); // side order is [focus, newest baseline, …]; display oldest first
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  // Same calendar window across years ("each year" preset) → label rows by
  // year; otherwise use the short range label.
  const shorts = periods.map((p) => rangeLabel(p, true));
  const rowLabel = (idx: number) => (shorts.every((s) => s === shorts[0]) ? periods[idx].start.slice(0, 4) : shorts[idx]);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <Micro>{label}</Micro>
        <Change a={values[0]} b={values[1] ?? null} points={format === "pct"} t={t} />
      </div>
      <div className="mt-3.5 space-y-2.5">
        {orderedIdx.map((idx) => {
          const v = values[idx];
          const focus = idx === 0;
          return (
            <div key={idx} className="flex items-center gap-3">
              <span className="w-[88px] shrink-0 truncate font-mono text-2xs uppercase tracking-[0.06em] text-ink-dimmer" title={rangeLabel(periods[idx])}>
                {rowLabel(idx)}
              </span>
              <div className="h-[14px] flex-1 overflow-hidden rounded bg-raise">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${v == null || max <= 0 ? 0 : Math.max(2, (v / max) * 100)}%`,
                    background: focus ? "var(--color-orange)" : "var(--color-series)",
                    opacity: focus ? 1 : 0.55,
                  }}
                />
              </div>
              <span className={`w-[72px] shrink-0 text-right font-mono text-xs tabular-nums ${focus ? "text-ink" : "text-ink-dim"}`}>
                {v == null ? "—" : f(v)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Period({ label, range, value, days, accent, t }: { label: string; range: CompareRange; value: number; days: number; accent?: boolean; t: (s: string) => string }) {
  return (
    <div className="bg-cell p-4">
      <Micro className={accent ? "!text-orange" : undefined}>{label}</Micro>
      <div className="mt-2.5 text-2xl font-semibold leading-none tracking-[-0.01em] tabular-nums">{fmtMoney(value)}</div>
      <div className="mt-2 text-xs text-ink-dim">
        {rangeLabel(range)} · {days} {days === 1 ? t("day") : t("days")}
      </div>
    </div>
  );
}

function Change({ a, b, points, t }: { a: number | null; b: number | null; points: boolean; t: (s: string) => string }) {
  if (a != null && (b == null || b === 0)) return <Tag tone="orange">{t("New")}</Tag>;
  if ((a == null || a === 0) && b != null && b > 0) return <Tag tone="muted">{t("No sales")}</Tag>;
  if (a == null || b == null || b === 0) return <span className="font-mono text-xs text-ink-dimmer">—</span>;
  if (points) {
    const d = (a - b) * 100;
    const good = d >= 0;
    return (
      <span className="font-mono text-xs tabular-nums" style={{ color: good ? "var(--color-good)" : "var(--color-bad)" }}>
        {good ? "+" : "−"}{Math.abs(d).toFixed(1)} {t("pts")}
      </span>
    );
  }
  return <Delta value={(a - b) / b} />;
}
