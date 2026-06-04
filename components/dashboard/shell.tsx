"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "home" | "leak" | "store" | "users" | "scissors" | "star";

function Icon({ name }: { name: IconName }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "leak":
      return <svg {...common}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-1.4.6-3 1.4-4.4" /><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" /></svg>;
    case "store":
      return <svg {...common}><path d="M4 9V5h16v4" /><path d="M4 9h16l-1 11H5L4 9Z" /><path d="M9 13h6" /></svg>;
    case "users":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M18.5 19a5 5 0 0 0-3-4.6" /></svg>;
    case "scissors":
      return <svg {...common}><circle cx="6" cy="7" r="2.4" /><circle cx="6" cy="17" r="2.4" /><path d="M8 8.5 20 18M8 15.5 20 6" /></svg>;
    case "star":
      return <svg {...common}><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.3-4.1 5.9-.8L12 3.5Z" /></svg>;
  }
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/leaks", label: "Leaks", icon: "leak" },
  { href: "/dashboard/stores", label: "Stores", icon: "store" },
  { href: "/dashboard/customers", label: "Customers", icon: "users" },
  { href: "/dashboard/team", label: "Team", icon: "scissors" },
  { href: "/dashboard/reviews", label: "Reviews", icon: "star" },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = nav.find((n) => isActive(pathname, n.href))?.label ?? "Home";

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-edge bg-[#060606] px-4 py-5 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <span className="text-[21px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </Link>

        <div className="mt-7 flex items-center gap-2.5 rounded-xl border border-edge bg-white/[0.02] px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-orange-soft font-mono text-[12px] text-orange">WG</span>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink">Woof Gang</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">4 stores · Orlando</div>
          </div>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors ${
                  active ? "bg-white/[0.06] text-ink" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}
                <span className={active ? "text-orange" : "text-ink-dimmer group-hover:text-ink-dim"}>
                  <Icon name={n.icon} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-dashed border-edge-strong p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Pilot · mock data</div>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-ink-dim">Shaped like the live FranPOS, Twilio &amp; Google feeds.</p>
        </div>
      </aside>

      <div className="lg:pl-[228px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge bg-bg/75 px-5 py-3 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
            <span className="lg:hidden text-[15px] font-medium normal-case tracking-normal text-ink">Urso</span>
            <span className="hidden sm:inline">Woof Gang</span>
            <span className="hidden text-edge-strong sm:inline">/</span>
            <span className="text-ink-dim">{current}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <DatePill />
            <span className="hidden items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer sm:inline-flex">
              <span className="size-1.5 animate-pulse rounded-full bg-[#46d18a]" />
              Live 9:14 AM
            </span>
            <span className="grid size-8 place-items-center rounded-full border border-edge-strong bg-white/[0.03] font-mono text-[11px] text-ink-dim">GC</span>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-edge px-4 py-2 lg:hidden">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${active ? "bg-white/[0.08] text-ink" : "text-ink-dim"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}

function DatePill() {
  const [open] = useState(false);
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-white/[0.02] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:text-ink">
      Last 30 days
      <span className={`text-ink-dimmer transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
  );
}
