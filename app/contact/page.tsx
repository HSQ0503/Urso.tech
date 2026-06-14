import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Container,
  Eyebrow,
  Headline,
  Lede,
  BackdropGrid,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { ContactForm } from "@/components/site/contact-form";

export const metadata: Metadata = {
  title: "Start the conversation",
  description:
    "The beginning of a business review, not a sales funnel. Tell us how the business runs; we'll come back with what we'd look at first.",
};

const STEPS = [
  ["We read it.", "A founder reads every note. There's no inbox triage team to get past."],
  ["We look from the outside.", "Before we talk, we do recon an operator would respect: your public surfaces, booking flow, reviews — what a customer actually hits."],
  ["We talk.", "Thirty minutes on your operation and what we'd examine first. If we're not the right fit, we'll say so."],
];

export default function ContactPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <section className="relative overflow-hidden pb-[clamp(64px,10vw,128px)] pt-[clamp(112px,15vw,168px)]">
          <BackdropGrid />
          <Container className="relative">
            <div className="grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-12">
              {/* Left — the pitch */}
              <div className="lg:col-span-5">
                <Reveal>
                  <Eyebrow>Contact</Eyebrow>
                  <Headline as="h1" size="h1" className="mt-6">
                    Start the conversation
                  </Headline>
                  <Lede className="mt-7 max-w-[46ch]">
                    This is the beginning of a business review, not a sales
                    funnel. Tell us how the business runs; we&rsquo;ll come back
                    with what we&rsquo;d look at first.
                  </Lede>
                </Reveal>

                <Reveal delay={120} className="mt-12">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                    What happens next
                  </div>
                  <ol className="mt-5">
                    {STEPS.map(([t, d], i) => (
                      <li
                        key={t}
                        className="flex gap-4 border-t border-edge py-5 last:border-b"
                      >
                        <span className="font-mono text-[11px] text-ink-dimmer">
                          {`0${i + 1}`}
                        </span>
                        <div>
                          <div className="text-[15px] font-medium tracking-[-0.01em] text-ink">
                            {t}
                          </div>
                          <p className="mt-1.5 text-[14px] leading-[1.5] text-ink-dim">
                            {d}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Reveal>
              </div>

              {/* Right — the form */}
              <div className="lg:col-span-6 lg:col-start-7">
                <Reveal delay={80}>
                  <ContactForm />
                </Reveal>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
