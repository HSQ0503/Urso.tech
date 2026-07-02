"use client";

// Interactive Team view. The roster is fetched on the server (data.server) and
// passed in; this component owns only the selected-groomer UI state.
//
// Every number here is real: revenue and appointments are period-scoped from
// FranPOS line items; return and attach are lifetime shares. Revenue per
// labour hour is intentionally absent until a labour-hours source exists
// (FranPOS timeclocks are broken at the vendor; QuickBooks payroll is the
// fallback).

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { type TeamRow } from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag, EmptyState, BarRanking, fmtMoney, pct } from "@/components/dashboard/ui";
import { CountUp, type CountFormat } from "@/components/dashboard/count-up";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { InfoTip } from "@/components/dashboard/info-tip";
import { groomerColHelp } from "@/components/dashboard/team-help";
import { useT } from "@/components/dashboard/locale-provider";

const dash = "—";
const pctOr = (v: number | null) => (v == null ? dash : pct(v));
const rise = (i: number) => ({ "--i": i } as CSSProperties);

export function TeamClient({ roster, scopeName, period, canWiden = false }: { roster: TeamRow[]; scopeName: string; period: string; canWiden?: boolean }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(() => roster[0]?.id ?? "");

  if (roster.length === 0) {
    return (
      <div className="space-y-10">
        <div className="dash-rise" style={rise(0)}>
          <PageHeader eyebrow={`${t("Team")} · ${scopeName} · ${period}`} title={t("Groomer performance")} />
        </div>
        <div className="dash-rise" style={rise(1)}>
          <EmptyState
            label={`${t("Team")} · ${period}`}
            title={t("No groomer activity for this period")}
            body={t("Revenue and appointments appear here once FranPOS attributes grooming lines in the selected scope.")}
            action={
              canWiden ? (
                <Link
                  href="/dashboard/team?month=all"
                  className="dash-pill inline-flex items-center rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-ink"
                >
                  {t("View last 12 months, all stores")}
                </Link>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  const selected = roster.find((g) => g.id === selectedId) ?? roster[0];
  const initials = selected.name.split(" ").map((p) => p[0]).join("");

  const ranking = roster.map((g) => ({ name: g.name, value: g.revenue, highlight: g.id === selected.id }));

  return (
    <div className="space-y-10">
      <div className="dash-rise" style={rise(0)}>
        <PageHeader
          eyebrow={`${t("Team")} · ${scopeName} · ${period}`}
          title={t("Groomer performance")}
        />
      </div>

      {/* Revenue ranking */}
      <div className="dash-rise" style={rise(1)}>
        <Card>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Micro>{t("Productivity")}</Micro>
                <AskAi
                  topic="Service revenue per groomer"
                  topicId="productivityRank"
                  suggestions={["Who are the top groomers?", "Read this next to return rate and attach"]}
                />
                <ChartInfo id="productivityRank" />
              </div>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">{t("Service revenue per groomer")}</h2>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">{roster.length} {t("groomers")}</span>
          </div>
          <BarRanking data={ranking} valueFmt={(n) => fmtMoney(n)} labelWidth={150} valueLabel={t("Service revenue")} />
        </Card>
      </div>

      <div className="dash-rise grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_1fr]" style={rise(2)}>
        {/* Scorecard */}
        <Card pad={false}>
          <div className="px-5 pb-3 pt-5">
            <Micro>{t("Scorecard")}</Micro>
            <div className="mt-1.5 flex items-center gap-1.5">
              <h2 className="text-[18px] font-medium tracking-[-0.01em]">{t("Groomer scorecard")}</h2>
              <InfoTip text={groomerColHelp(t)} />
            </div>
          </div>
          {/* Scrolls past ~8 rows so the card stays level with the profile. */}
          <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                  {["Groomer", "Revenue", "Appts", "Avg ticket", "Return", "Attach"].map((h, i) => (
                    <th key={h} className={`sticky top-0 bg-panel px-5 py-2.5 font-normal shadow-[inset_0_1px_0_var(--color-edge),inset_0_-1px_0_var(--color-edge)] ${i === 0 ? "text-left" : "text-right"}`}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((g) => {
                  const active = g.id === selected.id;
                  return (
                    <tr
                      key={g.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setSelectedId(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(g.id);
                        }
                      }}
                      className={`cursor-pointer border-t border-edge transition-colors hover:bg-raise active:bg-raise-strong ${active ? "bg-raise-strong" : ""}`}
                    >
                      <td className="relative px-5 py-3">
                        {active && <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{g.name}</span>
                          {g.flag === "star" && <Tag tone="good">{t("Top")}</Tag>}
                          {g.flag === "coach" && <Tag tone="orange">{t("Coach")}</Tag>}
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

        {/* Profile — hugs its content instead of stretching to the table's height.
            Keyed by the selection so a new groomer settles in rather than snapping. */}
        <Card className="self-start">
          <div key={selected.id} className="animate-stage-in flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-orange-soft font-mono text-[15px] text-orange">{initials}</div>
              <div className="min-w-0 flex-1">
                <div className="relative inline-block text-[16px] text-ink">
                  {selected.name}
                  {/* Win rule: the page's single dash-draw, only under the top performer. */}
                  {selected.flag === "star" && <span aria-hidden className="dash-draw absolute inset-x-0 -bottom-0.5 h-px bg-orange" />}
                </div>
                <Micro className="mt-0.5">{selected.store}</Micro>
              </div>
              {selected.flag === "star" && <span className="chip-in"><Tag tone="good">{t("Top groomer")}</Tag></span>}
              {selected.flag === "coach" && <span className="chip-in"><Tag tone="orange">{t("Coach")}</Tag></span>}
            </div>

            {selected.rebook != null && selected.rebook < 0.45 && (
              <div className="flex items-center gap-2 rounded-none border border-[rgba(254,81,0,0.35)] bg-orange-soft px-3.5 py-2.5">
                <span className="size-1.5 rounded-full bg-orange" />
                <span className="text-[12.5px] text-ink">{t("Return rate")} ({pct(selected.rebook)}) {t("is below the team floor — the clearest single thing to address.")}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <Stat label={t("Revenue")} value={selected.revenue} format="money" />
              <Stat label={t("Team share")} value={selected.share} format="pct" />
              <Stat label={t("Appts")} value={selected.appts} format="int" />
              <Stat label={t("Avg ticket")} value={selected.avgTicket} format="money" />
              <Stat label={t("Return")} value={selected.rebook} format="pct" />
              <Stat label={t("Attach")} value={selected.attach} format="pct" />
            </div>
          </div>
        </Card>
      </div>

      <p className="dash-rise text-[13px] leading-[1.6] text-ink-dim" style={rise(3)}>
        {t("Revenue, appointments and avg ticket reflect the selected period; return and attach are lifetime shares from the full FranPOS history (")}{dash}{t(" means too little history to say). Revenue per labour hour returns once labour-hours data is available — FranPOS timeclocks today, payroll as the fallback.")}
      </p>
    </div>
  );
}

// Raw number + format token so the value can tick up via CountUp — and re-tick
// on every roster selection. Null (too little history) stays a static dash.
function Stat({ label, value, format }: { label: string; value: number | null; format: CountFormat }) {
  return (
    <div className="rounded-none border border-edge bg-raise px-3 py-2.5">
      <Micro>{label}</Micro>
      <div className="mt-1 font-mono text-[15px] tabular-nums text-ink">
        {value == null ? dash : <CountUp value={value} format={format} />}
      </div>
    </div>
  );
}
