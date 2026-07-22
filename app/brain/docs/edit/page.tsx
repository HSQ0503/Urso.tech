// Edit a vault doc by hand — the human twin of the AI's update_doc tool.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDepartments, getDocByPath, getProjects } from "@/lib/brain/db";
import { DocEditor } from "@/components/brain/doc-editor";

export default async function BrainDocEditPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/brain");

  const { path } = await searchParams;
  const [doc, departments, projects] = await Promise.all([
    path ? getDocByPath(admin, path).catch(() => null) : Promise.resolve(null),
    getDepartments(admin).catch(() => []),
    getProjects(admin).catch(() => []),
  ]);
  if (!doc) redirect("/brain/docs");

  return (
    <div className="ob-content">
      <div className="ob-wide !max-w-[760px]">
        <Link
          href={`/brain/docs/view?path=${encodeURIComponent(doc.path)}`}
          className="text-[13px] text-[var(--ob-accent)] hover:underline"
        >
          ← Back to doc
        </Link>
        <h1 className="ob-title mt-2 !text-[1.7em]">Edit doc</h1>
        {doc.origin === "vault" && (
          <p className="mt-1.5 text-[14px] leading-[1.55] text-[var(--ob-muted)]">
            This doc came from the Obsidian vault — saving makes the brain&rsquo;s copy the newer one; the disk file
            catches up on the next <code>--export</code>.
          </p>
        )}
        <div className="mt-6">
        <DocEditor
          mode="edit"
          departments={departments}
          projects={projects}
          initial={{
            path: doc.path,
            title: doc.title,
            description: doc.description,
            department: doc.department_id ?? "",
            project: doc.project_id ?? "",
            type: doc.doc_type,
            audience: doc.audience.join(", "),
            content: doc.content,
          }}
        />
      </div>
    </div>
      </div>
  );
}
