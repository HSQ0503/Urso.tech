"use client";

// "Ask AI" affordance that sits next to a chart/metric. Click → a modal with a
// plain-English reading of that data and a recommended action. The analysis is
// passed in as serializable props (deterministic mock; a real model fills these
// once the feeds are live) so it can be rendered from server pages.

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
  label = "Ask AI",
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
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)]"
      >
        <Spark />
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Urso AI" title={topic} maxWidth={520}>
        <div className="space-y-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">What this is telling you</div>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-dim">{read}</p>
          </div>

          {points.length > 0 && (
            <ul className="space-y-2">
              {points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-[1.55] text-ink-dim">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-orange" />
                  {p}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-[rgba(254,81,0,0.3)] bg-orange-wash p-4">
            <div className="flex items-center gap-2">
              <span className="text-orange"><Spark /></span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Recommended action</span>
              {pending && <span className="rounded-full border border-edge px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">Pending data</span>}
            </div>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-ink">{recommendation}</p>
          </div>

          <a
            href="mailto:han@urso.tech?subject=Urso%20—%20follow%20up"
            className="inline-flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110"
          >
            Talk to Urso about this →
          </a>
        </div>
      </Modal>
    </>
  );
}
