"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Filter,
  Users,
  FileText,
  CalendarDays,
  Receipt,
  Wallet,
  HandCoins,
  BarChart3,
  Settings,
  MoreHorizontal,
  ChevronRight,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
};

// Funnel order: people first (leads → customers), then the work, then money.
const LINKS: NavItem[] = [
  { href: "/CanesPressure", label: "Today", icon: LayoutDashboard, exact: true },
  { href: "/CanesPressure/inbox", label: "Inbox", icon: MessageSquare, exact: false },
  { href: "/CanesPressure/leads", label: "Leads", icon: Filter, exact: false },
  { href: "/CanesPressure/customers", label: "Customers", icon: Users, exact: false },
  { href: "/CanesPressure/estimates", label: "Estimates", icon: FileText, exact: false },
  { href: "/CanesPressure/schedule", label: "Schedule", icon: CalendarDays, exact: false },
  { href: "/CanesPressure/invoices", label: "Invoices", icon: Receipt, exact: false },
  { href: "/CanesPressure/expenses", label: "Expenses", icon: Wallet, exact: false },
  { href: "/CanesPressure/payouts", label: "Payouts", icon: HandCoins, exact: false },
  { href: "/CanesPressure/insights", label: "Insights", icon: BarChart3, exact: false },
  { href: "/CanesPressure/settings", label: "Settings", icon: Settings, exact: false },
];

// Mobile: Sebastian's daily loop gets a tab; everything else lives in More
// (Jobber's pattern) — five targets beat nine microscopic ones.
const MOBILE_TABS = LINKS.filter((l) =>
  ["Today", "Inbox", "Leads", "Schedule"].includes(l.label),
);
const MOBILE_MORE = LINKS.filter(
  (l) => !MOBILE_TABS.includes(l),
);

// Desktop groups the same links so a ten-item list reads as a hierarchy — the
// daily loop, then the work, then the money — instead of a flat wall, and the
// grouping fills the sidebar's dead space. Settings pins to the bottom.
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: LINKS.filter((l) => ["Today", "Inbox", "Leads", "Customers"].includes(l.label)) },
  { label: "Work", items: LINKS.filter((l) => ["Estimates", "Schedule"].includes(l.label)) },
  { label: "Money", items: LINKS.filter((l) => ["Invoices", "Expenses", "Payouts", "Insights"].includes(l.label)) },
];
const SETTINGS_LINK = LINKS.find((l) => l.label === "Settings")!;

export function CanesNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
  const moreActive = MOBILE_MORE.some((l) => isActive(l.href, l.exact));

  if (mobile) {
    return (
      <>
        <div className="flex items-stretch justify-around px-1 py-1 pb-[max(6px,env(safe-area-inset-bottom))]">
          {MOBILE_TABS.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className="cp-tab" data-active={isActive(href, exact)}>
              <Icon size={20} strokeWidth={2} className="shrink-0" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          ))}
          <button
            type="button"
            className="cp-tab"
            data-active={moreActive}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal size={20} strokeWidth={2} className="shrink-0" />
            <span className="max-w-full truncate">More</span>
          </button>
        </div>

        {/* Portal: the tab bar's backdrop-blur creates a containing block, so
            fixed-position children would anchor to the bar instead of the
            viewport (no dim, dead tap-outside). The .canes wrapper keeps the
            cp-* custom properties alive outside the app tree. */}
        {moreOpen &&
          createPortal(
            <div className="canes">
              <button
                type="button"
                aria-label="Close menu"
                className="cp-sheet-backdrop"
                onClick={() => setMoreOpen(false)}
              />
              <div className="cp-sheet" style={{ width: "auto", borderInline: 0, borderBottom: 0 }}>
                <div className="cp-grabber" />
                <div className="flex items-center justify-between px-4 pb-2 pt-1.5">
                  <span className="cp-mono">More</span>
                  <button
                    type="button"
                    aria-label="Close"
                    className="cp-icon-btn h-8 w-8"
                    onClick={() => setMoreOpen(false)}
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
                <div className="px-3 pb-3">
                  <div className="cp-list">
                    {MOBILE_MORE.map(({ href, label, icon: Icon, exact }) => {
                      const active = isActive(href, exact);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMoreOpen(false)}
                          className="cp-list-row"
                          style={active ? { color: "var(--cp-brand-deep)" } : undefined}
                        >
                          <Icon size={20} strokeWidth={2} className="shrink-0" />
                          <span className="cp-list-title flex-1">{label}</span>
                          <ChevronRight size={18} strokeWidth={2} className="cp-list-chev" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  const SettingsIcon = SETTINGS_LINK.icon;
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.label && <span className="cp-nav-section">{group.label}</span>}
          {group.items.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className="cp-nav-link" data-active={isActive(href, exact)}>
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="mt-auto border-t border-[color:var(--cp-chrome-line)] pt-3">
        <Link
          href={SETTINGS_LINK.href}
          className="cp-nav-link"
          data-active={isActive(SETTINGS_LINK.href, SETTINGS_LINK.exact)}
        >
          <SettingsIcon size={16} strokeWidth={2} />
          {SETTINGS_LINK.label}
        </Link>
      </div>
    </nav>
  );
}
