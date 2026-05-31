import Link from "next/link";
import { LiveTicker } from "./hero/live-ticker";
import { IntegrationStrip } from "./hero/integration-strip";
import { SlideToBook } from "./hero/slide-to-book";
import DarkVeil from "./ui/dark-veil";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-bg text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70 sm:h-[820px]"
        style={{
          maskImage:
            "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
        }}
      >
        <DarkVeil
          hueShift={220}
          speed={0.35}
          warpAmount={0.1}
          noiseIntensity={0.03}
        />
      </div>

      <div className="relative px-5 pb-8 pt-14 text-center sm:px-8 sm:pb-10 sm:pt-20 md:px-14">
        <LiveTicker />
        <h1 className="mx-auto mt-7 max-w-[1200px] text-[clamp(46px,13vw,124px)] font-medium leading-[0.95] tracking-[-0.045em] sm:mt-9 sm:leading-[0.94]">
          First click to
          <br />
          final sale<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[720px] text-[16px] leading-[1.5] tracking-[-0.005em] text-ink-dim sm:mt-8 sm:text-[19px]">
          Urso is a data agency for founder-led businesses. We find where your
          operation is quietly losing money missed calls, dead ad spend, the
          gaps between your tools then fix it with you, on retainer. The AI we
          build along the way is how we do it, not what we sell.
        </p>
        <div className="mt-7 flex justify-center sm:mt-9">
          <SlideToBook />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-ink-dim sm:mt-6">
          <Link
            href="/about"
            className="underline decoration-edge-strong underline-offset-[5px] transition-colors hover:text-ink hover:decoration-ink-dim"
          >
            New here? See who we are →
          </Link>
          <Link
            href="#how-it-works"
            className="underline decoration-edge-strong underline-offset-[5px] transition-colors hover:text-ink hover:decoration-ink-dim"
          >
            Or how it works →
          </Link>
        </div>
      </div>

      <div className="relative px-5 pb-14 pt-10 sm:px-8 sm:pb-[72px] sm:pt-14 md:px-14">
        <div id="diagnostic-cta-trigger" aria-hidden="true" className="h-px w-full" />
        <IntegrationStrip />
      </div>
    </section>
  );
}
