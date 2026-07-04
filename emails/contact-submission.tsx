// Notification email sent to the founders when someone submits the contact
// form (app/contact) or the diagnostic-request form. Unlike discovery, there's
// no database row — this email IS the delivery — so the route surfaces a send
// failure to the visitor rather than dropping the lead. Light-background and
// table-based on purpose (email clients don't support dark mode or flex/grid).
// Generic label/value shape so both forms share one template.

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

export type ContactField = { label: string; value: string };

export type ContactSubmission = {
  kind: string; // display label, e.g. "Contact form" / "Diagnostic request"
  name: string;
  email: string;
  org?: string; // company / brand, shown in the heading when present
  facts: ContactField[]; // short scannable values → two-column ledger
  answers: ContactField[]; // long-form answers → labeled blocks
  submittedAt: string; // pre-formatted timestamp
};

const BRAND = "#fe5100";

export function ContactSubmissionEmail(props: ContactSubmission) {
  const { kind, name, email, org, submittedAt } = props;
  const facts = props.facts.filter((f) => f.value?.trim());
  const answers = props.answers.filter((f) => f.value?.trim());
  const firstName = name.split(" ")[0] || "them";

  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { brand: BRAND } } } }}>
        <Head />
        <Preview>{`${kind} — ${name}${org ? ` · ${org}` : ""}`}</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-8 w-full max-w-[600px] rounded-xl border border-solid border-gray-200 bg-white">
            <Section className="px-7 pt-7">
              <Text className="m-0 text-[11px] font-semibold uppercase tracking-[2px] text-brand">Urso · {kind}</Text>
              <Heading className="m-0 mt-2 text-[20px] font-semibold text-gray-900">
                {name}
                {org ? ` — ${org}` : ""}
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
                      {facts.map((f) => (
                        <tr key={f.label}>
                          <td className="py-[5px] pr-4 align-top text-[13px] text-gray-500">{f.label}</td>
                          <td className="py-[5px] text-right align-top text-[13px] font-medium text-gray-900">
                            {f.value}
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
                  No additional details were provided — only the basics.
                </Text>
              ) : (
                answers.map((f) => (
                  <Section key={f.label} className="mb-4">
                    <Text className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-gray-400">{f.label}</Text>
                    <Text className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-gray-800">
                      {f.value}
                    </Text>
                  </Section>
                ))
              )}
            </Section>

            <Hr className="mx-7 my-5 border-gray-200" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-gray-400">
                Reply straight to this email to reach {firstName} — the reply-to is set to their address.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ContactSubmissionEmail.PreviewProps = {
  kind: "Contact form",
  name: "Jane Cooper",
  email: "jane@brightside.com",
  org: "Brightside Dental",
  facts: [
    { label: "Website", value: "brightside.com" },
    { label: "Business type", value: "Clinic or practice" },
    { label: "Locations", value: "2–3" },
  ],
  answers: [
    {
      label: "What's getting harder as they grow",
      value: "The front desk can't keep up with the phones on Mondays, and we have no idea how many callers we miss.",
    },
    {
      label: "What runs the business today",
      value: "Dentrix for charts, QuickBooks for the books, a whiteboard for scheduling.",
    },
  ],
  submittedAt: "Friday, July 4, 2026 at 2:14 PM ET",
} satisfies ContactSubmission;

export default ContactSubmissionEmail;
