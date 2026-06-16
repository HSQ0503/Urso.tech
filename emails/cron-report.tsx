// Server-health report email sent after every cron run (FranPOS sync + the
// weekly AI run). Built with React Email so it renders cleanly across clients.
// Kept light-background and table-based on purpose — email clients don't support
// dark mode media queries or flex/grid.

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
  Hr,
  Tailwind,
  pixelBasedPreset,
} from "@react-email/components";

export type CronReportProps = {
  job: string; // e.g. "Weekly AI brief & actions"
  status: "success" | "failed";
  ranAt: string; // pre-formatted timestamp
  rows: { label: string; value: string }[];
  note?: string;
  error?: string;
};

const BRAND = "#fe5100";

export function CronReportEmail({ job, status, ranAt, rows, note, error }: CronReportProps) {
  const ok = status === "success";
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { brand: BRAND } } } }}>
        <Head />
        <Preview>{`${job} — ${ok ? "ran successfully" : "FAILED"}`}</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-8 w-full max-w-[560px] rounded-xl border border-solid border-gray-200 bg-white">
            <Section className="px-7 pt-7">
              <Text className="m-0 text-[11px] font-semibold uppercase tracking-[2px] text-brand">Urso · Server health</Text>
              <Heading className="m-0 mt-2 text-[20px] font-semibold text-gray-900">{job}</Heading>
            </Section>

            <Section className="px-7 pt-4">
              <Text className="m-0">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-[12px] font-semibold ${
                    ok ? "bg-[#e7f6ec] text-[#1a7f4b]" : "bg-[#fdecec] text-[#b42318]"
                  }`}
                >
                  {ok ? "✓ Ran successfully" : "✗ Run failed"}
                </span>
              </Text>
              <Text className="m-0 mt-3 text-[13px] text-gray-500">{ranAt}</Text>
            </Section>

            <Hr className="mx-7 my-5 border-gray-200" />

            <Section className="px-7">
              {rows.map((r, i) => (
                <Row key={i} className="mb-[10px]">
                  <Column className="align-top text-[13px] text-gray-500">{r.label}</Column>
                  <Column className="text-right align-top text-[13px] font-medium text-gray-900">{r.value}</Column>
                </Row>
              ))}
            </Section>

            {note && (
              <Section className="px-7 pt-2">
                <Text className="m-0 text-[13px] leading-[1.5] text-gray-600">{note}</Text>
              </Section>
            )}

            {error && (
              <Section className="px-7 pt-4">
                <Text className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[#b42318]">Error</Text>
                <Text className="m-0 rounded-lg bg-[#fdecec] p-3 font-mono text-[12px] leading-[1.5] text-[#7a271a]">{error}</Text>
              </Section>
            )}

            <Hr className="mx-7 my-5 border-gray-200" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-gray-400">
                Automated report from the Urso server. You&apos;re receiving this because cron health alerts are enabled for Woof Gang.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

CronReportEmail.PreviewProps = {
  job: "Weekly AI brief & actions",
  status: "success",
  ranAt: "Monday, June 15, 2026 at 7:01 AM ET",
  rows: [
    { label: "Week of", value: "2026-06-08" },
    { label: "Briefs written", value: "5 / 5" },
    { label: "Actions generated", value: "5" },
    { label: "Scope failures", value: "none" },
  ],
} satisfies CronReportProps;

export default CronReportEmail;
