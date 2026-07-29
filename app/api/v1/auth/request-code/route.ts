import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { issueMobileCode } from "@/lib/canes/mobile-auth";
import { SignInCodeEmail, CODE_COPY } from "@/emails/canes/signin-code-email";
import { isDemo } from "@/lib/canes/data";

// POST /api/v1/auth/request-code — email a sign-in code to a provisioned admin.
//
// UNAUTHENTICATED by design: it is the front door. Everything that could be
// abused through it is handled inside issueMobileCode — the address must
// already be in the ADMINS map, codes are CSPRNG-generated and stored only as a
// scrypt hash, and repeated failures lock the address out.
//
// The response is deliberately IDENTICAL whether or not the address is an
// admin. Distinguishing them would turn this into an oracle for discovering who
// has owner access to a client's business.

export const dynamic = "force-dynamic";

const SAME_ANSWER = {
  ok: true,
  data: { sent: true },
} as const;

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
    if (typeof body.email !== "string") throw new Error("bad");
    email = body.email;
  } catch {
    return NextResponse.json({ ok: false, notice: "Enter your email." }, { status: 422 });
  }

  // Configuration is checked BEFORE the admin lookup, on purpose. With the
  // order reversed a deployment missing RESEND_API answered 500 for a real
  // admin and 200 for everyone else — which told an attacker exactly which
  // addresses are provisioned. Now a misconfigured server fails identically for
  // every caller and reveals nothing.
  const apiKey = process.env.RESEND_API;
  if (!apiKey) {
    console.error("[canes mobile auth] RESEND_API is not set — cannot send the code");
    return NextResponse.json(
      { ok: false, notice: "Sign-in email isn’t configured yet." },
      { status: 500 },
    );
  }

  const issued = await issueMobileCode(email);
  if (!issued.ok) {
    // Only a lockout is worth telling the caller about — it is about their own
    // behaviour, not about who exists. An unknown address gets SAME_ANSWER.
    if (issued.notice.startsWith("Too many")) {
      return NextResponse.json({ ok: false, notice: issued.notice }, { status: 429 });
    }
    return NextResponse.json(SAME_ANSWER, { status: 200 });
  }

  const html = await render(SignInCodeEmail({ code: issued.code, purpose: "login" }));
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.CANES_AUTH_EMAIL_FROM ?? "Canes Pressure Washing <server@urso.ws>",
      to: [email.trim().toLowerCase()],
      subject: CODE_COPY.login.subject,
      html,
    });
    if (error) {
      // Never log `issued.code`.
      const message = typeof error === "string" ? error : error.message;
      console.error(`[canes mobile auth] resend failed: ${message}`);
      return NextResponse.json(
        { ok: false, notice: "Couldn’t send the email. Try again in a moment." },
        { status: 502 },
      );
    }
  } catch (e) {
    console.error(`[canes mobile auth] threw: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json(
      { ok: false, notice: "Couldn’t send the email. Try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json(SAME_ANSWER, { status: 200 });
}
