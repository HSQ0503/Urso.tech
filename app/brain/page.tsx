// The Urso Brain console page. Auth is the Urso HQ project session; here we
// require a completed profile (else onboarding) and hand the client console its
// identity + project slate + which providers have org keys.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getOrgKeyStatus, getProfile, getProjects } from "@/lib/brain/db";
import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import { BrainConsole } from "@/components/brain/brain-console";

export default async function BrainPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  // ursoDbSafe: a half-configured deploy (auth env set, secret key missing)
  // must land on the setup notice below, never a 500 — sign-in alone only
  // needs the publishable key, so this state is very reachable.
  const admin = ursoDbSafe();

  // Tolerate the pre-migration state too: treat DB errors as "no data yet" so
  // the page renders the notice instead of crashing.
  const [profile, departments, projects, keyStatus] = admin
    ? await Promise.all([
        getProfile(admin, user.id).catch(() => null),
        getDepartments(admin).catch(() => []),
        getProjects(admin).catch(() => []),
        getOrgKeyStatus(admin).catch(() => []),
      ])
    : ([null, [], [], []] as const);

  if (!admin || departments.length === 0) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="max-w-[460px] rounded-none border border-edge bg-panel p-6 text-center">
          <h1 className="text-[17px] font-bold text-ink">The brain isn&rsquo;t wired up yet</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-dim">
            {!admin ? (
              <>
                Set <code className="text-orange">URSO_SUPABASE_SECRET_KEY</code> (the Urso HQ project&rsquo;s secret
                key, Settings → API keys) in the environment, then restart.
              </>
            ) : (
              <>
                Run <code className="text-orange">supabase/urso/0001_brain.sql</code> in the URSO project&rsquo;s SQL
                editor (not Woof Gang&rsquo;s), then <code className="text-orange">node scripts/brain-sync.mjs</code> to
                load the vault.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (!profile) redirect("/brain/welcome");

  const department = departments.find((d) => d.id === profile.department_id);
  const available = keyStatus.map((k) => k.provider);
  const initialProvider = available[0] ?? null;
  const initialModel = initialProvider ? BRAIN_PROVIDERS[initialProvider].defaultModel : null;

  return (
    <div className="min-h-[70vh] flex-1 md:h-[calc(100vh-140px)]">
      <BrainConsole
        userName={profile.name}
        departmentId={profile.department_id}
        departmentName={department?.name ?? profile.department_id}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        availableProviders={available}
        initialProvider={initialProvider}
        initialModel={initialModel}
      />
    </div>
  );
}
