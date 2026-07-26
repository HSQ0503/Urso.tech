import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  MessageSquareText,
  Scale,
} from "lucide-react";
import {
  BrainAccessNotice,
  DocumentRow,
  EmptyKnowledge,
  Metric,
  WorkspacePage,
} from "@/components/brain/workspace-ui";
import { getBrainUser } from "@/lib/brain/access";
import { getAuthorizedKnowledgeCatalog, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { getDepartments, getProfile } from "@/lib/brain/db";
import { ursoDbSafe } from "@/lib/brain/supabase";

export default async function BrainDepartmentsPage() {
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
      <BrainAccessNotice title="Department hubs are not available yet">
        Finish the Brain database setup and sync the canonical vault to make department knowledge available.
      </BrainAccessNotice>
    );
  }
  if (!profile) redirect("/brain/welcome");
  if (!principal) {
    return (
      <BrainAccessNotice title="Brain access is inactive">
        An active organization membership is required to browse department knowledge.
      </BrainAccessNotice>
    );
  }

  const catalog = await getAuthorizedKnowledgeCatalog(admin, principal).catch(() => ({
    docs: [],
    projects: [],
  }));
  const projects = catalog.projects;
  const authorizedDocs = catalog.docs;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const totalOwnedDocs = authorizedDocs.filter((doc) => doc.department_id).length;
  const totalRules = authorizedDocs.filter((doc) => doc.doc_type === "rule").length;

  return (
    <WorkspacePage
      eyebrow="Knowledge ownership"
      title="Department knowledge"
      description="See who owns each body of company knowledge and where that truth is being applied to active work."
      action={
        <Link href="/brain/chat" className="ob-btn ob-btn-cta self-start">
          <MessageSquareText className="size-4" />
          Ask across departments
        </Link>
      }
    >
      <section className="sana-metric-strip">
        <Metric label="Departments" value={departments.length} detail="Knowledge owners" />
        <Metric label="Owned docs" value={totalOwnedDocs} detail="Permitted in your scope" />
        <Metric label="Standing rules" value={totalRules} detail="Across authorized knowledge" />
      </section>

      <section className="sana-directory-section">
        <div className="ob-section-heading">
          <div>
            <h2>Knowledge owners</h2>
            <p>Open a department to browse its owned sources and company rules.</p>
          </div>
        </div>
        <div className="sana-entity-directory">
          {departments.map((department) => {
            const ownedDocs = authorizedDocs
              .filter((doc) => doc.department_id === department.id)
              .sort((a, b) => a.title.localeCompare(b.title));
            const applicableRules = authorizedDocs
              .filter(
                (doc) =>
                  doc.doc_type === "rule" &&
                  doc.department_id !== department.id &&
                  (doc.audience.includes("all") || doc.audience.includes(department.id)),
              )
              .sort((a, b) => a.title.localeCompare(b.title));
            const projectIds = new Set(
              ownedDocs.flatMap((doc) => (doc.project_id ? [doc.project_id] : [])),
            );
            const isHome = department.id === principal.departmentId;
            const ruleCount =
              ownedDocs.filter((doc) => doc.doc_type === "rule").length + applicableRules.length;

            return (
              <details
                id={department.id}
                key={department.id}
                className={`sana-directory-item ${isHome ? "is-home" : ""}`}
              >
                <summary>
                  <span className="sana-directory-icon">
                    <Building2 className="size-5" />
                  </span>
                  <span className="sana-directory-copy">
                    <strong>
                      {department.name}
                      {isHome && <em>Your department</em>}
                    </strong>
                    <span>
                      {department.blurb || "Department-owned rules, playbooks, and operating knowledge."}
                    </span>
                    <small>
                      {ownedDocs.length} sources · {ruleCount} rules · {projectIds.size} projects
                    </small>
                  </span>
                  <ArrowRight className="sana-directory-arrow" />
                </summary>

                <div className="sana-directory-body">
                  <aside>
                    <p>Department details</p>
                    <dl>
                      <div>
                        <dt>Owned knowledge</dt>
                        <dd>{ownedDocs.length} docs</dd>
                      </div>
                      <div>
                        <dt>Active projects</dt>
                        <dd>{projectIds.size}</dd>
                      </div>
                      <div>
                        <dt>Applicable rules</dt>
                        <dd>{ruleCount}</dd>
                      </div>
                    </dl>
                    {projectIds.size > 0 && (
                      <div className="sana-contributors">
                        <span>Active work</span>
                        <ul>
                          {Array.from(projectIds).map((projectId) => (
                            <li key={projectId}>{projectNames.get(projectId) ?? projectId}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Link href="/brain/chat" className="ob-btn">
                      Ask about {department.name}
                      <ArrowRight className="size-3.5 text-orange" />
                    </Link>
                  </aside>

                  <div className="sana-directory-documents">
                    <div>
                      <BookOpenText className="size-4" />
                      <h3>Owned knowledge</h3>
                    </div>
                    {ownedDocs.length > 0 ? (
                      <div>
                        {ownedDocs.map((doc) => (
                          <DocumentRow
                            key={doc.path}
                            doc={doc}
                            context={
                              doc.project_id
                                ? (projectNames.get(doc.project_id) ?? "Project")
                                : "Department-wide"
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyKnowledge
                        title="No owned knowledge in your view"
                        description="No department-owned documents are currently available in your authorized scope."
                        kind="department"
                      />
                    )}
                    {applicableRules.length > 0 && (
                      <section className="sana-rule-section">
                        <div>
                          <Scale className="size-4" />
                          <h3>Company rules that apply</h3>
                        </div>
                        {applicableRules.map((doc) => (
                          <DocumentRow
                            key={doc.path}
                            doc={doc}
                            context={
                              doc.project_id
                                ? (projectNames.get(doc.project_id) ?? "Project")
                                : "Company-wide"
                            }
                          />
                        ))}
                      </section>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </WorkspacePage>
  );
}
