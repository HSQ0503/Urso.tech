import { NextRequest, NextResponse } from "next/server";

// Step 1 of the QuickBooks OAuth flow. The owner hits this link → we redirect
// them to Intuit's consent screen. Intuit sends them back to /callback.
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const SCOPE = "com.intuit.quickbooks.accounting";

export async function GET(req: NextRequest) {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "QuickBooks is not configured (set QBO_CLIENT_ID and QBO_REDIRECT_URI)." },
      { status: 500 },
    );
  }

  // Which client (tenant) we're connecting books for. Defaults to Woof Gang.
  const tenant = req.nextUrl.searchParams.get("client") ?? "woof-gang";
  const state = crypto.randomUUID();

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", SCOPE);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  // Short-lived cookie to verify the round-trip (CSRF) and remember the tenant.
  res.cookies.set("qbo_oauth", JSON.stringify({ state, tenant }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
