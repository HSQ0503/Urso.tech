"use client";

import { useId, useState } from "react";
import type { Finding } from "./findings-data";
import { cx } from "./ui";

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-t border-edge first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-4 py-5 text-left outline-none focus-visible:bg-white/[0.02]"
      >
        <span className="w-[104px] shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
          {finding.tag}
        </span>
        <span className="flex-1 text-[16px] leading-[1.4] tracking-[-0.01em] text-ink sm:text-[17px]">
          {finding.title}
        </span>
        <span
          className={cx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-edge text-ink-dim transition-all duration-200 group-hover:border-edge-strong group-hover:text-ink",
            open && "rotate-45",
          )}
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      <div id={panelId} className="ledger-panel" data-open={open}>
        <div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-4 pb-6 pl-0 sm:grid-cols-2 sm:pl-[120px]">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                Where it hides
              </div>
              <p className="mt-2 text-[14px] leading-[1.55] text-ink-dim">
                {finding.hides}
              </p>
            </div>
            <div className="border-l-2 border-orange pl-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
                The move
              </div>
              <p className="mt-2 text-[14px] leading-[1.55] text-ink">
                {finding.move}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FindingsLedger({ findings }: { findings: Finding[] }) {
  return (
    <div>
      {findings.map((f) => (
        <FindingRow key={f.tag} finding={f} />
      ))}
    </div>
  );
}
