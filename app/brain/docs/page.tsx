// Authorized knowledge library grouped by company layer, owner, and project.

import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Library } from "lucide-react";
import {
  BrainAccessNotice,
  EmptyKnowledge,
  WorkspacePage,
} from "@/components/brain/workspace-ui";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getProjects } from "@/lib/brain/db";
import { KnowledgeBrowser, type KnowledgeSectionData } from "@/components/brain/knowledge-browser";

export default async function BrainDocsPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  if (!admin) {
    return (
      <BrainAccessNotice title="The knowledge library isn’t available yet">
        Finish the Brain database setup and sync the canonical vault to make approved knowledge available.
      </BrainAccessNotice>
    );
  }
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) {
    return (
      <BrainAccessNotice title="Brain access is inactive">
        An active organization membership is required to browse company knowledge.
      </BrainAccessNotice>
    );
  }
  const [manifest, projects, departments] = await Promise.all([
    getAuthorizedDocManifest(admin, principal, null).catch(() => []),
    getProjects(admin, principal.organizationId).catch(() => []),
    getDepartments(admin, principal.organizationId).catch(() => []),
  ]);

  const core = manifest.filter((d) => d.doc_type === "core");
  const rules = manifest.filter((d) => d.doc_type === "rule");
  const rest = manifest.filter((d) => d.doc_type === "doc");
  const unassigned = rest.filter((d) => !d.project_id && !d.department_id);
  // Docs pointing at an archived project or an unknown department would match
  // no section below and silently vanish while still being counted (and still
  // readable by the chat tools) — catch them in a leftover bucket instead.
  const projIds = new Set(projects.map((p) => p.id));
  const depIds = new Set(departments.map((d) => d.id));
  const unfiled = rest.filter(
    (d) => !(d.project_id ? projIds.has(d.project_id) : d.department_id ? depIds.has(d.department_id) : true),
  );
  const sections: KnowledgeSectionData[] = [
    {
      title: "Company core",
      description: "Strategy, operating model, and shared truth for the whole organization.",
      docs: core,
    },
    {
      title: "Standing rules",
      description: "Policies and controls that apply across departments and project work.",
      docs: rules,
    },
    ...departments.map((department) => ({
      title: department.name,
      description: department.blurb || "Department-owned playbooks and operating knowledge.",
      docs: rest.filter((doc) => doc.department_id === department.id && !doc.project_id),
    })),
    ...projects.map((project) => ({
      title: project.name,
      description: project.blurb || "Knowledge applied to this active project.",
      docs: rest.filter((doc) => doc.project_id === project.id),
    })),
    {
      title: "Company-wide knowledge",
      description: "Shared references without a specific department or project owner.",
      docs: unassigned,
    },
    {
      title: "Needs classification",
      description: "Authorized knowledge whose department or project is no longer in the active catalog.",
      docs: unfiled,
    },
  ];

  return (
    <WorkspacePage
      eyebrow="Authorized sources"
      title="Knowledge library"
      description={
        manifest.length === 0
          ? "Approved company knowledge will appear here after the canonical sources are synced."
          : `${manifest.length} documents are available in your current permission scope.`
      }
      action={
        canEditBrainTruth(principal) ? (
          <Link
            href="/brain/docs/new"
            className="ob-btn ob-btn-cta self-start"
          >
            <FilePlus2 className="size-4" />
            New knowledge
          </Link>
        ) : undefined
      }
    >
      {manifest.length === 0 ? (
        <div className="pt-8">
          <EmptyKnowledge
            title="No authorized knowledge yet"
            description="Approved documents will appear here when they are available to your role and scope."
          />
        </div>
      ) : (
        <KnowledgeBrowser sections={sections} />
      )}
      <p className="flex items-center gap-2 pt-8 text-[11px] text-ink-dimmer">
        <Library className="size-3.5" />
        The Brain can retrieve only the sources permitted in this library and the active project scope.
      </p>
    </WorkspacePage>
  );
}
