// Weekly AI run, hit by Vercel cron Monday mornings (vercel.json): writes the
// AI brief narrative for every scope and regenerates suggested actions.
// 11:00 UTC = 7am EDT / 6am EST — after the 00:30 UTC close-of-day sync, so
// Monday's brief covers a complete week through Sunday close.
// Same auth as /api/franpos/sync: Vercel sends `Authorization: Bearer
// ${CRON_SECRET}`; manual runs can pass ?secret= instead.

import { NextRequest, NextResponse } from "next/server";
import { runWeekly } from "@/lib/ai/weekly";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const summary = await runWeekly();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
