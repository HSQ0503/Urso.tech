import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance/finance-shell";
import { getFinanceAdmin } from "@/lib/finance";

export const metadata: Metadata = {
  title: "Finance | Urso",
  description: "Internal Urso deal, cash, distribution, and expense tracker.",
  robots: { index: false, follow: false },
};

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const admin = await getFinanceAdmin();
  if (!admin) redirect("/login");
  return <FinanceShell email={admin.email}>{children}</FinanceShell>;
}
