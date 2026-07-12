import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPending } from "@/lib/urso-auth";
import { confirmPasscode } from "../actions";

export const metadata: Metadata = {
  title: "Confirm passcode | Urso",
  robots: { index: false, follow: false },
};

// First sign-in on a device: the magic link proved the email, this proves the
// person. Reached only with a valid pending cookie (set by /login/verify);
// anyone else bounces back to /login.
export default async function PasscodePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const pending = await getPending();
  if (!pending) redirect("/login?error=expired");

  const sp = await searchParams;
  const error = sp.error ? "That passcode isn't right. Try again." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </div>

        <h1 className="text-[26px] font-medium tracking-[-0.02em]">One more step</h1>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-dim">
          You are signed in as <span className="text-ink">{pending.email}</span>. Enter your setup passcode to finish. We only ask this the first time on a device.
        </p>

        <form action={confirmPasscode} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Passcode</span>
            <input
              type="text"
              name="passcode"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="••••••"
              className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-[13.5px] tracking-[0.3em] text-ink placeholder:tracking-[0.3em] placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-orange/30 bg-orange-soft px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-orange">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange py-3 text-[13.5px] font-medium text-black transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
          >
            Confirm →
          </button>
        </form>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
          Provisioned by Urso · magic link + passcode
        </p>
      </div>
    </main>
  );
}
