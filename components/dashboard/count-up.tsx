"use client";

// A number that ticks up to its value on mount — the small reward for landing on
// a screen. Honest: it always settles on the real figure, and reduced-motion users
// get it instantly. Put `tabular-nums` on the element so the width doesn't jitter
// as digits change mid-count.
//
// Takes a serializable format TOKEN (not a function) so server components can pass
// it across the client boundary. Formatting matches fmtMoney / pct in ui.tsx.
import { useEffect, useState } from "react";

export type CountFormat = "money" | "pct" | "int";

function format(n: number, f: CountFormat): string {
  if (f === "money") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (f === "pct") return `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  return Math.round(n).toLocaleString("en-US");
}

export function CountUp({
  value,
  format: fmt,
  className = "",
}: {
  value: number;
  format: CountFormat;
  className?: string;
}) {
  const [n, setN] = useState(value);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : 750;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    let t0 = 0;
    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const p = dur === 0 ? 1 : Math.min(1, (ts - t0) / dur);
      setN(value * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{format(n, fmt)}</span>;
}
