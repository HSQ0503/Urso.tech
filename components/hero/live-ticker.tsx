export function LiveTicker() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-white/[0.025] py-1.5 pl-3.5 pr-1.5 text-[12px] sm:gap-3.5 sm:py-2 sm:pl-[18px] sm:pr-2 sm:text-[14px]">
      <span className="text-ink-dim">Now booking founding operators</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange px-2 py-[3px] font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-white sm:px-2.5 sm:py-1 sm:text-[10px]">
        <span
          className="size-1.5 rounded-full bg-white"
          style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.25)" }}
        />
        OPEN
      </span>
    </div>
  );
}
