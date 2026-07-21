// Vault browser — the synced docs, grouped the way the company is organized.
// Read-only in v1 (authoring stays in Obsidian/markdown; the sync script loads it).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getDocManifest, getProjects } from "@/lib/brain/db";
import type { BrainDocMeta } from "@/lib/brain/types";

const TYPE_BADGE: Record<string, string> = { core: "core", rule: "rule" };

function DocRow({ doc }: { doc: BrainDocMeta }) {
  const badge = TYPE_BADGE[doc.doc_type];
  return (
    <Link
      href={`/brain/docs/view?path=${encodeURIComponent(doc.path)}`}
      className="group flex items-baseline justify-between gap-3 rounded-none border border-edge bg-raise px-4 py-3 transition-colors hover:border-[rgba(254,81,0,0.4)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink group-hover:text-orange">{doc.title}</span>
          {badge && (
            <span className="rounded-full border border-[rgba(254,81,0,0.35)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.12em] text-orange">
              {badge}
            </span>
          )}
        </div>
        {doc.description && <p className="mt-0.5 truncate text-[12px] text-ink-dim">{doc.description}</p>}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-ink-dimmer">→</span>
    </Link>
  );
}

export default async function BrainDocsPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const admin = ursoDbSafe();
  const [manifest, projects, departments] = admin
    ? await Promise.all([
        getDocManifest(admin).catch(() => []),
        getProjects(admin).catch(() => []),
        getDepartments(admin).catch(() => []),
      ])
    : ([[], [], []] as const);

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
    (d) =>
      !(d.project_id ? projIds.has(d.project_id) : d.department_id ? depIds.has(d.department_id) : true),
  );

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-9 py-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Vault</div>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">The vault</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-dim">
          {manifest.length === 0
            ? "Nothing synced yet — run node scripts/brain-sync.mjs."
            : `${manifest.length} docs. This is everything the brain can read.`}
        </p>
      </div>

      {core.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">Company core — always in context</h2>
          <div className="grid gap-2">{core.map((d) => <DocRow key={d.path} doc={d} />)}</div>
        </section>
      )}

      {rules.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">Standing rules</h2>
          <div className="grid gap-2">{rules.map((d) => <DocRow key={d.path} doc={d} />)}</div>
        </section>
      )}

      {departments.map((dep) => {
        const docs = rest.filter((d) => d.department_id === dep.id && !d.project_id);
        if (!docs.length) return null;
        return (
          <section key={dep.id}>
            <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">{dep.name}</h2>
            <div className="grid gap-2">{docs.map((d) => <DocRow key={d.path} doc={d} />)}</div>
          </section>
        );
      })}

      {projects.map((p) => {
        const docs = rest.filter((d) => d.project_id === p.id);
        if (!docs.length) return null;
        return (
          <section key={p.id}>
            <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">Project · {p.name}</h2>
            <div className="grid gap-2">{docs.map((d) => <DocRow key={d.path} doc={d} />)}</div>
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">Company-wide</h2>
          <div className="grid gap-2">{unassigned.map((d) => <DocRow key={d.path} doc={d} />)}</div>
        </section>
      )}

      {unfiled.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">Archived / unfiled projects</h2>
          <div className="grid gap-2">{unfiled.map((d) => <DocRow key={d.path} doc={d} />)}</div>
        </section>
      )}
    </div>
  );
}
