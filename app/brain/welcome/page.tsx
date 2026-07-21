// First-run onboarding: pick your department + title. After this, being logged
// in IS the context — the brain knows who you are on every chat.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getProfile } from "@/lib/brain/db";
import { OnboardingForm } from "@/components/brain/onboarding-form";

export default async function BrainWelcomePage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  if (!admin) redirect("/brain"); // setup notice lives there
  const [profile, departments] = await Promise.all([
    getProfile(admin, user.id).catch(() => null),
    getDepartments(admin).catch(() => []),
  ]);
  if (profile) redirect("/brain");
  if (departments.length === 0) redirect("/brain"); // pre-migration notice lives there

  return (
    <div className="mx-auto w-full max-w-[560px] py-10">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Welcome</div>
      <h1 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-ink">Who are you here?</h1>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-dim">
        The brain uses this to load the right context automatically — your department&rsquo;s docs, the standing rules
        that apply to you, and the projects you work on. You can change it any time in settings.
      </p>
      <div className="mt-7">
        <OnboardingForm departments={departments} initialName={user.name} />
      </div>
    </div>
  );
}
