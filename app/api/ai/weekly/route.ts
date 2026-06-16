// Weekly AI run, hit by Vercel cron Monday mornings (vercel.json): writes the
// AI brief narrative for every scope and regenerates suggested actions.
// 11:00 UTC = 7am EDT / 6am EST — after the 00:30 UTC close-of-day sync, so
// Monday's brief covers a complete week through Sunday close.
// Same auth as /api/franpos/sync: Vercel sends `Authorization: Bearer
// ${CRON_SECRET}`; manual runs can pass ?secret= instead.

import { NextRequest, NextResponse } from "next/server";
import { runWeekly } from "@/lib/ai/weekly";
import { sendCronReport } from "@/lib/email";

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
    await sendCronReport({
      job: "Weekly AI brief & actions",
      status: summary.failed.length ? "failed" : "success",
      rows: [
        { label: "Week of", value: summary.weekStart },
        { label: "Briefs written", value: `${summary.briefs} / 5` },
        { label: "Actions generated", value: String(summary.actions) },
        { label: "Scope failures", value: summary.failed.length ? summary.failed.join(", ") : "none" },
      ],
      note: summary.failed.length
        ? "One or more store briefs fell back to the computed template this week — see scope failures above."
        : undefined,
    });
    return NextResponse.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendCronReport({ job: "Weekly AI brief & actions", status: "failed", rows: [], error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
