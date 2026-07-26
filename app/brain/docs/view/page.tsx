// A single knowledge document with a focused reading measure, backlinks, and
// source metadata. The path travels as a query param because source paths may
// contain spaces and slashes.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedBrainDoc,
  getAuthorizedKnowledgeCatalog,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getBacklinks, listLinkTargets } from "@/lib/brain/db";
import { VaultMarkdown, countWords } from "@/components/brain/markdown";
import {
  TemporalClaimsPanel,
  type AuthorizedTemporalClaim,
} from "@/components/brain/temporal-claims-panel";
import { brainDocEditHref, brainDocHref } from "@/lib/brain/links";
import { getAuthorizedClaimsForDoc } from "@/lib/brain/temporal";

export default async function BrainDocViewPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; project?: string; asOf?: string }>;
}) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const { path, project, asOf } = await searchParams;
  const projectId = project?.trim() || null;
  const requestedAsOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "") ? asOf! : null;
  const effectiveAt =
    requestedAsOf ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const admin = ursoDbSafe();
  const principal = admin ? await resolveBrainPrincipal(admin, user).catch(() => null) : null;
  const doc =
    path && admin && principal
      ? await getAuthorizedBrainDoc(admin, principal, path, projectId).catch(() => null)
      : null;

  if (!doc || !admin || !principal) {
    return (
      <div className="ob-content">
        <div className="ob-note">
          <p className="text-[15px] text-[var(--ob-muted)]">That document isn&rsquo;t available in your knowledge scope.</p>
          <Link href="/brain/docs" className="mt-3 inline-block text-[14px] text-[var(--ob-accent)] hover:underline">
            ← Back to knowledge
          </Link>
        </div>
      </div>
    );
  }

  // Every live document is a wikilink target, including documents this source
  // does not already list in its resolved `links` column.
  const [catalog, allTargets, allBacklinks, temporalResults] = await Promise.all([
    getAuthorizedKnowledgeCatalog(admin, principal).catch(() => ({ docs: [], projects: [] })),
    listLinkTargets(admin, principal.organizationId).catch(() => []),
    getBacklinks(admin, doc.path, principal.organizationId).catch(() => []),
    doc.id
      ? getAuthorizedClaimsForDoc({
          admin,
          principal,
          docId: doc.id,
          projectId,
          effectiveAt,
          includeHistory: Boolean(requestedAsOf),
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const permittedByPath = new Map(catalog.docs.map((item) => [item.path, item]));
  const targets = allTargets
    .filter((item) => permittedByPath.has(item.path))
    .map((item) => ({
      ...item,
      projectId: permittedByPath.get(item.path)?.access_project_id,
    }));
  const backlinks = allBacklinks
    .filter((item) => permittedByPath.has(item.path))
    .map((item) => ({
      ...item,
      projectId: permittedByPath.get(item.path)?.access_project_id,
    }));

  const words = countWords(doc.content);
  const claims: AuthorizedTemporalClaim[] = temporalResults.flatMap((result) => {
    const source =
      result.evidence.find((item) => item.docId === doc.id) ?? result.evidence[0];
    if (!source) return [];
    const openConflict = result.conflicts.find((item) => item.status === "open");
    return [{
      id: result.claim.id,
      subjectLabel: result.claim.subject.label,
      predicateLabel: result.claim.predicate.label,
      objectValue: result.claim.object.value,
      objectLabel: result.claim.object.label,
      objectType: result.claim.object.type,
      lifecycle: result.claim.lifecycle,
      resolution: result.claim.resolution,
      temporalStatus: result.claim.temporalStatus,
      validFrom: result.claim.validFrom,
      validUntil: result.claim.validUntil,
      projectId: result.projectId,
      source: {
        path: source.path,
        title: source.title,
        version: source.version,
        excerpt: source.excerpt,
      },
      supersedes: result.claim.supersedes.map((id) => ({ id })),
      supersededBy: result.claim.supersededBy.map((id) => ({ id })),
      conflict: openConflict
        ? {
            id: openConflict.id,
            status: openConflict.status,
            message: openConflict.message,
            otherClaimIds: openConflict.claimIds.filter((id) => id !== result.claim.id),
          }
        : null,
    }];
  });

  return (
    <>
      <div className="ob-content">
        <div className="ob-note">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h1 className="ob-title">{doc.title}</h1>
            {canEditBrainTruth(principal) && (
              <Link
                href={brainDocEditHref(doc.path, projectId)}
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

          <TemporalClaimsPanel
            claims={claims}
            path={doc.path}
            projectId={projectId}
            asOf={requestedAsOf}
            defaultDate={effectiveAt}
          />

          <VaultMarkdown content={doc.content} targets={targets} />

          {backlinks.length > 0 && (
            <div className="ob-pane">
              <div className="ob-pane-head">
                {backlinks.length} linked mention{backlinks.length === 1 ? "" : "s"}
              </div>
              {backlinks.map((b) => (
                <Link key={b.path} href={brainDocHref(b.path, b.projectId)} className="ob-pane-link">
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
