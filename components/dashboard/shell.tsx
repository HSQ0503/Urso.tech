"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  STORE_OPTIONS,
  MONTH_OPTIONS,
  parseScope,
  parseMonth,
  scopeLabel,
  type StoreId,
} from "@/components/dashboard/data";
import type { Role } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { Modal } from "./modal";
import { ThemeToggle } from "./theme-toggle";

type IconName = "home" | "brief" | "activity" | "money" | "spark" | "store" | "users" | "scissors" | "star";

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /><path d="M9.5 21v-6.5h5V21" /></svg>;
    case "brief":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6M9 9h1" /></svg>;
    case "activity":
      return <svg {...common}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "money":
      return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>;
    case "spark":
      return <svg {...common}><path d="M11.4 3.3a.65.65 0 0 1 1.2 0l1.27 4.13a2 2 0 0 0 1.32 1.32l4.13 1.27a.65.65 0 0 1 0 1.24l-4.13 1.27a2 2 0 0 0-1.32 1.32l-1.27 4.13a.65.65 0 0 1-1.2 0l-1.27-4.13a2 2 0 0 0-1.32-1.32L4.68 11.5a.65.65 0 0 1 0-1.24l4.13-1.27a2 2 0 0 0 1.32-1.32Z" /><path d="M19 3.5v3M20.5 5h-3" /></svg>;
    case "store":
      return <svg {...common}><path d="M4 8 6 4h12l2 4" /><path d="M4 8h16" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M9.5 20v-5h5v5" /></svg>;
    case "users":
      return <svg {...common}><path d="M16 21v-1.8a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V21" /><circle cx="9.25" cy="7" r="3.75" /><path d="M21.5 21v-1.8a4 4 0 0 0-3-3.85" /><path d="M16 3.6a3.75 3.75 0 0 1 0 7.3" /></svg>;
    case "scissors":
      return <svg {...common}><circle cx="6" cy="6.5" r="2.75" /><circle cx="6" cy="17.5" r="2.75" /><path d="M8.2 8.4 20 19.5" /><path d="M20 4.5 8.2 15.6" /><path d="M12 12h.01" /></svg>;
    case "star":
      return <svg {...common}><path d="M12 3.2l2.62 5.32 5.88.86-4.25 4.14 1 5.86L12 16.77 6.75 19.4l1-5.86L3.5 9.4l5.88-.86Z" /></svg>;
  }
}

