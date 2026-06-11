import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Pill } from "@/components/ui/pill";

export const metadata: Metadata = {
  title: "Terms of Service | Urso",
  description:
    "The terms and end-user license agreement that govern your use of Urso's website, dashboards, and services.",
};

const EFFECTIVE = "June 9, 2026";

const intro = `These Terms of Service (the "Terms") are a binding agreement between you and Urso ("Urso", "we", "us", or "our") — a data and analytics agency based in Orlando, Florida. They govern your use of our website at urso.ws and the dashboards, software, and services we provide (the "Services"), and they include the end-user license terms for that software. By using the Services or authorizing Urso to connect to your accounts, you agree to these Terms. If you do not agree, do not use the Services.`;

type Block = { h: string; p?: string[]; list?: string[]; note?: string };

const sections: Block[] = [
  {
    h: "The Services",
    p: [
      `Urso provides analytics dashboards for business owners, built by connecting to the tools they already use, plus the related implementation and advisory work agreed with each client. Specific scope, fees, and deliverables are set out in your separate agreement or order with Urso; these Terms govern your use of the software and website regardless of that agreement.`,
    ],
  },
  {
    h: "Eligibility and your account",
    p: [
      `You must be at least 18 and authorized to act on behalf of the business you represent. You are responsible for keeping your login and any connected credentials secure, and for activity that happens under your account.`,
    ],
  },
  {
    h: "Connecting your accounts",
    p: [
      `The Services let you authorize Urso to access data in third-party platforms you use — such as Google Business Profile, QuickBooks Online, FranPOS, and Twilio. By connecting an account, you represent that you are authorized to grant that access, and you permit Urso to access and process that data solely to provide the Services to you. You can disconnect any connection at any time, which ends our access going forward.`,
    ],
  },
  {
    h: "License to use the Services",
    p: [
      `Subject to these Terms, Urso grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Services for your own internal business purposes for as long as your engagement is active.`,
      `You may not copy, resell, sublicense, rent, reverse-engineer, or attempt to extract the source code of the Services; remove proprietary notices; or use the Services to build a competing product.`,
    ],
  },
  {
    h: "Acceptable use",
    p: [`You agree not to:`],
    list: [
      `Use the Services for anything unlawful, or to infringe anyone's rights.`,
      `Interfere with, overload, or attempt to gain unauthorized access to the Services or their underlying systems.`,
      `Upload malicious code, or misuse another business's or person's data.`,
    ],
  },
  {
    h: "Third-party services",
    p: [
      `The Services rely on third parties — including Intuit (QuickBooks), Google, FranPOS, Twilio, Supabase, and Vercel — each governed by its own terms and policies. Your use of those platforms through the Services is also subject to their terms, and Urso is not responsible for their availability, changes, or actions.`,
    ],
  },
  {
    h: "Fees",
    p: [
      `Any fees for the Services are set out in your separate agreement or order with Urso. Except where that agreement says otherwise, the Services are provided as part of a paid engagement and are not an offer of free service.`,
    ],
  },
  {
    h: "Intellectual property",
    p: [
      `Urso owns the Services, the software, and all related intellectual property. You own your business data. You grant Urso the rights needed to process your data to provide the Services, as described in our Privacy Policy.`,
    ],
  },
  {
    h: "Confidentiality",
    p: [
      `Each party will protect the other's non-public information and use it only as needed to perform under these Terms or your agreement.`,
    ],
  },
  {
    h: "Disclaimers",
    p: [
      `The Services are provided "as is" and "as available," without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. Urso does not warrant that the Services will be uninterrupted, error-free, or that insights drawn from third-party data will be complete or accurate.`,
    ],
  },
  {
    h: "Limitation of liability",
    p: [
      `To the maximum extent permitted by law, Urso will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits or revenues. Urso's total liability arising out of or relating to the Services will not exceed the amounts you paid to Urso for the Services in the three months before the claim.`,
    ],
  },
  {
    h: "Termination",
    p: [
      `You or Urso may end your use of the Services as set out in your agreement, or at any time if there is no separate agreement. On termination, your license ends, we stop accessing your connected accounts, and we delete or return your data as described in our Privacy Policy, except where law requires us to keep it.`,
    ],
  },
  {
    h: "Changes to these Terms",
    p: [
      `We may update these Terms from time to time. We will post the updated version on this page and revise the effective date above. Your continued use of the Services after a change means you accept the updated Terms.`,
    ],
  },
  {
    h: "Governing law",
    p: [
      `These Terms are governed by the laws of the State of Florida, USA, without regard to its conflict-of-laws rules. The courts located in Florida will have exclusive jurisdiction over any dispute, to the extent permitted by law.`,
    ],
  },
  {
    h: "Contact us",
    p: [
      `Questions about these Terms? Email us at han@urso.ws. Urso is based in Orlando, Florida, USA. See also our Privacy Policy at urso.ws/privacy.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="bg-bg text-ink">
      <Nav />

      <section className="border-b border-edge px-5 pb-12 pt-16 sm:px-8 sm:pb-14 sm:pt-20 md:px-14">
        <div className="max-w-[760px]">
          <Pill dot>Legal</Pill>
          <h1 className="mt-5 text-[clamp(34px,6vw,60px)] font-medium leading-[1.04] tracking-[-0.03em] sm:mt-6">
            Terms of Service<span className="text-orange">.</span>
          </h1>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Effective {EFFECTIVE}
          </p>
          <p className="mt-6 max-w-[680px] text-[15px] leading-[1.6] text-ink-dim sm:text-[16px]">{intro}</p>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-16 md:px-14 md:py-20">
        <div className="max-w-[760px] space-y-11">
          {sections.map((s, i) => (
            <div key={s.h}>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em]">
                <span className="text-orange">{String(i + 1).padStart(2, "0")}</span>
                <span className="ml-2.5 text-ink">{s.h}</span>
              </h2>
              <div className="mt-4 space-y-3.5">
                {s.p?.map((para, j) => (
                  <p key={j} className="text-[14.5px] leading-[1.65] text-ink-dim">{para}</p>
                ))}
                {s.list && (
                  <ul className="space-y-2.5 pt-0.5">
                    {s.list.map((li, j) => (
                      <li key={j} className="flex gap-2.5 text-[14.5px] leading-[1.6] text-ink-dim">
                        <span className="mt-[9px] size-1 shrink-0 rounded-full bg-orange" />
                        <span>{li}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.note && (
                  <div className="rounded-lg border border-edge bg-[#0b0b0b] px-4 py-3.5 text-[13.5px] leading-[1.6] text-ink">
                    {s.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
