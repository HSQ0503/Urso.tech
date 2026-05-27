export function LiveTicker() {
  return (
    <div className="inline-flex items-center gap-3.5 rounded-full border border-edge bg-white/[0.025] py-2 pl-[18px] pr-2 text-[14px]">
      <span className="text-ink-dim">Now booking founding operators</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-white">
        <span
          className="size-1.5 rounded-full bg-white"
          style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.25)" }}
        />
        OPEN
      </span>
    </div>
  );
}
