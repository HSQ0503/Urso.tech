"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Origin = { x: number; y: number; r0?: number };
type Phase = "idle" | "covering" | "covered" | "uncovering";

let triggerFn: ((href: string, origin?: Origin) => void) | null = null;

export function triggerWipe(href: string, origin?: Origin) {
  if (triggerFn) {
    triggerFn(href, origin);
  } else {
    window.location.href = href;
  }
}

const BLOOM_COVER_MS = 460;
const BLOOM_UNCOVER_MS = 520;

const SLIDE_COVER_MS = 360;
const SLIDE_UNCOVER_MS = 520;

const COVER_HOLD_MAX_MS = 220;

export function WipeTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);

  const variant: "bloom" | "slide" = origin ? "bloom" : "slide";
  const coverMs = origin ? BLOOM_COVER_MS : SLIDE_COVER_MS;
  const uncoverMs = origin ? BLOOM_UNCOVER_MS : SLIDE_UNCOVER_MS;

  useEffect(() => {
    triggerFn = (href, o) => {
      router.prefetch(href);
      setOrigin(o ?? null);
      setPendingHref(href);
      setPhase("covering");
      router.push(href);
    };
    return () => {
      triggerFn = null;
    };
  }, [router]);

  useEffect(() => {
    if (phase !== "covering") return;
    const t = window.setTimeout(() => setPhase("covered"), coverMs);
    return () => window.clearTimeout(t);
  }, [phase, coverMs]);

  useEffect(() => {
    if (phase !== "covered" || !pendingHref) return;
    const delay = pathname === pendingHref ? 0 : COVER_HOLD_MAX_MS;
    const t = window.setTimeout(() => setPhase("uncovering"), delay);
    return () => window.clearTimeout(t);
  }, [pathname, phase, pendingHref]);

  useEffect(() => {
    if (phase !== "uncovering") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setPendingHref(null);
      setOrigin(null);
    }, uncoverMs);
    return () => window.clearTimeout(t);
  }, [phase, uncoverMs]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (phase === "idle") {
      delete root.dataset.wipeStage;
      delete root.dataset.wipeVariant;
      root.style.removeProperty("--wipe-x");
      root.style.removeProperty("--wipe-y");
      return;
    }
    // Only mark the new page once it's actually mounted (or once we're
    // uncovering anyway) otherwise the OLD page wrap would match these
    // rules and visually disappear before the cover panel reaches it.
    if (phase !== "uncovering" && pathname !== pendingHref) return;
    root.dataset.wipeVariant = variant;
    root.dataset.wipeStage = phase;
    if (origin) {
      root.style.setProperty("--wipe-x", `${origin.x}px`);
      root.style.setProperty("--wipe-y", `${origin.y}px`);
    } else {
      root.style.removeProperty("--wipe-x");
      root.style.removeProperty("--wipe-y");
    }
  }, [phase, origin, variant, pathname, pendingHref]);

  if (phase === "idle") return null;

  if (variant === "bloom" && origin) {
    const r0 = origin.r0 ?? 28;
    const cx = `${origin.x}px`;
    const cy = `${origin.y}px`;
    const animation =
      phase === "uncovering"
        ? `wipe-bloom-implode ${BLOOM_UNCOVER_MS}ms cubic-bezier(0.6, 0, 0.35, 1) forwards`
        : `wipe-bloom-grow ${BLOOM_COVER_MS}ms cubic-bezier(0.22, 1, 0.32, 1) forwards`;

    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[100]"
        style={{
          ["--wipe-x" as string]: cx,
          ["--wipe-y" as string]: cy,
          ["--wipe-r0" as string]: `${r0}px`,
          background: `radial-gradient(circle at ${cx} ${cy}, #ff7a3d 0%, #fe5100 24%, #c84408 65%, #2a0b03 100%)`,
          animation,
          willChange: "clip-path",
        }}
      />
    );
  }

  // Slide variant left-to-right sweep
  const animation =
    phase === "uncovering"
      ? `wipe-slide-uncover ${SLIDE_UNCOVER_MS}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`
      : `wipe-slide-cover ${SLIDE_COVER_MS}ms cubic-bezier(0.5, 0, 0.75, 0) forwards`;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          animation,
          willChange: "transform",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg," +
              " rgba(7,7,7,0) 0%," +
              " rgba(7,7,7,0.55) 3%," +
              " #070707 11%," +
              " #070707 55%," +
              " #1a0a04 72%," +
              " #6a230a 86%," +
              " #d24508 95%," +
              " #fe5100 100%)",
          }}
        />
        <div
          className="absolute top-0 bottom-0 left-full"
          style={{
            width: "140px",
            background:
              "linear-gradient(90deg," +
              " rgba(254,81,0,0.75) 0%," +
              " rgba(254,81,0,0.45) 22%," +
              " rgba(254,81,0,0.18) 55%," +
              " rgba(254,81,0,0) 100%)",
          }}
        />
      </div>
    </div>
  );
}
