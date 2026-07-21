import { NextResponse } from "next/server";
import { getAdminSession, adminHome } from "@/lib/urso-auth";
import { getTechnicianActor } from "@/lib/canes/crew-auth";

// Session state for the marketing-site navbar: is this browser already signed
// in, and where does "Enter dashboard" go? Reads the httpOnly session cookies
// server-side (the client nav can't) and reveals nothing beyond a destination
// — no emails, names, or scopes leave this route.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const admin = await getAdminSession();
    if (admin) {
      return NextResponse.json(
        { dash: { href: adminHome(), label: "Enter dashboard" } },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const tech = await getTechnicianActor();
    if (tech) {
      return NextResponse.json(
        { dash: { href: "/CanesPressure/crew", label: "Enter dashboard" } },
        { headers: { "cache-control": "no-store" } },
      );
    }
  } catch {
    // Any resolution hiccup (e.g. crew auth unconfigured) reads as signed out.
  }
  return NextResponse.json({ dash: null }, { headers: { "cache-control": "no-store" } });
}
