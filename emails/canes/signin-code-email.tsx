import { Section, Text } from "@react-email/components";
import { CanesEmail, CANES } from "./base";

// The one-time code Supabase generates for an auth action, sent through OUR
// Resend account via the Send Email Hook rather than Supabase's built-in
// mailer — that one is throttled to a couple of messages an hour, which is fine
// for one developer and useless when a crew all clock in at 7am, and it sends
// from a supabase.io address with none of the Canes branding.
//
// IMPORTANT: enabling the hook routes EVERY auth email through it, not just
// sign-in. So this template covers each purpose rather than assuming a login —
// telling someone resetting their password that it is a "sign-in code" is the
// kind of small wrongness that makes people distrust the whole system.
//
// Deliberately sparse: a technician standing in a driveway needs the number and
// nothing else. No CTA button, because there is no link to follow — the code is
// typed into an app that is already open.

export type CodePurpose = "login" | "signup" | "recovery" | "email_change" | "other";

type Copy = { subject: string; heading: string; lede: string };

// Exported so the route uses exactly the same subject line it renders a body
// for — the two drifting apart is an easy and confusing mistake.
export const CODE_COPY: Record<CodePurpose, Copy> = {
  login: {
    subject: "Your Canes sign-in code",
    heading: "Your sign-in code",
    lede: "Enter this code in the Urso app:",
  },
  signup: {
    subject: "Finish setting up your Canes account",
    heading: "Finish setting up your account",
    lede: "Enter this code in the Urso app to finish setting up:",
  },
  recovery: {
    subject: "Your Canes password reset code",
    heading: "Reset your password",
    lede: "Enter this code to set a new password:",
  },
  email_change: {
    subject: "Confirm your new email for Canes",
    heading: "Confirm your new email",
    lede: "Enter this code to confirm this email address:",
  },
  other: {
    subject: "Your Canes verification code",
    heading: "Your verification code",
    lede: "Enter this code to continue:",
  },
};

export type SignInCodeEmailProps = {
  code: string;
  purpose?: CodePurpose;
};

export function SignInCodeEmail({ code, purpose = "login" }: SignInCodeEmailProps) {
  const copy = CODE_COPY[purpose] ?? CODE_COPY.other;
  return (
    <CanesEmail
      preview={`${copy.heading}: ${code}`}
      accent="brand"
      eyebrow="Crew portal"
      heading={copy.heading}
    >
      <Section className="px-7 pt-4">
        <Text className="m-0 text-[14px] leading-[1.6]" style={{ color: CANES.ink }}>
          {copy.lede}
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
          It expires shortly and can only be used once. If you didn’t ask for it, you can ignore
          this email — nobody can get in without the code.
        </Text>
      </Section>
    </CanesEmail>
  );
}

export default SignInCodeEmail;
