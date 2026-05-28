import { Pill } from "@/components/ui/pill";

const rows: Array<{
  label: string;
  title: string;
  body: string;
}> = [
  {
    label: "From you",
    title: "~2 hours up front. ~30 minutes a week.",
    body: "One kickoff call, one weekly sync, and the time to share access. We do the digging.",
  },
  {
    label: "Access we'll need",
    title: "Read-only credentials to your stack.",
    body: "POS, Google Business Profile, accounting, ad accounts, and your phone provider. Read-only — we observe, you stay in control.",
  },
  {
    label: "Timeline",
    title: "Four weeks from access to leak report.",
    body: "Fixed schedule, no scope creep. If we miss a beat, we say so on the weekly sync.",
  },
  {
    label: "Pricing",
    title: "Scoped after a 30-minute fit call.",
    body: "We need to see your store count and stack before quoting. No pressure — the call is free, and we'll tell you if it isn't a fit.",
  },
];

export function AuditCommitment() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What it takes</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            No surprises<span className="text-orange">.</span>
          </h2>
          <p className="mt-5 max-w-[520px] text-[15px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:mt-6 sm:text-[16px]">
            Here&apos;s exactly what we need from you, what you&apos;ll need
            from us, and what it costs to find out if it&apos;s a fit.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-edge bg-panel md:mt-14">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`grid grid-cols-1 gap-2 p-6 sm:p-8 md:grid-cols-[200px_1fr] md:gap-10 md:p-9 ${
                i < rows.length - 1 ? "border-b border-edge" : ""
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange md:pt-1">
                {r.label}
              </div>
              <div>
                <h3 className="text-[17px] font-medium leading-[1.3] tracking-[-0.015em] sm:text-[19px]">
                  {r.title}
                </h3>
                <p className="mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                  {r.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
