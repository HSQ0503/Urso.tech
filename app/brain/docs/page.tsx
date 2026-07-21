// Vault browser — the synced docs grouped the way the company is organized.
// The sidebar tree is the folder view; this is the semantic view (core, rules,
// departments, projects), which the folder structure alone can't express.

import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getDocManifest, getProjects } from "@/lib/brain/db";
import type { BrainDocMeta } from "@/lib/brain/types";

function DocRow({ doc }: { doc: BrainDocMeta }) {
  return (
    <Link href={`/brain/docs/view?path=${encodeURIComponent(doc.path)}`} className="ob-row group !py-[7px]">
      <FileText size={14} className="shrink-0 text-[var(--ob-faint)]" />
      <span className="ob-row-label !text-[13.5px]">{doc.title}</span>
      {doc.description && (
        <span className="ml-2 min-w-0 flex-1 truncate text-[12.5px] text-[var(--ob-faint)]">{doc.description}</span>
      )}
    </Link>
  );
}

function Section({ title, docs }: { title: string; docs: BrainDocMeta[] }) {
  if (!docs.length) return null;
  return (
    <section className="mb-7">
      <h2 className="mb-1.5 px-1.5 text-[12.5px] font-semibold text-[var(--ob-muted)]">{title}</h2>
      <div>{docs.map((d) => <DocRow key={d.path} doc={d} />)}</div>
    </section>
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
    (d) => !(d.project_id ? projIds.has(d.project_id) : d.department_id ? depIds.has(d.department_id) : true),
  );

  return (
    <>
      <div className="ob-content">
        <div className="ob-wide !max-w-[820px]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="ob-title !text-[1.7em]">The vault</h1>
              <p className="mt-1 text-[14px] text-[var(--ob-muted)]">
                {manifest.length === 0
                  ? "Nothing synced yet — run node scripts/brain-sync.mjs."
                  : `${manifest.length} docs. This is everything the brain can read.`}
              </p>
            </div>
            <Link href="/brain/docs/new" className="ob-btn ob-btn-cta">
              <Plus size={14} />
              New doc
            </Link>
          </div>

          <Section title="Company core — always in context" docs={core} />
          <Section title="Standing rules" docs={rules} />
          {departments.map((dep) => (
            <Section
              key={dep.id}
              title={dep.name}
              docs={rest.filter((d) => d.department_id === dep.id && !d.project_id)}
            />
          ))}
          {projects.map((p) => (
            <Section key={p.id} title={p.name} docs={rest.filter((d) => d.project_id === p.id)} />
          ))}
          <Section title="Company-wide" docs={unassigned} />
          <Section title="Archived / unfiled projects" docs={unfiled} />
        </div>
      </div>
      <div className="ob-status">
        <span>{manifest.length} docs</span>
      </div>
    </>
  );
}
