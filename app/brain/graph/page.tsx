// The vault graph — Obsidian's graph view, in the brain. Server assembles
// nodes + edges from brain_docs.links; the client canvas does the physics.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getGraph, getProjects } from "@/lib/brain/db";
import { GraphLegend, GraphView, type GraphNode } from "@/components/brain/graph-view";

export default async function BrainGraphPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");

  const [docs, projects] = await Promise.all([getGraph(admin).catch(() => []), getProjects(admin).catch(() => [])]);

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

  return (
    <div className="w-full py-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Graph</div>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] text-ink">The vault graph</h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            {nodes.length} docs · {edges.length} connections. Hover to trace, click to open, scroll to zoom, drag to pan.
            Orange rings are brain-written docs.
          </p>
        </div>
      </div>
      {nodes.length === 0 ? (
        <div className="grid h-[50vh] place-items-center rounded-none border border-edge bg-panel">
          <p className="max-w-[420px] text-center text-[13.5px] leading-[1.6] text-ink-dim">
            Nothing to draw yet — run <code className="text-orange">node scripts/brain-sync.mjs</code> to load the vault.
          </p>
        </div>
      ) : (
        <>
          <GraphView nodes={nodes} edges={edges} />
          <div className="mt-3">
            <GraphLegend projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </>
      )}
    </div>
  );
}
