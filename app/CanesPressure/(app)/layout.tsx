import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAccess, gateEnabled } from "@/lib/canes/gate";
import { isDemo } from "@/lib/canes/data";
import { getAdminSession } from "@/lib/urso-auth";
import { signOutAdmin } from "@/app/login/actions";
import { CanesNav } from "../components/nav";
import { CanesTour } from "../components/tour";
import { getTechnicianActor } from "@/lib/canes/crew-auth";
import { adminPinKey, pinGate } from "@/lib/canes/pin";
import { PinWatchdog } from "../components/pin-watchdog";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

// The gated application shell: dark Urso chrome sidebar on desktop, five
// bottom tabs + a More sheet on mobile.

export default async function CanesAppLayout({ children }: { children: React.ReactNode }) {
  const [admin, technician] = await Promise.all([
    getAdminSession(),
    getTechnicianActor(),
  ]);
  const demo = isDemo();
  // A technician session must never inherit owner access from the legacy shared
  // passcode cookie. A real owner session wins if both cookies exist.
  if (technician && !admin) redirect("/CanesPressure/crew");
  // Live CRM data is owner-account only. The old shared access-code cookie is
  // retained solely for an unconfigured/demo environment.
  if (!admin && !demo) redirect("/login");

  // Locked out → the shared-passcode page if that gate is configured, otherwise
  // the Urso admin login. This branch is now only reachable in demo mode.
  if (!(await hasAccess())) {
    redirect(gateEnabled() ? "/CanesPressure/login" : "/login");
  }

  // Quick-PIN re-lock (live only — demo has no DB to hold a PIN). First login
  // routes to setup; an expired 30-minute unlock routes to the lock screen.
  // The watchdog below handles the tab that sits open past its window.
  let pinRelockMs: number | null = null;
  if (admin && !demo) {
    const gate = await pinGate(adminPinKey(admin.email));
    if (gate.status !== "ok") redirect("/CanesPressure/pin?to=/CanesPressure");
    pinRelockMs = gate.relockInMs;
  }

  return (
    // theme-scope: the app follows the site-wide dark/light toggle exactly like
    // /dashboard — canes.css re-maps every cp token onto the --color-* tokens
    // inside this scope. The wrapper paints the field full-width so the >1440px
    // gutters follow the theme too.
    <div className="theme-scope min-h-screen bg-[var(--cp-bg)] text-[var(--cp-ink)]">
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
      {/* Sidebar (desktop) — the dashboard's theme-aware sidebar material */}
      <aside className="cp-sidebar-rail sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto px-3 py-5 text-[var(--cp-chrome-ink)] md:flex">
        {/* Wordmark, not an icon-in-a-box — real trade software leads with the name */}
        <Link href="/CanesPressure" className="mb-6 block px-2.5 pt-1">
          <span className="cp-display block text-[19px] leading-tight">
            Canes<span className="text-[var(--cp-brand)]">.</span>
          </span>
          <span className="cp-mono mt-1 block" style={{ color: "var(--cp-chrome-faint)" }}>
            Pressure Washing
          </span>
        </Link>
        <CanesNav />
        <div className="mt-auto px-2">
          {demo && (
            <div className="rounded-md border border-[var(--cp-chrome-line)] bg-[var(--cp-chrome-raise)] px-3 py-2.5 text-[12px] leading-snug text-[var(--cp-chrome-muted)]">
              <span className="font-semibold text-[var(--cp-brand)]">Demo data.</span> Connect the
              Canes Supabase secret key to go live.
            </div>
          )}
          {admin && (
            <div className="mt-3 flex items-center justify-between gap-2 px-1">
              <span className="cp-mono min-w-0 truncate" style={{ color: "var(--cp-chrome-faint)" }} title={admin.email}>
                {admin.email}
              </span>
              <form action={signOutAdmin}>
                <button
                  type="submit"
                  className="cp-mono shrink-0 transition-colors hover:text-[var(--cp-chrome-ink)]"
                  style={{ color: "var(--cp-chrome-muted)" }}
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
          <div className="mt-3">
            <ThemeToggle />
          </div>
          <p className="cp-mono mt-3 px-1" style={{ color: "var(--cp-chrome-faint)" }}>
            Powered by Urso
          </p>
        </div>
      </aside>

      {/* Main — mobile content clears the notch (top) and the tab bar (bottom) */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 pb-24 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
          {children}
        </main>
        {/* Bottom tabs (mobile) — translucent iOS tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cp-line)] bg-[var(--cp-surface)]/80 px-1 backdrop-blur-xl md:hidden">
          <CanesNav mobile />
        </nav>
      </div>

      {/* First-login onboarding tour — self-contained; never blocks the page */}
      <Suspense fallback={null}>
        <CanesTour />
      </Suspense>

      {/* Re-lock a tab the moment its PIN unlock window lapses */}
      {pinRelockMs !== null && (
        <PinWatchdog relockInMs={pinRelockMs} lockBase="/CanesPressure/pin" />
      )}
    </div>
    </div>
  );
}
