"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Filter, CalendarDays, Settings } from "lucide-react";

const LINKS = [
  { href: "/CanesPressure", label: "Today", icon: LayoutDashboard, exact: true },
  { href: "/CanesPressure/inbox", label: "Inbox", icon: MessageSquare, exact: false },
  { href: "/CanesPressure/leads", label: "Leads", icon: Filter, exact: false },
  { href: "/CanesPressure/schedule", label: "Schedule", icon: CalendarDays, exact: false },
  { href: "/CanesPressure/settings", label: "Settings", icon: Settings, exact: false },
];

export function CanesNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  if (mobile) {
    return (
      <div className="flex items-stretch justify-around px-1 py-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
        {LINKS.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className="flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold"
            style={{ color: isActive(href, exact) ? "var(--cp-brand-deep)" : "var(--cp-muted)" }}
          >
            <Icon size={20} strokeWidth={isActive(href, exact) ? 2.4 : 2} />
            {label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon: Icon, exact }) => (
        <Link key={href} href={href} className="cp-nav-link" data-active={isActive(href, exact)}>
          <Icon size={17} strokeWidth={2.1} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
