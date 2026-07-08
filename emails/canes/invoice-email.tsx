// CUSTOMER-facing invoice email — sent when the owner bills a completed job for
// card payment (notifyInvoiceSent). Mirrors estimate-email: brand wordmark, a
// short message, a tidy summary block, and one prominent "View & pay" button
// linking to the public invoice page (which deep-links to Square's hosted,
// PCI-compliant pay page). Our server never touches card data.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow } from "./base";

export type InvoiceEmailProps = {
  number: string;
  customerName?: string | null;
  customerPhone?: string | null; // pre-formatted
  jobAddress?: string | null;
  jobName?: string | null;
  total: string; // pre-formatted money
  balance?: string | null; // pre-formatted money still owed, or null if paid in full
  message?: string | null;
  payUrl: string; // /CanesPressure/i/<token>
};

export function InvoiceEmail({
  number,
  customerName,
  customerPhone,
  jobAddress,
  jobName,
  total,
  balance,
  message,
  payUrl,
}: InvoiceEmailProps) {
  const rows: DetailRow[] = [
    { label: "Invoice", value: number, strong: true },
    { label: "Customer", value: customerName },
    { label: "Phone", value: customerPhone },
    { label: "Address", value: jobAddress },
    { label: "Service", value: jobName },
    { label: "Total", value: total, strong: true },
    { label: "Amount due", value: balance },
  ];

  return (
    <CanesEmail
      preview={`Your invoice from Canes Pressure Washing — ${number}`}
      accent="brand"
      eyebrow="Your invoice is ready"
      heading={`Invoice ${number}`}
    >
      {message?.trim() && (
        <Section className="px-7 pt-4">
          <Text className="m-0 whitespace-pre-line text-[14px] leading-[1.6] text-[#131B23]">{message}</Text>
        </Section>
      )}

      <Divider />

      <DetailTable rows={rows} />

      <CtaButton href={payUrl} label="View & pay" tone="brand" />

      <Section className="px-7 pt-4">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          Tap the button above to view the full invoice and pay securely online by card. If the button doesn&apos;t
          work, copy this link into your browser: <span className="text-[#131B23]">{payUrl}</span>
        </Text>
      </Section>
    </CanesEmail>
  );
}

InvoiceEmail.PreviewProps = {
  number: "INV-1042",
  customerName: "Marcus Bell",
  customerPhone: "(407) 555-0134",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  jobName: "House wash + driveway",
  total: "$1,240.00",
  balance: "$1,240.00",
  message:
    "Hi Marcus — thanks again for having us out. Here's your invoice for the house wash and driveway. You can pay securely online with the button below. We appreciate your business!",
  payUrl: "https://urso.ws/CanesPressure/i/tok_abc123",
} satisfies InvoiceEmailProps;

export default InvoiceEmail;
