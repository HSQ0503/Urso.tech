import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { setPassword } from "../actions";

export const metadata: Metadata = {
  title: "Set your password | Urso",
  robots: { index: false, follow: false },
};

// Reached two ways: from the emailed link (the recovery token became a session
// at /auth/callback), or by an already-signed-in user who wants to change their
// password. Either way there must be a provisioned session — getSession() is
// the same gate the dashboard uses.
const errorCopy: Record<string, string> = {
  short: "Use at least 10 characters.",
  match: "Those two passwords don't match.",
  failed: "That password couldn't be saved. Try a different one.",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=expired");

  const sp = await searchParams;
  const error = sp.error ? (errorCopy[sp.error] ?? errorCopy.failed) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </div>

        <h1 className="text-[26px] font-medium tracking-[-0.02em]">Choose a password</h1>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-dim">
          Signed in as <span className="text-ink">{session.email}</span>. Pick something only you know — at least 10
          characters. You&apos;ll use it every time from now on.
        </p>

        <form action={setPassword} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">New password</span>
            <input
              type="password"
              name="password"
              required
              minLength={10}
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-[13.5px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Confirm password</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={10}
              autoComplete="new-password"
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
            Save and continue →
          </button>
        </form>
      </div>
    </main>
  );
}
