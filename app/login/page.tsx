import type { Metadata } from "next";
import { MOCK_USERS, type Role } from "@/lib/auth";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in | Urso",
  description: "Sign in to the Urso dashboard.",
};

const roleLabel: Record<Role, string> = {
  urso_admin: "Platform",
  owner: "Owner",
  manager: "Store manager",
};

const initials: Record<string, string> = {
  urso: "UR", owner: "RC", "mgr-wp": "WP", "mgr-wg": "WG", "mgr-lv": "LV", "mgr-wm": "WM",
};

const groups: { label: string; ids: string[] }[] = [
  { label: "Urso — platform", ids: ["urso"] },
  { label: "Woof Gang — owner", ids: ["owner"] },
  { label: "Woof Gang — store managers", ids: ["mgr-wp", "mgr-wg", "mgr-lv", "mgr-wm"] },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink">Urso</span>
          <span className="size-1.5 rounded-full bg-orange" />
        </div>

        <h1 className="text-[26px] font-medium tracking-[-0.02em]">Sign in</h1>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-dim">
          Pilot environment — choose an identity to continue. Each one opens the dashboard scoped to that person.
        </p>

        <div className="mt-8 space-y-7">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">{g.label}</div>
              <div className="space-y-2">
                {g.ids.map((id) => {
                  const u = MOCK_USERS[id];
                  return (
                    <form key={id} action={signIn}>
                      <input type="hidden" name="id" value={id} />
                      <button
                        type="submit"
                        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-left transition-colors hover:border-edge-strong hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-soft font-mono text-[11px] text-orange">
                          {initials[id]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">{u.name}</span>
                          <span className="block truncate font-mono text-[10.5px] text-ink-dimmer">{u.email}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-edge px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dim">
                          {roleLabel[u.role]}
                        </span>
                        <span className="shrink-0 text-ink-dimmer transition-colors group-hover:text-orange" aria-hidden>
                          →
                        </span>
                      </button>
                    </form>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
          Mock auth · no password yet · Supabase next
        </p>
      </div>
    </main>
  );
}
