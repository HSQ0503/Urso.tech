import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components";

export const URSO_SIGN_IN_CODE_SUBJECT = "Your Urso sign-in code";

export function UrsoSignInCodeEmail({ code }: { code: string }) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Preview>Your Urso sign-in code is {code}</Preview>
        <Body className="bg-[#EEF0F3] font-sans">
          <Container className="mx-auto my-8 w-full max-w-[560px] overflow-hidden rounded-xl border border-solid border-[#DDE1E6] bg-white">
            <Section className="bg-[#0B0B0C] px-7 py-6">
              <Text
                className="m-0 text-[25px] font-semibold leading-none text-white"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.5px" }}
              >
                Urso<span style={{ color: "#FE5100" }}>.</span>
              </Text>
              <Text className="m-0 mt-3 text-[10px] font-semibold uppercase tracking-[2px] text-[#A8A8AD]">
                Client operations
              </Text>
            </Section>

            <Section className="px-7 pt-7">
              <Heading className="m-0 text-[21px] font-semibold leading-[1.3] text-[#171719]">
                Your sign-in code
              </Heading>
              <Text className="m-0 mt-2 text-[14px] leading-[1.65] text-[#51535A]">
                Enter this code in the Urso app to open your dashboard.
              </Text>
            </Section>

            <Section className="px-7 pt-5">
              <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      align="center"
                      style={{
                        backgroundColor: "#F4F5F7",
                        border: "1px solid #DDE1E6",
                        borderRadius: "10px",
                        padding: "18px 12px",
                      }}
                    >
                      <span
                        style={{
                          color: "#171719",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: "34px",
                          fontWeight: 700,
                          letterSpacing: "8px",
                          lineHeight: "1.2",
                        }}
                      >
                        {code}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section className="px-7 pt-5">
              <Text className="m-0 text-[13px] leading-[1.6] text-[#686A72]">
                This code expires shortly and works once. If you didn’t request it, you can ignore this email.
              </Text>
            </Section>

            <Hr className="mx-7 my-6 border-solid border-[#E3E5E9]" />

            <Section className="px-7 pb-7">
              <Text className="m-0 text-[11px] leading-[1.5] text-[#85878E]">Urso · urso.ws</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default UrsoSignInCodeEmail;
