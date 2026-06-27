"use client";

// Minimal shadcn/ui-style charting layer over Recharts, themed for Urso.
// Provides a container that injects per-series CSS color vars, plus a styled
// tooltip. Series colors are set in each chart's ChartConfig.

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "./cn";

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within <ChartContainer>");
  return ctx;
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { config: ChartConfig; children: React.ReactElement }) {
  const uid = React.useId();
  const chartId = `chart-${uid.replace(/:/g, "")}`;
  // When the wrapper has a known numeric height, hand it to ResponsiveContainer
  // as a minHeight so it never measures its parent as -1 on first paint (the
  // "width(-1) and height(-1)" Recharts warning + a blank-chart flash). Charts
  // that size via className stay on the default (undefined) — no behavior change.
  const styleHeight = typeof props.style?.height === "number" ? props.style.height : undefined;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "w-full font-mono",
          "[&_.recharts-cartesian-axis-tick_text]:fill-[var(--color-axis)] [&_.recharts-cartesian-axis-tick_text]:text-[10px]",
          "[&_.recharts-cartesian-grid_line]:stroke-[var(--color-grid)]",
          "[&_.recharts-cartesian-axis-line]:stroke-transparent [&_.recharts-cartesian-axis-tick-line]:stroke-transparent",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-[var(--color-edge-strong)]",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-[var(--color-raise)]",
          "[&_.recharts-surface]:overflow-visible focus:outline-none [&_*]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%" minHeight={styleHeight}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, c]) => c.color);
  if (!colors.length) return null;
  const css = `[data-chart=${id}] {\n${colors.map(([k, c]) => `  --color-${k}: ${c.color};`).join("\n")}\n}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItem = { dataKey?: string | number; name?: string | number; value?: number; color?: string };

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  hideLabel = false,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  labelFormatter?: (label: string | number) => React.ReactNode;
  valueFormatter?: (value: number, key: string) => React.ReactNode;
  hideLabel?: boolean;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[8rem] rounded-none border border-edge bg-surface px-3 py-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.75)]">
      {!hideLabel && (
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          {labelFormatter ? labelFormatter(label ?? "") : label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const cfg = config[key];
          const color = item.color || `var(--color-${key})`;
          // null = no data for this series (e.g. groomer absent that period),
          // which is different from a measured zero.
          const value = item.value == null ? null : Number(item.value);
          return (
            <div key={i} className="flex items-center justify-between gap-4 text-[11.5px]">
              <span className="flex items-center gap-1.5 font-sans text-ink-dim">
                <span className="size-2 rounded-[2px]" style={{ background: color }} />
                {cfg?.label ?? key}
              </span>
              <span className="font-mono tabular-nums text-ink">
                {value == null ? "—" : valueFormatter ? valueFormatter(value, key) : value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
