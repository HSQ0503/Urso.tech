import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./canes.css";

// Canes Pressure Washing — Phase 1 operations app. Fully separate from the
// Urso marketing site and the Woof Gang /dashboard: its own Supabase project,
// its own design language (light, field-service), its own access gate.
// This root layout only sets fonts + the .canes scope; the gated shell lives
// in (app)/layout.tsx so /CanesPressure/login stays outside the gate.

const body = Inter({ subsets: ["latin"], variable: "--font-canes-body" });

export const metadata: Metadata = {
  title: { default: "Canes Pressure Washing — Operations", template: "%s · Canes Ops" },
  robots: { index: false, follow: false },
};

export default function CanesRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={`canes ${body.variable} min-h-screen`}>{children}</div>;
}
