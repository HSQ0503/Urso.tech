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
        className="pointer-events-none absolute inset-x-0 top-0 h-[820px] opacity-70"
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

      <div className="relative px-14 pb-10 pt-20 text-center">
        <LiveTicker />
        <h1 className="mx-auto mt-9 max-w-[1200px] text-[124px] font-medium leading-[0.94] tracking-[-0.045em]">
          First click to
          <br />
          final sale<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-[720px] text-[19px] leading-[1.5] tracking-[-0.005em] text-ink-dim">
          Urso is an operational intelligence agency that combines advisory,
          automation, and custom software to help businesses connect data,
          streamline operations, and make smarter decisions.
        </p>
        <div className="mt-9 flex justify-center">
          <SlideToBook />
        </div>
      </div>

      <div className="relative px-14 pb-14 pt-10">
        <Modules />
      </div>

      <div className="relative px-14 pb-[72px] pt-10">
        <IntegrationStrip />
      </div>
    </section>
  );
}
