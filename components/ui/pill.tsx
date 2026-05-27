import type { ReactNode } from "react";

type PillProps = {
  children: ReactNode;
  dot?: boolean;
  dotColor?: string;
};

export function Pill({ children, dot = false, dotColor = "#FE5100" }: PillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-white/[0.02] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-dim px-[9px] py-[4px]">
      {dot && (
        <span
          className="block size-1.5 rounded-full"
          style={{
            background: dotColor,
            boxShadow: `0 0 0 3px ${dotColor}22`,
          }}
        />
      )}
      {children}
    </span>
  );
}
