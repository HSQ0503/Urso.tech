// OWNER-facing estimate outcomes — approved (green accent, job created, go
// schedule) and declined (red accent, no job). Both show the estimate details
// as a Row/Column table plus the signature or decline reason, and an "Open in
// Canes" deep link to the estimate page.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow } from "./base";

// Estimate fields shown on both outcome emails. Money/phone are pre-formatted.
export type EstimateOutcomeProps = {
  number: string;
  customerName?: string | null;
  customerPhone?: string | null; // pre-formatted
  jobAddress?: string | null;
  jobName?: string | null;
  total: string; // pre-formatted money
  deposit?: string | null; // pre-formatted money or null
  openUrl: string; // /CanesPressure/estimates/<id>
};

function outcomeRows(p: EstimateOutcomeProps): DetailRow[] {
  return [
    { label: "Estimate", value: p.number, strong: true },
    { label: "Customer", value: p.customerName },
    { label: "Phone", value: p.customerPhone },
    { label: "Address", value: p.jobAddress },
    { label: "Job", value: p.jobName },
    { label: "Total", value: p.total, strong: true },
    { label: "Deposit", value: p.deposit },
  ];
}

// A customer approved — a job was created. Green accent, "go schedule" tone,
// signer name surfaced when present.
export function EstimateApprovedEmail(props: EstimateOutcomeProps & { signatureName?: string | null }) {
  const { signatureName, ...est } = props;
  const who = est.customerName ?? "A customer";
  return (
    <CanesEmail
      preview={`Approved — ${who} (${est.total})`}
      accent="good"
      eyebrow="Estimate approved"
      heading={`${who} approved ${est.number}`}
    >
      <Divider />
      <DetailTable rows={outcomeRows(est)} />
      {signatureName?.trim() && (
        <Section className="px-7 pt-3">
          <Text className="m-0 text-[13px] text-[#5B6673]">
            Signed by <span className="font-semibold text-[#131B23]">{signatureName}</span>
          </Text>
        </Section>
      )}
      <Section className="px-7 pt-3">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          A job was created from this estimate. Open it to schedule the visit.
        </Text>
      </Section>
      <CtaButton href={est.openUrl} label="Open in Canes" tone="good" />
    </CanesEmail>
  );
}

EstimateApprovedEmail.PreviewProps = {
  number: "EST-1042",
  customerName: "Marcus Bell",
  customerPhone: "(407) 555-0134",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  jobName: "House wash + driveway",
  total: "$1,240.00",
  deposit: "$300.00",
  openUrl: "https://urso.ws/CanesPressure/estimates/est_abc123",
  signatureName: "Marcus Bell",
} satisfies EstimateOutcomeProps & { signatureName?: string | null };

// A booking deposit was paid (0013) — money in before the visit is scheduled.
// Green accent, same detail table; `deposit` here is the amount actually paid.
export function DepositPaidOwnerEmail(props: EstimateOutcomeProps) {
  const who = props.customerName ?? "A customer";
  return (
    <CanesEmail
      preview={`Deposit paid — ${who}${props.deposit ? ` (${props.deposit})` : ""}`}
      accent="good"
      eyebrow="Deposit received"
      heading={`${who} paid the deposit${props.deposit ? ` (${props.deposit})` : ""}`}
    >
      <Divider />
      <DetailTable rows={outcomeRows(props)} />
      <Section className="px-7 pt-3">
        <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
          The booking deposit is in and will credit the final invoice automatically. Open the job to
          schedule the visit.
        </Text>
      </Section>
      <CtaButton href={props.openUrl} label="Open in Canes" tone="good" />
    </CanesEmail>
  );
}

DepositPaidOwnerEmail.PreviewProps = {
  number: "EST-1042",
  customerName: "Marcus Bell",
  customerPhone: "(407) 555-0134",
  jobAddress: "812 Lake Ridge Dr, Windermere, FL 34786",
  jobName: "House wash + driveway",
  total: "$1,240.00",
  deposit: "$300.00",
  openUrl: "https://urso.ws/CanesPressure/estimates/est_abc123",
} satisfies EstimateOutcomeProps;

// A customer declined — no job created. Red accent, decline reason surfaced.
export function EstimateDeclinedEmail(props: EstimateOutcomeProps & { declineReason?: string | null }) {
  const { declineReason, ...est } = props;
  const who = est.customerName ?? "A customer";
  return (
    <CanesEmail
      preview={`Declined — ${who} · ${est.number}`}
      accent="danger"
      eyebrow="Estimate declined"
      heading={`${who} declined ${est.number}`}
    >
      <Divider />
      <DetailTable rows={outcomeRows(est)} />
      {declineReason?.trim() && (
        <Section className="px-7 pt-3">
          <Text className="m-0 text-[13px] text-[#5B6673]">
            Reason: <span className="font-semibold text-[#131B23]">{declineReason}</span>
          </Text>
        </Section>
      )}
      <CtaButton href={est.openUrl} label="Open in Canes" tone="danger" />
    </CanesEmail>
  );
}

EstimateDeclinedEmail.PreviewProps = {
  number: "EST-1039",
  customerName: "Renee Salas",
  customerPhone: "(407) 555-0177",
  jobAddress: "23 Sable Palm Way, Clermont, FL 34711",
  jobName: "Driveway + walkway",
  total: "$460.00",
  deposit: null,
  openUrl: "https://urso.ws/CanesPressure/estimates/est_def456",
  declineReason: "Going with a neighbor's guy this time",
} satisfies EstimateOutcomeProps & { declineReason?: string | null };
