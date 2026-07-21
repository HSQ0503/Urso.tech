import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, LogOut, UserRound } from "lucide-react";
import { requireTechnicianActor } from "@/lib/canes/crew-auth";
import { signOutTechnician } from "@/app/CanesPressure/crew/auth-actions";
import { canesConfigured } from "@/lib/canes/supabase";
import { crewPinKey, pinGate } from "@/lib/canes/pin";
import { PinWatchdog } from "@/app/CanesPressure/components/pin-watchdog";

export default async function TechnicianPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireTechnicianActor();

  // Quick-PIN re-lock, same contract as the owner console: first login sets
  // the PIN, a 30-minute-old tab re-enters it. Live deploys only.
  let pinRelockMs: number | null = null;
  if (canesConfigured()) {
    const gate = await pinGate(crewPinKey(actor.accountId));
    if (gate.status !== "ok") redirect("/CanesPressure/pin?to=/CanesPressure/crew");
    pinRelockMs = gate.relockInMs;
  }

  return (
    <div className="min-h-screen bg-[var(--cp-bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--cp-chrome-line)] bg-[var(--cp-chrome)] text-[var(--cp-chrome-ink)]">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-3 px-4 pb-[env(safe-area-inset-top)] sm:px-6">
          <Link href="/CanesPressure/crew" className="flex min-h-11 items-center gap-3 py-2">
            <span className="cp-display text-[20px]">
              Canes<span className="text-[var(--cp-brand)]">.</span>
            </span>
            <span className="hidden h-5 w-px bg-[var(--cp-chrome-line)] sm:block" />
            <span className="hidden text-[12px] text-[var(--cp-chrome-muted)] sm:block">
              Crew portal
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-[13px] font-semibold">{actor.name}</p>
              <p className="truncate text-[11px] text-[var(--cp-chrome-muted)]">
                {actor.crewNames.join(", ")}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-chrome-raise)] text-[var(--cp-chrome-muted)] sm:hidden">
              <UserRound aria-hidden size={18} />
            </span>
            <form action={signOutTechnician}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--cp-chrome-muted)] transition-colors duration-200 hover:bg-[var(--cp-chrome-raise)] hover:text-white"
              >
                <LogOut aria-hidden size={18} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5 sm:px-6 sm:pb-10 sm:pt-7">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cp-line)] bg-[var(--cp-surface)]/95 px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <Link
          href="/CanesPressure/crew"
          className="mx-auto flex min-h-12 max-w-40 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--cp-brand-soft)] text-[13px] font-semibold text-[var(--cp-brand-deep)]"
        >
          <CalendarDays aria-hidden size={18} />
          My week
        </Link>
      </nav>

      {pinRelockMs !== null && (
        <PinWatchdog relockInMs={pinRelockMs} lockBase="/CanesPressure/pin" />
      )}
    </div>
  );
}
