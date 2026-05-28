"use client";

import { useEffect } from "react";

// Reads the static page's hero CTA position and applies a transform to the
// cinematic root so it scales down toward that position over 1.5s.
// Fires once on mount (matches the 1500ms `handoff` beat duration).

export function HandoffScene() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".cinematic-root");
    const target = document.querySelector<HTMLElement>("[data-audit-hero-cta]");
    if (!root) return;

    if (!target) {
      // Fallback: scale in place + fade out.
      root.style.transform = "scale(0.6)";
      root.style.opacity = "0";
      root.dataset.handoff = "true";
      return;
    }

    // Compute translation that moves the cinematic's center to the target's center.
    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const rootCx = rootRect.left + rootRect.width / 2;
    const rootCy = rootRect.top + rootRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;
    const dx = targetCx - rootCx;
    const dy = targetCy - rootCy;

    // Apply transform — scale to ~CTA-size relative to viewport.
    root.style.transform = `translate(${dx}px, ${dy}px) scale(0.04)`;
    root.style.opacity = "0";
    root.dataset.handoff = "true";
  }, []);

  return null;
}
