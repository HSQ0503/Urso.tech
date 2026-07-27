// The knowledge map groups authorized sources by company layer, project, and
// department. Wikilinks remain the relationship source, but the presentation
// is deterministic so the same knowledge always appears in the same place.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { getAuthorizedKnowledgeCatalog, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getGraph } from "@/lib/brain/db";
import { GraphView, type GraphNode } from "@/components/brain/graph-view";

export default async function BrainGraphPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) redirect("/brain");

  const [allDocs, catalog, departments] = await Promise.all([
    getGraph(admin, principal.organizationId).catch(() => []),
    getAuthorizedKnowledgeCatalog(admin, principal).catch(() => ({ docs: [], projects: [] })),
    getDepartments(admin, principal.organizationId).catch(() => []),
  ]);
  const permittedPaths = new Set(catalog.docs.map((doc) => doc.path));
  const docs = allDocs.filter((doc) => permittedPaths.has(doc.path));
  const accessProjectByPath = new Map(
    catalog.docs.map((doc) => [doc.path, doc.access_project_id ?? null]),
  );
  const projects = catalog.projects;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );

  const nodes: GraphNode[] = docs.map((d) => ({
    path: d.path,
    title: d.title,
    project: d.project_id,
    projectName: d.project_id ? (projectNames.get(d.project_id) ?? d.project_id) : null,
    department: d.department_id,
    departmentName: d.department_id
      ? (departmentNames.get(d.department_id) ?? d.department_id)
      : null,
    type: d.doc_type,
    origin: d.origin,
    accessProjectId: accessProjectByPath.get(d.path) ?? null,
  }));
  const indexByPath = new Map(nodes.map((n, i) => [n.path, i]));
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  docs.forEach((d, s) => {
    for (const target of d.links) {
      const t = indexByPath.get(target);
      if (t === undefined || t === s) continue; // dangling link or self-link
      const key = s < t ? `${s}:${t}` : `${t}:${s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([s, t]);
    }
  });

  if (nodes.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <p className="max-w-[420px] text-center text-[14px] leading-[1.6] text-[var(--ob-muted)]">
          Nothing to draw yet — run <code>node scripts/brain-sync.mjs</code> to load the vault.
        </p>
      </div>
    );
  }

  return <GraphView nodes={nodes} edges={edges} />;
}
