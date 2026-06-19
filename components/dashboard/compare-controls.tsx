"use client";

// Controls for the Compare page, framed as a guided two-step so the question
// reads as a sentence: (1) WHAT to compare — break down by + measure, then
// (2) OVER WHICH PERIODS. A resolved "Comparing A vs B" line states the actual
// windows so the comparison is never left implicit. All state lives in the URL
// (?mode, ?preset, ?a, ?b, ?metric) so every comparison stays shareable and the
// page itself stays a server component.
//
// Custom dates: one-click quick ranges fill the focus period AND auto-derive a
// like-for-like baseline (apply immediately); the date inputs are for
// fine-tuning and are Apply-gated so a half-edited date never triggers a fetch.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  COMPARE_MODES,
  COMPARE_PRESETS,
  COMPARE_METRICS,
  type CompareMode,
  type ComparePreset,
} from "./data";

const MAX_BASELINES = 3;

type Range = { start: string; end: string };
type Props = {
  mode: CompareMode;
  preset: ComparePreset;
  metric: string;
  a: Range;
  bs: Range[];
  minDate: string;
  maxDate: string;
};

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (r: Range) => Math.round((utc(r.end).getTime() - utc(r.start).getTime()) / 86400000) + 1;
const addDaysIso = (s: string, n: number) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const shiftYearIso = (s: string, n: number) => { const d = utc(s); d.setUTCFullYear(d.getUTCFullYear() + n); return isoOf(d); };
const firstOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const eqRange = (x: Range, y: Range) => x.start === y.start && x.end === y.end;

