import { LiveTicker } from "./hero/live-ticker";
import { IntegrationStrip } from "./hero/integration-strip";
import { SlideToBook } from "./hero/slide-to-book";
import { Modules } from "./modules";
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
          Urso is an AI-powered operational intelligence agency. Custom models
          trained on your data, paired with advisory, automation, and custom
          software — to connect systems, streamline operations, and make
          smarter decisions.
        </p>
        <div className="mt-7 flex justify-center sm:mt-9">
          <SlideToBook />
        </div>
      </div>

      <div className="relative px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-10 md:px-14">
        <Modules />
      </div>

      <div className="relative px-5 pb-14 pt-8 sm:px-8 sm:pb-[72px] sm:pt-10 md:px-14">
        <IntegrationStrip />
      </div>
    </section>
  );
}
