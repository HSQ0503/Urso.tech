"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMasterClock } from "./use-master-clock";
import { TIMELINE, TOTAL_MS, MOBILE_SCALAR, isBeatActive } from "./timeline";
import { ActTag } from "./ui/act-tag";
import { Timer } from "./ui/timer";
import { SkipControl } from "./ui/skip-control";
import { CardScene } from "./scenes/card-scene";
import { CollapseScene } from "./scenes/collapse-scene";
import { EstablishScene } from "./scenes/establish-scene";
import { GridOverlayScene } from "./scenes/grid-overlay-scene";
import { GridScene } from "./scenes/grid-scene";
import { TaglineScene } from "./scenes/tagline-scene";
import { ProcessStepScene } from "./scenes/process-step-scene";
import { LeakCardScene } from "./scenes/leak-card-scene";
import { SilenceScene } from "./scenes/silence-scene";
import { HandoffScene } from "./scenes/handoff-scene";
import "./cinematic.css";

type Props = { onComplete: () => void };

export function AuditCinematic({ onComplete }: Props) {
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const [totalMs] = useState<number>(() => {
    if (typeof window === "undefined") return TOTAL_MS;
    return window.matchMedia("(max-width: 767px)").matches
      ? TOTAL_MS * MOBILE_SCALAR
      : TOTAL_MS;
  });

  const handleComplete = useCallback(() => {
    const target = document.querySelector<HTMLElement>("[data-audit-hero-cta]");
    target?.focus();
    onComplete();
  }, [onComplete]);

  const { progress, jumpToEnd } = useMasterClock({
    totalMs,
    playing,
    onComplete: handleComplete,
  });

  const elapsedMs = progress * totalMs;

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

      {activeBeats.map((beat) => {
        const key = `${beat.at}-${beat.scene}`;
        if (beat.scene === "collapse") return <CollapseScene key={key} />;
        if (beat.scene === "establish") return <EstablishScene key={key} />;
        if (beat.scene === "card") return <CardScene key={key} data={beat.data} />;
        if (beat.scene === "tagline") return <TaglineScene key={key} text={beat.text} />;
        if (beat.scene === "grid") return <GridScene key={key} />;
        if (beat.scene === "grid-overlay") return <GridOverlayScene key={key} text={beat.text} />;
        if (beat.scene === "process-step") {
          return <ProcessStepScene key={key} step={beat.step} title={beat.title} />;
        }
        if (beat.scene === "leak-card") return <LeakCardScene key={key} />;
        if (beat.scene === "silence") {
          return <SilenceScene key={key} phase={beat.phase} text={beat.text} />;
        }
        if (beat.scene === "handoff") return <HandoffScene key={key} />;
      })}
    </div>
  );
}
