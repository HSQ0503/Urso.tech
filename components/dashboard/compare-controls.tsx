"use client";

// Controls for the Compare page. All state lives in the URL (?mode, ?preset,
// ?a, ?b, ?metric) so every comparison is shareable and the page itself stays
// a server component. Custom ranges are applied explicitly (Apply button) so
// half-edited dates never trigger a fetch. Custom mode allows up to three
// baseline periods (?b= holds them comma-separated) — enough for "this June
// vs the last two Junes" without turning the chart into noise.

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

  return (
    <div className="space-y-4 rounded-2xl border border-edge bg-panel p-5">
      <Row label="Compare">
        {COMPARE_MODES.map((m) => (
          <Chip key={m.value} active={mode === m.value} onClick={() => push({ mode: m.value, metric: null })}>
            {m.label}
          </Chip>
        ))}
      </Row>

      <Row label="Period">
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
        <div className="space-y-3 border-t border-edge pt-4">
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
                    className="rounded-lg border border-edge px-2 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => push({ preset: "custom", a: `${draftA.start}..${draftA.end}`, b: draftBs.map((b) => `${b.start}..${b.end}`).join(",") })}
              className="rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110"
            >
              Apply
            </button>
            {draftBs.length < MAX_BASELINES && (
              <button
                onClick={() => setDraftBs([...draftBs, draftBs[draftBs.length - 1]])}
                className="rounded-lg border border-edge px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
              >
                + Add another period
              </button>
            )}
          </div>
        </div>
      )}

      <Row label="Metric">
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
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
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
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{label}</div>
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
      className="rounded-lg border border-edge bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-ink [color-scheme:dark] focus:border-orange/60 focus:outline-none"
    />
  );
}
