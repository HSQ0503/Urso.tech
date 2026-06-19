import { NextRequest, NextResponse } from "next/server";
import { syncQuickbooks } from "@/lib/quickbooks";

// QuickBooks P&L sync — pulls the monthly ProfitAndLoss report and upserts it
// into quickbooks_pnl. Same auth pattern as /api/franpos/sync: Vercel cron
// sends `Authorization: Bearer ${CRON_SECRET}`; manual runs pass ?secret=.
// Sandbox test: /api/quickbooks/sync?secret=…&months=3&method=Accrual
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  // Cap at 36 so a one-shot backfill can reach the full FranPOS history start
  // (2024-01); the daily cron passes no param and stays at the light default 3.
  const months = Math.min(Math.max(Number(sp.get("months")) || 3, 1), 36);
  const method = sp.get("method") === "Cash" ? "Cash" : "Accrual";
  const client = sp.get("client") ?? "woof-gang";

  try {
    const summary = await syncQuickbooks(client, months, method);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
