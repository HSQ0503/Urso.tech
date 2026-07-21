// Create a vault doc by hand — the human twin of the AI's create_doc tool.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getProjects } from "@/lib/brain/db";
import { DocEditor } from "@/components/brain/doc-editor";

export default async function BrainDocNewPage() {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");

  const [departments, projects] = await Promise.all([
    getDepartments(admin).catch(() => []),
    getProjects(admin).catch(() => []),
  ]);
  if (departments.length === 0) redirect("/brain");

  return (
    <div className="mx-auto w-full max-w-[760px] py-6">
      <Link href="/brain/docs" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dimmer transition-colors hover:text-orange">← Vault</Link>
      <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-ink">New doc</h1>
      <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink-dim">
        Lands under <code className="text-orange">_Brain/</code> and flows into your Obsidian vault on the next export.
      </p>
      <div className="mt-6">
        <DocEditor mode="create" departments={departments} projects={projects} />
      </div>
    </div>
  );
}
