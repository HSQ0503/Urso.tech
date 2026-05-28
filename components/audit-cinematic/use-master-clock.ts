"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Opts = {
  totalMs: number;
  playing: boolean;
  onComplete: () => void;
};

export type MasterClock = {
  progress: number; // 0..1
  jumpToEnd: () => void;
  reset: () => void;
};

// rAF-driven clock. Pauses when `playing` flips false (preserves elapsed).
// Calls `onComplete` once when progress reaches 1.
// jumpToEnd skips to 0.94 so the final handoff beat still plays.
export function useMasterClock({ totalMs, playing, onComplete }: Opts): MasterClock {
  const [progress, setProgress] = useState(0);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // keep latest callback without retriggering the effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!playing) {
      // pause: record elapsed and stop the loop
      if (startedAtRef.current != null) {
        elapsedRef.current = performance.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // resume / start
    startedAtRef.current = performance.now() - elapsedRef.current;

    const tick = (t: number) => {
      const start = startedAtRef.current;
      if (start == null) return;
      const elapsed = t - start;
      const p = Math.min(1, elapsed / totalMs);
      setProgress(p);
      if (p >= 1) {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, totalMs]);

  const jumpToEnd = useCallback(() => {
    elapsedRef.current = totalMs * 0.94;
    if (startedAtRef.current != null) {
      startedAtRef.current = performance.now() - elapsedRef.current;
    }
    setProgress(0.94);
  }, [totalMs]);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    startedAtRef.current = performance.now();
    completedRef.current = false;
    setProgress(0);
  }, []);

  return { progress, jumpToEnd, reset };
}
