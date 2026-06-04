import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { Shell } from "@/components/dashboard/shell";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Dashboard | Urso · Woof Gang",
  description: "Admin dashboard for the Woof Gang pilot.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={fraunces.variable}>
      <Shell>{children}</Shell>
    </div>
  );
}
