// OWNER-facing daily digest — the 7am ET morning email. Keeps everything the
// hand-built version had: the four counts, today's estimate visits, the cold
// queue waiting for a call, and follow-ups due — but as clean react-email
// sections. Cold accent (deep water blue) since it's a routine briefing, not an
// alarm. All values arrive pre-formatted (times, phones, money) so the
// component stays presentational.

import { Section, Row, Column, Heading, Text, Hr, Link } from "@react-email/components";
import { CanesEmail, CtaButton, CANES } from "./base";

// One appointment row — pre-formatted time, who, address, and whether it's
// confirmed. `href` deep-links to the lead.
export type DigestAppt = {
  time: string;
  who: string;
  address?: string | null;
  confirmed: boolean;
  href: string;
};

// One cold-queue row — who, service, phone, and how long they've waited.
export type DigestCold = {
  who: string;
  service?: string | null;
  phone?: string | null;
  waiting: string; // e.g. "waiting 42m"
  href: string;
};

// One follow-up row — who, service, and last-activity stamp.
export type DigestFollowUp = {
  who: string;
  service?: string | null;
  lastActivity: string;
  href: string;
};

export type DigestEmailProps = {
  dayLabel: string; // e.g. "Monday, Jul 6"
  counts: { open: number; hot: number; cold: number; wonThisWeek: number };
  appointments: DigestAppt[];
  cold: DigestCold[];
  followUps: DigestFollowUp[];
  dashboardUrl: string; // /CanesPressure
};

function SectionHeading({ children }: { children: string }) {
  return (
    <Heading as="h3" className="mx-7 mb-2 mt-6 text-[14px] font-semibold text-[#131B23]">
      {children}
    </Heading>
  );
}

function EmptyLine() {
  return <Text className="mx-7 my-1 text-[13px] text-[#5B6673]">None.</Text>;
}

const cellClass = "border-t border-solid border-[#E5E9EE] py-[7px] pr-3 align-top text-[13px] text-[#131B23]";

export function DigestEmail({
  dayLabel,
  counts,
  appointments,
  cold,
  followUps,
  dashboardUrl,
}: DigestEmailProps) {
  const countItems: { n: number; label: string }[] = [
    { n: counts.open, label: "Open leads" },
    { n: counts.hot, label: "Hot" },
    { n: counts.cold, label: "Cold" },
    { n: counts.wonThisWeek, label: "Won this week" },
  ];

  return (
    <CanesEmail
      preview={`Morning digest — ${dayLabel}`}
      accent="cold"
      eyebrow="Morning digest"
      heading={dayLabel}
    >
      {/* Counts strip */}
      <Section className="px-7 pt-4">
        <Row>
          {countItems.map((c) => (
            <Column key={c.label} className="align-top" style={{ width: "25%" }}>
              <Text className="m-0 text-[22px] font-bold leading-[1.1] text-[#131B23]">{c.n}</Text>
              <Text className="m-0 mt-1 text-[12px] leading-[1.3] text-[#5B6673]">{c.label}</Text>
            </Column>
          ))}
        </Row>
      </Section>

      <SectionHeading>Today&apos;s estimate visits</SectionHeading>
      {appointments.length === 0 ? (
        <EmptyLine />
      ) : (
        <Section className="px-7">
          <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
            <tbody>
              {appointments.map((a, i) => (
                <tr key={i}>
                  <td className={cellClass} style={{ whiteSpace: "nowrap" }}>
                    {a.time}
                  </td>
                  <td className={cellClass}>
                    <Link href={a.href} className="font-semibold no-underline" style={{ color: CANES.brand }}>
                      {a.who}
                    </Link>
                  </td>
                  <td className={cellClass}>{a.address}</td>
                  <td className={cellClass} style={{ whiteSpace: "nowrap" }}>
                    {a.confirmed ? (
                      <span style={{ color: CANES.good, fontWeight: 600 }}>Confirmed</span>
                    ) : (
                      <span style={{ color: CANES.brand, fontWeight: 600 }}>Not confirmed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <SectionHeading>Cold leads waiting for a call</SectionHeading>
      {cold.length === 0 ? (
        <EmptyLine />
      ) : (
        <Section className="px-7">
          <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
            <tbody>
              {cold.map((c, i) => (
                <tr key={i}>
                  <td className={cellClass}>
                    <Link href={c.href} className="font-semibold no-underline" style={{ color: CANES.brand }}>
                      {c.who}
                    </Link>
                  </td>
                  <td className={cellClass}>{c.service}</td>
                  <td className={cellClass} style={{ whiteSpace: "nowrap" }}>
                    {c.phone}
                  </td>
                  <td className={cellClass} style={{ whiteSpace: "nowrap" }}>
                    {c.waiting}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <SectionHeading>Follow-ups due</SectionHeading>
      {followUps.length === 0 ? (
        <EmptyLine />
      ) : (
        <Section className="px-7">
          <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
            <tbody>
              {followUps.map((f, i) => (
                <tr key={i}>
                  <td className={cellClass}>
                    <Link href={f.href} className="font-semibold no-underline" style={{ color: CANES.brand }}>
                      {f.who}
                    </Link>
                  </td>
                  <td className={cellClass}>{f.service}</td>
                  <td className={cellClass}>{f.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Hr className="mx-7 my-5 border-solid border-[#E5E9EE]" />
      <CtaButton href={dashboardUrl} label="Open dashboard" tone="cold" />
    </CanesEmail>
  );
}

DigestEmail.PreviewProps = {
  dayLabel: "Monday, Jul 6",
  counts: { open: 14, hot: 5, cold: 9, wonThisWeek: 3 },
  appointments: [
    {
      time: "9:00 AM",
      who: "Priya Anand",
      address: "17 Birch Ln, Winter Garden",
      confirmed: true,
      href: "https://urso.ws/CanesPressure/leads/lead_1",
    },
    {
      time: "1:30 PM",
      who: "Marcus Bell",
      address: "812 Lake Ridge Dr, Windermere",
      confirmed: false,
      href: "https://urso.ws/CanesPressure/leads/lead_2",
    },
  ],
  cold: [
    {
      who: "Dana Whitfield",
      service: "Roof soft wash",
      phone: "(407) 555-0199",
      waiting: "waiting 42m",
      href: "https://urso.ws/CanesPressure/leads/lead_3",
    },
  ],
  followUps: [
    {
      who: "Renee Salas",
      service: "Driveway",
      lastActivity: "last activity Sat, Jul 4, 3:12 PM",
      href: "https://urso.ws/CanesPressure/leads/lead_4",
    },
  ],
  dashboardUrl: "https://urso.ws/CanesPressure",
} satisfies DigestEmailProps;

export default DigestEmail;
