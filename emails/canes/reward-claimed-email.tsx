// OWNER-facing alert when a customer claims a review reward on their invoice
// (0012). The claim is a request for verification, not an applied discount —
// this email is the "go check Google/Facebook/Instagram, then approve or
// decline" prompt. Mirrors the estimate-outcome emails: one accent, a tidy
// detail block, one button into the invoice's reward panel.

import { Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, type DetailRow } from "./base";

export type RewardClaimedEmailProps = {
  customerName?: string | null;
  invoiceNumber: string;
  rewardLabel: string;   // "Google review"
  amount: string;        // pre-formatted money, e.g. "$15.00"
  openUrl: string;       // owner invoice detail page
};

export function RewardClaimedEmail({
  customerName,
  invoiceNumber,
  rewardLabel,
  amount,
  openUrl,
}: RewardClaimedEmailProps) {
  const rows: DetailRow[] = [
    { label: "Customer", value: customerName },
    { label: "Invoice", value: invoiceNumber, strong: true },
    { label: "Claimed", value: rewardLabel },
    { label: "Discount if approved", value: `−${amount}`, strong: true },
  ];

  return (
    <CanesEmail
      preview={`${customerName ?? "A customer"} says they left a ${rewardLabel} — verify to apply −${amount}`}
      accent="brand"
      eyebrow="Reward claim"
      heading={`Verify: ${rewardLabel}`}
    >
      <Text style={{ fontSize: 14, lineHeight: "22px", margin: "0 0 14px" }}>
        {customerName ?? "A customer"} tapped &ldquo;I did this&rdquo; on invoice{" "}
        {invoiceNumber}. Check that the {rewardLabel.toLowerCase()} actually exists, then
        approve to take {amount} off their bill — or decline if it isn&rsquo;t there.
        Nothing changes until you approve.
      </Text>
      <DetailTable rows={rows} />
      <CtaButton href={openUrl} label="Review the claim" />
    </CanesEmail>
  );
}
