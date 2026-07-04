"use client";

import { useEffect, useState } from "react";

// Speed-to-lead chip: minutes since the lead arrived, re-checked every 30s.
// ok < 5m, warn < 15m, late >= 15m (late pulses via canes.css).

function minutesWaiting(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function WaitTimer({ createdAt }: { createdAt: string }) {
  const [mins, setMins] = useState(() => minutesWaiting(createdAt));

  useEffect(() => {
    const id = setInterval(() => setMins(minutesWaiting(createdAt)), 30_000);
    return () => clearInterval(id);
  }, [createdAt]);

  const tone = mins < 5 ? "cp-timer-ok" : mins < 15 ? "cp-timer-warn" : "cp-timer-late";

  return (
    <span
      suppressHydrationWarning
      className={`cp-chip ${tone}`}
      aria-label={`Waiting ${mins} minutes`}
    >
      {mins}m
    </span>
  );
}
