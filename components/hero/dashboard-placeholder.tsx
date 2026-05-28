const tabs = ["Findability", "Capture", "Convert", "Retain", "Reputation", "Money"];

const stats: ReadonlyArray<readonly [string, string]> = [
  ["Recovered MTD", "$4,180"],
  ["Open leaks", "3"],
  ["Confidence", "94%"],
];

export function DashboardPlaceholder() {
  return (
    <div
      className="relative mx-auto aspect-[16/9] w-full max-w-[1120px] overflow-hidden rounded-2xl border border-edge bg-[#0d0d0d]"
      style={{
        boxShadow:
          "0 60px 120px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, #000 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, #000 30%, transparent 80%)",
        }}
      />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-edge bg-[#0d0d0d]/50 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="block size-[18px] rounded bg-orange" />
          <span className="text-[13px] font-medium text-ink">
            Operating System
          </span>
        </div>
        <div className="hidden gap-2 md:flex">
          {tabs.map((t, i) => (
            <span
              key={t}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                i === 5
                  ? "border-b border-orange text-orange"
                  : "border-b border-transparent text-ink-dimmer"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-edge-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            <span className="block size-1.5 rounded-full bg-orange" />
            Dashboard placeholder
          </div>
          <div className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-ink-dimmer">
            Real dashboard renders here. Six panels, one schema, cross-store
            comparison built in.
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-edge bg-[#0d0d0d]/50 px-5 py-3.5">
        <div className="flex gap-8">
          {stats.map(([l, v]) => (
            <div key={l}>
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dimmer">
                {l}
              </div>
              <div className="mt-1 text-[16px] font-medium tracking-[-0.01em] text-ink">
                {v}
              </div>
            </div>
          ))}
        </div>
        <span className="font-mono text-[11px] text-ink-dim">
          Updated 2 min ago
        </span>
      </div>
    </div>
  );
}
