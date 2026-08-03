import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  BriefcaseBusiness,
  Landmark,
  LayoutDashboard,
  ReceiptText,
} from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { signOutAdmin } from "@/app/login/actions";

const nav = [
  { href: "/fi", label: "Overview", icon: LayoutDashboard },
  { href: "/fi#cash-flow", label: "Cash flow", icon: ArrowLeftRight },
  { href: "/fi#deals", label: "Deals", icon: BriefcaseBusiness },
  { href: "/fi#ledger", label: "Ledger", icon: ReceiptText },
  { href: "/fi#record", label: "New transaction", icon: Banknote },
] as const;

export function FinanceShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="theme-scope min-h-screen bg-bg text-ink lg:flex">
      <aside
        className="sticky top-0 z-30 hidden h-screen w-[228px] shrink-0 flex-col overflow-y-auto border-r border-edge px-4 py-5 lg:flex"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <Link href="/fi" className="flex items-center gap-3 px-1">
          <span className="grid size-9 place-items-center border border-[rgba(254,81,0,0.28)] bg-orange-soft text-orange">
            <Landmark size={17} strokeWidth={1.75} aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-[-0.01em]">Urso</span>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dimmer">Finance</span>
          </span>
        </Link>

        <div className="mt-5 h-px bg-edge" />
        <nav className="mt-6 space-y-1" aria-label="Finance navigation">
          {nav.map(({ href, label, icon: Icon }, index) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-11 items-center gap-3 border-l px-3 text-[12.5px] transition-colors ${index === 0 ? "border-orange bg-orange-wash text-ink" : "border-transparent text-ink-dim hover:border-edge-strong hover:bg-raise hover:text-ink"}`}
            >
              <Icon size={17} strokeWidth={1.7} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-edge pt-4">
          <p className="truncate px-2 font-mono text-[9.5px] text-ink-dimmer" title={email}>{email}</p>
          <div className="mt-3"><ThemeToggle /></div>
          <form action={signOutAdmin} className="mt-2">
            <button type="submit" className="min-h-11 w-full cursor-pointer px-2 text-left font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer transition-colors hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-edge px-4 backdrop-blur-xl lg:hidden" style={{ background: "var(--topbar-bg)" }}>
          <Link href="/fi" className="flex items-center gap-2 text-[15px] font-semibold">
            Urso <span className="size-1.5 bg-orange" /> <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dimmer">Finance</span>
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
