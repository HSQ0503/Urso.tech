import { Logo } from "./ui/logo";

const columns: Array<readonly [string, ReadonlyArray<string>]> = [
  ["Product", ["Operating System", "Modules", "Pricing", "Roadmap"]],
  ["Solutions", ["Pet franchises", "Wellness multi-unit", "Service brands"]],
  ["Company", ["About", "Founders", "Master context", "Careers"]],
  ["Contact", ["Book an audit", "hello@urso.co", "X / Twitter", "LinkedIn"]],
];

export function Footer() {
  return (
    <footer className="border-t border-edge bg-[#040404] px-14 pb-10 pt-14 text-ink">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-[280px] text-[13px] leading-[1.5] text-ink-dim">
            A data agency for founder-led service businesses.
            <br />
            Run on data, not gut feel.
          </p>
        </div>
        {columns.map(([h, items]) => (
          <div key={h}>
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer">
              {h}
            </div>
            <div className="flex flex-col gap-2.5">
              {items.map((it) => (
                <a
                  key={it}
                  href="#"
                  className="text-[13px] text-ink-dim hover:text-ink"
                >
                  {it}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-14 flex flex-wrap justify-between gap-2 border-t border-edge pt-6 font-mono text-[11px] tracking-[0.04em] text-ink-dimmer">
        <span>© 2026 Urso. All rights reserved.</span>
        <span>&ldquo;Urso&rdquo; — Portuguese for bear.</span>
      </div>
    </footer>
  );
}
