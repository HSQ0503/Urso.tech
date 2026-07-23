// The vault graph — Obsidian's graph view, in the brain. Server assembles
// nodes + edges from brain_docs.links; the client canvas does the physics. It
// fills the pane the way Obsidian's does, with the legend floating over it.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { getAuthorizedDocManifest, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getGraph, getProjects } from "@/lib/brain/db";
import { GraphLegend, GraphView, type GraphNode } from "@/components/brain/graph-view";

export default async function BrainGraphPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) redirect("/brain");

  const [allDocs, manifest, projects] = await Promise.all([
    getGraph(admin, principal.organizationId).catch(() => []),
    getAuthorizedDocManifest(admin, principal, null).catch(() => []),
    getProjects(admin, principal.organizationId).catch(() => []),
  ]);
  const permittedPaths = new Set(manifest.map((doc) => doc.path));
  const docs = allDocs.filter((doc) => permittedPaths.has(doc.path));

  const nodes: GraphNode[] = docs.map((d) => ({
    path: d.path,
    title: d.title,
    project: d.project_id,
    department: d.department_id,
    type: d.doc_type,
    origin: d.origin,
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

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <GraphView nodes={nodes} edges={edges} />
        <div className="pointer-events-none absolute bottom-3 left-4 right-4">
          <GraphLegend projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </div>
      <div className="ob-status">
        <span>{nodes.length} docs</span>
        <span>{edges.length} connections</span>
      </div>
    </>
  );
}
