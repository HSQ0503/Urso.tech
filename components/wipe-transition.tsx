"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Origin = { x: number; y: number; r0?: number };
type Phase = "idle" | "covering" | "covered" | "uncovering";

let triggerFn: ((href: string, origin: Origin) => void) | null = null;

export function triggerWipe(href: string, origin: Origin) {
  if (triggerFn) {
    triggerFn(href, origin);
  } else {
    window.location.href = href;
  }
}

const COVER_MS = 3000;
const UNCOVER_MS = 3000;
const COVER_HOLD_MIN_MS = 60;

export function WipeTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const coveredAt = useRef(0);

  useEffect(() => {
    triggerFn = (href, o) => {
      router.prefetch(href);
      setOrigin(o);
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
    const t = window.setTimeout(() => {
      setPhase("covered");
      coveredAt.current = performance.now();
    }, COVER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "covered" || !pendingHref) return;
    if (pathname !== pendingHref) return;
    const elapsed = performance.now() - coveredAt.current;
    const wait = Math.max(0, COVER_HOLD_MIN_MS - elapsed);
    const t = window.setTimeout(() => setPhase("uncovering"), wait);
    return () => window.clearTimeout(t);
  }, [pathname, phase, pendingHref]);

  useEffect(() => {
    if (phase !== "uncovering") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setPendingHref(null);
      setOrigin(null);
    }, UNCOVER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (phase === "uncovering" && origin) {
      root.style.setProperty("--wipe-x", `${origin.x}px`);
      root.style.setProperty("--wipe-y", `${origin.y}px`);
      root.dataset.wipeReveal = "true";
    } else {
      delete root.dataset.wipeReveal;
    }
  }, [phase, origin]);

  if (phase === "idle" || !origin) return null;

  const r0 = origin.r0 ?? 28;
  const cx = `${origin.x}px`;
  const cy = `${origin.y}px`;

  const animation =
    phase === "uncovering"
      ? `wipe-implode ${UNCOVER_MS}ms cubic-bezier(0.6, 0, 0.35, 1) forwards`
      : `wipe-bloom ${COVER_MS}ms cubic-bezier(0.22, 1, 0.32, 1) forwards`;

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
