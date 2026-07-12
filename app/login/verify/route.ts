import { NextRequest, NextResponse } from "next/server";
import {
  readMagicToken,
  getAdmin,
  setAdminSession,
  setPending,
  hasPasscodeConfirmed,
  adminHome,
} from "@/lib/urso-auth";

// The magic link lands here. Validate the signed token, then either (device has
// cleared the passcode before) set the session and go straight in, or (first
// time on this device) hold a short pending state and send them to the passcode
// step. Never trust a user-supplied redirect — the destination is derived from
// the admin's own scope.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = readMagicToken(token);
  if (!email) {
    return NextResponse.redirect(new URL("/login?error=link", base));
  }
  const admin = getAdmin(email);
  if (!admin) {
    return NextResponse.redirect(new URL("/login?error=link", base));
  }

  if (await hasPasscodeConfirmed(email)) {
    await setAdminSession(email, admin.scope);
    return NextResponse.redirect(new URL(adminHome(), base));
  }

  await setPending(email);
  return NextResponse.redirect(new URL("/login/passcode", base));
}
