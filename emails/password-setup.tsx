// Sent when someone in the account directory asks to set or reset their
// dashboard password. The link carries a one-time Supabase recovery token that
// signs them in just long enough to choose a password. Same copy for a first
// setup and a later reset — the recipient can't tell the difference and doesn't
// need to. Light-background and table-based on purpose (email clients don't
// support dark mode or flex/grid).

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Tailwind,
  pixelBasedPreset,
} from "@react-email/components";

export type PasswordSetup = {
  name: string; // display name from app_users
  url: string; // the one-time link
  expiresIn: string; // human copy for the token lifetime, e.g. "1 hour"
};

const BRAND = "#fe5100";

export function PasswordSetupEmail({ name, url, expiresIn }: PasswordSetup) {
  const firstName = name.split(" ")[0] || "there";

  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { brand: BRAND } } } }}>
        <Head />
        <Preview>Set your Urso dashboard password</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-8 w-full max-w-[600px] rounded-xl border border-solid border-gray-200 bg-white">
            <Section className="px-7 pt-7">
              <Text className="m-0 text-[11px] font-semibold uppercase tracking-[2px] text-brand">Urso</Text>
              <Heading className="m-0 mt-2 text-[20px] font-semibold text-gray-900">
                Set your password, {firstName}
              </Heading>
              <Text className="m-0 mt-2 text-[14px] leading-[1.6] text-gray-600">
                Use the button below to choose a password for your Urso dashboard. It signs you in, you pick the
                password, and you land straight on your dashboard.
              </Text>
            </Section>

            <Section className="px-7 pt-6">
              <Button
                href={url}
                className="box-border inline-block rounded-lg px-5 py-3 text-center text-[14px] font-semibold text-white no-underline"
                style={{ backgroundColor: BRAND }}
              >
                Set my password →
              </Button>
            </Section>

            <Section className="px-7 pt-5">
              <Text className="m-0 text-[13px] leading-[1.6] text-gray-600">
                This link works once and expires in {expiresIn}. If it has already expired, go to the sign-in page and
                ask for a new one. If you did not request this, you can ignore this email — your current password keeps
                working.
              </Text>
            </Section>

            <Hr className="mx-7 my-6 border-gray-200" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-gray-400">
                If the button does not work, paste this link into your browser:
              </Text>
              <Text className="m-0 mt-1 break-all font-mono text-[11px] leading-[1.5] text-gray-500">{url}</Text>
              <Text className="m-0 mt-4 text-[11px] leading-[1.5] text-gray-400">Urso · urso.ws</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
