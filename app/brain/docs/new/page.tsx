// Create a vault doc by hand — the human twin of the AI's create_doc tool.

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
    <div className="ob-content">
      <div className="ob-wide !max-w-[760px]">
        <h1 className="ob-title !text-[1.7em]">New doc</h1>
        <p className="mt-1.5 text-[14px] leading-[1.55] text-[var(--ob-muted)]">
          Lands under <code>_Brain/</code> and flows into your Obsidian vault on the next export.
        </p>
        <div className="mt-6">
          <DocEditor mode="create" departments={departments} projects={projects} />
        </div>
      </div>
    </div>
  );
}
