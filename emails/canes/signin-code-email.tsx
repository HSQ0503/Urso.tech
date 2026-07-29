import { Section, Text } from "@react-email/components";
import { CanesEmail, CANES } from "./base";

// The technician sign-in code, sent when someone taps "Send code" in the Urso
// mobile app. Delivered through OUR Resend account via the Supabase Send Email
// Hook, not Supabase's built-in mailer — that one is throttled to a couple of
// messages an hour, which is fine for one developer and useless for a crew all
// clocking in at 7am.
//
// Deliberately sparse: a technician standing in a driveway needs the number and
// nothing else. No CTA button, because there is no link to follow — the code is
// typed into an app that is already open.

export type SignInCodeEmailProps = {
  code: string;
  // Whether the account is signing in or being created. Copy differs slightly;
  // the crew flow is allowlist-only so in practice this is nearly always "login".
  action?: "login" | "signup";
};

export function SignInCodeEmail({ code, action = "login" }: SignInCodeEmailProps) {
  const isSignup = action === "signup";
  return (
    <CanesEmail
      preview={`Your Canes sign-in code: ${code}`}
      accent="brand"
      eyebrow="Crew portal"
      heading={isSignup ? "Finish setting up your account" : "Your sign-in code"}
    >
      <Section className="px-7 pt-4">
        <Text className="m-0 text-[14px] leading-[1.6]" style={{ color: CANES.ink }}>
          Enter this code in the Urso app:
        </Text>
      </Section>

      {/* The code is the entire point of this email — sized so it can be read
          at arm's length, in sunlight, and letter-spaced so digits don't run
          together. Selectable text, never an image: images get blocked. */}
      <Section className="px-7 pt-3">
        <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td
                align="center"
                style={{
                  backgroundColor: "#F6F7F9",
                  border: `1px solid ${CANES.line}`,
                  borderRadius: "10px",
                  padding: "18px 12px",
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    fontSize: "34px",
                    fontWeight: 700,
                    letterSpacing: "8px",
                    color: CANES.ink,
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

      <Section className="px-7 pt-4">
        <Text className="m-0 text-[13px] leading-[1.6]" style={{ color: CANES.muted }}>
          It expires shortly and can only be used once. If you didn’t ask to sign in, you can ignore
          this email — nobody can get in without the code.
        </Text>
      </Section>
    </CanesEmail>
  );
}

export default SignInCodeEmail;
