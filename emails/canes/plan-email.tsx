// CUSTOMER-facing recurring service agreement — sent when the owner sends a
// plan for signature (notifyPlanSent). Same shell as the estimate email: the
// message, a tidy summary of the plan, and one "Review & sign" button linking
// to the public token URL.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow } from "./base";

export type PlanEmailProps = {
  number: string;
  customerName?: string | null;
  jobAddress?: string | null;
  jobName?: string | null;
  cadence: string; // "Quarterly"
  pricePerVisit: string; // pre-formatted money
  firstVisit: string; // "Oct 14, 2026"
  message?: string | null;
  reviewUrl: string; // /CanesPressure/r/<token>
};

export function PlanEmail({ number, customerName, jobAddress, jobName, cadence, pricePerVisit, firstVisit, message, reviewUrl }: PlanEmailProps) {
  const rows: DetailRow[] = [
    { label: "Agreement", value: number, strong: true },
    { label: "Customer", value: customerName },
    { label: "Address", value: jobAddress },
    { label: "Service", value: jobName },
    { label: "How often", value: cadence },
    { label: "Per visit", value: pricePerVisit, strong: true },
    { label: "First visit", value: firstVisit },
  ];

  return (
    <CanesEmail
      preview={`Your recurring service agreement from Canes Pressure Washing — ${number}`}
      accent="brand"
      eyebrow="Recurring service agreement"
      heading={`Agreement ${number}`}
    >
      {message?.trim() && (
        <Section className="px-7 pt-4">
          <Text className="m-0 whitespace-pre-line text-[14px] leading-[1.6] text-[#131B23]">{message}</Text>
        </Section>
      )}

      <Divider />

      <DetailTable rows={rows} />

      <CtaButton href={reviewUrl} label="Review & sign" tone="brand" />

      <Section className="px-7 pt-4">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          Tap the button above to read the full agreement and sign it with your name. If the button doesn&apos;t work,
          copy this link into your browser: <span className="text-[#131B23]">{reviewUrl}</span>
        </Text>
      </Section>
    </CanesEmail>
  );
}

PlanEmail.PreviewProps = {
  number: "PLAN-000012",
  customerName: "Marcus Bell",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  jobName: "Quarterly house wash",
  cadence: "Quarterly",
  pricePerVisit: "$450.00",
  firstVisit: "Oct 14, 2026",
  message: "Thanks again for having us out. Here is the maintenance plan we talked about.",
  reviewUrl: "https://urso.ws/CanesPressure/r/preview",
} satisfies PlanEmailProps;

export default PlanEmail;
