import type { CSSProperties } from "react";
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
  getTeamRoster,
  getCustomersNeedingAttention,
} from "@/components/dashboard/data.server";
import { Card, Micro, Tag, Delta, BarRanking, WelcomeBanner, EmptyState, fmtMoney, pct } from "@/components/dashboard/ui";
import { CountUp, type CountFormat } from "@/components/dashboard/count-up";
import { ActionItemCard } from "@/components/dashboard/action-item-card";
import { StoreScoreboard } from "@/components/dashboard/store-scoreboard";
import { InfoTip } from "@/components/dashboard/info-tip";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { GROOMER_COL_HELP } from "@/components/dashboard/team-help";
import { getI18n } from "@/lib/i18n.server";

const GREEN = "var(--color-good)";
const ORANGE = "#fe5100";

const statusTone: Record<ActionStatus, "muted" | "orange" | "good" | "warn"> = {
  suggested: "orange",
  approved: "muted",
  running: "warn",
  completed: "good",
};

const shorten = (name: string) => name.replace(" Village", "");

// CountUp needs the serializable format token; scorecard rows only carry the
// preformatted string, so map it from the (untranslated) label.
const scoreFormat: Record<string, CountFormat> = {
  "Return rate": "pct",
  "Retail attach": "pct",
  "Avg visit": "money",
};

