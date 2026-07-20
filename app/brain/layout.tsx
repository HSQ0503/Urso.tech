// Urso Brain shell — its own product surface (not the dashboard). Gated to the
// urso_admin role in v1; see lib/brain/access.ts. Dark-first, dashboard tokens.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Urso Brain",
  description: "The company brain — identity-aware AI over the whole company's knowledge.",
};

export default async function BrainLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  if (user.role !== "urso_admin") {
    return (
      <div className="theme-scope grid min-h-screen place-items-center bg-bg px-6">
        <div className="max-w-[420px] rounded-none border border-edge bg-panel p-6 text-center">
          <h1 className="text-[18px] font-bold text-ink">Urso Brain</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-dim">
            This surface isn&rsquo;t enabled for your account yet. Ask Urso to add you.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-orange underline underline-offset-2">
            Back to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-scope flex min-h-screen flex-col bg-bg">
      <header className="border-b border-edge">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-4 py-3 md:px-6">
          <Link href="/brain" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-none border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                <path d="M12 5.5l1.7 4.8L18 12l-4.3 1.7L12 18.5l-1.7-4.8L6 12l4.3-1.7L12 5.5Z" />
              </svg>
            </span>
            <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              Urso <span className="text-orange">Brain</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-[13px]">
            <Link href="/brain" className="rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink">Chat</Link>
            <Link href="/brain/docs" className="rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink">Vault</Link>
            <Link href="/brain/settings" className="rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-4 py-5 md:px-6">{children}</main>
    </div>
  );
}
