"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { triggerWipe } from "@/components/wipe-transition";
import { armIntro } from "@/lib/intro-state";

const HANDLE = 52;
const PAD = 4;

export function SlideToBook() {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ id: -1, startX: 0, startDrag: 0, max: 0 });
  const [drag, setDrag] = useState(0);
  const [max, setMax] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    router.prefetch("/book-an-audit");
  }, [router]);

  useEffect(() => {
    const measure = () => {
      const w = trackRef.current?.getBoundingClientRect().width ?? 0;
      setMax(Math.max(1, w - HANDLE - PAD * 2));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (confirmed) return;
    const w = trackRef.current?.getBoundingClientRect().width ?? 0;
    const m = Math.max(1, w - HANDLE - PAD * 2);
    handleRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startDrag: drag,
      max: m,
    };
    setMax(m);
    setDragging(true);
  };

  const fireWipe = () => {
    armIntro();
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) {
      triggerWipe("/book-an-audit");
      return;
    }
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) {
      triggerWipe("/book-an-audit", {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        r0: HANDLE / 2,
      });
      return;
    }
    triggerWipe("/book-an-audit", {
      x: rect.right - PAD - HANDLE / 2,
      y: rect.top + rect.height / 2,
      r0: HANDLE / 2 + 6,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || confirmed) return;
    const s = dragRef.current;
    if (e.pointerId !== s.id) return;
    const next = Math.max(0, Math.min(s.max, s.startDrag + e.clientX - s.startX));
    setDrag(next);
    if (next >= s.max - 1) {
      setConfirmed(true);
      setDragging(false);
      setDrag(s.max);
      fireWipe();
    }
  };

  const onPointerUp = () => {
    if (confirmed) return;
    setDragging(false);
    setDrag(0);
  };

  const progress = drag / max;
  const idle = !dragging && !confirmed && drag === 0;

  return (
    <div
      ref={trackRef}
      className="relative h-[60px] w-full max-w-[360px] overflow-hidden rounded-full select-none"
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(254,81,0,${progress * 0.28})`,
      }}
    >
      <div
        aria-hidden
        className="absolute bg-orange"
        style={{
          top: PAD,
          left: PAD,
          height: HANDLE,
          width: drag + HANDLE,
          borderRadius: HANDLE / 2,
          opacity: progress * 0.6,
          transition: dragging
            ? "none"
            : "width .55s cubic-bezier(0.16,1,0.3,1), opacity .55s cubic-bezier(0.16,1,0.3,1)",
        }}
      />

      {idle && (
        <div
          aria-hidden
          className="slide-sheen pointer-events-none absolute inset-0"
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 font-sans text-[15px] font-medium tracking-[-0.005em] text-white"
        style={{
          opacity: confirmed ? 0 : Math.max(0, 1 - progress * 1.5),
          transition: dragging
            ? "none"
            : "opacity .35s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <span>Slide to book an audit</span>
        <span className="ml-2 inline-flex items-center text-white/60">
          <span className="slide-chev slide-chev-1">›</span>
          <span className="slide-chev slide-chev-2">›</span>
          <span className="slide-chev slide-chev-3">›</span>
        </span>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center font-sans text-[15px] font-medium tracking-[-0.005em] text-white"
        style={{
          opacity: confirmed ? 1 : 0,
          transition: "opacity .3s cubic-bezier(0.16,1,0.3,1) .08s",
        }}
      >
        Opening audit booking…
      </div>

      <div
        ref={handleRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        aria-label="Slide to book an audit"
        tabIndex={0}
        onKeyDown={(e) => {
          if (confirmed) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setConfirmed(true);
            setDrag(max);
            fireWipe();
          }
        }}
        className="absolute grid place-items-center rounded-full bg-orange text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={{
          top: PAD,
          left: PAD,
          width: HANDLE,
          height: HANDLE,
          transform: `translateX(${drag}px) scale(${dragging ? 1.04 : 1})`,
          transition: dragging
            ? "transform .06s linear"
            : "transform .55s cubic-bezier(0.16,1,0.3,1)",
          cursor: confirmed ? "default" : dragging ? "grabbing" : "grab",
          boxShadow: `0 4px 14px rgba(254,81,0,${0.3 + progress * 0.35}), 0 0 0 ${dragging ? 6 : 0}px rgba(254,81,0,0.08)`,
          touchAction: "none",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          {confirmed ? (
            <path
              d="M4 9.5l3 3 7-8"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M5 4l5 5-5 5M10 4l5 5-5 5"
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
