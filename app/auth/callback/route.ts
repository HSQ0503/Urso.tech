import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the password-setup email lands. Exchanges the one-time recovery token
// for a real Supabase session — a route handler, because only handlers and
// server actions may write cookies — then hands off to the form that actually
// sets the password. Mirrors the Canes crew callback, against Woof Gang's
// Supabase project.
//
// The token is the only credential accepted here; there is no user-supplied
// redirect to honor, so a stolen link can't be pointed anywhere else.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(new URL("/login?error=link", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", request.url));
  }

  return NextResponse.redirect(new URL("/login/set-password", request.url));
}
