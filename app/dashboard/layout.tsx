import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/dashboard/shell";
import { compareBounds } from "@/components/dashboard/data.server";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n.server";

export const metadata: Metadata = {
  title: "Dashboard | Urso · Woof Gang",
  description: "Admin dashboard for the Woof Gang pilot.",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "urso_admin") redirect("/console");
  const locale = await getLocale();

  return (
    <Shell
      role={user.role}
      storeId={user.storeId}
      clientName={user.clientName}
      userName={user.name}
      email={user.email}
      streak={user.streak}
      memberSince={user.memberSince}
      locale={locale}
      /* Resolved on the server (New York time, same as the data layer) so the
         date picker's bounds can't drift from the client's clock. */
      dayBounds={compareBounds()}
    >
      {children}
    </Shell>
  );
}
