"use client";

import { useEffect, useRef } from "react";
import { FORECAST_GRAIN } from "./forecast";

/* Scroll-grow range — the disc scales from BASE up to BASE+RANGE as the section
   travels through the viewport. Kept as constants so the SSR first-paint scale
   and the runtime baseline can't drift apart. */
const BASE_SCALE = 0.88;
const SCALE_RANGE = 0.3;

/**
 * The eclipse backdrop for the final CTA: a black disc ringed by a luminous
 * orange corona on a dark field, built from layered offset blooms + a film-grain
 * overlay so it matches the photographic surface of the other sections (rather
 * than a flat concentric ring). The disc scales up slightly as the section
 * scrolls through the viewport — the "grows as you scroll" motion. The handler
 * mutates the disc transform through a ref (no React state) so the motion stays
 * smooth and avoids the set-state-in-effect rule. Reduced motion pins the scale.
 */
export function Eclipse() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const disc = discRef.current;
    if (!wrap || !disc) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      disc.style.transform = "translate(-50%, -50%) scale(1.04)";
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 as the section enters from the bottom → 1 once it has scrolled past
      // the top. The disc grows across that travel.
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      const scale = BASE_SCALE + p * SCALE_RANGE;
      disc.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* faint cool vignette so the black disc reads against the field */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, rgba(255,255,255,0.04) 0%, transparent 46%), #070707",
        }}
      />
      {/* the eclipse — black core + layered orange corona, brighter top/bottom
          (dimmer on the flanks where the text crosses), scaled on scroll */}
      <div
        ref={discRef}
        className="absolute left-1/2 top-1/2 aspect-square w-[min(94vw,1200px)] will-change-transform"
        style={{
          transform: `translate(-50%, -50%) scale(${BASE_SCALE})`,
          background:
            "radial-gradient(74% 50% at 50% 90%, rgba(255,124,46,0.34) 0%, transparent 54%)," +
            "radial-gradient(58% 38% at 50% 9%, rgba(255,150,82,0.22) 0%, transparent 50%)," +
            "radial-gradient(circle at 50% 49%, #070707 0%, #070707 43%, rgba(255,168,104,0.15) 45.5%, rgba(255,130,55,0.64) 50%, rgba(255,114,42,0.38) 55%, rgba(255,96,28,0.13) 64%, transparent 79%)",
        }}
      />
      {/* film grain — the photographic texture used across the other sections */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: FORECAST_GRAIN,
          backgroundSize: "150px 150px",
          opacity: 0.06,
          mixBlendMode: "soft-light",
        }}
      />
      {/* Dissolve the corona into the field at the top/bottom edges so the
          scaled disc never clips into a hard line against the neighbouring
          sections. */}
      <div
        className="absolute inset-x-0 top-0 h-[26%]"
        style={{
          background:
            "linear-gradient(180deg, #070707 0%, rgba(7,7,7,0.6) 36%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[22%]"
        style={{
          background:
            "linear-gradient(0deg, #070707 0%, rgba(7,7,7,0.6) 38%, transparent 100%)",
        }}
      />
    </div>
  );
}
