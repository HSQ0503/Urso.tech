import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { WipeTransition } from "@/components/wipe-transition";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable} ${robotoMono.variable}`}>
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
