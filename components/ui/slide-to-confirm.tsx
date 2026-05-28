"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
};

export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  compact = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [maxOffset, setMaxOffset] = useState(0);
  const liveRef = useRef({ startX: 0, pointerId: 0, max: 0, offset: 0 });

  const handleSize = compact ? 32 : 52;
  const pad = compact ? 4 : 6;
  const trackHeight = compact ? 40 : 64;
  const textSize = compact ? 13 : 15;

  const reset = useCallback(() => {
    liveRef.current.offset = 0;
    setOffset(0);
    setDragging(false);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || loading || completed) return;
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const max = trackRect.width - handleSize - pad * 2;
    liveRef.current.startX = e.clientX;
    liveRef.current.pointerId = e.pointerId;
    liveRef.current.max = max;
    liveRef.current.offset = 0;
    setMaxOffset(max);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - liveRef.current.startX;
    const next = Math.max(0, Math.min(liveRef.current.max, dx));
    liveRef.current.offset = next;
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try {
      (e.target as Element).releasePointerCapture(liveRef.current.pointerId);
    } catch {}
    const { offset: finalOffset, max } = liveRef.current;
    if (finalOffset >= max * 0.9) {
      setOffset(max);
      setCompleted(true);
      setDragging(false);
      onConfirm();
    } else {
      reset();
    }
  };

  const progress = maxOffset ? Math.min(1, offset / maxOffset) : 0;

  return (
    <div
      ref={trackRef}
      className={`relative w-full select-none overflow-hidden rounded-full border border-edge bg-[#0d0d0d] ${
        compact ? "shadow-[0_2px_10px_rgba(0,0,0,0.4)]" : "shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
      } ${disabled ? "opacity-50" : ""}`}
      style={{ padding: pad, height: trackHeight }}
      aria-disabled={disabled}
    >
      {/* Orange progress fill */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-orange/15"
        style={{
          width: `${pad + handleSize + offset}px`,
          transition: dragging ? "none" : "width 200ms ease-out",
        }}
      />

      {/* Label */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 font-sans font-medium tracking-[-0.005em] text-ink"
        style={{
          fontSize: textSize,
          opacity: completed ? 0 : 1 - progress * 1.4,
          transition: dragging ? "none" : "opacity 200ms ease-out",
        }}
      >
        <span>{label}</span>
        <Chevrons />
      </div>

      {/* Completed label (loading state) */}
      {completed && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-sans font-medium tracking-[-0.005em] text-orange"
          style={{ fontSize: textSize }}
        >
          {loading ? "Sending…" : ""}
        </div>
      )}

      {/* Handle */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onKeyDown={(e) => {
          if (disabled || loading || completed) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCompleted(true);
            onConfirm();
          }
        }}
        className={`relative grid place-items-center rounded-full bg-orange text-white ${
          compact
            ? "shadow-[0_2px_10px_rgba(254,81,0,0.45)]"
            : "shadow-[0_4px_18px_rgba(254,81,0,0.55)]"
        } ${
          disabled || loading ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        } touch-none`}
        style={{
          width: handleSize,
          height: handleSize,
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
      >
        {loading ? <Spinner /> : <DoubleChevron size={compact ? 14 : 20} />}
      </div>
    </div>
  );
}

function DoubleChevron({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l6 6-6 6M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevrons() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true">
      <path
        d="M2 2l5 5-5 5M9 2l5 5-5 5M16 2l5 5-5 5"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
