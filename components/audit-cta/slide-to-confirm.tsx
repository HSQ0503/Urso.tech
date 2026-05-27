"use client";

import { useRef, useState, useCallback } from "react";

type Props = { onComplete: () => void };

export function SlideToConfirm({ onComplete }: Props) {
  const [drag, setDrag] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const confirmedRef = useRef(false);

  const start = useCallback(
    (clientX: number) => {
      if (confirmedRef.current) return;
      const track = trackRef.current?.getBoundingClientRect();
      if (!track) return;
      const maxX = track.width - 56;

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const cx =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const x = cx - track.left - 28;
        const d = Math.max(0, Math.min(maxX, x));
        setDrag(d);
        if (d >= maxX - 4) {
          confirmedRef.current = true;
          setConfirmed(true);
          setDrag(maxX);
          cleanup();
          window.setTimeout(onComplete, 350);
        }
      };
      const handleEnd = () => {
        if (!confirmedRef.current) setDrag(0);
        cleanup();
      };
      const cleanup = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleEnd);
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("touchend", handleEnd);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove);
      window.addEventListener("touchend", handleEnd);
      // suppress unused param warning
      void clientX;
    },
    [onComplete],
  );

  return (
    <div
      ref={trackRef}
      className="relative h-16 w-full max-w-[560px] overflow-hidden rounded-full border border-edge bg-[#0d0d0d] select-none"
    >
      <div
        className="absolute inset-y-0 left-0 bg-orange"
        style={{
          width: drag + 56,
          opacity: 0.18,
          transition: confirmed ? "width .35s ease" : "none",
        }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-sans text-[15px] tracking-[0.04em] text-ink-dim">
        {confirmed ? (
          <span className="font-medium text-orange">
            Confirmed — let&apos;s get your details
          </span>
        ) : (
          <span>
            Slide to confirm{" "}
            <span className="ml-1.5 text-ink">›››</span>
          </span>
        )}
      </div>
      <div
        onMouseDown={(e) => start(e.clientX)}
        onTouchStart={(e) => start(e.touches[0].clientX)}
        className="absolute left-1 top-1 grid size-14 place-items-center rounded-full bg-orange text-white"
        style={{
          transform: `translateX(${drag}px)`,
          transition: confirmed ? "transform .35s ease" : "none",
          cursor: confirmed ? "default" : "grab",
          boxShadow: "0 4px 16px rgba(254,81,0,0.4)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {confirmed ? (
            <path
              d="M5 10l3 3 7-8"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M6 4l6 6-6 6M11 4l6 6-6 6"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
