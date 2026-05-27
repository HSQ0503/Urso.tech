export type TabData = {
  key: string;
  headline: string;
  description: string;
  bullets: string[];
  metric: { label: string; value: string; delta: string; tone: "good" | "bad" };
  legend: string;
  footer: string;
  chartData: number[];
  highlight: (i: number) => boolean;
  xAxis: string[];
};

export function Panel({ tab }: { tab: TabData }) {
  const max = Math.max(...tab.chartData);
  return (
    <div className="panel-fade-in relative w-full max-w-[560px] overflow-hidden rounded-xl border border-edge bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-edge px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-orange">
            {tab.key}
          </span>
          <span className="font-mono text-[11px] text-ink-dimmer">
            · last 30 days
          </span>
        </div>
        <span className="font-mono text-[11px] text-ink-dim">4 stores ▾</span>
      </div>

      <div className="px-6 pb-2 pt-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dimmer">
          {tab.metric.label}
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-[36px] font-medium tracking-[-0.02em]">
          <span>{tab.metric.value}</span>
          <span
            className={`font-mono text-[14px] ${tab.metric.tone === "bad" ? "text-[#F87171]" : "text-orange"}`}
          >
            {tab.metric.delta}
          </span>
        </div>
      </div>

      <div className="flex h-[120px] items-end gap-1 px-6 pb-6 pt-2">
        {tab.chartData.map((v, i) => {
          const lit = tab.highlight(i);
          const h = (v / max) * 100;
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className="bar-rise origin-bottom rounded-[2px] transition-[filter] duration-200 hover:brightness-125"
                style={{
                  height: `${h}%`,
                  background: lit ? "#FE5100" : "rgba(255,255,255,0.13)",
                  animationDelay: `${i * 18}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between px-6 pb-4 font-mono text-[10px] text-ink-dimmer">
        {tab.xAxis.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-edge bg-orange-wash px-6 py-3.5">
        <div className="text-[13px]">
          <span className="text-orange">● </span>
          {tab.legend}
        </div>
        <span className="font-mono text-[11px]">{tab.footer}</span>
      </div>
    </div>
  );
}
