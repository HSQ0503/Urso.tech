// Urso Brain shell — its own product surface on its OWN Supabase project
// (Urso HQ; see lib/brain/supabase.ts). Access = signed in to that project.
// Dark-first, dashboard tokens.

import type { Metadata } from "next";
import Link from "next/link";
import { getBrainUser } from "@/lib/brain/access";
import { SignOutButton } from "@/components/brain/sign-out";

export const metadata: Metadata = {
  title: "Urso Brain",
  description: "The company brain — identity-aware AI over the whole company's knowledge.",
};

export default async function BrainLayout({ children }: { children: React.ReactNode }) {
  // No redirect here: /brain/login renders inside this layout, and the proxy +
  // each protected page enforce auth. The header just adapts to the state.
  const user = await getBrainUser();

  return (
    <div className="theme-scope flex min-h-screen flex-col bg-bg">
      <header className="relative z-30 border-b border-edge bg-panel">
        <div className="flex w-full items-center justify-between px-4 py-3 md:px-6">
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
          {user ? (
            <nav className="flex items-center gap-1 text-[13px]">
              <Link href="/brain" className="rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink">Chat</Link>
              <Link href="/brain/graph" className="hidden rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink sm:inline-flex">Graph</Link>
              <Link href="/brain/docs" className="rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink">Vault</Link>
              <Link href="/brain/docs/new" className="hidden rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink md:inline-flex">New doc</Link>
              <Link href="/brain/settings" className="hidden rounded-lg px-3 py-1.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink md:inline-flex">Settings</Link>
              <SignOutButton />
            </nav>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Company brain</span>
          )}
        </div>
      </header>
      <main className="flex w-full flex-1 flex-col px-4 py-5 md:px-6">{children}</main>
    </div>
  );
}
