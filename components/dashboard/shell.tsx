"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
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
import type { Locale } from "@/lib/i18n";
import { signOut } from "@/app/login/actions";
import { Modal } from "./modal";
import { ThemeToggle } from "./theme-toggle";
import { LangToggle } from "./lang-toggle";
import { LocaleProvider, useT } from "./locale-provider";
import {
  Home,
  FileText,
  Activity,
  Banknote,
  ArrowRightLeft,
  Package,
  Target,
  Flag,
  Store,
  Users,
  Scissors,
  Star,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";

type IconName = "home" | "brief" | "activity" | "money" | "profit" | "spark" | "store" | "users" | "scissors" | "star" | "compare" | "box" | "event";

// Brand packet §11: hairline geometric line icons on a 24px grid — Lucide is the
// approved set. Mapped here so the nav data keeps using stable string keys.
const ICONS: Record<IconName, LucideIcon> = {
  home: Home,
  brief: FileText,
  activity: Activity,
  money: Banknote,
  profit: PiggyBank,
  spark: Target,
  store: Store,
  users: Users,
  scissors: Scissors,
  star: Star,
  compare: ArrowRightLeft,
  box: Package,
  event: Flag,
};

function Icon({ name }: { name: IconName }) {
  const Glyph = ICONS[name];
  return <Glyph size={17} strokeWidth={1.75} aria-hidden />;
}

// `roles` omitted = visible to everyone in the shell (owner + manager). Owner-only
// pages are tagged so managers get a trimmed, store-scoped nav. `label` doubles
// as the i18n key (translated via t() at render).
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
      { href: "/dashboard/money", label: "Money", icon: "profit", roles: ["owner"] },
      { href: "/dashboard/compare", label: "Compare", icon: "compare", roles: ["owner"] },
      { href: "/dashboard/products", label: "Products", icon: "box", roles: ["owner"] },
      { href: "/dashboard/actions", label: "AI actions", icon: "spark", roles: ["owner"] },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/dashboard/events", label: "Events", icon: "event" },
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
  locale: Locale;
  children: ReactNode;
};
type ChromeProps = Omit<ShellProps, "locale">;

export function Shell({ children, locale, ...rest }: ShellProps) {
  return (
    <LocaleProvider locale={locale}>
      <Suspense fallback={<ShellChrome qs="" {...rest}>{children}</ShellChrome>}>
        <ShellLive {...rest}>{children}</ShellLive>
      </Suspense>
    </LocaleProvider>
  );
}

function ShellLive({ children, ...rest }: ChromeProps) {
  const qs = useSearchParams().toString();
  return <ShellChrome qs={qs} {...rest}>{children}</ShellChrome>;
}

