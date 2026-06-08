"use client";

// "Ask urso.ai" — the in-dashboard AI assistant. Click → a clean modal with a
// plain-English reading of that data and a recommended action. This is the AI
// product (urso.ai), distinct from "Talk to Urso" (the human team), so it has no
// human-contact CTA. Analysis is passed in as serializable props (deterministic
// mock; a real model fills these once the feeds are live).

import { useState } from "react";
import { Modal } from "./modal";

function Spark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.7 4.8L18 9.5l-4.3 1.7L12 16l-1.7-4.8L6 9.5l4.3-1.7L12 3Z" />
    </svg>
  );
}

export function AskAi({
  topic,
  read,
  points = [],
  recommendation,
  pending = false,
  label = "Ask urso.ai",
}: {
  topic: string;
  read: string;
  points?: string[];
  recommendation: string;
  pending?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border border-edge text-ink-dimmer transition-colors hover:border-[rgba(254,81,0,0.45)] hover:bg-orange-soft hover:text-orange"
      >
        <Spark />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="urso.ai" title={topic} maxWidth={500}>
        <div className="space-y-5">
          <p className="text-[14px] leading-[1.65] text-ink">{read}</p>

          {points.length > 0 && (
            <ul className="space-y-2.5 border-t border-edge pt-4">
              {points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-[1.55] text-ink-dim">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-dimmer" />
                  {p}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-[rgba(254,81,0,0.28)] bg-orange-wash p-4">
            <div className="flex items-center gap-2">
              <span className="text-orange">
                <Spark />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Recommended action</span>
              {pending && <span className="rounded-full border border-edge px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">Pending data</span>}
            </div>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-ink">{recommendation}</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
