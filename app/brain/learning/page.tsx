import { redirect } from "next/navigation";
import { LearningInbox } from "@/components/brain/learning-inbox";
import { WorkspacePage } from "@/components/brain/workspace-ui";
import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";

export default async function BrainLearningPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");

  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) redirect("/brain");
  if (!canEditBrainTruth(principal)) redirect("/brain/settings");

  return (
    <WorkspacePage
      eyebrow="Knowledge operations"
      title="Learning inbox"
      description="Review durable patterns the Brain has observed before they enter a governed knowledge or temporal-truth proposal."
    >
      <LearningInbox />
    </WorkspacePage>
  );
}
