import Image from "next/image";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import { Cta, Mark, BackdropGrid } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { HeroAsk } from "@/components/site/hero-ask";
import { Offerings } from "@/components/site/offerings";
import { AskDemo, Sparkle } from "@/components/site/ask-demo";
import { FeatureCards } from "@/components/site/feature-cards";
import { MeasureCards } from "@/components/site/measure-cards";
import {
  ForecastChart,
  FORECAST_GRADIENT,
  FORECAST_GRAIN,
} from "@/components/site/forecast";
import { Eclipse } from "@/components/site/eclipse";
import { WipeLink } from "@/components/site/wipe-link";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden px-[clamp(20px,4vw,56px)] pb-[clamp(64px,10vw,120px)] pt-[clamp(132px,20vw,224px)]">
          {/* Layered backdrop: the OS hairline grid, a richer multi-bloom orange
              glow, and fine film grain — depth and texture, not a flat black
              field. All faint enough to stay behind the type. */}
          <BackdropGrid />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(62% 44% at 50% -2%, rgba(254,81,0,0.17) 0%, rgba(254,81,0,0.045) 40%, transparent 68%)," +
                "radial-gradient(38% 30% at 82% 5%, rgba(255,120,42,0.08) 0%, transparent 55%)," +
                "radial-gradient(50% 28% at 50% 73%, rgba(254,81,0,0.05) 0%, transparent 72%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: FORECAST_GRAIN,
              backgroundSize: "150px 150px",
              opacity: 0.05,
              mixBlendMode: "soft-light",
            }}
          />
          <div className="relative mx-auto flex max-w-[940px] flex-col items-center text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-white/[0.04] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                For businesses that run on people
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-8 text-balance font-serif text-[clamp(3.25rem,9vw,7rem)] font-normal leading-[0.94] tracking-[-0.02em] text-ink">
                <em className="italic">Own</em> your direction
                <span className="text-orange">.</span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-9 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
                Urso is the operating partner for your business.
              </p>
            </Reveal>

            <Reveal delay={220} className="mt-11 w-full">
              <HeroAsk />
            </Reveal>

            <Reveal delay={280}>
              <p className="mt-6 text-[15px] text-ink-dimmer">
                See everything. Ask anything.
              </p>
            </Reveal>

            <Reveal delay={340}>
              <p className="mt-10 font-mono text-[11px] uppercase leading-[1.6] tracking-[0.14em] text-ink-dimmer">
                29 months of POS history · 4 locations · $6.8M validated to the penny
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Product showcase ===== */}
        <section className="relative overflow-hidden px-[clamp(20px,4vw,56px)] pb-[clamp(64px,11vw,160px)] pt-[clamp(24px,5vw,80px)]">
          <Reveal className="mx-auto max-w-[1000px] text-center">
            <h2 className="text-balance font-serif text-[clamp(3rem,7vw,6rem)] font-normal leading-[1.02] tracking-[-0.025em] text-ink">
              <em className="italic">Simplify</em> your operation
              <span className="text-orange">.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-[clamp(28px,4vw,52px)] w-full">
            <div className="relative mx-auto" style={{ maxWidth: 720 }}>
              {/* Soft glow lifting the device off the dark field. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(52% 44% at 50% 46%, rgba(254,81,0,0.1) 0%, transparent 70%)",
                }}
              />
              <Image
                src="/images/macbook.png"
                alt="The Urso dashboard on a MacBook — a performance overview across the whole business."
                width={1080}
                height={1080}
                sizes="(max-width: 768px) 100vw, 720px"
                className="relative h-auto w-full"
              />
            </div>
          </Reveal>
        </section>

        {/* ===== Story / what we offer ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="mx-auto max-w-[820px] text-center">
            <h2 className="text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">More</em> than software
              <span className="text-orange">.</span>
            </h2>
            <p className="mt-7 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
              You don&rsquo;t buy a tool — you hire the team that runs it.
            </p>
            <p className="mx-auto mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Urso connects the data scattered across your business into one
              operating system, surfaces where you&rsquo;re losing money, and works
              with your team to fix it — week after week. The software is where we
              start; the partnership is what you&rsquo;re paying for.
            </p>
            <div className="mt-9 flex justify-center">
              <WipeLink
                href="/how-it-works"
                className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.035) 100%)",
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.07), 0 16px 32px -16px rgba(0,0,0,0.85)",
                }}
              >
                More about how we work
              </WipeLink>
            </div>
          </Reveal>

          <Offerings />
        </section>

        {/* ===== Ask anything (AI layer) ===== */}
        <section className="relative overflow-hidden border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="relative mx-auto max-w-[760px] text-center">
            <div className="flex justify-center">
              <Sparkle size={52} />
            </div>
            <h2 className="mt-8 text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">Ask</em> anything
              <span className="text-orange">.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Urso AI turns your numbers into answers you can trust — grounded in
              your real data, sized in dollars, and ready to act on.
            </p>
          </Reveal>
          <Reveal delay={120} className="relative mt-[clamp(40px,6vw,72px)]">
            <AskDemo />
          </Reveal>
        </section>

        {/* ===== Feature cards: dashboard + AI analyst ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,11vw,160px)]">
          <Reveal>
            <FeatureCards />
          </Reveal>
        </section>

        {/* ===== Measure what matters (dashboard metrics) ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="mx-auto max-w-[820px] text-center">
            <h2 className="text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">Measure</em> what matters
              <span className="text-orange">.</span>
            </h2>
            <p className="mt-7 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
              Every number, defined once.
            </p>
            <p className="mx-auto mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Revenue, capacity, retention, reputation — the metrics that actually
              move your business, live on one screen and true at every location.
            </p>
            <div className="mt-9 flex justify-center">
              <WipeLink
                href="/capabilities"
                className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.035) 100%)",
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.07), 0 16px 32px -16px rgba(0,0,0,0.85)",
                }}
              >
                More about the dashboard
              </WipeLink>
            </div>
          </Reveal>
          <div className="mt-[clamp(48px,7vw,88px)]">
            <MeasureCards />
          </div>
        </section>

        {/* ===== Compound — the AI analyst that learns what works ===== */}
        <section className="relative overflow-hidden">
          {/* Full-bleed amber field — fades from the dark section above; bright
              bloom kept low so the white headline reads over the dark top band. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: FORECAST_GRADIENT }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: FORECAST_GRAIN,
              backgroundSize: "160px 160px",
              opacity: 0.07,
              mixBlendMode: "soft-light",
            }}
          />
          <div className="relative mx-auto max-w-[1120px] px-[clamp(20px,4vw,56px)] pb-[clamp(72px,11vw,150px)] pt-[clamp(88px,14vw,190px)]">
            <Reveal className="text-center">
              {/* No orange period — the headline sits over the orange gradient. */}
              <h2 className="mx-auto max-w-[15ch] text-balance font-serif text-[clamp(2.75rem,6.4vw,5.25rem)] font-normal leading-[1.0] tracking-[-0.025em] text-ink">
                <em className="italic">Compound</em> your gains
              </h2>
              <p className="mx-auto mt-7 max-w-[46ch] text-[clamp(1.0625rem,1.7vw,1.25rem)] leading-[1.5] text-ink-dim">
                Every fix is measured against your real numbers. The system keeps
                what works and drops what doesn&rsquo;t &mdash; so the wins
                don&rsquo;t just add up. They compound.
              </p>
              <div className="mt-9 flex justify-center">
                <WipeLink
                  href="/capabilities"
                  className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)",
                    boxShadow:
                      "inset 0 1px 0 0 rgba(255,255,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.08), 0 16px 32px -16px rgba(0,0,0,0.85)",
                  }}
                >
                  More about Urso AI
                </WipeLink>
              </div>
            </Reveal>
            <div className="mt-[clamp(48px,7vw,90px)]">
              <ForecastChart />
            </div>
          </div>
        </section>

        {/* ===== Final CTA — eclipse (grows as you scroll) ===== */}
        <section className="relative isolate flex min-h-[clamp(680px,92svh,1040px)] items-center overflow-hidden px-[clamp(20px,4vw,56px)] py-[clamp(96px,14vw,180px)]">
          <Eclipse />
          {/* Keeps the headline + sub on near-black even where the corona
              swells across them on small screens. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[clamp(360px,60vh,560px)] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse closest-side at center, #070707 0%, rgba(7,7,7,0.9) 46%, transparent 100%)",
            }}
          />
          <Reveal className="relative mx-auto w-full max-w-[640px] text-center">
            <h2 className="font-serif text-[clamp(2.75rem,6.4vw,5rem)] font-normal leading-[1.02] tracking-[-0.025em] text-ink">
              <em className="italic">Run</em> it together<span className="text-orange">.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[40ch] text-[17px] leading-[1.55] text-ink-dim sm:text-[19px]">
              You bring the business. We bring the team that reads the numbers —
              and stays to fix what they find.
            </p>

            {/* you + Urso — the partnership, in the shape of Origin's "add your
                partner" avatars. */}
            <div className="mt-10 flex justify-center">
              <div
                aria-hidden
                className="inline-flex items-center rounded-full border border-edge bg-white/[0.04] px-2.5 py-2 backdrop-blur-sm"
              >
                <span className="relative z-20 grid h-11 w-11 place-items-center rounded-full border border-edge-strong bg-[#0c0c0d]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8.5" r="3.4" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                    <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="relative z-30 -mx-2 grid h-12 w-12 place-items-center rounded-full border-2 border-orange bg-[#0c0c0d] shadow-[0_0_22px_-4px_rgba(254,81,0,0.65)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="9" cy="9.2" r="2.7" stroke="#fe5100" strokeWidth="1.5" />
                    <circle cx="15.6" cy="9.6" r="2.3" stroke="#fe5100" strokeWidth="1.5" />
                    <path d="M4 18.4a5 5 0 0 1 10 0" stroke="#fe5100" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M13.6 17.6a4.6 4.6 0 0 1 6.6 .7" stroke="#fe5100" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="relative z-20 grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-edge-strong bg-[#0c0c0d]">
                  <Mark height={16} />
                </span>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
              <Cta href="/contact" size="lg">
                Start the conversation
              </Cta>
              <Cta href="/what-we-find" variant="text" size="lg">
                See what we find
              </Cta>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
