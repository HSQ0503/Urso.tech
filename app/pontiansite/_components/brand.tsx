import type { ReactNode } from "react";

export type Tone = "blue" | "yellow" | "red" | "ink";

export const TONE_BG: Record<Tone, string> = {
  blue: "bg-pt-blue",
  yellow: "bg-pt-yellow",
  red: "bg-pt-red",
  ink: "bg-pt-ink",
};

export const BUTTON = {
  primary:
    "inline-flex h-12 cursor-pointer items-center justify-center rounded-[14px] bg-pt-action px-5 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-pt-action-deep active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pt-action",
  ink: "inline-flex h-12 cursor-pointer items-center justify-center rounded-[14px] bg-pt-ink px-5 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-[#2c2c2c] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pt-action",
  secondary:
    "inline-flex h-12 cursor-pointer items-center justify-center rounded-[14px] border border-[#cfcbc3] bg-white px-5 text-[16px] font-semibold text-pt-ink transition-colors duration-150 hover:bg-pt-paper active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pt-action",
};

export const CONTAINER = "mx-auto w-full max-w-[1248px] px-6";

export function Label({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2.5 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-pt-ink ${className}`}>
      <span aria-hidden className={`size-2.5 rounded-[3px] ${TONE_BG[tone]}`} />
      {children}
    </p>
  );
}

export function BuildConnectOperate({ className = "" }: { className?: string }) {
  const words: [string, Tone][] = [
    ["Build", "blue"],
    ["Connect", "yellow"],
    ["Operate", "red"],
  ];
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {words.map(([word, tone]) => (
        <span key={word} className="inline-flex items-center gap-2">
          <span aria-hidden className={`size-2.5 rounded-[3px] ${TONE_BG[tone]}`} />
          {word}
        </span>
      ))}
    </span>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
