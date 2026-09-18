import Link from "next/link";
import { getOverview } from "@/lib/canes/data";
import { accessAllows, getConsoleAccess } from "@/lib/canes/access";
import { fmtMoney, type CrewPermissionKey } from "@urso/types";

export const dynamic = "force-dynamic";
const destinations: { label: string; href: string; description: string; permission?: CrewPermissionKey; ownerOnly?: boolean }[] = [
  { label: "Dashboard", href: "/dashboard", description: "Collected revenue and recurring value", ownerOnly: true },
  { label: "Recurring", href: "/recurring", description: "Scheduled repeat work", permission: "estimates" },
  { label: "Expenses", href: "/expenses", description: "Business expenses and employee payments", ownerOnly: true },
  { label: "Leads", href: "/leads", description: "New enquiries and follow-ups", permission: "leads" },
  { label: "Estimates", href: "/estimates", description: "Quotes, revisions, and signatures", permission: "estimates" },
  { label: "Invoices", href: "/invoices", description: "Bills, deposits, and remaining balances", permission: "invoices" },
  { label: "Schedule", href: "/schedule", description: "Jobs and quote visits", permission: "schedule" },
  { label: "Work orders", href: "/jobs", description: "All work, newest first", permission: "schedule" },
  { label: "Customers", href: "/customers", description: "Contact details and work history", permission: "customers" },
  { label: "Settings", href: "/settings", description: "Business settings", ownerOnly: true },
];

export default async function CanesHome() {
  const [overview, access] = await Promise.all([getOverview(), getConsoleAccess()]);
  const attention = overview.coldNeedingCall.length + overview.followUpsDue.length + overview.unconfirmedToday.length;
  const demo = access.kind === "none";
  const visible = destinations.filter(item => demo || (item.ownerOnly ? access.kind === "owner" : item.permission ? accessAllows(access, item.permission) : true));
  return <div className="space-y-6"><header><p className="cp-mono">Canes Pressure Washing</p><h1 className="cp-display mt-2 text-3xl">Home</h1><p className="mt-2 text-sm">{fmtMoney(overview.money.collectedThisWeekCents)} collected in the last seven days.</p></header>
    {attention > 0 ? <Link href="/CanesPressure/leads" className="cp-card block p-4">{attention} lead {attention === 1 ? "needs" : "items need"} attention →</Link> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">{visible.map(item => <Link key={item.href} href={`/CanesPressure${item.href}`} className="cp-card flex min-h-36 flex-col justify-between p-5 transition-colors hover:border-[var(--cp-brand)]"><h2 className="text-lg font-semibold">{item.label}</h2><p className="mt-3 text-sm text-[var(--cp-muted)]">{item.description}{item.href === "/jobs" && overview.pipeline.jobs.unscheduledCount > 0 ? ` · ${overview.pipeline.jobs.unscheduledCount} unscheduled` : ""}</p></Link>)}</div>
  </div>;
}
