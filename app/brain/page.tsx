// The Urso Brain console page. The layout has already gated to urso_admin;
// here we require a completed profile (else onboarding) and hand the client
// console its identity + project slate + which providers have org keys.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartments, getOrgKeyStatus, getProfile, getProjects } from "@/lib/brain/db";
import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import { BrainConsole } from "@/components/brain/brain-console";

export default async function BrainPage() {
  const user = await getBrainUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Tolerate the pre-migration state: treat DB errors as "no data yet" so the
  // page renders with an empty slate instead of a 500.
  const [profile, departments, projects, keyStatus] = await Promise.all([
    getProfile(admin, user.id).catch(() => null),
    getDepartments(admin).catch(() => []),
    getProjects(admin).catch(() => []),
    getOrgKeyStatus(admin).catch(() => []),
  ]);

  if (departments.length === 0) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="max-w-[460px] rounded-none border border-edge bg-panel p-6 text-center">
          <h1 className="text-[17px] font-bold text-ink">The brain isn&rsquo;t wired up yet</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-dim">
            Run migration <code className="text-orange">0026_brain.sql</code> in the Supabase SQL editor, then{" "}
            <code className="text-orange">node scripts/brain-sync.mjs</code> to load the vault.
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
