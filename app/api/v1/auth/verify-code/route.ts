import { NextResponse, type NextRequest } from "next/server";
import { verifyMobileCode } from "@/lib/canes/mobile-auth";
import { makeMobileToken, getAdmin } from "@/lib/urso-auth";
import { isDemo } from "@/lib/canes/data";

// POST /api/v1/auth/verify-code — exchange a valid code for a bearer token.
//
// This is the ONLY place an admin mobile token is minted. The token is a
// distinct kind ("mobile"), so it is not interchangeable with the web session
// cookie in either direction, and its scope is re-derived from the live ADMINS
// map on every request rather than read from the payload — removing someone
// from ADMINS revokes their app access immediately.
//
// UNAUTHENTICATED by design: possession of the emailed code IS the credential.
// The brute-force cap, single-use consumption and lockout all live in
// verifyMobileCode.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (isDemo()) {
    return NextResponse.json(
      { ok: false, notice: "This deployment is in demo mode — the mobile API is disabled." },
      { status: 503 },
    );
  }

  let email: string;
  let code: string;
  try {
    const body = (await req.json()) as { email?: unknown; code?: unknown };
    if (typeof body.email !== "string" || typeof body.code !== "string") throw new Error("bad");
    email = body.email;
    code = body.code;
  } catch {
    return NextResponse.json({ ok: false, notice: "Enter your email and the code." }, { status: 422 });
  }

  const result = await verifyMobileCode(email, code);
  if (!result.ok) {
    const tooMany = result.notice.startsWith("Too many");
    return NextResponse.json({ ok: false, notice: result.notice }, { status: tooMany ? 429 : 401 });
  }

  const admin = getAdmin(result.email);
  if (!admin) {
    // Removed from ADMINS between issuing and verifying — refuse.
    return NextResponse.json({ ok: false, notice: "That code didn’t work." }, { status: 401 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        token: makeMobileToken(result.email),
        email: result.email,
        name: admin.name,
        scope: admin.scope,
      },
    },
    { status: 200, headers: { "X-Urso-Api-Version": "1" } },
  );
}
