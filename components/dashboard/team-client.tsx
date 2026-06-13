"use client";

// Interactive Team view. The roster is fetched on the server (data.server) and
// passed in; this component owns only the selected-groomer UI state.
//
// Every number here is real: revenue and appointments are period-scoped from
// FranPOS line items; return and attach are lifetime shares. Revenue per
// labour hour is intentionally absent until a labour-hours source exists
// (FranPOS timeclocks are broken at the vendor; QuickBooks payroll is the
// fallback).

import { useState } from "react";
import { type TeamRow } from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag, BarRanking, fmtMoney, pct } from "@/components/dashboard/ui";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { InfoTip } from "@/components/dashboard/info-tip";
import { GROOMER_COL_HELP } from "@/components/dashboard/team-help";

const dash = "—";
const pctOr = (v: number | null) => (v == null ? dash : pct(v));

export function TeamClient({ roster, scopeName, period }: { roster: TeamRow[]; scopeName: string; period: string }) {
  const [selectedId, setSelectedId] = useState(() => roster[0]?.id ?? "");

  if (roster.length === 0) {
    return (
      <div className="animate-stage-in">
        <PageHeader eyebrow={`Team · ${scopeName} · ${period}`} title="Groomer performance" sub="No groomer activity on record for this location and period." />
      </div>
    );
  }

  const selected = roster.find((g) => g.id === selectedId) ?? roster[0];
  const initials = selected.name.split(" ").map((p) => p[0]).join("");

  const ranking = roster.map((g) => ({ name: g.name, value: g.revenue, highlight: g.id === selected.id }));

  return (
    <div className="animate-stage-in space-y-10">
      <PageHeader
        eyebrow={`Team · ${scopeName} · ${period}`}
        title="Groomer performance"
        sub="A coaching view, not a leaderboard — ranked by service revenue for the selected period, alongside retention and retail attachment. Select a groomer to see their full profile."
      />

      {/* Revenue ranking */}
      <Card>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>Productivity</Micro>
              <ChartInfo id="productivityRank" />
            </div>
            <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Service revenue per groomer</h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">{roster.length} groomers</span>
        </div>
        <BarRanking data={ranking} valueFmt={(n) => fmtMoney(n)} labelWidth={130} valueLabel="Service revenue" />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
        {/* Scorecard */}
        <Card pad={false}>
          <div className="px-5 pb-3 pt-5">
            <Micro>Scorecard</Micro>
            <div className="mt-1.5 flex items-center gap-1.5">
              <h2 className="text-[18px] font-medium tracking-[-0.01em]">Groomer scorecard</h2>
              <InfoTip text={GROOMER_COL_HELP} />
            </div>
          </div>
          {/* Scrolls past ~8 rows so the card stays level with the profile. */}
          <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                  {["Groomer", "Revenue", "Appts", "Avg ticket", "Return", "Attach"].map((h, i) => (
                    <th key={h} className={`sticky top-0 bg-panel px-5 py-2.5 font-normal shadow-[inset_0_1px_0_var(--color-edge),inset_0_-1px_0_var(--color-edge)] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((g) => {
                  const active = g.id === selected.id;
                  return (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className={`cursor-pointer border-t border-edge transition-colors hover:bg-raise ${active ? "bg-raise-strong" : ""}`}
                    >
                      <td className="relative px-5 py-3">
                        {active && <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{g.name}</span>
                          {g.flag === "star" && <Tag tone="good">Top</Tag>}
                          {g.flag === "coach" && <Tag tone="orange">Coach</Tag>}
                        </div>
                        <Micro className="mt-0.5">{g.store}</Micro>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink">{fmtMoney(g.revenue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink-dim">{g.appts}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink-dim">{fmtMoney(g.avgTicket)}</td>
                      <td className="px-5 py-3 text-right font-mono" style={{ color: g.rebook != null && g.rebook < 0.45 ? "#fe5100" : undefined }}>{pctOr(g.rebook)}</td>
                      <td className="px-5 py-3 text-right font-mono" style={{ color: g.attach != null && g.attach < 0.25 ? "#fe5100" : undefined }}>{pctOr(g.attach)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Profile — hugs its content instead of stretching to the table's height */}
        <Card className="flex flex-col gap-5 self-start">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-orange-soft font-mono text-[15px] text-orange">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] text-ink">{selected.name}</div>
              <Micro className="mt-0.5">{selected.store}</Micro>
            </div>
            {selected.flag === "star" && <Tag tone="good">Top groomer</Tag>}
            {selected.flag === "coach" && <Tag tone="orange">Coach</Tag>}
          </div>

          {selected.rebook != null && selected.rebook < 0.45 && (
            <div className="flex items-center gap-2 rounded-xl border border-[rgba(254,81,0,0.35)] bg-orange-soft px-3.5 py-2.5">
              <span className="size-1.5 rounded-full bg-orange" />
              <span className="text-[12.5px] text-ink">Return rate ({pct(selected.rebook)}) is below the team floor — the clearest single thing to address.</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Revenue" value={fmtMoney(selected.revenue)} />
            <Stat label="Team share" value={pct(selected.share)} />
            <Stat label="Appts" value={String(selected.appts)} />
            <Stat label="Avg ticket" value={fmtMoney(selected.avgTicket)} />
            <Stat label="Return" value={pctOr(selected.rebook)} />
            <Stat label="Attach" value={pctOr(selected.attach)} />
          </div>
        </Card>
      </div>

      <p className="-mt-4 text-[13px] leading-[1.6] text-ink-dim">
        Revenue, appointments and avg ticket reflect the selected period; return and attach are lifetime shares from the full FranPOS history ({dash} means too little history to say). Revenue per labour hour returns once labour-hours data is available — FranPOS timeclocks today, payroll as the fallback.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-raise px-3 py-2.5">
      <Micro>{label}</Micro>
      <div className="mt-1 font-mono text-[15px] text-ink">{value}</div>
    </div>
  );
}
