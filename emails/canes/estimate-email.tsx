// CUSTOMER-facing estimate email — the showcase. Sent when the owner marks an
// estimate as sent (notifyEstimateSent). Clean, professional, trustworthy: the
// brand wordmark, the message to the customer, a tidy summary block, and one
// prominent "Review & approve" button linking to the public token URL.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow } from "./base";

export type EstimateEmailProps = {
  number: string;
  customerName?: string | null;
  customerPhone?: string | null; // pre-formatted, e.g. "(407) 555-0134"
  jobAddress?: string | null;
  jobName?: string | null;
  total: string; // pre-formatted money, e.g. "$1,240.00"
  deposit?: string | null; // pre-formatted money or null
  message?: string | null; // owner's note to the customer
  reviewUrl: string; // /CanesPressure/e/<token>
};

export function EstimateEmail({
  number,
  customerName,
  customerPhone,
  jobAddress,
  jobName,
  total,
  deposit,
  message,
  reviewUrl,
}: EstimateEmailProps) {
  const rows: DetailRow[] = [
    { label: "Estimate", value: number, strong: true },
    { label: "Customer", value: customerName },
    { label: "Phone", value: customerPhone },
    { label: "Address", value: jobAddress },
    { label: "Job", value: jobName },
    { label: "Total", value: total, strong: true },
    { label: "Deposit", value: deposit },
  ];

  return (
    <CanesEmail
      preview={`Your estimate from Canes Pressure Washing — ${number}`}
      accent="brand"
      eyebrow="Your estimate is ready"
      heading={`Estimate ${number}`}
    >
      {message?.trim() && (
        <Section className="px-7 pt-4">
          <Text className="m-0 whitespace-pre-line text-[14px] leading-[1.6] text-[#131B23]">{message}</Text>
        </Section>
      )}

      <Divider />

      <DetailTable rows={rows} />

      <CtaButton href={reviewUrl} label="Review & approve" tone="brand" />

      <Section className="px-7 pt-4">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          Tap the button above to view the full estimate, approve it, or ask a question. If the button doesn&apos;t
          work, copy this link into your browser:{" "}
          <span className="text-[#131B23]">{reviewUrl}</span>
        </Text>
      </Section>
    </CanesEmail>
  );
}

EstimateEmail.PreviewProps = {
  number: "EST-1042",
  customerName: "Marcus Bell",
  customerPhone: "(407) 555-0134",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  jobName: "House wash + driveway",
  total: "$1,240.00",
  deposit: "$300.00",
  message:
    "Hi Marcus — thanks for having us out. Here's the estimate for the house wash and driveway. Everything's itemized on the review page. Let me know if you have any questions!",
  reviewUrl: "https://urso.ws/CanesPressure/e/tok_abc123",
} satisfies EstimateEmailProps;

export default EstimateEmail;
