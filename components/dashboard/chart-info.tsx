import { CHART_GUIDES, type ChartGuide, type GuideId, type GuideLegendItem } from "./chart-guides";

const ALIGN = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
} as const;

// An "(i)" affordance that, on hover or focus/click, opens a popover explaining
// what a chart shows, how to read it, and a colour key. CSS-only (no client JS),
// so it drops into server and client components alike — same mechanism as InfoTip.
export function ChartInfo({ id, align = "left" }: { id: GuideId; align?: keyof typeof ALIGN }) {
  const g: ChartGuide = CHART_GUIDES[id];
  return (
    <span className="group/ci relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="button"
        aria-label="How to read this graph"
        className="grid size-6 cursor-help select-none place-items-center rounded-full border border-edge-strong font-mono text-[13px] font-medium normal-case leading-none tracking-normal text-ink-dimmer transition-colors hover:border-orange hover:text-orange focus:outline-none focus-visible:border-orange focus-visible:text-orange"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-[calc(100%+8px)] z-50 w-[266px] rounded-xl border border-edge bg-surface p-3.5 text-left opacity-0 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-hover/ci:opacity-100 group-focus-within/ci:opacity-100 motion-reduce:transition-none ${ALIGN[align]}`}
      >
        <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dimmer">How to read this</span>
        <span className="mt-2 block font-sans text-[12px] font-medium normal-case leading-[1.45] tracking-normal text-ink">{g.summary}</span>
        <span className="mt-2 block font-sans text-[11.5px] normal-case leading-[1.5] tracking-normal text-ink-dim">{g.read}</span>
        {g.legend && (
          <span className="mt-3 block space-y-1.5 border-t border-edge pt-2.5">
            {g.legend.map((it) => (
              <span key={it.label} className="flex items-start gap-2">
                <Swatch item={it} />
                <span className="font-sans text-[11px] normal-case leading-[1.4] tracking-normal">
                  <span className="text-ink">{it.label}</span>
                  {it.note && <span className="text-ink-dim"> — {it.note}</span>}
                </span>
              </span>
            ))}
          </span>
        )}
        {g.source && (
          <span className="mt-2.5 block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">{g.source}</span>
        )}
      </span>
    </span>
  );
}

function Swatch({ item }: { item: GuideLegendItem }) {
  const shape = item.shape ?? "square";
  const base = "mt-[3px] shrink-0";
  if (shape === "line") return <span className={`${base} h-[3px] w-3.5 rounded-full`} style={{ background: item.color }} />;
  if (shape === "dot") return <span className={`${base} size-2.5 rounded-full`} style={{ background: item.color }} />;
  return <span className={`${base} size-2.5 rounded-[3px]`} style={{ background: item.color }} />;
}