// Compact range label: a single day carries its weekday; a span drops the start
// year when both ends share it ("Jun 1 – 18, 2026").
function fmtRange(r: Range): string {
  const f = (s: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(utc(s));
  if (r.start === r.end) return f(r.start, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
  const start = f(r.start, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${f(r.end, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function CompareControls({ mode, preset, metric, a, bs, minDate, maxDate }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [draftA, setDraftA] = useState(a);
  const [draftBs, setDraftBs] = useState<Range[]>(bs);

  const push = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`/dashboard/compare?${params.toString()}`, { scroll: false });
  };

  const setB = (i: number, r: Range) => setDraftBs(draftBs.map((b, j) => (j === i ? r : b)));

  // --- custom-date helpers --------------------------------------------------
  const clamp = (r: Range): Range => ({
    start: r.start < minDate ? minDate : r.start > maxDate ? maxDate : r.start,
    end: r.end > maxDate ? maxDate : r.end < minDate ? minDate : r.end,
  });
  // Baseline = the equal-length window immediately before A.
  const prevPeriod = (r: Range): Range => {
    const end = addDaysIso(r.start, -1);
    return clamp({ start: addDaysIso(end, -(daysIn(r) - 1)), end });
  };
  const lastYear = (r: Range): Range => clamp({ start: shiftYearIso(r.start, -1), end: shiftYearIso(r.end, -1) });

  const lastMonthEnd = addDaysIso(firstOfMonth(maxDate), -1);
  const QUICK: { label: string; a: Range }[] = [
    { label: "This month", a: clamp({ start: firstOfMonth(maxDate), end: maxDate }) },
    { label: "Last month", a: clamp({ start: firstOfMonth(lastMonthEnd), end: lastMonthEnd }) },
    { label: "Last 7 days", a: clamp({ start: addDaysIso(maxDate, -6), end: maxDate }) },
    { label: "Last 30 days", a: clamp({ start: addDaysIso(maxDate, -29), end: maxDate }) },
    { label: "Last 90 days", a: clamp({ start: addDaysIso(maxDate, -89), end: maxDate }) },
    { label: "Year to date", a: clamp({ start: `${maxDate.slice(0, 4)}-01-01`, end: maxDate }) },
  ];

  const applyRanges = (aR: Range, bsR: Range[]) =>
    push({ preset: "custom", a: `${aR.start}..${aR.end}`, b: bsR.map((b) => `${b.start}..${b.end}`).join(",") });
  const applyQuick = (aR: Range) => { const b = prevPeriod(aR); setDraftA(aR); setDraftBs([b]); applyRanges(aR, [b]); };
  const applyBaseline = (bR: Range) => { setDraftBs([bR]); applyRanges(draftA, [bR]); };

  const prevB = prevPeriod(draftA);
  const yearB = lastYear(draftA);
  const dirty = !eqRange(draftA, a) || draftBs.length !== bs.length || draftBs.some((b, i) => !eqRange(b, bs[i]));

  const dA = daysIn(a);
  const dB = daysIn(bs[0]);
  const extras = bs.length - 1;
  const lengthNote = dA === dB ? `${dA} ${dA === 1 ? "day" : "days"} each` : `${dA} vs ${dB} days`;

  return (
    <div className="space-y-5 rounded-none border border-edge bg-panel p-5">
      {/* Step 1 — what to compare */}
      <div className="space-y-3">
        <StepLabel n="1" title="What to compare" />
        <Row label="Break down">
          {COMPARE_MODES.map((m) => (
            <Chip key={m.value} active={mode === m.value} onClick={() => push({ mode: m.value, metric: null })}>
              {m.label}
            </Chip>
          ))}
        </Row>
        <Row label="Measure">
          <Chip active={metric === "all"} onClick={() => push({ metric: "all" })}>
            All metrics
          </Chip>
          {COMPARE_METRICS[mode].map((m) => (
            <Chip key={m.key} active={metric === m.key} onClick={() => push({ metric: m.key })}>
              {m.label}
            </Chip>
          ))}
        </Row>
      </div>

      <div className="h-px bg-edge" />

      {/* Step 2 — over which periods */}
      <div className="space-y-3">
        <StepLabel n="2" title="Over which periods" />
        <Row label="Compare">
          {COMPARE_PRESETS.map((p) => (
            <Chip
              key={p.value}
              active={preset === p.value}
              onClick={() => (p.value === "custom" ? push({ preset: "custom" }) : push({ preset: p.value, a: null, b: null }))}
            >
              {p.label}
            </Chip>
          ))}
        </Row>

        {preset === "custom" && (
          <div className="space-y-4 border-t border-edge pt-4">
            {/* One click fills the focus period AND a like-for-like baseline. */}
            <div className="space-y-2">
              <SubLabel>This period — quick pick</SubLabel>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <Chip key={q.label} active={eqRange(draftA, q.a)} onClick={() => applyQuick(q.a)}>
                    {q.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <SubLabel>Compare against</SubLabel>
              <div className="flex flex-wrap gap-2">
                <Chip active={draftBs.length === 1 && eqRange(draftBs[0], prevB)} onClick={() => applyBaseline(prevB)}>
                  Previous period
                </Chip>
                <Chip active={draftBs.length === 1 && eqRange(draftBs[0], yearB)} onClick={() => applyBaseline(yearB)}>
                  Same dates, last year
                </Chip>
              </div>
            </div>

            <div className="space-y-3">
              <SubLabel>Or set exact dates</SubLabel>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <RangeInputs label="This period (A)" value={draftA} onChange={setDraftA} min={minDate} max={maxDate} />
                {draftBs.map((b, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <RangeInputs
                      label={i === 0 ? "Compare against (B)" : `And also (${String.fromCharCode(67 + i - 1)})`}
                      value={b}
                      onChange={(r) => setB(i, r)}
                      min={minDate}
                      max={maxDate}
                    />
                    {i > 0 && (
                      <button
                        onClick={() => setDraftBs(draftBs.filter((_, j) => j !== i))}
                        aria-label="Remove this period"
                        className="rounded-sm border border-edge px-2 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {dirty && (
                <p className="text-[12px] text-ink-dim">
                  Will compare <span className="font-medium text-orange">{fmtRange(draftA)}</span> vs{" "}
                  <span className="font-medium text-ink">{fmtRange(draftBs[0])}</span>
                  <span className="text-ink-dimmer"> · {daysIn(draftA) === daysIn(draftBs[0]) ? `${daysIn(draftA)} days each` : `${daysIn(draftA)} vs ${daysIn(draftBs[0])} days`}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => applyRanges(draftA, draftBs)}
                  disabled={!dirty}
                  className={`rounded-sm px-4 py-2 text-[13px] font-medium transition ${
                    dirty ? "cursor-pointer bg-orange text-[#070707] hover:brightness-110" : "cursor-default border border-edge text-ink-dimmer"
                  }`}
                >
                  {dirty ? "Apply" : "Applied"}
                </button>
                {draftBs.length < MAX_BASELINES && (
                  <button
                    onClick={() => setDraftBs([...draftBs, draftBs[draftBs.length - 1]])}
                    className="cursor-pointer rounded-sm border border-edge px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
                  >
                    + Add another period
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-edge" />

      {/* The resolved comparison — stated plainly so it's never left implicit. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Comparing</span>
        <span className="text-[14px] font-medium tracking-[-0.01em] text-orange">{fmtRange(a)}</span>
        <span className="text-[13px] text-ink-dim">vs</span>
        <span className="text-[14px] font-medium tracking-[-0.01em] text-ink">{fmtRange(bs[0])}</span>
        {extras > 0 && <span className="text-[12.5px] text-ink-dim">+ {extras} earlier {extras === 1 ? "period" : "periods"}</span>}
        <span className="text-ink-dimmer">·</span>
        <span className="text-[12.5px] text-ink-dim">{lengthNote}</span>
      </div>
    </div>
  );
}

function StepLabel({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-[18px] place-items-center rounded-sm bg-orange-soft font-mono text-[10px] font-medium text-orange">{n}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">{title}</span>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[78px] shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-sm border px-3 py-1.5 text-[12.5px] transition-colors ${
        active
          ? "border-[rgba(254,81,0,0.45)] bg-orange-soft text-orange"
          : "border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function RangeInputs({ label, value, onChange, min, max }: { label: string; value: Range; onChange: (r: Range) => void; min: string; max: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{label}</span>
        <span className="font-mono text-[10px] text-ink-dimmer">· {daysIn(value)}d</span>
      </div>
      <div className="flex items-center gap-2">
        <DateInput value={value.start} min={min} max={max} onChange={(start) => onChange({ ...value, start })} />
        <span className="text-[12px] text-ink-dimmer">to</span>
        <DateInput value={value.end} min={min} max={max} onChange={(end) => onChange({ ...value, end })} />
      </div>
    </div>
  );
}

function DateInput({ value, min, max, onChange }: { value: string; min: string; max: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-sm border border-edge bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-ink focus:border-orange/60 focus:outline-none"
    />
  );
}
