"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMasterClock } from "./use-master-clock";
import { TIMELINE, TOTAL_MS, isBeatActive } from "./timeline";
import { ActTag } from "./ui/act-tag";
import { Timer } from "./ui/timer";
import { SkipControl } from "./ui/skip-control";
import "./cinematic.css";

type Props = { onComplete: () => void };

export function AuditCinematic({ onComplete }: Props) {
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const { progress, jumpToEnd } = useMasterClock({
    totalMs: TOTAL_MS,
    playing,
    onComplete: handleComplete,
  });

  const elapsedMs = progress * TOTAL_MS;

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVis = () => setPlaying(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Esc skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") jumpToEnd();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [jumpToEnd]);

  // Click on the overlay background (but not interactive children) also skips.
  const onRootClick = (e: React.MouseEvent) => {
    if (e.target === rootRef.current) jumpToEnd();
  };

  // Lock body scroll while playing.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const activeBeats = TIMELINE.filter((b) => isBeatActive(b, elapsedMs));

  return (
    <div
      ref={rootRef}
      onClick={onRootClick}
      className="cinematic-root"
      data-paused={!playing}
      aria-hidden="true"
    >
      <ActTag elapsedMs={elapsedMs} />
      <Timer elapsedMs={elapsedMs} />
      <SkipControl onSkip={jumpToEnd} />

      {/* Scene dispatch goes here — Tasks 12+. For now we just see the chrome. */}
      {activeBeats.map((beat) => (
        <SceneStub key={`${beat.at}-${beat.scene}`} beat={beat} elapsedMs={elapsedMs} />
      ))}
    </div>
  );
}

// Temporary visualizer — replaced by real scenes in subsequent tasks.
function SceneStub({ beat, elapsedMs }: { beat: (typeof TIMELINE)[number]; elapsedMs: number }) {
  if (beat.scene === "establish") return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-dim"
      style={{ animation: "cinematic-fade-in 200ms ease both" }}
    >
      [{beat.scene}] · {(elapsedMs / 1000).toFixed(1)}s
    </div>
  );
}
