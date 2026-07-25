import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  FileCheck2,
  MessageSquareText,
} from "lucide-react";
import {
  BrainAccessNotice,
  DocumentRow,
  EmptyKnowledge,
  SectionHeading,
  WorkspacePage,
} from "@/components/brain/workspace-ui";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { getDepartments, getOrgKeyStatus, getProfile, getProjects } from "@/lib/brain/db";
import { ursoDbSafe } from "@/lib/brain/supabase";
import type { BrainDocMeta, BrainThreadSummary } from "@/lib/brain/types";

async function getRecentThreads(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<BrainThreadSummary[]> {
  const { data, error } = await admin
    .from("brain_threads")
    .select("id, title, project_id, model, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(4);
  if (error) return [];
  return (data ?? []) as BrainThreadSummary[];
}

async function getPendingProposalCount(admin: SupabaseClient, organizationId: string): Promise<number> {
  const { count, error } = await admin
    .from("brain_knowledge_proposals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "pending");
  return error ? 0 : (count ?? 0);
}

async function getOverdueReviewCount(admin: SupabaseClient, organizationId: string): Promise<number> {
  const { count, error } = await admin
    .from("brain_docs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("review_due_at", "is", null)
    .lt("review_due_at", new Date().toISOString());
  return error ? 0 : (count ?? 0);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function priorityForDocument(doc: BrainDocMeta): number {
  if (doc.doc_type === "rule") return 0;
  if (doc.doc_type === "core") return 1;
  return 2;
}

export default async function BrainHomePage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  const [profile, principal, departments] = admin
    ? await Promise.all([
        getProfile(admin, user.id).catch(() => null),
        resolveBrainPrincipal(admin, user).catch(() => null),
        getDepartments(admin).catch(() => []),
      ])
    : ([null, null, []] as const);

  if (!admin || departments.length === 0) {
    return (
      <BrainAccessNotice title="The Brain isn’t wired up yet">
        {!admin ? (
          <>
            Set <code className="text-orange">URSO_SUPABASE_SECRET_KEY</code> for the Urso HQ project, then
            restart the app.
          </>
        ) : (
          <>
            Apply <code className="text-orange">0001_brain.sql</code> and{" "}
            <code className="text-orange">0002_company_brain.sql</code>, then run{" "}
            <code className="text-orange">node scripts/brain-sync.mjs</code>.
          </>
        )}
      </BrainAccessNotice>
    );
  }

  if (!profile) redirect("/brain/welcome");
  if (!principal) {
    return (
      <BrainAccessNotice title="Brain access is inactive">
        Your profile exists, but you do not have an active organization membership. Ask an administrator to
        restore your access.
      </BrainAccessNotice>
    );
  }

  const steward = canEditBrainTruth(principal);
  const [projects, keyStatus, companyManifest, recentThreads, pendingProposals, overdueReviews] = await Promise.all([
    getProjects(admin, principal.organizationId).catch(() => []),
    getOrgKeyStatus(admin, principal.organizationId).catch(() => []),
    getAuthorizedDocManifest(admin, principal, null).catch(() => []),
    getRecentThreads(admin, principal.organizationId, principal.userId),
    steward ? getPendingProposalCount(admin, principal.organizationId) : Promise.resolve(0),
    steward ? getOverdueReviewCount(admin, principal.organizationId) : Promise.resolve(0),
  ]);

  const projectManifests = await Promise.all(
    projects.map(async (project) => ({
      project,
      docs: (await getAuthorizedDocManifest(admin, principal, project.id).catch(() => [])).filter(
        (doc) => doc.project_id === project.id,
      ),
    })),
  );

  const department = departments.find((item) => item.id === principal.departmentId);
  const departmentName = department?.name ?? principal.departmentId;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const departmentKnowledge = companyManifest
    .filter(
      (doc) =>
        doc.department_id === principal.departmentId ||
        (doc.doc_type === "rule" &&
          (doc.audience.includes("all") || doc.audience.includes(principal.departmentId))),
    )
    .sort((a, b) => priorityForDocument(a) - priorityForDocument(b) || a.title.localeCompare(b.title));
  const currentKnowledge = [...departmentKnowledge, ...companyManifest.filter((doc) => doc.doc_type === "core")]
    .filter((doc, index, docs) => docs.findIndex((candidate) => candidate.path === doc.path) === index)
    .slice(0, 6);
  const permittedKnowledge = [...companyManifest, ...projectManifests.flatMap(({ docs }) => docs)].filter(
    (doc, index, docs) => docs.findIndex((candidate) => candidate.path === doc.path) === index,
  );
  const applicableRules = departmentKnowledge.filter((doc) => doc.doc_type === "rule");
  const firstName = principal.name.trim().split(/\s+/)[0] || "there";

  return (
    <WorkspacePage
      eyebrow="Home"
      title={`${departmentName} workspace`}
      description={`${firstName}, you have ${permittedKnowledge.length} permitted sources across ${projects.length} active projects.`}
      action={
        <Link href="/brain/chat" className="ob-btn ob-btn-cta self-start">
          <MessageSquareText className="size-3.5" />
          Ask Brain
        </Link>
      }
    >
      <section className="sana-home-grid">
        <div className="min-w-0">
          <SectionHeading
            title="Active projects"
            description="Project spaces available in your current scope."
            href="/brain/projects"
          />
          {projectManifests.length > 0 ? (
            <div className="sana-project-list">
              {projectManifests.slice(0, 6).map(({ project, docs }) => {
                const contributingDepartments = new Set(
                  docs.map((doc) => doc.department_id).filter(Boolean),
                ).size;
                return (
                  <Link
                    key={project.id}
                    href={`/brain/projects#${project.id}`}
                    className="sana-project-row group"
                  >
                    <span className="sana-entity-icon">
                      <BriefcaseBusiness className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="sana-project-title">{project.name}</span>
                      <span className="sana-project-meta">
                        {docs.length} permitted docs · {contributingDepartments} contributing departments
                      </span>
                    </span>
                    <ArrowRight className="sana-row-arrow" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyKnowledge
              title="No active projects"
              description="Active project workspaces will appear here when they are added to the Brain catalog."
            />
          )}
        </div>

        <aside className="min-w-0">
          <SectionHeading title="Your department" />
          <div className="sana-department-card">
          <div className="flex items-center gap-2.5">
            <Building2 className="size-[15px] text-orange" />
            <h2 className="text-[13px] font-medium">{departmentName}</h2>
          </div>
          <p className="mt-2 text-[11.5px] leading-5 text-ink-dim">
            {department?.blurb || "Your department’s knowledge, rules, and active project context."}
          </p>
          <dl className="mt-3 grid grid-cols-2 border-y border-edge py-3">
            <div>
              <dt className="text-[9.5px] text-ink-dimmer">Knowledge</dt>
              <dd className="mt-0.5 text-[13px] font-medium">{departmentKnowledge.length}</dd>
            </div>
            <div className="border-l border-edge pl-4">
              <dt className="text-[9.5px] text-ink-dimmer">Rules</dt>
              <dd className="mt-0.5 text-[13px] font-medium">{applicableRules.length}</dd>
            </div>
          </dl>
          <dl className="mt-3 space-y-1 text-[10.5px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-dimmer">Access</dt>
              <dd className="text-ink-dim">{principal.role.replaceAll("_", " ")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-dimmer">Models</dt>
              <dd className="text-ink-dim">{keyStatus.length > 0 ? `${keyStatus.length} ready` : "Setup required"}</dd>
            </div>
          </dl>
          <Link href="/brain/departments" className="ob-btn mt-4 w-full justify-center">
            Open department
            <ArrowRight className="size-3 text-orange" />
          </Link>
          </div>
        </aside>
      </section>

      <section className="sana-home-lower">
        <div>
          <SectionHeading
            title="Current knowledge"
            description={`Company core, ${departmentName} knowledge, and the rules that apply to your work.`}
            href="/brain/departments"
            hrefLabel="Open department"
          />
          {currentKnowledge.length > 0 ? (
            <div>
              {currentKnowledge.map((doc) => (
                <DocumentRow
                  key={doc.path}
                  doc={doc}
                  context={
                    doc.project_id
                      ? (projectNames.get(doc.project_id) ?? "Project")
                      : doc.department_id
                        ? (departments.find((item) => item.id === doc.department_id)?.name ?? "Department")
                        : "Company-wide"
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyKnowledge
              title="No department briefing yet"
              description="Permitted company core, department knowledge, and standing rules will appear here."
            />
          )}
        </div>

        <div>
          <SectionHeading
            title="Recent conversations"
            href="/brain/chat"
            hrefLabel="Open chat"
          />
          {recentThreads.length > 0 ? (
            <div className="sana-conversation-list">
              {recentThreads.map((thread) => (
                <div key={thread.id} className="sana-conversation-row">
                  <span className="ob-document-icon">
                    <MessageSquareText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>{thread.title}</p>
                    <p>
                      {thread.project_id ? (projectNames.get(thread.project_id) ?? "Project") : "Company-wide"} ·{" "}
                      {formatUpdatedAt(thread.updated_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyKnowledge
              title="No conversations yet"
              description="Your recent Brain conversations will be available here after your first question."
            />
          )}
        </div>
      </section>

      {steward && (pendingProposals > 0 || overdueReviews > 0) && (
        <section className="mt-8 border-t border-edge pt-3">
          <div className="flex flex-col gap-3 rounded-md bg-raise px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-orange" />
              <div>
                <p className="text-[12px] font-medium">Steward review</p>
                <p className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
                  {pendingProposals} pending proposal{pendingProposals === 1 ? "" : "s"} · {overdueReviews}{" "}
                  overdue review{overdueReviews === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <Link
              href="/brain/settings"
              className="ob-btn"
            >
              <FileCheck2 className="size-3.5 text-orange" />
              Review
            </Link>
          </div>
        </section>
      )}
    </WorkspacePage>
  );
}