// `roles` omitted = visible to everyone in the shell (owner + manager). Owner-only
// pages are tagged so managers get a trimmed, store-scoped nav.
type NavItem = { href: string; label: string; icon: IconName; roles?: Role[] };
type NavGroup = { group: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    group: "Today",
    items: [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/dashboard/brief", label: "Weekly brief", icon: "brief", roles: ["owner"] },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/dashboard/performance", label: "Performance", icon: "activity", roles: ["owner"] },
      { href: "/dashboard/revenue", label: "Revenue map", icon: "money", roles: ["owner"] },
      { href: "/dashboard/actions", label: "AI actions", icon: "spark", roles: ["owner"] },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/dashboard/stores", label: "Stores", icon: "store", roles: ["owner"] },
      { href: "/dashboard/customers", label: "Customers", icon: "users", roles: ["owner"] },
      { href: "/dashboard/team", label: "Team", icon: "scissors", roles: ["owner"] },
      { href: "/dashboard/reviews", label: "Reviews", icon: "star", roles: ["owner"] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

type ShellProps = {
  role: Role;
  storeId: StoreId | null;
  clientName: string;
  userName: string;
  email: string;
  streak: number;
  memberSince: string;
  children: ReactNode;
};

export function Shell({ children, ...rest }: ShellProps) {
  return (
    <Suspense fallback={<ShellChrome qs="" {...rest}>{children}</ShellChrome>}>
      <ShellLive {...rest}>{children}</ShellLive>
    </Suspense>
  );
}

function ShellLive({ children, ...rest }: ShellProps) {
  const qs = useSearchParams().toString();
  return <ShellChrome qs={qs} {...rest}>{children}</ShellChrome>;
}

function ShellChrome({ qs, role, storeId, clientName, userName, email, streak, memberSince, children }: ShellProps & { qs: string }) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const lockedStore = role === "manager" ? storeId : null;
  const initials = userName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "WG";
  const roleLabel = role === "manager" ? "Store manager" : role === "owner" ? "Owner" : "Platform";

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || n.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
  const flatNav = groups.flatMap((g) => g.items);

  const current = flatNav.find((n) => isActive(pathname, n.href))?.label ?? "Home";
  const withQs = (href: string) => (qs ? `${href}?${qs}` : href);

  const storeName = lockedStore ? scopeLabel(lockedStore) : null;
  const orgSub = lockedStore ? `${storeName} · store manager` : "4 stores · Orlando";
  const orgBadge = lockedStore ? lockedStore.toUpperCase() : "WG";

  return (
    <div className="min-h-screen bg-bg text-ink lg:flex">
      {/* Sidebar — sticky so it stays pinned while the page scrolls. (Can't use
          `fixed` here: the .wipe-page-wrap ancestor sets will-change:transform,
          which makes a fixed element resolve against the wrapper, not the viewport.) */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[228px] shrink-0 flex-col overflow-y-auto border-r border-edge bg-sidebar px-4 py-5 lg:flex">
        <Link href={withQs("/dashboard")} className="flex items-center gap-2 px-2">
          <span className="text-[21px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </Link>

        <div className="mt-7 flex items-center gap-2.5 rounded-xl border border-edge bg-raise px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-orange-soft font-mono text-[12px] text-orange">{orgBadge}</span>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink">{clientName}</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">{orgSub}</div>
          </div>
        </div>

        <nav className="mt-6 flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <div className="px-3 pb-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-dimmer">{g.group}</div>
              {g.items.map((n) => {
                const active = isActive(pathname, n.href);
                return (
                  <Link
                    key={n.href}
                    href={withQs(n.href)}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors ${
                      active ? "bg-raise-strong text-ink" : "text-ink-dim hover:bg-raise hover:text-ink"
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

        {/* Identity (click → account) + sign out */}
        <div className="mt-auto flex flex-col gap-3 pt-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAccountOpen(true)}
              className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-edge bg-raise px-2.5 py-2 text-left transition-colors hover:border-edge-strong hover:bg-raise"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-soft font-mono text-[11px] text-orange">{initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{userName}</span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">{roleLabel} · account</span>
              </span>
              <span className="shrink-0 text-ink-dimmer transition-colors group-hover:text-orange" aria-hidden>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          </div>
          <ThemeToggle />
          <div className="rounded-xl border border-dashed border-edge-strong p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Pilot · mock data</div>
            <p className="mt-1.5 text-[11.5px] leading-[1.45] text-ink-dim">Shaped like the live FranPOS, Twilio &amp; Google feeds.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge bg-bg/75 px-5 py-3 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
            <span className="text-[15px] font-medium normal-case tracking-normal text-ink lg:hidden">Urso</span>
            <span className="hidden sm:inline">{clientName}</span>
            <span className="hidden text-edge-strong sm:inline">/</span>
            <span className="truncate text-ink-dim">{current}</span>
          </div>
          <FilterBar qs={qs} pathname={pathname} lockedStore={lockedStore} />
        </header>

        {/* Mobile nav */}
        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-edge px-4 py-2 lg:hidden">
          {flatNav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={withQs(n.href)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${active ? "bg-raise-strong text-ink" : "text-ink-dim"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <form action={signOut} className="ml-auto shrink-0">
            <button type="submit" className="cursor-pointer rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer">
              Sign out
            </button>
          </form>
        </nav>

        <main className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">{children}</main>
      </div>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} eyebrow="Account" title={userName} maxWidth={420}>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-orange-soft font-mono text-[15px] text-orange">{initials}</span>
            <div className="min-w-0">
              <div className="text-[15px] text-ink">{userName}</div>
              <div className="truncate font-mono text-[11px] text-ink-dimmer">{email}</div>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-edge bg-edge">
            <AccountRow k="Role" v={roleLabel} />
            <AccountRow k="Client" v={clientName} />
            {lockedStore && <AccountRow k="Store" v={scopeLabel(lockedStore)} />}
            <AccountRow k="Member since" v={memberSince} />
            <AccountRow k="Login streak" v={`${streak} days`} />
          </dl>
          <p className="text-[11.5px] leading-[1.5] text-ink-dimmer">
            Pilot environment — profile editing and password changes arrive with Supabase auth.
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-edge-strong py-2.5 text-[13px] text-ink transition-colors hover:bg-raise"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
              Sign out
            </button>
          </form>
        </div>
      </Modal>
    </div>
  );
}

function AccountRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between bg-cell px-4 py-3 text-[13px]">
      <span className="text-ink-dim">{k}</span>
      <span className="font-mono text-ink">{v}</span>
    </div>
  );
}

// ---- Global filter (Store + Month), URL-driven -----------------------------
// Managers have their store pinned (shown as a static label); everyone else
// gets the store dropdown.
function FilterBar({ qs, pathname, lockedStore }: { qs: string; pathname: string; lockedStore: StoreId | null }) {
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
      {lockedStore ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-raise px-3 py-1.5 text-[11.5px] text-ink-dim">
          <span className="text-ink-dimmer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5h16v4" /><path d="M4 9h16l-1 11H5L4 9Z" /></svg>
          </span>
          <span className="font-medium text-ink">{scopeLabel(lockedStore)}</span>
        </span>
      ) : (
        <FilterSelect
          glyph="store"
          value={store}
          options={STORE_OPTIONS.map((o) => ({ value: o.value, label: o.short }))}
          onChange={(v) => setParam("store", v, "all")}
        />
      )}
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
        className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-raise px-3 py-1.5 text-[11.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
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
            className="absolute right-0 z-40 mt-2 max-h-[320px] w-[200px] overflow-y-auto rounded-xl border border-edge bg-surface p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]"
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
                    sel ? "bg-raise-strong text-ink" : "text-ink-dim hover:bg-raise hover:text-ink"
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
