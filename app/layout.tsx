import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { WipeTransition } from "@/components/wipe-transition";

// Keep font assets local: some Google CSS URLs cannot be parsed by Turbopack.
const ibmPlexSans = localFont({
  variable: "--font-ibm-plex-sans",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans/400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans/500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans/600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans/700.woff2", weight: "700", style: "normal" },
  ],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://urso-tech.vercel.app";
const TITLE = "Urso — Operational intelligence for people-based businesses";
const DESCRIPTION =
  "Urso connects the data scattered across your business into one operating system — then works with your team to fix what it finds. More revenue, sharper decisions, less chaos.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — Urso",
  },
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
    <html lang="en" suppressHydrationWarning className={`${ibmPlexSans.variable} ${fraunces.variable} ${ibmPlexMono.variable}`}>
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
