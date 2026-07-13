import { NextResponse, type NextRequest } from "next/server";
import { createCanesAuthClient } from "@/lib/canes/crew-auth-client";
import { canesDb } from "@/lib/canes/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const auth = await createCanesAuthClient();
  if (!code) {
    return NextResponse.redirect(
      new URL("/CanesPressure/crew/login?error=invalid-link", request.url),
    );
  }

  const { error } = await auth.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/CanesPressure/crew/login?error=expired-link", request.url),
    );
  }
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/CanesPressure/crew/login?error=invalid-link", request.url),
    );
  }

  const db = canesDb();
  const { data: account } = await db
    .from("crew_accounts")
    .select("id, active, team_member_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account?.active) {
    await auth.auth.signOut();
    return NextResponse.redirect(
      new URL("/CanesPressure/crew/login?error=no-access", request.url),
    );
  }
  const { data: member } = await db
    .from("team_members")
    .select("active")
    .eq("id", account.team_member_id)
    .maybeSingle();
  if (!member?.active) {
    await auth.auth.signOut();
    return NextResponse.redirect(
      new URL("/CanesPressure/crew/login?error=no-access", request.url),
    );
  }

  await db
    .from("crew_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", account.id);
  return NextResponse.redirect(new URL("/CanesPressure/crew", request.url));
}
