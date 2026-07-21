import { redirect } from "next/navigation";
import { canesConfigured } from "@/lib/canes/supabase";
import { pinGate } from "@/lib/canes/pin";
import { resolvePinIdentity } from "@/lib/canes/pin-identity";
import { PinForm } from "./pin-form";

// The quick-PIN screen — first-time setup or the 30-minute re-lock. Sits
// OUTSIDE the (app)/(portal) gates (a sibling of login/), because those
// layouts are exactly what redirects here. Identity is surface-aware
// (resolvePinIdentity) so a browser holding both an admin and a crew session
// doesn't ping-pong. Requires a real session; with none there is nothing to
// lock, so it bounces to login.

export const dynamic = "force-dynamic";
export const metadata = { title: "Enter PIN", robots: { index: false, follow: false } };

export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const returnToRaw = to && to.startsWith("/CanesPressure") && !to.startsWith("//") ? to : undefined;

  const identity = await resolvePinIdentity(returnToRaw);
  if (!identity) redirect("/login");
  const returnTo = returnToRaw ?? identity.home;

  // Demo/unconfigured: the gate is off — nothing to set or unlock.
  if (!canesConfigured()) redirect(returnTo);

  const gate = await pinGate(identity.key);
  if (gate.status === "ok") redirect(returnTo);

  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-5 py-10">
      <header className="mb-6 text-center">
        <p className="cp-display text-[26px] leading-none">
          Canes<span className="text-[var(--cp-brand)]">.</span>
        </p>
        <p className="cp-mono mt-1.5">Pressure washing</p>
      </header>

      <div className="cp-card p-5">
        {gate.status === "setup" ? (
          <>
            <h1 className="text-[17px] font-semibold">Set your PIN, {identity.firstName}</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
              Pick a 4-digit PIN. When a tab sits open for a while, we&rsquo;ll ask for it
              instead of making you sign in again.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[17px] font-semibold">Welcome back, {identity.firstName}</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
              This tab was open a while — enter your PIN to continue.
            </p>
          </>
        )}
        <div className="mt-4">
          <PinForm mode={gate.status} returnTo={returnTo} />
        </div>
      </div>

      <p className="cp-mono mt-6 text-center">Powered by Urso</p>
    </div>
  );
}
