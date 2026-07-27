// First-run onboarding: pick your department + title. After this, being logged
// in IS the context — the brain knows who you are on every chat.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { getBrainMembership } from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getProfile } from "@/lib/brain/db";
import { OnboardingForm } from "@/components/brain/onboarding-form";

export default async function BrainWelcomePage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  if (!admin) redirect("/brain"); // setup notice lives there
  const [profile, departments, membership] = await Promise.all([
    getProfile(admin, user.id).catch(() => null),
    getDepartments(admin).catch(() => []),
    getBrainMembership(admin, user.id).catch(() => null),
  ]);
  if (profile) redirect("/brain");
  if (departments.length === 0) redirect("/brain"); // pre-migration notice lives there
  if (
    !membership?.active ||
    !membership.department_id ||
    !departments.some((department) => department.id === membership.department_id)
  ) {
    return (
      <div className="w-full max-w-[520px] p-8 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">
          Urso Brain · Access required
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-ink">
          Your Brain membership has not been provisioned
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-ink-dim">
          An administrator must assign your organization membership and department before you can create a profile.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[560px] p-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Welcome</div>
      <h1 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-ink">Who are you here?</h1>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-dim">
        The Brain uses your organization-assigned department and project memberships to load the right context
        automatically. You can personalize your name and title without changing your access.
      </p>
      <div className="mt-7">
        <OnboardingForm
          departments={departments}
          initialName={user.name}
          initialDepartmentId={membership.department_id}
          departmentLocked
        />
      </div>
    </div>
  );
}
