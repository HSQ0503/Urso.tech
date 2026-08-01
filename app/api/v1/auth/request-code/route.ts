import { render } from "@react-email/components";
import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { SignInCodeEmail, CODE_COPY } from "@/emails/canes/signin-code-email";
import {
  UrsoSignInCodeEmail,
  URSO_SIGN_IN_CODE_SUBJECT,
} from "@/emails/urso/signin-code-email";
import { issueMobileCode } from "@/lib/canes/mobile-auth";
import { isDemo } from "@/lib/canes/data";
import { canesDb } from "@/lib/canes/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdmin } from "@/lib/urso-auth";

// POST /api/v1/auth/request-code — the single mobile email-auth broker.
//
// Supabase remains the session authority for Canes crew and Woof Gang users,
// but it never sends their mobile login email. Its admin generateLink method
// mints an OTP without delivery; this route sends that OTP through Resend. That
// gives the app one branded email per request and prevents the default
// noreply@mail.app.supabase.io message from leaking into any mobile flow.
//
// The response is identical for every validly-shaped email. Membership checks,
// provider choice, and delivery failures stay server-side so this endpoint
// cannot be used to enumerate clients, technicians, owners, or Urso admins.

export const dynamic = "force-dynamic";

const SAME_ANSWER = {
  ok: true,
  data: { sent: true },
} as const;

type EmailBrand = "canes" | "urso";

async function sendCode({
  resend,
  email,
  code,
  brand,
}: {
  resend: Resend;
  email: string;
  code: string;
  brand: EmailBrand;
}): Promise<boolean> {
  const message =
    brand === "canes" ? SignInCodeEmail({ code, purpose: "login" }) : UrsoSignInCodeEmail({ code });
  const html = await render(message);
  const text = await render(message, { plainText: true });
  const subject = brand === "canes" ? CODE_COPY.login.subject : URSO_SIGN_IN_CODE_SUBJECT;
  const from =
    brand === "canes"
      ? (process.env.CANES_AUTH_EMAIL_FROM ?? "Canes Pressure Washing <server@urso.ws>")
      : (process.env.URSO_AUTH_EMAIL_FROM ?? process.env.URSO_LOGIN_FROM ?? "Urso <hello@urso.ws>");

  try {
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject,
      html,
      text,
      tags: [
        { name: "email_type", value: "mobile_login_code" },
        { name: "workspace", value: brand },
      ],
    });
    if (!error) return true;
    const message = typeof error === "string" ? error : error.message;
    console.error(`[mobile auth] Resend rejected a ${brand} login email: ${message}`);
  } catch (error) {
    console.error(
      `[mobile auth] Resend threw for a ${brand} login email: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return false;
}

async function findWorkspace(email: string): Promise<"canes" | "woof-gang" | null> {
  const [canesAccount, wgMember] = await Promise.all([
    canesDb().from("crew_accounts").select("id").eq("email", email).eq("active", true).maybeSingle(),
    createAdminClient().from("app_users").select("user_id").eq("email", email).maybeSingle(),
  ]);

  if (canesAccount.error) {
    console.error(`[mobile auth] Canes membership lookup failed: ${canesAccount.error.message}`);
  }
  if (wgMember.error) {
    console.error(`[mobile auth] Woof Gang membership lookup failed: ${wgMember.error.message}`);
  }

  if (canesAccount.data) return "canes";
  if (wgMember.data) return "woof-gang";
  return null;
}

async function generateSupabaseCode(
  workspace: "canes" | "woof-gang",
  email: string,
): Promise<string | null> {
  const client = workspace === "canes" ? canesDb() : createAdminClient();
  const { data, error } = await client.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.email_otp) {
    console.error(
      `[mobile auth] ${workspace} OTP generation failed: ${error?.message ?? "no OTP returned"}`,
    );
    return null;
  }
  return data.properties.email_otp;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (isDemo()) {
    return NextResponse.json(
      { ok: false, notice: "This deployment is in demo mode — the mobile API is disabled." },
      { status: 503 },
    );
  }

  let email: string;
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email !== "string") throw new Error("invalid");
    email = body.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("invalid");
  } catch {
    return NextResponse.json({ ok: false, notice: "Enter a valid email." }, { status: 422 });
  }

  // Check global delivery configuration before identity lookup so a missing
  // Resend key produces the same result for every address.
  const apiKey = process.env.RESEND_API;
  if (!apiKey) {
    console.error("[mobile auth] RESEND_API is not set");
    return NextResponse.json(
      { ok: false, notice: "Sign-in email isn’t configured yet." },
      { status: 500 },
    );
  }
  const resend = new Resend(apiKey);

  try {
    const admin = getAdmin(email);
    if (admin) {
      const issued = await issueMobileCode(email);
      if (!issued.ok) {
        if (issued.notice.startsWith("Too many")) {
          return NextResponse.json({ ok: false, notice: issued.notice }, { status: 429 });
        }
        return NextResponse.json(SAME_ANSWER, { status: 200 });
      }
      await sendCode({
        resend,
        email,
        code: issued.code,
        brand: issued.scope === "canes" ? "canes" : "urso",
      });
      return NextResponse.json(SAME_ANSWER, { status: 200 });
    }

    const workspace = await findWorkspace(email);
    if (!workspace) return NextResponse.json(SAME_ANSWER, { status: 200 });

    // generateLink returns an email OTP for custom delivery and sends nothing
    // itself. The mobile client redeems the same challenge with verifyOtp.
    const code = await generateSupabaseCode(workspace, email);
    if (code) {
      await sendCode({
        resend,
        email,
        code,
        brand: workspace === "canes" ? "canes" : "urso",
      });
    }
  } catch (error) {
    // Do not let a provider outage turn this endpoint into an identity oracle.
    console.error(`[mobile auth] code request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return NextResponse.json(SAME_ANSWER, { status: 200 });
}
