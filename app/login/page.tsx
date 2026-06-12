import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in | Urso",
  description: "Sign in to the Urso dashboard.",
};

const errorCopy: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Email or password is incorrect.",
  unprovisioned: "This account isn't set up for a dashboard yet — ask Urso to provision it.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Already signed in and provisioned → straight home. Unprovisioned sessions
  // fall through to the form (getSession() is null for them), no redirect loop.
  const session = await getSession();
  if (session) redirect(homePathFor(session.role));

  const sp = await searchParams;
  const error = sp.error ? (errorCopy[sp.error] ?? errorCopy.invalid) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </div>

        <h1 className="text-[26px] font-medium tracking-[-0.02em]">Sign in</h1>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-dim">
          Use the account Urso provisioned for you. One login per person — owners see every store, managers see theirs.
        </p>

        <form action={signIn} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@woofgangbakery.com"
              className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-[13.5px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-[13.5px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
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
            Sign in →
          </button>
        </form>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
          Accounts are provisioned by Urso · no self-signup
        </p>
      </div>
    </main>
  );
}
