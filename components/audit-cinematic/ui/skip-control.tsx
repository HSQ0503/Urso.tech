"use client";

type Props = { onSkip: () => void };

export function SkipControl({ onSkip }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSkip();
      }}
      aria-label="Skip intro"
      className="absolute bottom-5 right-5 cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dimmer outline-none transition-colors hover:text-ink-dim focus-visible:ring-2 focus-visible:ring-white/40 sm:bottom-8 sm:right-8"
    >
      esc · skip ›
    </button>
  );
}
