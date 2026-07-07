// OWNER-facing lead alerts — cold lead ("call now"), escalation (still waiting),
// and unconfirmed appointment. All three share the same lead-detail shape, so a
// small internal LeadAlert renders the shared body and each exported component
// (ColdLeadEmail / EscalationEmail / UnconfirmedEmail) supplies its own accent,
// eyebrow, heading and preview. Functional and scannable: colored accent bar
// for urgency, the lead details as a Row/Column table, and an "Open in Canes"
// deep link to the lead page.

import { Section, Text } from "@react-email/components";
import { CanesEmail, DetailTable, CtaButton, Divider, type DetailRow, type AccentTone } from "./base";

// The lead fields every alert shows. Values are pre-formatted (phone already
// humanized). `openUrl` deep-links to /CanesPressure/leads/<id>.
export type LeadEmailProps = {
  name?: string | null;
  phone?: string | null; // pre-formatted, e.g. "(407) 555-0134"
  service?: string | null;
  address?: string | null;
  rawMessage?: string | null; // the original inbound SMS body
  openUrl: string;
};

function LeadAlert({
  preview,
  accent,
  eyebrow,
  heading,
  lead,
}: {
  preview: string;
  accent: AccentTone;
  eyebrow: string;
  heading: string;
  lead: LeadEmailProps;
}) {
  const rows: DetailRow[] = [
    { label: "Name", value: lead.name, strong: true },
    { label: "Phone", value: lead.phone },
    { label: "Service", value: lead.service },
    { label: "Address", value: lead.address },
    { label: "Original text", value: lead.rawMessage },
  ];
  return (
    <CanesEmail preview={preview} accent={accent} eyebrow={eyebrow} heading={heading}>
      <Divider />
      <DetailTable rows={rows} />
      <CtaButton href={lead.openUrl} label="Open in Canes" tone={accent} />
      {lead.phone && (
        <Section className="px-7 pt-3">
          <Text className="m-0 text-[12px] leading-[1.5] text-[#5B6673]">
            Or call directly: <span className="font-semibold text-[#131B23]">{lead.phone}</span>
          </Text>
        </Section>
      )}
    </CanesEmail>
  );
}

// New cold lead — a virtual-quote shopper who needs a call while they're still
// comparing. Orange accent, top urgency.
export function ColdLeadEmail(props: LeadEmailProps) {
  const who = props.name ?? "New lead";
  return (
    <LeadAlert
      preview={`Call now — new virtual quote: ${who}`}
      accent="brand"
      eyebrow="Cold lead · call asap"
      heading={`${who} wants a quote — call while they're shopping`}
      lead={props}
    />
  );
}

ColdLeadEmail.PreviewProps = {
  name: "Dana Whitfield",
  phone: "(407) 555-0199",
  service: "Roof soft wash",
  address: "440 Maple Ct, Ocoee, FL 34761",
  rawMessage: "Hi, saw your ad — how much for a roof cleaning on a 2-story?",
  openUrl: "https://urso.ws/CanesPressure/leads/lead_abc123",
} satisfies LeadEmailProps;

// Escalation — a cold lead that has waited N minutes without a call. Same orange
// urgency, sharper heading. `minutes` is folded into the heading by the caller.
export function EscalationEmail(props: LeadEmailProps & { minutes: number }) {
  const { minutes, ...lead } = props;
  const who = lead.name ?? "This lead";
  return (
    <LeadAlert
      preview={`Still waiting ${minutes}m — ${lead.name ?? "unnamed lead"}`}
      accent="brand"
      eyebrow="Escalation"
      heading={`${who} has waited ${minutes} minutes without a call`}
      lead={lead}
    />
  );
}

EscalationEmail.PreviewProps = {
  name: "Dana Whitfield",
  phone: "(407) 555-0199",
  service: "Roof soft wash",
  address: "440 Maple Ct, Ocoee, FL 34761",
  rawMessage: "Hi, saw your ad — how much for a roof cleaning on a 2-story?",
  openUrl: "https://urso.ws/CanesPressure/leads/lead_abc123",
  minutes: 45,
} satisfies LeadEmailProps & { minutes: number };

// Unconfirmed appointment — an estimate visit that hasn't gotten a YES yet.
// `when` is the pre-formatted visit time, folded into the heading by the caller.
export function UnconfirmedEmail(props: LeadEmailProps & { when: string }) {
  const { when, ...lead } = props;
  return (
    <LeadAlert
      preview={`Unconfirmed appointment ${when} — ${lead.name ?? "unnamed lead"}`}
      accent="brand"
      eyebrow="Confirmation pending"
      heading={`No YES yet for the ${when} estimate visit`}
      lead={lead}
    />
  );
}

UnconfirmedEmail.PreviewProps = {
  name: "Priya Anand",
  phone: "(407) 555-0142",
  service: "House wash",
  address: "17 Birch Ln, Winter Garden, FL 34787",
  rawMessage: "Sounds good, see you then",
  openUrl: "https://urso.ws/CanesPressure/leads/lead_def456",
  when: "tomorrow 9:00 AM",
} satisfies LeadEmailProps & { when: string };
