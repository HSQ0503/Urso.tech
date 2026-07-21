"use client";

import { useEffect } from "react";

// Client half of the 30-minute re-lock: the server layouts enforce the PIN on
// every REQUEST, but a tab left sitting open never makes one — this watchdog
// sends it to the lock screen when the unlock window elapses.
//
// It takes a DURATION (relockInMs, computed server-side as expiry − now at
// render), never an absolute timestamp, so a skewed client clock can't fire it
// early and cause a home↔pin reload loop. On fire it preserves the exact page
// via `to`, so unlocking returns you where you were.

export function PinWatchdog({ relockInMs, lockBase }: { relockInMs: number; lockBase: string }) {
  useEffect(() => {
    const delay = Math.max(0, relockInMs) + 1000; // grace so the cookie is surely expired
    const t = setTimeout(() => {
      const to = window.location.pathname + window.location.search;
      window.location.assign(`${lockBase}?to=${encodeURIComponent(to)}`);
    }, delay);
    return () => clearTimeout(t);
  }, [relockInMs, lockBase]);

  return null;
}
