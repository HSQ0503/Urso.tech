import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import { Container, Eyebrow, Headline, Lede, BackdropGrid } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { DiscoveryForm } from "@/components/site/discovery-form";

export const metadata: Metadata = {
  title: "Before we meet",
  description:
    "A few questions about how the business runs, so we can do our homework before we talk.",
  // A link we send to warm prospects — not a public funnel page.
  robots: { index: false, follow: false },
};

export default function DiscoveryPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <section className="relative overflow-hidden pb-[clamp(64px,10vw,128px)] pt-[clamp(112px,15vw,168px)]">
          <BackdropGrid />
          <Container className="relative">
            <div className="mx-auto max-w-[760px]">
              <Reveal className="text-center">
                <Eyebrow>Before we meet</Eyebrow>
                <Headline as="h1" size="h1" className="mt-6">
                  A little homework
                </Headline>
                <Lede className="mx-auto mt-6 max-w-[52ch]">
                  A few questions about how the business runs, where the
                  information lives, and what would be most useful to fix. It
                  doesn&rsquo;t need to be perfect — short answers are completely
                  fine.
                </Lede>
              </Reveal>

              <Reveal delay={100} className="mt-12">
                <DiscoveryForm />
              </Reveal>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
