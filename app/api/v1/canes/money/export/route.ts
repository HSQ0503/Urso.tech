import { NextResponse } from "next/server";
import { apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { getMoneyReport, parseMoneyPeriod } from "@/lib/canes/money";
import { moneyCsv } from "@urso/types";

export const dynamic = "force-dynamic";
export const GET = apiRoute(async ({ actor, req }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  const report = await getMoneyReport(
    parseMoneyPeriod(req.nextUrl.searchParams.get("period")),
  );
  const tab = req.nextUrl.searchParams.get("tab") ?? "services";
  const csv = moneyCsv(report, tab);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="canes-money-${["marketing", "workers", "expenses", "payments"].includes(tab) ? tab : "services"}-${report.period}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
