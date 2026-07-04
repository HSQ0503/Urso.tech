import { redirect } from "next/navigation";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { hasAccess } from "@/lib/canes/gate";
import { isDemo } from "@/lib/canes/data";
import { CanesNav } from "../components/nav";

// The gated application shell: sidebar on desktop, bottom tabs on mobile.

export default async function CanesAppLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAccess())) redirect("/CanesPressure/login");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 px-4 py-6 md:flex">
        <Link href="/CanesPressure" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--cp-brand)] text-white">
            <Droplets size={18} strokeWidth={2.2} />
          </span>
          <span>
            <span className="cp-display block text-[15px] leading-tight">Canes</span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-[var(--cp-muted)]">
              Pressure Washing
            </span>
          </span>
        </Link>
        <CanesNav />
        <div className="mt-auto px-2">
          {isDemo() && (
            <div className="cp-card px-3 py-2.5 text-[12px] leading-snug text-[var(--cp-muted)]">
              <span className="font-semibold text-[var(--cp-hot)]">Demo data.</span> Connect the Canes
              Supabase secret key to go live.
            </div>
          )}
          <p className="mt-3 px-1 text-[11px] text-[var(--cp-faint)]">Powered by Urso</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        {/* Bottom tabs (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cp-line)] bg-[var(--cp-surface)]/95 backdrop-blur md:hidden">
          <CanesNav mobile />
        </nav>
      </div>
    </div>
  );
}
