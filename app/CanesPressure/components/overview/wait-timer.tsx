"use client";

import { useEffect, useState } from "react";
import { minutesSince } from "@/lib/canes/types";

// Speed-to-lead chip: minutes since the lead arrived, re-checked every 30s.
// Tone escalates ok < 5m, warn < 15m, late >= 15m — color only, nothing blinks.

export function WaitTimer({ createdAt }: { createdAt: string }) {
  const [mins, setMins] = useState(() => minutesSince(createdAt));

  useEffect(() => {
    const id = setInterval(() => setMins(minutesSince(createdAt)), 30_000);
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
