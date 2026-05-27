import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WipeTransition } from "@/components/wipe-transition";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Urso — First click to final sale.",
  description:
    "A data agency for multi-unit operators. We find the leaks across your stores — and fix them on retainer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        {children}
        <WipeTransition />
      </body>
    </html>
  );
}
