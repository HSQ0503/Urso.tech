"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { consumeIntro } from "@/lib/intro-state";

// Dynamic import — cinematic doesn't ship in the static page bundle.
const AuditCinematic = dynamic(
  () => import("./").then((m) => m.AuditCinematic),
  { ssr: false },
);

export function AuditPageGate({ children }: { children: ReactNode }) {
  const [showCinematic, setShowCinematic] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Always discard a pending flag so it doesn't leak to the next page.
      consumeIntro();
      return;
    }

    // Debug helper — ?intro=1 forces the cinematic to play even on direct
    // URL hits. Lets us iterate on scenes without sliding from the homepage
    // every time. Strip on production if it's a problem.
    const debug = new URLSearchParams(window.location.search).get("intro") === "1";

    if (consumeIntro() || debug) {
      setShowCinematic(true);
    }
  }, []);

  return (
    <>
      {children}
      {mounted && showCinematic && (
        <AuditCinematic onComplete={() => setShowCinematic(false)} />
      )}
    </>
  );
}
