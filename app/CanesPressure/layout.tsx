import type { Metadata } from "next";
import "./canes.css";

// Canes Pressure Washing — operations app. Fully separate from the
// Urso marketing site and the Woof Gang /dashboard: its own Supabase project,
// its own design language (light field-service UI in Urso's brand voice), its
// own access gate. Fonts (IBM Plex Sans/Mono, Fraunces) inherit from the root
// layout's next/font variables; canes.css maps them to --cp-font-*.
// This root layout only sets the .canes scope; the gated shell lives in
// (app)/layout.tsx so /CanesPressure/login stays outside the gate.

export const metadata: Metadata = {
  title: { default: "Canes Pressure Washing — Operations", template: "%s · Canes Ops" },
  robots: { index: false, follow: false },
};

export default function CanesRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="canes min-h-screen">{children}</div>;
}
