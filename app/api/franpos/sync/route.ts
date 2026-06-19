import { NextRequest, NextResponse } from "next/server";
import { syncFranpos } from "@/lib/franpos";
import { sendCronReport } from "@/lib/email";

// FranPOS incremental sync, hit by Vercel cron twice a day (vercel.json):
// 17:00 UTC = 1pm Orlando (midday pulse) and 00:30 UTC = 8:30pm EDT / 7:30pm
// EST (day close — stores close at 7pm and stragglers ring until ~7:30, so
// this stays past close in both DST phases).
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when the
// env var exists; manual runs can pass ?secret= instead.
// 300s (Pro max) — a 60s cap was timing out when a missed run left a large
// catch-up backlog, which then snowballed (each failure grew the next window).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const summary = await syncFranpos();
    await sendCronReport({
      job: "FranPOS store sync",
      status: "success",
      rows: [
        ...summary.stores.map((s) => ({
          label: s.id.toUpperCase(),
          value: `${s.orders} orders · ${s.items} items · ${s.customers} customers`,
        })),
        { label: "API calls", value: String(summary.calls) },
        { label: "Duration", value: `${(summary.ms / 1000).toFixed(1)}s` },
      ],
    });
    return NextResponse.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendCronReport({ job: "FranPOS store sync", status: "failed", rows: [], error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
