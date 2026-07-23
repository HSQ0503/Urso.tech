// A single vault doc in Obsidian's reading view: inline title, the note bounded
// to the reading measure, a backlinks pane underneath, and a status bar with the
// counts. The path travels as a query param (vault paths contain spaces and
// slashes).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedBrainDoc,
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getBacklinks, listLinkTargets } from "@/lib/brain/db";
import { VaultMarkdown, countWords } from "@/components/brain/markdown";

export default async function BrainDocViewPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const { path } = await searchParams;
  const admin = ursoDbSafe();
  const principal = admin ? await resolveBrainPrincipal(admin, user).catch(() => null) : null;
  const doc =
    path && admin && principal
      ? await getAuthorizedBrainDoc(admin, principal, path).catch(() => null)
      : null;

  if (!doc || !admin || !principal) {
    return (
      <div className="ob-content">
        <div className="ob-note">
          <p className="text-[15px] text-[var(--ob-muted)]">That doc isn&rsquo;t in the vault.</p>
          <Link href="/brain/docs" className="mt-3 inline-block text-[14px] text-[var(--ob-accent)] hover:underline">
            ← Back to the vault
          </Link>
        </div>
      </div>
    );
  }

  // Every live doc is a wikilink target, so [[links]] inside the body resolve
  // the same way they do in Obsidian — including to docs this one doesn't
  // already list in its `links` column.
  const [manifest, allTargets, allBacklinks] = await Promise.all([
    getAuthorizedDocManifest(admin, principal, doc.project_id).catch(() => []),
    listLinkTargets(admin, principal.organizationId).catch(() => []),
    getBacklinks(admin, doc.path, principal.organizationId).catch(() => []),
  ]);
  const permittedPaths = new Set(manifest.map((item) => item.path));
  const targets = allTargets.filter((item) => permittedPaths.has(item.path));
  const backlinks = allBacklinks.filter((item) => permittedPaths.has(item.path));

  const words = countWords(doc.content);

  return (
    <>
      <div className="ob-content">
        <div className="ob-note">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h1 className="ob-title">{doc.title}</h1>
            {canEditBrainTruth(principal) && (
              <Link
                href={`/brain/docs/edit?path=${encodeURIComponent(doc.path)}`}
                className="ob-icon-btn mt-2 shrink-0"
                title="Edit"
              >
                <Pencil size={15} />
              </Link>
            )}
          </div>
          {doc.description && (
            <p className="mb-5 text-[15px] leading-[1.55] text-[var(--ob-muted)]">{doc.description}</p>
          )}

          <VaultMarkdown content={doc.content} targets={targets} />

          {backlinks.length > 0 && (
            <div className="ob-pane">
              <div className="ob-pane-head">
                {backlinks.length} linked mention{backlinks.length === 1 ? "" : "s"}
              </div>
              {backlinks.map((b) => (
                <Link key={b.path} href={`/brain/docs/view?path=${encodeURIComponent(b.path)}`} className="ob-pane-link">
                  {b.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ob-status">
        {doc.origin === "brain" && <span title="Written by the brain — flows back to Obsidian on the next export">brain-written</span>}
        <span>
          {backlinks.length} backlink{backlinks.length === 1 ? "" : "s"}
        </span>
        <span>{words.toLocaleString("en-US")} words</span>
        <span>{doc.content.length.toLocaleString("en-US")} characters</span>
      </div>
    </>
  );
}
