// Invoice outcome emails — fired when an invoice is paid.
//   • InvoiceReceiptEmail — CUSTOMER receipt / thank-you (green "paid" accent).
//   • InvoicePaidOwnerEmail — OWNER "money in" alert.
// Mirror estimate-outcome-emails: react-email + the shared CanesEmail base.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow } from "./base";

export type InvoiceReceiptEmailProps = {
  number: string;
  customerName?: string | null;
  jobName?: string | null;
  jobAddress?: string | null;
  total: string; // pre-formatted money paid
  method: string; // "card" | "cash"
  paidOn?: string | null; // pre-formatted date
};

export function InvoiceReceiptEmail({
  number,
  customerName,
  jobName,
  jobAddress,
  total,
  method,
  paidOn,
}: InvoiceReceiptEmailProps) {
  const rows: DetailRow[] = [
    { label: "Invoice", value: number, strong: true },
    { label: "Service", value: jobName },
    { label: "Address", value: jobAddress },
    { label: "Amount paid", value: total, strong: true },
    { label: "Method", value: method === "cash" ? "Cash" : "Card" },
    { label: "Paid on", value: paidOn },
  ];

  return (
    <CanesEmail
      preview={`Payment received — ${number}`}
      accent="good"
      eyebrow="Payment received"
      heading="Thank you for your payment"
    >
      <Section className="px-7 pt-4">
        <Text className="m-0 text-[14px] leading-[1.6] text-[#131B23]">
          {customerName ? `Hi ${customerName.split(" ")[0]}, thanks!` : "Thank you!"} We&apos;ve received your payment
          and marked this invoice paid in full. This email is your receipt.
        </Text>
      </Section>

      <Divider />

      <DetailTable rows={rows} />

      <Section className="px-7 pt-4">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          We appreciate your business. If anything doesn&apos;t look right, just reply to this email or text us.
        </Text>
      </Section>
    </CanesEmail>
  );
}

export type InvoicePaidOwnerEmailProps = {
  number: string;
  customerName?: string | null;
  jobName?: string | null;
  total: string;
  method: string;
  openUrl: string; // /CanesPressure/invoices/<id>
};

export function InvoicePaidOwnerEmail({
  number,
  customerName,
  jobName,
  total,
  method,
  openUrl,
}: InvoicePaidOwnerEmailProps) {
  const rows: DetailRow[] = [
    { label: "Invoice", value: number, strong: true },
    { label: "Customer", value: customerName },
    { label: "Service", value: jobName },
    { label: "Amount", value: total, strong: true },
    { label: "Method", value: method === "cash" ? "Cash" : "Card" },
  ];

  return (
    <CanesEmail
      preview={`Paid — ${customerName ?? number} (${total})`}
      accent="good"
      eyebrow="Money in"
      heading={`${number} paid`}
    >
      <Divider />
      <DetailTable rows={rows} />
      <CtaButton href={openUrl} label="Open invoice" tone="good" />
    </CanesEmail>
  );
}

InvoiceReceiptEmail.PreviewProps = {
  number: "INV-1042",
  customerName: "Marcus Bell",
  jobName: "House wash + driveway",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  total: "$1,240.00",
  method: "card",
  paidOn: "Jul 7, 2026",
} satisfies InvoiceReceiptEmailProps;
