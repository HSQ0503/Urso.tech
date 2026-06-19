import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { parseScope, scopeLabel } from "@/components/dashboard/data";
import { getWeeklyBrief } from "@/components/dashboard/data.server";
import { BriefReport } from "@/components/dashboard/brief-report";
import { AutoPrint } from "./auto-print";

export const metadata = { title: "Weekly Brief — Urso" };

// Standalone, shell-free render of the weekly brief on a light "paper" surface,
// purpose-built for printing to PDF. Lives outside the dashboard layout so the
// sidebar/topbar never appear in the export.
export default async function BriefPrintPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const b = await getWeeklyBrief(scope);
  const generatedAt = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <main className="report-light min-h-screen bg-[var(--color-bg)] px-4 py-8 print:p-0 sm:px-8">
      <BriefReport b={b} scopeText={scopeLabel(scope)} period="This week" generatedAt={generatedAt} />
      <AutoPrint />
    </main>
  );
}
