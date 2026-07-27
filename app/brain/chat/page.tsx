import { redirect } from "next/navigation";
import { BrainConsole } from "@/components/brain/brain-console";
import { getBrainUser } from "@/lib/brain/access";
import { getAuthorizedProjects, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import { getDepartments, getOrgKeyStatus, getProfile } from "@/lib/brain/db";
import { ursoDbSafe } from "@/lib/brain/supabase";

export default async function BrainChatPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  const [profile, principal] = admin
    ? await Promise.all([
        getProfile(admin, user.id).catch(() => null),
        resolveBrainPrincipal(admin, user).catch(() => null),
      ])
    : ([null, null] as const);
  const departments = admin ? await getDepartments(admin).catch(() => []) : [];
  const [projects, keyStatus] =
    admin && principal
      ? await Promise.all([
          getAuthorizedProjects(admin, principal).catch(() => []),
          getOrgKeyStatus(admin, principal.organizationId).catch(() => []),
        ])
      : ([[], []] as const);

  if (!admin || departments.length === 0) redirect("/brain");
  if (!profile) redirect("/brain/welcome");
  if (!principal) redirect("/brain");

  const department = departments.find((item) => item.id === principal.departmentId);
  const available = keyStatus.map((key) => key.provider);
  const initialProvider = available[0] ?? null;
  const initialModel = initialProvider ? BRAIN_PROVIDERS[initialProvider].defaultModel : null;
  const requestedProjectId = (await searchParams).project;
  const initialProjectId = projects.some((project) => project.id === requestedProjectId)
    ? (requestedProjectId ?? null)
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <BrainConsole
        departmentId={principal.departmentId}
        departmentName={department?.name ?? principal.departmentId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        availableProviders={available}
        initialProvider={initialProvider}
        initialModel={initialModel}
        initialProjectId={initialProjectId}
      />
    </div>
  );
}
