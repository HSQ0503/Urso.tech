// Shared base layout + primitives for every Canes Pressure Washing email.
// Built with React Email so it renders cleanly across Gmail, Apple Mail and
// Outlook — light-background and table-based on purpose (email clients don't
// support dark mode media queries or flex/grid). One place for the brand
// palette, header wordmark, footer, the primary CTA button, colored accent
// bar, and the Row/Column detail table so every Canes email is consistent.
//
// Cross-client rules honored here: no flexbox/grid (Row/Column only), no rem
// units (pixelBasedPreset), no media queries or dark: selectors, every border
// gets an explicit type, buttons are box-border, container maxes at 600px.

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Button,
  Hr,
  Tailwind,
  pixelBasedPreset,
} from "@react-email/components";
import type { ReactNode } from "react";

// Brand palette — the design-direction values, kept in one place so every
// Canes email reads identically. Urso orange is the one loud accent.
export const CANES = {
  brand: "#e84900", // Urso orange — primary buttons + cold/escalation accent
  ink: "#131B23", // near-black body ink
  muted: "#5B6673", // secondary / label text
  line: "#E5E9EE", // hairline dividers + table rules
  good: "#2F9E44", // approved
  danger: "#C0392B", // declined
  canvas: "#EEF1F4", // cool gray page canvas
  surface: "#FFFFFF", // card
} as const;

// The four accent colors an email can lead with, keyed by intent.
export type AccentTone = "brand" | "good" | "danger" | "cold";

const ACCENT_HEX: Record<AccentTone, string> = {
  brand: CANES.brand,
  good: CANES.good,
  danger: CANES.danger,
  cold: "#0B6AA2",
};

// A label/value pair for the scannable detail table. `value` may be null so
// callers can pass optional fields straight through — nulls are dropped.
export type DetailRow = { label: string; value: string | null | undefined; strong?: boolean };

type BaseLayoutProps = {
  preview: string;
  accent: AccentTone;
  eyebrow: string; // uppercase kicker over the heading
  heading: ReactNode;
  children: ReactNode;
};

// The full page chrome: page canvas → white card → colored accent bar →
// brand wordmark + eyebrow + heading → body → footer. Every email composes
// its content inside this.
export function CanesEmail({ preview, accent, eyebrow, heading, children }: BaseLayoutProps) {
  const accentHex = ACCENT_HEX[accent];
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { brand: CANES.brand } } } }}>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-[#EEF1F4] font-sans">
          <Container className="mx-auto my-8 w-full max-w-[600px] overflow-hidden rounded-xl border border-solid border-[#E5E9EE] bg-white">
            {/* Colored accent bar — the one signal of urgency/intent */}
            <Section>
              <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ height: "4px", backgroundColor: accentHex, lineHeight: "4px", fontSize: "1px" }}>
                      &nbsp;
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section className="px-7 pt-6">
              <Text className="m-0 text-[12px] font-bold uppercase tracking-[2px] text-[#131B23]">
                Canes Pressure Washing
              </Text>
              <Text className="m-0 mt-3 text-[11px] font-semibold uppercase tracking-[1.5px]" style={{ color: accentHex }}>
                {eyebrow}
              </Text>
              <Heading className="m-0 mt-1 text-[20px] font-semibold leading-[1.3] text-[#131B23]">{heading}</Heading>
            </Section>

            {children}

            <Hr className="mx-7 my-5 border-solid border-[#E5E9EE]" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-[#5B6673]">
                Powered by Urso · urso.ws
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

// The scannable label/value ledger (Estimate #, Customer, Phone, …). Uses
// Row/Column so it stays a table — labels left, values right with tabular
// figures. Null/blank values are filtered out.
export function DetailTable({ rows }: { rows: DetailRow[] }) {
  const shown = rows.filter((r) => (r.value ?? "").toString().trim());
  if (shown.length === 0) return null;
  return (
    <Section className="px-7">
      {shown.map((r) => (
        <Row key={r.label} className="border-collapse">
          <Column className="py-[6px] pr-4 align-top text-[13px] text-[#5B6673]" style={{ width: "40%" }}>
            {r.label}
          </Column>
          <Column
            className="py-[6px] text-right align-top text-[13px] font-medium text-[#131B23]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {r.strong ? <strong className="font-semibold text-[#131B23]">{r.value}</strong> : r.value}
          </Column>
        </Row>
      ))}
    </Section>
  );
}

// The primary call-to-action. Urso orange, white text, rounded, box-border —
// one prominent button per email. `tone` lets owner emails match the accent.
export function CtaButton({ href, label, tone = "brand" }: { href: string; label: string; tone?: AccentTone }) {
  return (
    <Section className="px-7 pt-6">
      <Button
        href={href}
        className="box-border inline-block rounded-lg px-5 py-3 text-center text-[14px] font-semibold text-white no-underline"
        style={{ backgroundColor: ACCENT_HEX[tone] }}
      >
        {label}
      </Button>
    </Section>
  );
}

// A thin hairline used between the header block and the detail table.
export function Divider() {
  return <Hr className="mx-7 my-5 border-solid border-[#E5E9EE]" />;
}
