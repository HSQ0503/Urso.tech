// Notification email sent to the founders when a prospect submits the
// pre-meeting discovery form (app/discovery). The Supabase row is the system
// of record; this is the ping so the founders read it before the call. Built
// with React Email so it renders cleanly across clients — light-background and
// table-based on purpose (email clients don't support dark mode or flex/grid).

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Hr,
  Link,
  Tailwind,
  pixelBasedPreset,
} from "@react-email/components";

export type DiscoverySubmission = {
  name: string;
  email: string;
  businessName?: string;
  locations?: string;
  structure?: string;
  revenueBand?: string;
  systems?: string;
  infoLocation?: string;
  contactChannels?: string;
  journey?: string;
  leakGuess?: string;
  wishVisibility?: string;
  gutDecisions?: string;
  currentReports?: string;
  worthIt?: string;
  anythingElse?: string;
  submittedAt: string; // pre-formatted timestamp
};

const BRAND = "#fe5100";

// Short, scannable facts rendered as a two-column ledger.
const FACTS: [keyof DiscoverySubmission, string][] = [
  ["businessName", "Business"],
  ["locations", "Locations"],
  ["structure", "Independent / franchise"],
  ["revenueBand", "Rough monthly revenue"],
];

// Long-form answers rendered as labeled blocks, in form order.
const ANSWERS: [keyof DiscoverySubmission, string][] = [
  ["systems", "Systems they run"],
  ["infoLocation", "Where the info lives"],
  ["contactChannels", "How customers reach & book / who answers"],
  ["journey", "Customer journey — first contact to paid"],
  ["leakGuess", "Where they think they lose the most"],
  ["wishVisibility", "Most wish they could see instantly"],
  ["gutDecisions", "Decided on gut today"],
  ["currentReports", "Numbers they already check"],
  ["worthIt", "What would make it worth it"],
  ["anythingElse", "Anything else"],
];

export function DiscoverySubmissionEmail(props: DiscoverySubmission) {
  const { name, email, businessName, submittedAt } = props;
  const facts = FACTS.filter(([k]) => (props[k] ?? "").toString().trim());
  const answers = ANSWERS.filter(([k]) => (props[k] ?? "").toString().trim());

  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { brand: BRAND } } } }}>
        <Head />
        <Preview>{`Discovery form — ${name}${businessName ? ` · ${businessName}` : ""}`}</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-8 w-full max-w-[600px] rounded-xl border border-solid border-gray-200 bg-white">
            <Section className="px-7 pt-7">
              <Text className="m-0 text-[11px] font-semibold uppercase tracking-[2px] text-brand">Urso · Discovery form</Text>
              <Heading className="m-0 mt-2 text-[20px] font-semibold text-gray-900">
                {name}
                {businessName ? ` — ${businessName}` : ""}
              </Heading>
              <Text className="m-0 mt-1 text-[13px] text-gray-500">
                <Link href={`mailto:${email}`} className="text-brand underline">{email}</Link>
                {" · "}
                {submittedAt}
              </Text>
            </Section>

            {facts.length > 0 && (
              <>
                <Hr className="mx-7 my-5 border-gray-200" />
                <Section className="px-7">
                  <table className="w-full" cellPadding={0} cellSpacing={0}>
                    <tbody>
                      {facts.map(([k, label]) => (
                        <tr key={k}>
                          <td className="py-[5px] pr-4 align-top text-[13px] text-gray-500">{label}</td>
                          <td className="py-[5px] text-right align-top text-[13px] font-medium text-gray-900">
                            {props[k] as string}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              </>
            )}

            <Hr className="mx-7 my-5 border-gray-200" />

            <Section className="px-7 pb-2">
              {answers.length === 0 ? (
                <Text className="m-0 text-[13px] italic text-gray-400">
                  No long-form answers — only the basics were filled in.
                </Text>
              ) : (
                answers.map(([k, label]) => (
                  <Section key={k} className="mb-4">
                    <Text className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-gray-400">{label}</Text>
                    <Text className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-gray-800">
                      {props[k] as string}
                    </Text>
                  </Section>
                ))
              )}
            </Section>

            <Hr className="mx-7 my-5 border-gray-200" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-gray-400">
                Saved to <span className="font-mono">discovery_submissions</span>. Do the recon, then book the call.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

DiscoverySubmissionEmail.PreviewProps = {
  name: "Rubens Campos",
  email: "rubens@example.com",
  businessName: "Woof Gang Bakery & Grooming",
  locations: "4–9",
  structure: "Franchise — Woof Gang Bakery",
  revenueBand: "$150k–500k/mo",
  systems: "FranPOS for the registers and booking, QuickBooks for the books, the phone is just the front desk line.",
  infoLocation: "Mostly FranPOS, but the real picture is in my head and a couple of spreadsheets.",
  contactChannels: "Most book by phone or walk in. Front desk answers when they can — after hours it just rings.",
  journey: "They find us on Google, call or walk in, we book the groom, they pay at pickup, we hope they rebook.",
  leakGuess: "Honestly the phone. When we're slammed it just rings and I have no idea how many we miss.",
  wishVisibility: "Which store is actually doing well this week, and why.",
  gutDecisions: "Staffing and which store needs attention — all gut.",
  currentReports: "I glance at the FranPOS daily totals. That's about it.",
  worthIt: "If I could see all four stores in one place and stop losing calls.",
  anythingElse: "Winter Park is the strong one. The two Horizon West stores are newer.",
  submittedAt: "Wednesday, June 24, 2026 at 2:14 PM ET",
} satisfies DiscoverySubmission;

export default DiscoverySubmissionEmail;
