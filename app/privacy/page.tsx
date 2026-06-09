import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Pill } from "@/components/ui/pill";

export const metadata: Metadata = {
  title: "Privacy Policy | Urso",
  description:
    "How Urso collects, uses, and protects information across our website and the dashboards we build for our clients.",
};

const EFFECTIVE = "June 9, 2026";

const intro = `This Privacy Policy explains how Urso ("Urso", "we", "us", or "our") — a data and analytics agency based in Orlando, Florida — collects, uses, and protects information in connection with our website at urso.tech and the dashboards and services we provide to our business clients (the "Services"). By using our Services or authorizing Urso to connect to your accounts, you agree to this Policy.`;

type Block = { h: string; p?: string[]; list?: string[]; note?: string };

const sections: Block[] = [
  {
    h: "Who this covers",
    p: [
      `Urso builds analytics dashboards for business owners ("Clients"). To do that, Clients authorize us to access data in the third-party tools they already use, so we can show it back to them in one place. This Policy applies both to visitors of our website and to the Client account data we process on their behalf.`,
    ],
  },
  {
    h: "Information we collect",
    p: [`We collect three kinds of information:`],
    list: [
      `Information you give us — your name, email, business name, and anything you send when you contact us or request a diagnostic.`,
      `Data from services you connect — when a Client authorizes a connection, we access business data from the platforms below, strictly to power their dashboard: Google Business Profile (listing details, reviews, ratings, replies, and performance insights for locations you manage); QuickBooks Online (financial reports, expenses, vendor bills, and accounting records); FranPOS (point-of-sale orders, products, customers, appointments, and staff records); and Twilio (call metadata such as time, answered/missed status and duration, and SMS delivery status).`,
      `Information collected automatically — basic usage and device information, and cookies, when you visit urso.tech, used to operate and improve the site.`,
    ],
  },
  {
    h: "How we use information",
    p: [`We use information only to run and improve the Services:`],
    list: [
      `To provide and maintain the dashboards and the analytics, insights, and recommended actions in them.`,
      `To take actions you authorize on your behalf — for example, drafting and posting replies to your reviews, or texting back a missed caller.`,
      `To communicate with you about the Services and respond to your requests.`,
      `To secure, troubleshoot, and improve the Services, and to meet legal obligations.`,
    ],
    note: `We do not sell your information, and we do not use it for advertising.`,
  },
  {
    h: "Google user data",
    p: [
      `When you connect a Google account, Urso accesses Google Business Profile data only to display it in your dashboard and, at your direction, to reply to your reviews and update your listing. We request the minimum scopes needed, and only for the locations you authorize.`,
      `We do not allow humans to read your Google data except: (a) with your explicit consent; (b) where necessary for security purposes, or to comply with applicable law; or (c) where the data has been aggregated or anonymized and is used to operate or improve the Services.`,
    ],
    note: `Urso's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.`,
  },
  {
    h: "How we share information",
    p: [`We share information only as needed to operate the Services:`],
    list: [
      `Service providers that host and process data for us — such as Supabase (database) and Vercel (hosting) — under agreements that require them to protect it.`,
      `The platforms you connect, when we act at your direction (for example, posting a review reply back to Google).`,
      `Legal and safety — when required by law, or to protect the rights, property, or safety of Urso, our Clients, or others.`,
      `Business transfers — if Urso is involved in a merger or acquisition, with notice to you.`,
    ],
    note: `We never sell your data, and we never share it for third-party advertising.`,
  },
  {
    h: "Data retention",
    p: [
      `We keep data only as long as we need it to provide the Services, or as required by law. When a Client ends their engagement or disconnects an account, we delete or anonymize the associated data within a reasonable period, unless we are legally required to keep it.`,
    ],
  },
  {
    h: "Security",
    p: [
      `We protect data with encryption in transit, access controls, and strict server-side handling of all credentials and access tokens — these are never exposed to your browser. No system is perfectly secure, but we work hard to safeguard your information.`,
    ],
  },
  {
    h: "Your choices and rights",
    p: [
      `You can disconnect any connected account at any time — for example, by revoking Urso's access in your Google Account security settings or in QuickBooks — which stops our access going forward.`,
      `You can ask us to access, correct, or delete your information by emailing us. Depending on where you live, you may have additional rights (such as under the GDPR or CCPA), and we will honor applicable requests.`,
    ],
  },
  {
    h: "Third-party services",
    p: [
      `Our Services connect to and depend on third parties, each with its own privacy policy: Google Business Profile, QuickBooks Online (Intuit), FranPOS, Twilio, Supabase, and Vercel. We encourage you to review their policies to understand how they handle data.`,
    ],
  },
  {
    h: "Children's privacy",
    p: [
      `Our Services are built for businesses and are not directed to children under 13. We do not knowingly collect information from children.`,
    ],
  },
  {
    h: "International users",
    p: [
      `Urso operates in the United States. If you use the Services from outside the U.S., you understand that your information will be processed in the United States.`,
    ],
  },
  {
    h: "Changes to this policy",
    p: [
      `We may update this Policy from time to time. We will post the updated version on this page and revise the effective date above. If changes are material, we will provide notice where appropriate.`,
    ],
  },
  {
    h: "Contact us",
    p: [
      `Questions about this Policy or your data? Email us at han@urso.tech. Urso is based in Orlando, Florida, USA.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="bg-bg text-ink">
      <Nav />

      <section className="border-b border-edge px-5 pb-12 pt-16 sm:px-8 sm:pb-14 sm:pt-20 md:px-14">
        <div className="max-w-[760px]">
          <Pill dot>Legal</Pill>
          <h1 className="mt-5 text-[clamp(34px,6vw,60px)] font-medium leading-[1.04] tracking-[-0.03em] sm:mt-6">
            Privacy Policy<span className="text-orange">.</span>
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
