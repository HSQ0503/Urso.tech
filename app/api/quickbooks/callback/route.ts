import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 2 of the QuickBooks OAuth flow. Intuit redirects the owner here with a
// one-time `code` + `realmId`. We swap the code for tokens and store them.
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function done(req: NextRequest, status: "ok" | "error") {
  const res = NextResponse.redirect(new URL(`/quickbooks/connected?status=${status}`, req.url));
  res.cookies.delete("qbo_oauth");
  return res;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const realmId = sp.get("realmId");
  const state = sp.get("state");

  let saved: { state: string; tenant: string } | null = null;
  try {
    const raw = req.cookies.get("qbo_oauth")?.value;
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }

  // Verify the round-trip before trusting anything.
  if (!code || !realmId || !state || !saved || saved.state !== state) {
    console.error("[qbo callback] round-trip check failed", {
      hasCode: !!code,
      hasRealmId: !!realmId,
      hasState: !!state,
      hasCookie: !!saved,
      stateMatches: !!saved && saved.state === state,
    });
    return done(req, "error");
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return done(req, "error");

  // Exchange the authorization code for tokens (Basic auth = client_id:secret).
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    const tid = tokenRes.headers.get("intuit_tid") ?? "n/a"; // Intuit transaction id — capture for support
    console.error(`[qbo callback] token exchange failed (${tokenRes.status}) intuit_tid=${tid}:`, body.slice(0, 300));
    return done(req, "error");
  }
  const t = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const now = Date.now();
  const supabase = createAdminClient();
  const { error } = await supabase.from("quickbooks_connections").upsert(
    {
      client_id: saved.tenant,
      realm_id: realmId,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      token_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + t.x_refresh_token_expires_in * 1000).toISOString(),
      environment: process.env.QBO_ENVIRONMENT ?? "production",
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "client_id,realm_id" },
  );

  if (error) console.error("[qbo callback] supabase upsert failed:", error.message);
  return done(req, error ? "error" : "ok");
}
