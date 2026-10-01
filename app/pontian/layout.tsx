import type { Viewport } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function PontianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pontian-root min-h-screen bg-white text-pt-ink antialiased ${inter.className}`}>
      {children}
    </div>
  );
}
