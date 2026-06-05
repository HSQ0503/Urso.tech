"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  STORE_OPTIONS,
  MONTH_OPTIONS,
  parseScope,
  parseMonth,
} from "@/components/dashboard/data";

type IconName = "home" | "activity" | "store" | "users" | "scissors" | "star";

function Icon({ name }: { name: IconName }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "activity":
      return <svg {...common}><path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" /></svg>;
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

type NavGroup = { group: string; items: { href: string; label: string; icon: IconName }[] };

const navGroups: NavGroup[] = [
  { group: "Overview", items: [{ href: "/dashboard", label: "Home", icon: "home" }] },
  { group: "Performance", items: [{ href: "/dashboard/performance", label: "Performance", icon: "activity" }] },
  {
    group: "Drill in",
    items: [
      { href: "/dashboard/stores", label: "Stores", icon: "store" },
      { href: "/dashboard/customers", label: "Customers", icon: "users" },
      { href: "/dashboard/team", label: "Team", icon: "scissors" },
      { href: "/dashboard/reviews", label: "Reviews", icon: "star" },
    ],
  },
];

const flatNav = navGroups.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellChrome qs="">{children}</ShellChrome>}>
      <ShellLive>{children}</ShellLive>
    </Suspense>
  );
}

function ShellLive({ children }: { children: ReactNode }) {
  const qs = useSearchParams().toString();
  return <ShellChrome qs={qs}>{children}</ShellChrome>;
}

function ShellChrome({ qs, children }: { qs: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = flatNav.find((n) => isActive(pathname, n.href))?.label ?? "Home";
  const withQs = (href: string) => (qs ? `${href}?${qs}` : href);

  return (
    <div className="min-h-screen bg-bg text-ink lg:flex">
      {/* Sidebar — sticky so it stays pinned while the page scrolls. (Can't use
          `fixed` here: the .wipe-page-wrap ancestor sets will-change:transform,
          which makes a fixed element resolve against the wrapper, not the viewport.) */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[228px] shrink-0 flex-col overflow-y-auto border-r border-edge bg-[#060606] px-4 py-5 lg:flex">
        <Link href={withQs("/dashboard")} className="flex items-center gap-2 px-2">
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

        <nav className="mt-6 flex flex-col gap-5">
          {navGroups.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <div className="px-3 pb-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-dimmer">{g.group}</div>
              {g.items.map((n) => {
                const active = isActive(pathname, n.href);
                return (
                  <Link
                    key={n.href}
                    href={withQs(n.href)}
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
            </div>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-dashed border-edge-strong p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Pilot · mock data</div>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-ink-dim">Shaped like the live FranPOS, Twilio &amp; Google feeds.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge bg-bg/75 px-5 py-3 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
            <span className="text-[15px] font-medium normal-case tracking-normal text-ink lg:hidden">Urso</span>
            <span className="hidden sm:inline">Woof Gang</span>
            <span className="hidden text-edge-strong sm:inline">/</span>
            <span className="truncate text-ink-dim">{current}</span>
          </div>
          <FilterBar qs={qs} pathname={pathname} />
        </header>

        {/* Mobile nav */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-edge px-4 py-2 lg:hidden">
          {flatNav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={withQs(n.href)}
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

// ---- Global filter (Store + Month), URL-driven -----------------------------
function FilterBar({ qs, pathname }: { qs: string; pathname: string }) {
  const router = useRouter();
  const params = new URLSearchParams(qs);
  const store = parseScope(params.get("store"));
  const month = parseMonth(params.get("month"));

  const setParam = (key: string, value: string, fallback: string) => {
    const p = new URLSearchParams(qs);
    if (value === fallback) p.delete(key);
    else p.set(key, value);
    const s = p.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <FilterSelect
        glyph="store"
        value={store}
        options={STORE_OPTIONS.map((o) => ({ value: o.value, label: o.short }))}
        onChange={(v) => setParam("store", v, "all")}
      />
      <FilterSelect
        glyph="calendar"
        value={month}
        options={MONTH_OPTIONS}
        onChange={(v) => setParam("month", v, "all")}
      />
    </div>
  );
}

function FilterSelect<T extends string>({
  glyph,
  value,
  options,
  onChange,
}: {
  glyph: "store" | "calendar";
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-white/[0.02] px-3 py-1.5 text-[11.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
      >
        <span className="text-ink-dimmer">
          {glyph === "store" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5h16v4" /><path d="M4 9h16l-1 11H5L4 9Z" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></svg>
          )}
        </span>
        <span className="max-w-[120px] truncate font-medium text-ink">{current.label}</span>
        <span className={`text-ink-dimmer transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute right-0 z-40 mt-2 max-h-[320px] w-[200px] overflow-y-auto rounded-xl border border-edge bg-[#0c0c0c] p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]"
          >
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors ${
                    sel ? "bg-white/[0.06] text-ink" : "text-ink-dim hover:bg-white/[0.04] hover:text-ink"
                  }`}
                >
                  {o.label}
                  {sel && <span className="text-orange">•</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
