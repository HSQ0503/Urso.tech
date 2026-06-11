import { NextRequest, NextResponse } from "next/server";
import { syncFranpos } from "@/lib/franpos";

// FranPOS incremental sync, hit by Vercel cron twice a day (vercel.json):
// 17:00 UTC = 1pm Orlando (midday pulse) and 23:05 UTC = 7:05pm (day close).
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when the
// env var exists; manual runs can pass ?secret= instead.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const summary = await syncFranpos();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
