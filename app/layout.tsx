import type { Metadata, Viewport } from "next";
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://urso-tech.vercel.app";
const TITLE = "Urso | First click to final sale.";
const DESCRIPTION =
  "A data agency for founder-led businesses. We find where your operation is losing money, then fix it with you on retainer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Urso",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#070707",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        {/* Set the theme before paint so there's no flash of the wrong mode. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('urso-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){document.documentElement.dataset.theme='dark';}`,
          }}
        />
        {children}
        <WipeTransition />
      </body>
    </html>
  );
}
