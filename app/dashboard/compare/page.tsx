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
  EmptyState,
  CompareBars,
  CompareDiverging,
  ComparePace,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { CountUp } from "@/components/dashboard/count-up";
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
  // The headline strip follows the selected measure. "All metrics" has no single
  // measure to follow, so it keeps revenue — and its label then reads correctly.
  const headline = data?.headline ?? { label: "Revenue", format: "money" as CompareFormat, additive: true, a: revenue.a, bs: revenue.bs as (number | null)[] };
  const headA = headline.a;
  const headB = headline.bs[0] ?? null;
  // Rate measures move in percentage POINTS; everything else in relative %.
  const headPoints = headline.format === "pct";
  const headDelta =
    headA != null && headB != null && headB !== 0 ? (headPoints ? headA - headB : (headA - headB) / headB) : null;
  const fmtHead = fmtBy(headline.format);
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
  // The "each year" preset compares the same calendar window across years, so
  // the short month/day label is identical for every period and the year is the
  // only thing telling them apart — carry it whenever the windows straddle years.
  const spansYears = new Set([a, ...bs].map((r) => r.start.slice(0, 4))).size > 1;
  const periodLabel = (r: CompareRange) => (spansYears ? `${rangeLabel(r, true)}, ${r.start.slice(0, 4)}` : rangeLabel(r, true));

  // Baselines step along one grey ramp, faintest = furthest back (see
  // PERIOD_COLORS in charts.tsx — same ramp, same order).
  const PERIOD_LEGEND_COLORS = ["var(--color-period-1)", "var(--color-period-2)", "var(--color-period-3)"];
  const extraLabels = extras.map(periodLabel);
  // Built in the same index order CompareBars colours them (so the formula is
  // identical), then reversed — the legend reads oldest → newest, matching the
  // left-to-right order of the bars.
  const legend = [
    ...extras
      .map((r, i) => ({ label: periodLabel(r), color: PERIOD_LEGEND_COLORS[(i + 1) % PERIOD_LEGEND_COLORS.length] }))
      .reverse(),
    { label: `${t("Before")} · ${periodLabel(b)}`, color: PERIOD_LEGEND_COLORS[0] },
    { label: `${t("Now")} · ${periodLabel(a)}`, color: "#fe5100" },
  ];
  const entityLabel = mode === "stores" ? "Store" : mode === "groomers" ? "Groomer" : "Item";
  // Resolved compare periods, handed to the in-page AskAi so chat knows exactly
  // what's being compared (the global month filter doesn't apply on this page).
  const cmp = data
    ? { aLabel: periodLabel(a), aStart: a.start, aEnd: a.end, bLabel: periodLabel(b), bStart: b.start, bEnd: b.end, metric: data.metricLabel }
    : undefined;
  const headlineCols = ["md:grid-cols-3", "md:grid-cols-4", "md:grid-cols-5"][extras.length] ?? "md:grid-cols-3";

  return (
    <div className="space-y-3">
      <div className="dash-rise" style={{ "--i": 0 } as React.CSSProperties}>
        <PageHeader
          eyebrow={`${t("Compare")} · ${rangeLabel(a)} ${t("vs")} ${rangeLabel(b)}${scopeNote}`}
          title={t("Compare anything")}
        />
      </div>

      <div className="dash-rise" style={{ "--i": 1 } as React.CSSProperties}>
        <CompareControls key={[a, ...bs].map((r) => `${r.start}${r.end}`).join("")} mode={mode} preset={preset} metric={metricKey} a={a} bs={bs} minDate={bounds.min} maxDate={bounds.max} />
      </div>

      {warnings.map((w, i) => (
        <p key={i} className="dash-rise flex items-start gap-2 text-[13px] leading-[1.5] text-ink-dim" style={{ "--i": 2 } as React.CSSProperties}>
          <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-orange" />
          {w}
        </p>
      ))}

      {/* Headline: the selected measure across every period, oldest first */}
      <section className={`dash-rise grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge ${headlineCols}`} style={{ "--i": 2 } as React.CSSProperties}>
        {[...extras].reverse().map((r, i) => (
          <Period key={`x${i}`} label={r.start.slice(0, 4)} range={r} value={headline.bs[extras.length - i] ?? null} format={headline.format} days={dayInfo.bs[extras.length - i]} t={t} />
        ))}
        <Period label={t("Compared against")} range={b} value={headB} format={headline.format} days={dayInfo.bs[0]} t={t} />
        <Period label={t("This period")} range={a} value={headA} format={headline.format} days={dayInfo.a} accent win={headDelta != null && headDelta >= 0} t={t} />
        <div className="col-span-2 bg-cell p-4 md:col-span-1">
          <Micro>{t("Change")} · {t(headline.label)}{extras.length > 0 ? ` · ${t("vs previous")}` : ""}</Micro>
          <div className="mt-2.5 flex items-baseline gap-2.5">
            <span
              className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums"
              style={headDelta == null ? undefined : { color: headDelta >= 0 ? "var(--color-good)" : "#fe5100" }}
            >
              {headDelta == null ? "—" : (
                <>
                  {headDelta >= 0 ? "+" : "−"}
                  {headPoints ? (
                    <>{Math.abs(headDelta * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })} {t("pts")}</>
                  ) : (
                    <CountUp value={Math.abs(headDelta)} format="pct" />
                  )}
                </>
              )}
            </span>
            {headline.additive && dayInfo.a !== dayInfo.bs[0] && (
              <span className="text-[11.5px] text-ink-dim">{t("totals · lengths differ")}</span>
            )}
          </div>
          {headline.additive && dayInfo.a !== dayInfo.bs[0] && headA != null && headB != null && headB > 0 && (
            <div className="mt-2 text-[12px] text-ink-dim">
              {t("Per day")}: {fmtHead(headA / dayInfo.a)} {t("vs")} {fmtHead(headB / dayInfo.bs[0])}
            </div>
          )}
        </div>
      </section>

      {/* All metrics: one small-multiple panel per metric, totals per period */}
      {overview && (
        <section className="dash-rise" style={{ "--i": 3 } as React.CSSProperties}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <Micro>{t("All metrics")} · {t("totals for")} {scopeLabel(scope)}</Micro>
              <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">{t("Every metric, period by period")}</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.metrics.map((m) => (
              <MetricPanel key={m.key} label={t(m.label)} format={m.format} values={m.values} periods={[a, ...bs]} t={t} />
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-dimmer">
            {t("Each panel totals the selected scope across the periods, oldest at the top; the chip is the change vs the previous period.")} {t("Pick a single metric above for the per-{entity} breakdown, charts and exact figures.").replace("{entity}", t(entityLabel).toLowerCase())}
          </p>
        </section>
      )}

      {/* What stands out */}
      {data && data.insights.length > 0 && (
        <div className="dash-rise" style={{ "--i": 3 } as React.CSSProperties}>
        <Card className="flex flex-col gap-3">
          <Micro className="!text-orange">{t("What stands out")}</Micro>
          <ul className="space-y-2">
            {data.insights.map((s, i) => (
              <li key={i} className="text-[14px] leading-[1.55] text-ink">{s}</li>
            ))}
          </ul>
        </Card>
        </div>
      )}

      {/* Mode-specific visuals */}
      {data && mode === "stores" && (
        <section className="dash-rise grid grid-cols-1 gap-3 xl:grid-cols-2" style={{ "--i": 4 } as React.CSSProperties}>
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
            <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Side by side")}</h2>
            <CompareBars data={scaled} labelA={`${t("Now")} · ${periodLabel(a)}`} labelB={`${t("Before")} · ${periodLabel(b)}`} moreLabels={extraLabels} format={chartFormat} />
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
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Is this period ahead or behind?")}</h2>
              <ComparePace a={data.pace.a} b={data.pace.bs[0]} more={data.pace.bs.slice(1)} labelA={`${t("Now")} · ${periodLabel(a)}`} labelB={`${t("Before")} · ${periodLabel(b)}`} moreLabels={extraLabels} />
              <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-dim">
                {t("Each line adds up revenue day by day. When the orange line sits above the dashed one, this period is ahead of the comparison at the same point.")}
              </p>
            </Card>
          )}
        </section>
      )}

      {data && mode === "groomers" && (
        <div className="dash-rise" style={{ "--i": 4 } as React.CSSProperties}>
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
          <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Now vs before, ranked")}</h2>
          <CompareBars layout="rows" data={scaled} labelA={`${t("Now")} · ${periodLabel(a)}`} labelB={`${t("Before")} · ${periodLabel(b)}`} moreLabels={extraLabels} format={chartFormat} />
          <div className="mt-3"><Legend items={legend} /></div>
        </Card>
        </div>
      )}

      {/* Absence is narrated, not hidden — an empty movers list is a data fact. */}
      {data && mode === "products" && (
        <div className="dash-rise" style={{ "--i": 4 } as React.CSSProperties}>
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
          <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Winners and losers")}</h2>
          {movers.length > 0 ? (
            <>
              <CompareDiverging data={movers} format={deltaFormat} />
              <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-dim">
                {data.pointDelta
                  ? t("The biggest margin moves across every item, in percentage points — right improved, left slipped. Changes under 1 point are left out.")
                  : t("The biggest moves across every item — right of the line sold more than in the comparison period, left sold less. Small changes are left out; the table below has the exact figures for your top sellers.")}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] leading-[1.5] text-ink-dim">
              {t("Nothing moved more than the threshold between these periods — the table below has the exact figures.")}
            </p>
          )}
        </Card>
        </div>
      )}

      {/* Exact figures */}
      {data && (
      <div className="dash-rise" style={{ "--i": 5 } as React.CSSProperties}>
      <Card pad={false}>
        <div className="px-5 pb-1 pt-5">
          <Micro>{t("Exact figures")} · {t(data.metricLabel).toLowerCase()}</Micro>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                <th className="px-5 py-3 text-left font-normal">{t(entityLabel)}</th>
                {[...extras].reverse().map((r, i) => (
                  <th key={`xh${i}`} className="px-5 py-3 text-right font-normal">{periodLabel(r)}</th>
                ))}
                <th className="px-5 py-3 text-right font-normal">{t("Before")} · {periodLabel(b)}</th>
                <th className="px-5 py-3 text-right font-normal">{t("Now")} · {periodLabel(a)}</th>
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
                  <td colSpan={4 + extras.length} className="p-5">
                    <EmptyState
                      label={t("No overlapping data")}
                      title={t("Nothing to compare in these periods")}
                      body={t("No data in these periods — try widening the dates (history starts {date}).").replace("{date}", new Date(`${bounds.min}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }))}
                      action={
                        <Link
                          href="/dashboard/compare?preset=mom"
                          className="dash-press rounded-sm border border-edge px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
                        >
                          {t("Reset to this month vs last month")}
                        </Link>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
      )}

      {data && mode === "products" && (
        <p className="dash-rise -mt-2 text-[13px]" style={{ "--i": 5 } as React.CSSProperties}>
          <Link href="/dashboard/products" className="text-orange transition-opacity hover:opacity-80">
            {t("Browse the full product list")} →
          </Link>
        </p>
      )}

      {(data?.notes ?? []).map((n, i) => (
        <p key={i} className="dash-rise -mt-2 text-[12.5px] leading-[1.5] text-ink-dimmer" style={{ "--i": 5 } as React.CSSProperties}>{n}</p>
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
        {orderedIdx.map((idx, pos) => {
          const v = values[idx];
          const focus = idx === 0;
          return (
            <div key={idx} className="flex items-center gap-3">
              <span className="w-[88px] shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dimmer" title={rangeLabel(periods[idx])}>
                {rowLabel(idx)}
              </span>
              <div className="h-[14px] flex-1 overflow-hidden rounded bg-raise">
                <div
                  className="meter-fill h-full rounded"
                  style={{
                    width: `${v == null || max <= 0 ? 0 : Math.max(2, (v / max) * 100)}%`,
                    background: focus ? "#fe5100" : "var(--color-series)",
                    opacity: focus ? 1 : 0.55,
                    "--reveal-delay": `${120 + pos * 70}ms`,
                  } as React.CSSProperties}
                />
              </div>
              <span className={`w-[72px] shrink-0 text-right font-mono text-[11.5px] tabular-nums ${focus ? "text-ink" : "text-ink-dim"}`}>
                {v == null ? "—" : f(v)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// `win` draws the single orange hairline — one per page, only under "This
// period" when the delta is positive.
// CompareFormat is the server-side token; CountUp speaks its own. A period with
// no value for the selected measure (no retail sales, no appointments) reads as
// an em dash — never a zero, which would claim something the data doesn't say.
const countFormat = (f: CompareFormat) => (f === "money" ? "money" : f === "pct" ? "pct" : "int");

function Period({ label, range, value, format, days, accent, win, t }: { label: string; range: CompareRange; value: number | null; format: CompareFormat; days: number; accent?: boolean; win?: boolean; t: (s: string) => string }) {
  return (
    <div className="bg-cell p-4">
      <Micro className={accent ? "!text-orange" : undefined}>{label}</Micro>
      <div className="relative mt-2.5 text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {value == null ? <span className="text-ink-dimmer">—</span> : <CountUp value={value} format={countFormat(format)} />}
        {/* absolute so the win underline never shifts the cell's baseline grid */}
        {win && <div aria-hidden className="dash-draw absolute -bottom-[5px] left-0 h-px w-full bg-orange" />}
      </div>
      <div className="mt-2 text-[12px] text-ink-dim">
        {rangeLabel(range)} · {days} {days === 1 ? t("day") : t("days")}
      </div>
    </div>
  );
}

function Change({ a, b, points, t }: { a: number | null; b: number | null; points: boolean; t: (s: string) => string }) {
  if (a != null && (b == null || b === 0)) return <Tag tone="orange">{t("New")}</Tag>;
  if ((a == null || a === 0) && b != null && b > 0) return <Tag tone="muted">{t("No sales")}</Tag>;
  if (a == null || b == null || b === 0) return <span className="font-mono text-[12px] text-ink-dimmer">—</span>;
  if (points) {
    const d = (a - b) * 100;
    const good = d >= 0;
    return (
      <span className="font-mono text-[12px] tabular-nums" style={{ color: good ? "var(--color-good)" : "#fe5100" }}>
        {good ? "+" : "−"}{Math.abs(d).toFixed(1)} {t("pts")}
      </span>
    );
  }
  return <Delta value={(a - b) / b} />;
}
