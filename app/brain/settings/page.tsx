// Brain settings: your profile (department/title — switching department is how
// a demo persona is played) + the org's BYO provider keys + vault sync status.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartments, getDocManifest, getOrgKeyStatus, getProfile } from "@/lib/brain/db";
import { OnboardingForm } from "@/components/brain/onboarding-form";
import { KeysManager } from "@/components/brain/keys-manager";

export default async function BrainSettingsPage() {
  const user = await getBrainUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [profile, departments, keys, manifest] = await Promise.all([
    getProfile(admin, user.id).catch(() => null),
    getDepartments(admin).catch(() => []),
    getOrgKeyStatus(admin).catch(() => []),
    getDocManifest(admin).catch(() => []),
  ]);
  if (departments.length === 0) redirect("/brain"); // pre-migration notice lives there
  if (!profile) redirect("/brain/welcome");

  const rules = manifest.filter((d) => d.doc_type === "rule").length;
  const core = manifest.filter((d) => d.doc_type === "core").length;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-10 py-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Settings</div>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">Settings</h1>
      </div>

      <section>
        <h2 className="text-[15px] font-semibold text-ink">Your profile</h2>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-dim">
          The brain loads context for whichever department you&rsquo;re in — switch it to work (or demo) as a different role.
        </p>
        <div className="mt-4">
          <OnboardingForm
            departments={departments}
            initialName={profile.name}
            initialDepartmentId={profile.department_id}
            initialTitle={profile.title}
            submitLabel="Save profile"
            redirectTo={null}
          />
        </div>
      </section>

      <section className="border-t border-edge pt-8">
        <h2 className="text-[15px] font-semibold text-ink">Org API keys</h2>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-dim">
          Bring-your-own keys: one per provider, org-wide. Everyone&rsquo;s chats route through these.
        </p>
        <div className="mt-4">
          <KeysManager initialKeys={keys} />
        </div>
      </section>

      <section className="border-t border-edge pt-8">
        <h2 className="text-[15px] font-semibold text-ink">Vault sync</h2>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-dim">
          {manifest.length === 0
            ? "No docs synced yet — run node scripts/brain-sync.mjs after applying the migration."
            : `${manifest.length} docs synced (${core} core · ${rules} standing rules). Re-run node scripts/brain-sync.mjs whenever the vault changes.`}
        </p>
      </section>
    </div>
  );
}
