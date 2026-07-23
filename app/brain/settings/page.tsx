// Brain settings: your profile (department/title — switching department is how
// a demo persona is played) + the org's BYO provider keys + vault sync status.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getOrgKeyStatus, getProfile } from "@/lib/brain/db";
import { OnboardingForm } from "@/components/brain/onboarding-form";
import { KeysManager } from "@/components/brain/keys-manager";
import { BrainIndexManager } from "@/components/brain/index-manager";
import { ProposalQueue } from "@/components/brain/proposal-queue";

export default async function BrainSettingsPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  if (!admin) redirect("/brain"); // setup notice lives there
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) redirect("/brain");
  const [profile, departments, keys, manifest] = await Promise.all([
    getProfile(admin, user.id, principal.organizationId).catch(() => null),
    getDepartments(admin, principal.organizationId).catch(() => []),
    canEditBrainTruth(principal)
      ? getOrgKeyStatus(admin, principal.organizationId).catch(() => [])
      : Promise.resolve([]),
    getAuthorizedDocManifest(admin, principal, null).catch(() => []),
  ]);
  if (departments.length === 0) redirect("/brain"); // pre-migration notice lives there
  if (!profile) redirect("/brain/welcome");

  const rules = manifest.filter((d) => d.doc_type === "rule").length;
  const core = manifest.filter((d) => d.doc_type === "core").length;

  return (
    <div className="ob-content">
      <div className="ob-wide !max-w-[720px]">
        <h1 className="ob-title !text-[1.7em]">Settings</h1>

        <section className="mt-8">
          <h2 className="text-[15px] font-semibold text-[var(--ob-text)]">Your profile</h2>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-[var(--ob-muted)]">
            {canEditBrainTruth(principal)
              ? "The Brain loads context for your assigned department. As a steward, you may switch it for controlled demos."
              : "Your department identity is assigned by an administrator and controls which context the Brain may retrieve."}
          </p>
          <div className="mt-4">
            <OnboardingForm
              departments={departments}
              initialName={profile.name}
              initialDepartmentId={profile.department_id}
              initialTitle={profile.title}
              submitLabel="Save profile"
              redirectTo={null}
              departmentLocked={!canEditBrainTruth(principal)}
            />
          </div>
        </section>

        {canEditBrainTruth(principal) && (
          <section className="mt-8 border-t border-[var(--ob-border)] pt-8">
            <h2 className="text-[15px] font-semibold text-[var(--ob-text)]">Org API keys</h2>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-[var(--ob-muted)]">
              Bring-your-own keys: one per provider, org-wide. Everyone&rsquo;s chats route through these.
            </p>
            <div className="mt-4">
              <KeysManager initialKeys={keys} />
            </div>
            <div className="mt-4">
              <BrainIndexManager />
            </div>
          </section>
        )}

        {canEditBrainTruth(principal) && (
          <section className="mt-8 border-t border-[var(--ob-border)] pt-8">
            <h2 className="text-[15px] font-semibold text-[var(--ob-text)]">Knowledge proposals</h2>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-[var(--ob-muted)]">
              Review AI-suggested changes before they become a new immutable document version.
            </p>
            <div className="mt-4">
              <ProposalQueue />
            </div>
          </section>
        )}

        <section className="mt-8 border-t border-[var(--ob-border)] pt-8">
          <h2 className="text-[15px] font-semibold text-[var(--ob-text)]">Vault sync</h2>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-[var(--ob-muted)]">
            {manifest.length === 0
              ? "No docs synced yet — run node scripts/brain-sync.mjs after applying the migration."
              : `${manifest.length} docs synced (${core} core · ${rules} standing rules). Re-run node scripts/brain-sync.mjs whenever the vault changes.`}
          </p>
        </section>
      </div>
    </div>
  );
}
