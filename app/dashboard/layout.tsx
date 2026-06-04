import type { Metadata } from "next";
import { Shell } from "@/components/dashboard/shell";

export const metadata: Metadata = {
  title: "Dashboard | Urso · Woof Gang",
  description: "Admin dashboard for the Woof Gang pilot.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
