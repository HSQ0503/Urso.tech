// The Urso Brain console page. Auth is the Urso HQ project session; here we
// require a completed profile (else onboarding) and hand the client console its
// identity + project slate + which providers have org keys.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { resolveBrainPrincipal } from "@/lib/brain/authorization";
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
  const [profile, principal] = admin
    ? await Promise.all([
        getProfile(admin, user.id).catch(() => null),
        resolveBrainPrincipal(admin, user).catch(() => null),
      ])
    : ([null, null] as const);
  const departments = admin ? await getDepartments(admin).catch(() => []) : [];
  const [projects, keyStatus] = admin && principal
    ? await Promise.all([
        getProjects(admin, principal.organizationId).catch(() => []),
        getOrgKeyStatus(admin, principal.organizationId).catch(() => []),
      ])
    : ([[], []] as const);

  if (!admin || departments.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="ob-card max-w-[460px] text-center">
          <h1 className="text-[17px] font-bold text-[var(--ob-text)]">The brain isn&rsquo;t wired up yet</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ob-muted)]">
            {!admin ? (
              <>
                Set <code className="text-orange">URSO_SUPABASE_SECRET_KEY</code> (the Urso HQ project&rsquo;s secret
                key, Settings → API keys) in the environment, then restart.
              </>
            ) : (
              <>
                Run <code className="text-orange">0001_brain.sql</code> and then{" "}
                <code className="text-orange">0002_company_brain.sql</code> in the URSO project&rsquo;s SQL editor,
                then run <code className="text-orange">node scripts/brain-sync.mjs</code>.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (!profile) redirect("/brain/welcome");
  if (!principal) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="ob-card max-w-[460px] text-center">
          <h1 className="text-[17px] font-bold text-[var(--ob-text)]">Brain access is inactive</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ob-muted)]">
            Your profile exists, but you do not have an active organization membership.
          </p>
        </div>
      </div>
    );
  }

  const department = departments.find((d) => d.id === principal.departmentId);
  const available = keyStatus.map((k) => k.provider);
  const initialProvider = available[0] ?? null;
  const initialModel = initialProvider ? BRAIN_PROVIDERS[initialProvider].defaultModel : null;

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <BrainConsole
        userName={principal.name}
        departmentId={principal.departmentId}
        departmentName={department?.name ?? principal.departmentId}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        availableProviders={available}
        initialProvider={initialProvider}
        initialModel={initialModel}
      />
    </div>
  );
}