function ShellChrome({ qs, role, storeId, clientName, userName, email, streak, memberSince, children }: ChromeProps & { qs: string }) {
  const pathname = usePathname();
  const t = useT();
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

  const orgInitials = clientName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "WG";

  return (
    <div className="theme-scope min-h-screen bg-bg text-ink lg:flex">
      {/* Sidebar — sticky so it stays pinned while the page scrolls. (Can't use
          `fixed` here: the .wipe-page-wrap ancestor sets will-change:transform,
          which makes a fixed element resolve against the wrapper, not the viewport.) */}
      <aside
        className="sticky top-0 z-30 hidden h-screen w-[228px] shrink-0 flex-col overflow-y-auto border-r border-edge px-3 py-4 lg:flex"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <Link href={withQs("/dashboard")} className="flex items-center gap-2.5 rounded-lg px-2 py-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-orange-edge bg-orange-soft font-mono text-xs font-medium text-orange">
            {orgInitials}
          </span>
          <span className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">{clientName}</span>
        </Link>

        <div className="mt-4 h-px bg-edge" />

        <nav className="mt-4 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-1 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">{t(g.group)}</div>
              {g.items.map((n) => {
                const active = isActive(pathname, n.href);
                return (
                  <Link
                    key={n.href}
                    href={withQs(n.href)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 ${
                      active ? "bg-raise-strong font-medium text-ink" : "text-ink-dim hover:bg-raise hover:text-ink"
                    }`}
                  >
                    <span className={active ? "text-ink" : "text-ink-dimmer group-hover:text-ink-dim"}>
                      <Icon name={n.icon} />
                    </span>
                    {t(n.label)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Identity (click → account) + sign out */}
        <div className="mt-auto flex flex-col gap-2.5 pt-5">
          <Link
            href={withQs("/dashboard/actions")}
            className="dash-pill flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors duration-150"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden className="text-orange"><path d="M12 3l1.7 4.8L18 9.5l-4.3 1.7L12 16l-1.7-4.8L6 9.5l4.3-1.7L12 3Z" /></svg>
            {t("Ask urso.ai")}
          </Link>
          <button
            onClick={() => setAccountOpen(true)}
            className="dash-pill group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raise-strong font-mono text-2xs text-ink-dim">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{userName}</span>
              <span className="block truncate font-mono text-2xs uppercase tracking-[0.08em] text-ink-dimmer">{t(roleLabel)} · {t("account")}</span>
            </span>
            <span className="shrink-0 text-ink-dimmer transition-colors group-hover:text-ink" aria-hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </button>
          <ThemeToggle />
          <div className="rounded-lg border border-dashed border-edge-strong px-3 py-2.5">
            <div className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">{t("Pilot · mock data")}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{t("Shaped like the live FranPOS, Twilio & Google feeds.")}</p>
          </div>
          <div className="flex items-center gap-2.5 border-t border-edge px-1 pt-3">
            <Image src="/urso-mark.png" alt="Urso" width={18} height={18} className="shrink-0" />
            <div className="leading-tight">
              <div className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">{t("Powered by")}</div>
              <div className="text-xs font-medium tracking-[-0.01em] text-ink-dim">Urso Systems</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge px-5 py-2.5 backdrop-blur-xl md:px-8"
          style={{ background: "var(--topbar-bg)" }}
        >
          <div className="flex min-w-0 items-center gap-2 font-mono text-2xs uppercase tracking-[0.1em] text-ink-dimmer">
            <span className="truncate text-sm font-medium normal-case tracking-normal text-ink sm:hidden">{clientName}</span>
            <span className="hidden sm:inline">{clientName}</span>
            <span className="hidden text-edge-strong sm:inline">/</span>
            <span className="truncate text-ink-dim">{t(current)}</span>
          </div>
          <div className="flex items-center gap-2">
            <FilterBar qs={qs} pathname={pathname} lockedStore={lockedStore} />
            <LangToggle />
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-edge px-4 py-2 lg:hidden">
          {flatNav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={withQs(n.href)}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                  active ? "bg-raise-strong font-medium text-ink" : "text-ink-dim hover:bg-raise hover:text-ink"
                }`}
              >
                {t(n.label)}
              </Link>
            );
          })}
          <form action={signOut} className="ml-auto shrink-0">
            <button type="submit" className="cursor-pointer rounded-lg px-3 py-2 font-mono text-2xs uppercase tracking-[0.08em] text-ink-dimmer hover:text-ink-dim">
              {t("Sign out")}
            </button>
          </form>
        </nav>

        <main className="mx-auto max-w-[1200px] px-5 py-6 md:px-8 md:py-7">{children}</main>
      </div>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} eyebrow={t("Account")} title={userName} maxWidth={420}>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-raise-strong font-mono text-sm text-ink-dim">{initials}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{userName}</div>
              <div className="truncate font-mono text-xs text-ink-dimmer">{email}</div>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
            <AccountRow k={t("Role")} v={t(roleLabel)} />
            <AccountRow k={t("Client")} v={clientName} />
            {lockedStore && <AccountRow k={t("Store")} v={scopeLabel(lockedStore)} />}
            <AccountRow k={t("Member since")} v={memberSince} />
            {streak > 0 && <AccountRow k={t("Login streak")} v={t("{n} days", { n: streak })} />}
          </dl>
          <p className="text-xs leading-relaxed text-ink-dimmer">
            {t("Pilot environment — profile editing and password changes are handled by Urso for now.")}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-edge-strong py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-raise"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
              {t("Sign out")}
            </button>
          </form>
        </div>
      </Modal>
    </div>
  );
}

function AccountRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between bg-cell px-4 py-3 text-sm">
      <span className="text-ink-dim">{k}</span>
      <span className="font-mono text-xs text-ink">{v}</span>
    </div>
  );
}

// ---- Global filter (Store + Month), URL-driven -----------------------------
// Managers have their store pinned (shown as a static label); everyone else
// gets the store dropdown.
function FilterBar({ qs, pathname, lockedStore }: { qs: string; pathname: string; lockedStore: StoreId | null }) {
  const router = useRouter();
  const t = useT();
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
        <span className="dash-pill inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-ink-dim">
          <span className="text-ink-dimmer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5h16v4" /><path d="M4 9h16l-1 11H5L4 9Z" /></svg>
          </span>
          <span className="font-medium text-ink">{scopeLabel(lockedStore)}</span>
        </span>
      ) : (
        <FilterSelect
          glyph="store"
          value={store}
          options={STORE_OPTIONS.map((o) => ({ value: o.value, label: o.value === "all" ? t("All stores") : o.short }))}
          onChange={(v) => setParam("store", v, "all")}
        />
      )}
      {pathname.startsWith("/dashboard/compare") ? (
        // Compare picks its own periods — a live month filter here would imply
        // it scopes that page when it doesn't.
        <span
          title={t("The Compare page uses its own period picker below — the global month filter doesn't apply there.")}
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-edge bg-raise px-3 py-1.5 text-xs text-ink-dimmer opacity-60"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></svg>
          <span className="font-medium">{t("Dates set below")}</span>
        </span>
      ) : (
        <FilterSelect
          glyph="calendar"
          value={month}
          options={MONTH_OPTIONS}
          onChange={(v) => setParam("month", v, "all")}
        />
      )}
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
        className="dash-pill inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-ink-dim transition-colors duration-150 hover:text-ink"
      >
        <span className="text-ink-dimmer">
          {glyph === "store" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5h16v4" /><path d="M4 9h16l-1 11H5L4 9Z" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></svg>
          )}
        </span>
        <span className="max-w-[120px] truncate font-medium text-ink">{current.label}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`text-ink-dimmer transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute right-0 z-40 mt-2 max-h-[320px] w-[200px] overflow-y-auto rounded-lg border border-edge bg-panel-strong p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.55)]"
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
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
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
