"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Phase = "idle" | "covering" | "covered" | "uncovering";

let triggerFn: ((href: string) => void) | null = null;

export function triggerWipe(href: string) {
  if (triggerFn) {
    triggerFn(href);
  } else {
    window.location.href = href;
  }
}

const COVER_MS = 420;
const UNCOVER_MS = 620;
const SETTLE_MS = 40;

export function WipeTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    triggerFn = (href) => {
      router.prefetch(href);
      setPendingHref(href);
      setPhase("covering");
    };
    return () => {
      triggerFn = null;
    };
  }, [router]);

  useEffect(() => {
    if (phase !== "covering" || !pendingHref) return;
    const t = window.setTimeout(() => {
      setPhase("covered");
      router.push(pendingHref);
    }, COVER_MS);
    return () => window.clearTimeout(t);
  }, [phase, pendingHref, router]);

  useEffect(() => {
    if (phase !== "covered" || !pendingHref) return;
    if (pathname !== pendingHref) return;
    const t = window.setTimeout(() => setPhase("uncovering"), SETTLE_MS);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (phase === "uncovering") {
      root.dataset.wipeReveal = "true";
    } else {
      delete root.dataset.wipeReveal;
    }
  }, [phase]);

  const translate = (
    {
      idle: "-102%",
      covering: "0%",
      covered: "0%",
      uncovering: "102%",
    } as const
  )[phase];

  const transition = (
    {
      idle: "transform 0s linear",
      covering: `transform ${COVER_MS}ms cubic-bezier(0.65, 0, 0.2, 1)`,
      covered: "transform 0s linear",
      uncovering: `transform ${UNCOVER_MS}ms cubic-bezier(0.22, 1, 0.32, 1)`,
    } as const
  )[phase];

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      style={{ visibility: phase === "idle" ? "hidden" : "visible" }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${translate})`,
          transition,
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
