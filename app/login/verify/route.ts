import { NextRequest, NextResponse } from "next/server";
import {
  readMagicToken,
  getAdmin,
  setAdminSession,
  adminHome,
} from "@/lib/urso-auth";

// The magic link lands here. Possession of the short-lived, HMAC-signed link is
// the authentication factor, so a valid link creates the session immediately.
// Never trust a user-supplied redirect — the destination is derived from the
// admin's live scope.
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

  await setAdminSession(email, admin.scope);
  return NextResponse.redirect(new URL(adminHome(admin.scope), base));
}
