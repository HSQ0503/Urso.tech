"use client";

import { useState } from "react";
import { groomers, type Groomer } from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag, CohortCurve, fmtMoney, pct } from "@/components/dashboard/ui";

// Synthesize a full profile from a scorecard row so every groomer is clickable.
function profileFor(g: Groomer) {
  const clientBook = Math.round(g.appts * 2.3);
  const loyal = Math.round(clientBook * (0.3 + g.rebook * 0.3));
  const requestRate = Math.min(0.6, g.rebook * 0.78);
  const redo = g.flag === "coach" ? 0.06 : 0.02;
  // retention cohort: better rebook -> flatter decay
  const decay = 1 - g.rebook * 0.55;
  const cohort = Array.from({ length: 8 }, (_, i) => Math.round(100 * Math.pow(1 - decay * 0.18, i)));
  const initials = g.name.split(" ").map((p) => p[0]).join("");
  const coaching =
    g.flag === "star"
      ? "Highest revenue per hour and request rate on the team. Their loyal client base is also a retention risk for the business, and worth protecting."
      : g.flag === "coach"
        ? `Strong in the chair, but rebooking (${pct(g.rebook)}) and retail attachment (${pct(g.attach)}) trail the company average. The clearest opportunity is the rebooking process.`
        : "Consistent all-rounder. The clearest opportunity is moving retail attachment closer to the top performers.";
  return { clientBook, loyal, requestRate, redo, cohort, initials, coaching };
}

export default function TeamPage() {
  const [selectedId, setSelectedId] = useState(groomers[0].id);
  const selected = groomers.find((g) => g.id === selectedId)!;
  const p = profileFor(selected);

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow="Team · Last 30 days"
        title="Groomer performance"
        sub="Ranked by overall value — revenue per hour, customer retention, and average ticket — rather than appointment volume alone. Select a groomer to view their full profile."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
        {/* Scorecard */}
        <Card pad={false}>
          <div className="px-5 pb-3 pt-5">
            <Micro>Scorecard</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Groomer scorecard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
              <thead>
                <tr className="border-t border-edge font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                  {["Groomer", "$/hr", "Appts", "Rebook", "Attach", "Util"].map((h, i) => (
                    <th key={h} className={`px-5 py-2.5 font-normal ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groomers.map((g) => {
                  const active = g.id === selectedId;
                  return (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className={`cursor-pointer border-t border-edge transition-colors hover:bg-white/[0.03] ${active ? "bg-white/[0.04]" : ""}`}
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
                      <td className="px-5 py-3 text-right font-mono text-ink">{fmtMoney(g.revPerHr)}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink-dim">{g.appts}</td>
                      <td className="px-5 py-3 text-right font-mono" style={{ color: g.rebook < 0.45 ? "#fe5100" : undefined }}>{pct(g.rebook)}</td>
                      <td className="px-5 py-3 text-right font-mono" style={{ color: g.attach < 0.25 ? "#fe5100" : undefined }}>{pct(g.attach)}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink-dim">{pct(g.util)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Profile */}
        <Card className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-orange-soft font-mono text-[15px] text-orange">{p.initials}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] text-ink">{selected.name}</div>
              <Micro className="mt-0.5">{selected.store}</Micro>
            </div>
            {selected.flag === "star" && <Tag tone="good">Top groomer</Tag>}
            {selected.flag === "coach" && <Tag tone="orange">Coach</Tag>}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="$/labor hr" value={fmtMoney(selected.revPerHr)} />
            <Stat label="Rebook" value={pct(selected.rebook)} />
            <Stat label="Requests" value={pct(p.requestRate)} />
            <Stat label="Attach" value={pct(selected.attach)} />
            <Stat label="Client book" value={String(p.clientBook)} />
            <Stat label="Redo rate" value={pct(p.redo)} />
          </div>

          <div className="border-t border-edge pt-4">
            <Micro className="mb-3">Their client retention — % still active</Micro>
            <CohortCurve data={p.cohort} />
          </div>

          <div className="rounded-xl border border-edge bg-white/[0.02] p-4">
            <Micro>Assessment</Micro>
            <p className="mt-2 text-[13px] leading-[1.55] text-ink-dim">{p.coaching}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-white/[0.015] px-3 py-2.5">
      <Micro>{label}</Micro>
      <div className="mt-1 font-mono text-[15px] text-ink">{value}</div>
    </div>
  );
}
