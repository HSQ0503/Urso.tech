import {
  scopeLabel,
  monthLabel,
  actionStatusLabel,
  type ActionStatus,
  type StoreId,
  type MonthValue,
} from "@/components/dashboard/data";
import {
  getManagerFocus,
  getManagerScorecard,
  getStoreRanking,
  getStoreScores,
  getAgentActionsForStore,
  getGroomersForStore,
  getCustomersNeedingAttention,
} from "@/components/dashboard/data.server";
import { Card, Micro, Tag, Delta, Meter, BarRanking, WelcomeBanner, fmtMoney, pct } from "@/components/dashboard/ui";
import { ActionItemCard } from "@/components/dashboard/action-item-card";
import { StoreScoreboard } from "@/components/dashboard/store-scoreboard";
import { InfoTip } from "@/components/dashboard/info-tip";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { GROOMER_COL_HELP } from "@/components/dashboard/team-help";

const GREEN = "var(--color-good)";
const ORANGE = "#fe5100";

const statusTone: Record<ActionStatus, "muted" | "orange" | "good" | "warn"> = {
  suggested: "orange",
  approved: "muted",
  running: "warn",
  completed: "good",
};

const shorten = (name: string) => name.replace(" Village", "");

export async function ManagerHome({ store, month, userName, streak }: { store: StoreId; month: MonthValue; userName: string; streak: number }) {
  const storeName = scopeLabel(store);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);
  const [focus, scorecard, rebookRank, answeredRank, scores, actions, team, watch] = await Promise.all([
    getManagerFocus(store, month),
    getManagerScorecard(store, month),
    getStoreRanking("rebook", month),
    getStoreRanking("answered", month),
    getStoreScores(month),
    getAgentActionsForStore(store),
    getGroomersForStore(store),
    getCustomersNeedingAttention(store),
  ]);

  return (
    <div className="animate-stage-in space-y-10">
      <WelcomeBanner name={userName} streak={streak} />

      <header>
        <Micro>Store dashboard · {storeName} · {period}</Micro>
        <h1 className="mt-2.5 text-[clamp(26px,3.6vw,34px)] font-medium tracking-[-0.02em]">{storeName}</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-ink-dim">
          Welcome back, {userName.split(" ")[0]}. Here is how {storeName} is doing, how it compares to the other stores, and what to do next. Use the month filter in the top bar to change the period.
        </p>
      </header>

      {/* 1 — Your focus */}
      <ActionItemCard
        eyebrow="Your focus · what to fix first"
        title={focus.title}
        detail={focus.detail}
        metric={focus.metric}
        pending={focus.pending}
        planKey={focus.planKey}
      />

      {/* 2 — Where you stand */}
      <section>
        <div className="mb-4">
          <Micro>Where you stand</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">How {storeName} ranks across the four stores</h2>
        </div>
        <div className="mb-5">
          <StoreScoreboard rows={scores} highlightId={store} variant="manager" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RateRankCard title="Rebook rate" ranking={rebookRank} storeId={store} />
          <RateRankCard title="Calls answered" ranking={answeredRank} storeId={store} />
        </div>
      </section>

      {/* 3 — Your scorecard */}
      <section>
        <div className="mb-4">
          <Micro>Your scorecard</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">How you&apos;re doing — and versus the group average</h2>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-5">
          {scorecard.map((s) => (
            <div key={s.label} className="bg-cell p-4">
              <div className="flex items-center justify-between gap-2">
                <Micro>{s.label}</Micro>
                <Delta value={s.delta} invert={s.invert} />
              </div>
              <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]">{s.value}</div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-ink-dimmer">Group {s.avgLabel}</span>
                <span className="font-mono" style={{ color: s.beatsAvg ? GREEN : ORANGE }}>{s.beatsAvg ? "Ahead" : "Behind"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — Your action queue */}
      <section>
        <div className="mb-4">
          <Micro>Your action queue</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">The dashboard is working on these</h2>
        </div>
        <div className="space-y-3">
          {actions.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{a.agent} agent</span>
                    {a.pending && <Tag tone="muted">Pending data</Tag>}
                  </div>
                  <h3 className="mt-2 text-[15px] font-medium tracking-[-0.01em] text-ink">{a.title}</h3>
                </div>
                <Tag tone={statusTone[a.status]}>{actionStatusLabel[a.status]}</Tag>
              </div>
              <p className="text-[13px] leading-[1.55] text-ink-dim">{a.detail}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Tag tone="orange">{a.metric}</Tag>
                {a.result && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-dim">
                    <span className="size-1.5 rounded-full" style={{ background: GREEN }} />
                    {a.result}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 5 — Your team */}
      <section>
        <div className="mb-4">
          <Micro>Your team</Micro>
          <div className="mt-1.5 flex items-center gap-1.5">
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">Groomer scorecards</h2>
            <InfoTip text={GROOMER_COL_HELP} />
          </div>
          <p className="mt-1.5 max-w-[560px] text-[13px] leading-[1.5] text-ink-dim">A coaching view — where each groomer is strong and where a conversation would help. Not a ranking against other stores.</p>
        </div>
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                  {["Groomer", "Rev / hr", "Rebook", "Retail attach", "Utilization"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 font-normal ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((g) => (
                  <tr key={g.id} className="border-t border-edge transition-colors hover:bg-raise">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{g.name}</span>
                        {g.flag === "star" && <Tag tone="good">Top</Tag>}
                        {g.flag === "coach" && <Tag tone="orange">Coach</Tag>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(g.revPerHr)}</td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: g.rebook < 0.45 ? ORANGE : "var(--color-ink-dim)" }}>{pct(g.rebook)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{pct(g.attach)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2.5">
                        <span className="w-24"><Meter value={g.util} /></span>
                        <span className="w-9 text-right font-mono text-ink-dim">{pct(g.util)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* 6 — Customers needing attention */}
      <section>
        <div className="mb-4">
          <Micro>Customers needing attention</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Reach out before they lapse</h2>
        </div>
        {watch.length === 0 ? (
          <Card>
            <p className="text-[13.5px] leading-[1.6] text-ink-dim">No customers are flagged right now — your retention is on track. Keep prompting rebooking at checkout to stay ahead.</p>
          </Card>
        ) : (
          <Card pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                    {["Customer", "Status", "Last visit", "Suggested action"].map((h, i) => (
                      <th key={h} className={`px-5 py-3 font-normal ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watch.map((c) => (
                    <tr key={c.name} className="border-t border-edge transition-colors hover:bg-raise">
                      <td className="px-5 py-3.5">
                        <div className="text-ink">{c.name}</div>
                        <Micro className="mt-0.5">{c.pet}</Micro>
                      </td>
                      <td className="px-5 py-3.5">
                        <Tag tone="orange">{c.segment}</Tag>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono" style={{ color: c.lastVisit > 60 ? ORANGE : "var(--color-ink-dim)" }}>{c.lastVisit}d ago</td>
                      <td className="px-5 py-3.5 text-ink-dim">{c.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function RateRankCard({ title, ranking, storeId }: { title: string; ranking: { id: string; name: string; value: number }[]; storeId: string }) {
  const pos = ranking.findIndex((r) => r.id === storeId) + 1;
  const leader = ranking[0];
  const mine = ranking.find((r) => r.id === storeId)!;
  const gap = Math.round((leader.value - mine.value) * 100);
  const data = ranking.map((r) => ({ name: shorten(r.name), value: Math.round(r.value * 100), highlight: r.id === storeId }));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Micro>{title}</Micro>
          <ChartInfo id="managerRank" />
        </div>
        <span className="font-mono text-[11px] text-ink-dim">
          #{pos} of {ranking.length}
          {pos > 1 ? ` · ${gap} pts behind ${shorten(leader.name)}` : " · leading"}
        </span>
      </div>
      <BarRanking data={data} format="pct" labelWidth={96} valueLabel={title} />
    </Card>
  );
}