export async function ManagerHome({ store, month, userName, streak }: { store: StoreId; month: MonthValue; userName: string; streak: number }) {
  const { t } = await getI18n();
  const storeName = scopeLabel(store);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);
  const [focus, scorecard, rebookRank, attachRank, scores, actions, team, watch] = await Promise.all([
    getManagerFocus(store, month),
    getManagerScorecard(store, month),
    getStoreRanking("rebook", month),
    getStoreRanking("attach", month),
    getStoreScores(month),
    getAgentActionsForStore(store),
    getTeamRoster(store, month),
    getCustomersNeedingAttention(store),
  ]);

  const leadsRebook = rebookRank[0]?.id === store;
  const leadsAttach = attachRank[0]?.id === store;

  return (
    <div className="space-y-10">
      <div className="dash-rise" style={{ "--i": 0 } as CSSProperties}>
        <WelcomeBanner name={userName} streak={streak} />
      </div>

      <header className="dash-rise" style={{ "--i": 0 } as CSSProperties}>
        <Micro>{t("Store dashboard")} · {storeName} · {t(period)}</Micro>
        <h1 className="mt-2.5 text-[clamp(26px,3.6vw,34px)] font-semibold tracking-[-0.02em]">{storeName}</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-ink-dim">
          {t("Welcome back,")} {userName.split(" ")[0]}. {t("Here is how")} {storeName} {t("is doing, how it compares to the other stores, and what to do next. Use the month filter in the top bar to change the period.")}
        </p>
      </header>

      {/* 1 — Your focus */}
      <div className="dash-rise" style={{ "--i": 1 } as CSSProperties}>
        <ActionItemCard
          eyebrow={t("Your focus · what to fix first")}
          title={focus.title}
          detail={focus.detail}
          metric={focus.metric}
          pending={focus.pending}
          planKey={focus.planKey}
          cta={t("Talk to Urso")}
        />
      </div>

      {/* 2 — Where you stand */}
      <section className="dash-rise" style={{ "--i": 2 } as CSSProperties}>
        <div className="mb-4">
          <Micro>{t("Where you stand")}</Micro>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">{t("How")} {storeName} {t("ranks across the four stores")}</h2>
        </div>
        <div className="mb-5">
          <StoreScoreboard rows={scores} highlightId={store} variant="manager" />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RateRankCard title={t("Return rate")} ranking={rebookRank} storeId={store} t={t} draw={leadsRebook} />
          <RateRankCard title={t("Retail attach")} ranking={attachRank} storeId={store} t={t} draw={leadsAttach && !leadsRebook} />
        </div>
      </section>

      {/* 3 — Your scorecard */}
      <section className="dash-rise" style={{ "--i": 3 } as CSSProperties}>
        <div className="mb-4">
          <Micro>{t("Your scorecard")}</Micro>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">{t("How you're doing — and versus the group average")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3">
          {scorecard.map((s) => (
            <div key={s.label} className="bg-cell p-4">
              <div className="flex items-center justify-between gap-2">
                <Micro>{t(s.label)}</Micro>
                {s.delta != null && <Delta value={s.delta} invert={s.invert} />}
              </div>
              <div className="mt-2.5 text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {scoreFormat[s.label] ? <CountUp value={s.raw} format={scoreFormat[s.label]} /> : s.value}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-ink-dimmer">{t("Group")} {s.avgLabel}</span>
                {/* Second beat: the verdict lands after the CountUp settles. */}
                <span className="chip-in font-mono" style={{ color: s.beatsAvg ? GREEN : ORANGE, "--reveal-delay": "550ms" } as CSSProperties}>{s.beatsAvg ? t("Ahead") : t("Behind")}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — Your action queue */}
      <section className="dash-rise" style={{ "--i": 4 } as CSSProperties}>
        <div className="mb-4">
          <Micro>{t("Your action queue")}</Micro>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">{t("The dashboard is working on these")}</h2>
        </div>
        {actions.length === 0 ? (
          <EmptyState
            label={t("Queue clear")}
            title={t("Nothing in flight for your store")}
            body={t("Approved fixes show up here while they run. Start with your focus card above — Urso turns it into a plan.")}
          />
        ) : (
          <div className="space-y-3">
            {actions.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{a.agent} {t("agent")}</span>
                      {a.pending && <Tag tone="muted">{t("Pending data")}</Tag>}
                    </div>
                    <h3 className="mt-2 text-[15px] font-medium tracking-[-0.01em] text-ink">{a.title}</h3>
                  </div>
                  <Tag tone={statusTone[a.status]}>{t(actionStatusLabel[a.status])}</Tag>
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
        )}
      </section>

      {/* 5 — Your team */}
      <section className="dash-rise" style={{ "--i": 5 } as CSSProperties}>
        <div className="mb-4">
          <Micro>{t("Your team")}</Micro>
          <div className="mt-1.5 flex items-center gap-1.5">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{t("Groomer scorecards")}</h2>
            <InfoTip text={GROOMER_COL_HELP} />
          </div>
          <p className="mt-1.5 max-w-[560px] text-[13px] leading-[1.5] text-ink-dim">{t("A coaching view — where each groomer is strong and where a conversation would help. Not a ranking against other stores.")}</p>
        </div>
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                  {["Groomer", "Revenue", "Avg ticket", "Return", "Retail attach"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 font-normal ${i === 0 ? "text-left" : "text-right"}`}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((g) => (
                  <tr key={g.id} className="border-t border-edge transition-colors hover:bg-raise">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{g.name}</span>
                        {g.flag === "star" && <Tag tone="good">{t("Top")}</Tag>}
                        {g.flag === "coach" && <Tag tone="orange">{t("Coach")}</Tag>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(g.revenue)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{fmtMoney(g.avgTicket)}</td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: g.rebook != null && g.rebook < 0.45 ? ORANGE : "var(--color-ink-dim)" }}>{g.rebook == null ? "—" : pct(g.rebook)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{g.attach == null ? "—" : pct(g.attach)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* 6 — Customers needing attention */}
      <section className="dash-rise" style={{ "--i": 6 } as CSSProperties}>
        <div className="mb-4">
          <Micro>{t("Customers needing attention")}</Micro>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">{t("Reach out before they lapse")}</h2>
        </div>
        {watch.length === 0 ? (
          <EmptyState
            label={t("All clear")}
            title={t("No customers at risk right now")}
            body={t("Keep prompting rebooking at checkout to stay ahead — anyone nearing a lapse shows up here.")}
            action={<Tag tone="good">{t("Retention on track")}</Tag>}
          />
        ) : (
          <Card pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                    {["Customer", "Status", "Last visit", "Suggested action"].map((h, i) => (
                      <th key={h} className={`px-5 py-3 font-normal ${i === 2 ? "text-right" : "text-left"}`}>{t(h)}</th>
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
                        <Tag tone="orange">{t(c.segment)}</Tag>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono" style={{ color: c.lastVisit > 60 ? ORANGE : "var(--color-ink-dim)" }}>{c.lastVisit}{t("d ago")}</td>
                      <td className="px-5 py-3.5 text-ink-dim">{t(c.next)}</td>
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

// `draw` fires the one-per-page dash-draw hairline — the caller picks at most
// one card so leading both rankings doesn't double the win moment.
function RateRankCard({ title, ranking, storeId, t, draw = false }: { title: string; ranking: { id: string; name: string; value: number }[]; storeId: string; t: (s: string) => string; draw?: boolean }) {
  const pos = ranking.findIndex((r) => r.id === storeId) + 1;
  const leader = ranking[0];
  const mine = ranking.find((r) => r.id === storeId)!;
  const gap = Math.round((leader.value - mine.value) * 1000) / 10;
  const data = ranking.map((r) => ({ name: shorten(r.name), value: Math.round(r.value * 1000) / 10, highlight: r.id === storeId }));

  return (
    <Card>
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Micro>{title}</Micro>
            <AskAi
              topic={`${title} — ${t("your store vs the others")}`}
              topicId="managerRank"
              suggestions={[t("Where do I stand on this?"), t("How do I close the gap to the leader?")]}
            />
            <ChartInfo id="managerRank" />
          </div>
          <span className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
            <span>
              #{pos} {t("of")} {ranking.length}
              {pos > 1 && ` · ${gap} ${t("pts behind")} ${shorten(leader.name)}`}
            </span>
            {pos === 1 && <Tag tone="good">{t("Leading")}</Tag>}
          </span>
        </div>
        {draw && <div aria-hidden className="dash-draw mt-2.5 h-px bg-orange" style={{ "--reveal-delay": "500ms" } as CSSProperties} />}
      </div>
      <BarRanking data={data} format="pct" labelWidth={96} valueLabel={title} />
    </Card>
  );
}
