"use client";

import { useEffect, useState } from "react";
import { minutesSince } from "@/lib/canes/types";

// Speed-to-lead chip: green under 5 minutes, amber under 15, pulsing red after.

export function WaitTimer({ createdAt }: { createdAt: string }) {
  const [mins, setMins] = useState(() => minutesSince(createdAt));

  useEffect(() => {
    const id = window.setInterval(() => setMins(minutesSince(createdAt)), 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  const tone = mins < 5 ? "cp-timer-ok" : mins < 15 ? "cp-timer-warn" : "cp-timer-late";
  const label = mins >= 120 ? `${Math.floor(mins / 60)}h waiting` : `${mins}m waiting`;

  // suppressHydrationWarning: the server render and the client can disagree by
  // a minute across the network boundary.
  return (
    <span suppressHydrationWarning className={`cp-chip tabular-nums ${tone}`}>
      {label}
    </span>
  );
}
