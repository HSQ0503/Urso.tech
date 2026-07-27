import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  FileText,
  MessageSquareText,
} from "lucide-react";
import {
  BrainAccessNotice,
  DocumentRow,
  EmptyKnowledge,
  Metric,
  WorkspacePage,
} from "@/components/brain/workspace-ui";
import { getBrainUser } from "@/lib/brain/access";
import {
  getAuthorizedDocManifest,
  getAuthorizedProjects,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { getDepartments, getProfile } from "@/lib/brain/db";
import { ursoDbSafe } from "@/lib/brain/supabase";

export default async function BrainProjectsPage() {
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
      <BrainAccessNotice title="Project workspaces are not available yet">
        Finish the Brain database setup and sync the canonical vault to make active projects available.
      </BrainAccessNotice>
    );
  }
  if (!profile) redirect("/brain/welcome");
  if (!principal) {
    return (
      <BrainAccessNotice title="Brain access is inactive">
        An active organization membership is required to browse project knowledge.
      </BrainAccessNotice>
    );
  }

  const projects = await getAuthorizedProjects(admin, principal).catch(() => []);
  const projectWorkspaces = await Promise.all(
    projects.map(async (project) => ({
      project,
      docs: (await getAuthorizedDocManifest(admin, principal, project.id).catch(() => [])).filter(
        (doc) => doc.project_id === project.id,
      ),
    })),
  );
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const totalProjectDocs = projectWorkspaces.reduce((total, workspace) => total + workspace.docs.length, 0);
  const contributingDepartmentIds = new Set(
    projectWorkspaces.flatMap((workspace) =>
      workspace.docs.flatMap((doc) => (doc.department_id ? [doc.department_id] : [])),
    ),
  );

  return (
    <WorkspacePage
      eyebrow="Work in context"
      title="Project workspaces"
      description="Browse the knowledge being applied to every active engagement, regardless of which department owns each source."
      action={
        <Link href="/brain/chat" className="ob-btn ob-btn-cta self-start">
          <MessageSquareText className="size-4" />
          Ask about a project
        </Link>
      }
    >
      <section className="sana-metric-strip">
        <Metric label="Active projects" value={projects.length} detail="Available workspaces" />
        <Metric label="Project docs" value={totalProjectDocs} detail="Permitted in your scope" />
        <Metric
          label="Departments"
          value={contributingDepartmentIds.size}
          detail="Contributing knowledge"
        />
      </section>

      {projectWorkspaces.length === 0 ? (
        <div className="pt-12">
          <EmptyKnowledge
            title="No active projects"
            description="Projects will appear here when they are added to the Brain’s active project catalog."
          />
        </div>
      ) : (
        <section className="sana-directory-section">
          <div className="ob-section-heading">
            <div>
              <h2>Active projects</h2>
              <p>Open a workspace to inspect its authorized sources and contributors.</p>
            </div>
          </div>
          <div className="sana-entity-directory">
            {projectWorkspaces.map(({ project, docs }) => {
              const projectDepartments = Array.from(
                new Set(docs.flatMap((doc) => (doc.department_id ? [doc.department_id] : []))),
              );
              const rules = docs.filter((doc) => doc.doc_type === "rule").length;

              return (
                <details id={project.id} key={project.id} className="sana-directory-item">
                  <summary>
                    <span className="sana-directory-icon">
                      <BriefcaseBusiness className="size-5" />
                    </span>
                    <span className="sana-directory-copy">
                      <strong>{project.name}</strong>
                      <span>
                        {project.blurb || "Project knowledge from the departments contributing to this work."}
                      </span>
                      <small>
                        {docs.length} sources · {rules} rules · {projectDepartments.length} contributors
                      </small>
                    </span>
                    <ArrowRight className="sana-directory-arrow" />
                  </summary>

                  <div className="sana-directory-body">
                    <aside>
                      <p>Workspace details</p>
                      <dl>
                        <div>
                          <dt>Knowledge</dt>
                          <dd>{docs.length} docs</dd>
                        </div>
                        <div>
                          <dt>Standing rules</dt>
                          <dd>{rules}</dd>
                        </div>
                      </dl>
                      <div className="sana-contributors">
                        <span>
                          <Building2 className="size-4" />
                          Contributors
                        </span>
                        {projectDepartments.length > 0 ? (
                          <ul>
                            {projectDepartments.map((departmentId) => (
                              <li key={departmentId}>
                                {departmentNames.get(departmentId) ?? departmentId}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No department ownership recorded.</p>
                        )}
                      </div>
                      <Link href={`/brain/chat?project=${encodeURIComponent(project.id)}`} className="ob-btn">
                        Ask Brain
                        <ArrowRight className="size-3.5 text-orange" />
                      </Link>
                    </aside>

                    <div className="sana-directory-documents">
                      <div>
                        <FileText className="size-4" />
                        <h3>Project knowledge</h3>
                      </div>
                      {docs.length > 0 ? (
                        <div>
                          {docs.map((doc) => (
                            <DocumentRow
                              key={doc.path}
                              doc={doc}
                              projectId={project.id}
                              context={
                                doc.department_id
                                  ? (departmentNames.get(doc.department_id) ?? "Department")
                                  : project.name
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyKnowledge
                          title="No permitted project documents"
                          description="No project-scoped knowledge is currently available in your authorized view."
                        />
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </WorkspacePage>
  );
}
