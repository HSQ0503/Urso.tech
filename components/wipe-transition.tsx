"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Phase = "idle" | "covering" | "covered" | "uncovering";

let triggerFn: ((href: string) => void) | null = null;

/** Navigate through the page wipe. Falls back to a hard navigation if the
 *  transition component hasn't mounted yet. */
export function triggerWipe(href: string) {
  if (triggerFn) {
    triggerFn(href);
  } else {
    window.location.href = href;
  }
}

const COVER_MS = 360;
const UNCOVER_MS = 420;
const COVER_HOLD_MAX_MS = 200;

export function WipeTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      triggerFn = (href) => router.push(href);
      return () => {
        triggerFn = null;
      };
    }
    triggerFn = (href) => {
      router.prefetch(href);
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
    const t = window.setTimeout(() => setPhase("covered"), COVER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

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
    }, UNCOVER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (phase === "idle") {
      delete root.dataset.wipeStage;
      return;
    }
    // Don't mark the new page as covered until it's actually mounted, or the
    // freshly-rendered page would be hidden before the panel reaches it.
    if (phase !== "uncovering" && pathname !== pendingHref) return;
    root.dataset.wipeStage = phase;
  }, [phase, pathname, pendingHref]);

  if (phase === "idle") return null;

  const covering = phase === "covering" || phase === "covered";
  const animation = covering
    ? `wipe-slide-cover ${COVER_MS}ms cubic-bezier(0.5, 0, 0.75, 0) forwards`
    : `wipe-slide-uncover ${UNCOVER_MS}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      <div
        className="absolute inset-0 bg-[#070707]"
        style={{ animation, willChange: "transform" }}
      >
        {/* The leading edge during cover, trailing edge during uncover —
            either way it's the line that sweeps across the viewport. */}
        <div
          className="absolute inset-y-0 w-[2px] bg-orange"
          style={{
            [covering ? "right" : "left"]: 0,
            boxShadow: "0 0 24px 1px rgba(254,81,0,0.55)",
          }}
        />
      </div>
    </div>
  );
}
