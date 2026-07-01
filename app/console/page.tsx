import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Console | Urso",
  description: "Urso platform console.",
};

// Platform console for Urso staff (Han + Guga). Intentionally blank for now —
// this is where clients get onboarded and managed once there's more than one.
export default async function ConsolePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "urso_admin") redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 md:px-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-medium tracking-[-0.01em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
          <span className="ml-1 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">Console</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-edge px-3 py-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-[420px] text-center">
          <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl border border-dashed border-edge-strong">
            <span className="font-mono text-sm text-ink-dimmer">U</span>
          </div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Platform console</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-dim">
            Client onboarding and management will live here. For now the work happens inside each client&apos;s
            dashboard — open Woof Gang as the owner from the sign-in screen.
          </p>
          <p className="mt-6 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">
            1 client · Woof Gang · pilot
          </p>
        </div>
      </div>
    </main>
  );
}
