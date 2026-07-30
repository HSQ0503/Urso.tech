import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedBrainDoc,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import {
  getDocByPath,
  getOrgKey,
  type BrainDocWrite,
} from "@/lib/brain/db";
import { indexBrainDocuments } from "@/lib/brain/retrieval";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainDoc } from "@/lib/brain/types";
import { checkMeta, hashDoc, linksFor, sanitizePathPart } from "@/lib/brain/write";

type ExactReplacement = {
  find: string;
  replace: string;
};

type RelatedEdit = {
  targetPath: string;
  baseVersion: number;
  replacements: ExactReplacement[];
};

type ProposalChange = {
  title?: string;
  content?: string;
  description?: string;
  department?: string;
  project?: string;
  documentType?: "core" | "doc" | "rule";
  visibility?: "organization" | "department" | "project" | "restricted";
  audience?: string[];
  linkedPath?: string;
  relatedEdits?: RelatedEdit[];
  targetBaseVersion?: number;
};

type ProposalRow = {
  id: string;
  operation: "create" | "update" | "link" | "delete";
  target_path: string;
  proposed_change: ProposalChange;
  evidence: string[];
  rationale: string;
  status: string;
  proposed_by: string;
  created_at: string;
};

type PreparedRelatedEdit = {
  doc: BrainDoc;
  baseVersion: number;
  content: string;
};

type ApplyResult = {
  changedPaths: string[];
  indexPaths: string[];
};

type ProposalMutationDocument = Omit<BrainDocWrite, "path"> & {
  visibility: NonNullable<BrainDocWrite["visibility"]>;
};

type ProposalMutation = {
  operation: "create" | "update" | "delete";
  path: string;
  expectedVersion?: number;
  document?: ProposalMutationDocument;
};

const occurrences = (content: string, value: string): number =>
  value ? content.split(value).length - 1 : 0;

const orgParam = (req: Request | undefined): string | null => {
  if (!req) return null;
  const value = new URL(req.url).searchParams.get("org");
  return value && /^[a-z0-9-]{2,40}$/.test(value) ? value : null;
};

async function stewardAccess(organizationId: string | null = null) {
  const user = await getBrainUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const admin = ursoDbSafe();
  if (!admin) return { error: Response.json({ error: URSO_DB_MISSING }, { status: 503 }) };
  // ?org= lets a steward review another organization's queue (Woof Gang's
  // client corpus) — same fail-closed resolution: no membership in that org,
  // no access. This is the ONLY brain route with org routing in fusion v1.
  const principal = await resolveBrainPrincipal(admin, user, organizationId ?? undefined);
  if (!principal || !canEditBrainTruth(principal)) {
    return { error: Response.json({ error: "knowledge steward access required" }, { status: 403 }) };
  }
  return { admin, principal };
}

async function getStewardDocument(
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
  path: string,
): Promise<BrainDoc | null> {
  const doc = await getDocByPath(auth.admin, path, auth.principal.organizationId);
  if (!doc) return null;
  const projectScope = doc.visibility === "project" ? doc.project_id : null;
  if (doc.visibility === "project" && !projectScope) return null;
  return getAuthorizedBrainDoc(auth.admin, auth.principal, path, projectScope);
}

export async function GET(req: Request) {
  const auth = await stewardAccess(orgParam(req));
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.admin
    .from("brain_knowledge_proposals")
    .select("id, operation, target_path, proposed_change, evidence, rationale, status, proposed_by, created_at")
    .eq("organization_id", auth.principal.organizationId)
    .in("status", ["pending", "applying"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ proposals: data ?? [] });
}

async function prepareRelatedEdits(
  proposal: ProposalRow,
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
): Promise<PreparedRelatedEdit[]> {
  const edits = proposal.proposed_change.relatedEdits ?? [];
  const seen = new Set<string>();
  const prepared: PreparedRelatedEdit[] = [];

  for (const edit of edits) {
    if (edit.targetPath === proposal.target_path) {
      throw new Error("A related edit cannot target the proposal's primary document.");
    }
    if (seen.has(edit.targetPath)) throw new Error(`Duplicate related edit target: ${edit.targetPath}`);
    seen.add(edit.targetPath);

    const doc = await getStewardDocument(auth, edit.targetPath);
    if (!doc) throw new Error(`Related edit target is no longer available: ${edit.targetPath}`);
    if (doc.current_version !== edit.baseVersion) {
      throw new Error(`${edit.targetPath} changed after this proposal was created. Re-inspect and propose again.`);
    }

    let content = doc.content;
    for (const replacement of edit.replacements) {
      if (!replacement.find || occurrences(content, replacement.find) !== 1) {
        throw new Error(`The exact text to replace in ${edit.targetPath} is no longer unique.`);
      }
      content = content.replace(replacement.find, replacement.replace);
    }
    if (content === doc.content) throw new Error(`The related edit for ${edit.targetPath} makes no change.`);
    prepared.push({ doc, baseVersion: edit.baseVersion, content });
  }

  return prepared;
}

async function prepareRelatedMutations(
  prepared: PreparedRelatedEdit[],
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
): Promise<ProposalMutation[]> {
  return Promise.all(prepared.map(async (item) => {
    const { doc, content, baseVersion } = item;
    const links = await linksFor(auth.admin, content, auth.principal.organizationId);
    const content_hash = hashDoc({
      title: doc.title,
      description: doc.description,
      department_id: doc.department_id,
      project_id: doc.project_id,
      doc_type: doc.doc_type,
      audience: doc.audience,
      tags: doc.tags,
      visibility: doc.visibility,
      content,
    });
    return {
      operation: "update" as const,
      path: doc.path,
      expectedVersion: baseVersion,
      document: {
        title: doc.title,
        description: doc.description,
        department_id: doc.department_id,
        project_id: doc.project_id,
        doc_type: doc.doc_type,
        audience: doc.audience,
        tags: doc.tags,
        links,
        content,
        content_hash,
        visibility: doc.visibility ?? "organization",
      },
    };
  }));
}

async function prepareProposalMutations(
  proposal: ProposalRow,
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
): Promise<ProposalMutation[]> {
  const { admin, principal } = auth;
  const change = proposal.proposed_change;
  const organizationId = principal.organizationId;
  const preparedRelatedEdits = await prepareRelatedEdits(proposal, auth);
  const existing =
    proposal.operation === "create"
      ? null
      : await getStewardDocument(auth, proposal.target_path);

  if (proposal.operation !== "create" && !existing) {
    throw new Error("The target document is no longer available to this steward.");
  }
  if (
    existing &&
    change.targetBaseVersion !== undefined &&
    existing.current_version !== change.targetBaseVersion
  ) {
    throw new Error("The primary document changed after this proposal was created. Re-inspect and propose again.");
  }
  const relatedMutations = await prepareRelatedMutations(preparedRelatedEdits, auth);

  if (proposal.operation === "create") {
    if (await getDocByPath(admin, proposal.target_path, organizationId)) {
      throw new Error("A document now exists at the proposed path.");
    }
    const content = change.content?.trim();
    const title = sanitizePathPart(change.title ?? proposal.target_path.split("/").pop()?.replace(/\.md$/i, "") ?? "");
    if (!content || title.length < 2) throw new Error("The proposal is missing a valid title or content.");
    const checked = await checkMeta(
      admin,
      { department: change.department, project: change.project, type: change.documentType },
      organizationId,
    );
    if (checked.error) throw new Error(checked.error);
    const row: ProposalMutationDocument = {
      title,
      description: change.description?.trim().slice(0, 200) ?? "",
      department_id: checked.department_id ?? null,
      project_id: checked.project_id ?? null,
      doc_type: checked.doc_type ?? "doc",
      audience: checked.doc_type === "rule" ? (change.audience?.length ? change.audience : ["all"]) : [],
      tags: [],
      links: await linksFor(admin, content, organizationId),
      content,
      content_hash: "",
      visibility: change.visibility ?? "organization",
    };
    if (row.visibility === "project" && !row.project_id) {
      throw new Error("A project-only document must be assigned to an active project.");
    }
    row.content_hash = hashDoc(row);
    return [{ operation: "create", path: proposal.target_path, document: row }, ...relatedMutations];
  }

  if (!existing) throw new Error("Target document missing.");
  if (proposal.operation === "delete") {
    return [
      { operation: "delete", path: existing.path, expectedVersion: existing.current_version },
      ...relatedMutations,
    ];
  }

  if (proposal.operation === "link") {
    const linkedPath = change.linkedPath;
    const linked = linkedPath ? await getStewardDocument(auth, linkedPath) : null;
    if (!linked) throw new Error("The linked document is no longer available.");
    if (existing.links.includes(linked.path) && !preparedRelatedEdits.length) {
      return [];
    }
    if (existing.links.includes(linked.path)) return relatedMutations;

    const linkLine = `- [[${linked.title}]]`;
    const content = /^##\s+Related\s*$/m.test(existing.content)
      ? existing.content.replace(/^(##\s+Related\s*)$/m, `$1\n${linkLine}`)
      : `${existing.content.trimEnd()}\n\n## Related\n${linkLine}\n`;
    const document: ProposalMutationDocument = {
        title: existing.title,
        description: existing.description,
        department_id: existing.department_id,
        project_id: existing.project_id,
        doc_type: existing.doc_type,
        audience: existing.audience,
        tags: existing.tags,
        visibility: existing.visibility ?? "organization",
        content,
        links: await linksFor(admin, content, organizationId),
        content_hash: "",
    };
    document.content_hash = hashDoc(document);
    return [
      {
        operation: "update",
        path: existing.path,
        expectedVersion: existing.current_version,
        document,
      },
      ...relatedMutations,
    ];
  }

  const content = change.content?.trim();
  if (!content) throw new Error("The update proposal has no content.");
  const checked = await checkMeta(
    admin,
    { department: change.department, project: change.project, type: change.documentType },
    organizationId,
  );
  if (checked.error) throw new Error(checked.error);
  const next: ProposalMutationDocument = {
    title: change.title ? sanitizePathPart(change.title) : existing.title,
    description: change.description !== undefined ? change.description.trim().slice(0, 200) : existing.description,
    department_id: checked.department_id !== undefined ? checked.department_id : existing.department_id,
    project_id: checked.project_id !== undefined ? checked.project_id : existing.project_id,
    doc_type: checked.doc_type ?? existing.doc_type,
    audience: change.audience ?? existing.audience,
    tags: existing.tags,
    links: await linksFor(admin, content, organizationId),
    content,
    content_hash: "",
    visibility: change.visibility ?? existing.visibility ?? "organization",
  };
  if (next.visibility === "project" && !next.project_id) {
    throw new Error("A project-only document must be assigned to an active project.");
  }
  next.content_hash = hashDoc(next);
  return [
    {
      operation: "update",
      path: existing.path,
      expectedVersion: existing.current_version,
      document: next,
    },
    ...relatedMutations,
  ];
}

async function applyProposal(
  proposal: ProposalRow,
  note: string,
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
): Promise<ApplyResult> {
  const mutations = await prepareProposalMutations(proposal, auth);
  const { data, error } = await auth.admin.rpc("brain_apply_knowledge_proposal", {
    p_organization_id: auth.principal.organizationId,
    p_proposal_id: proposal.id,
    p_reviewer_user_id: auth.principal.userId,
    p_reviewer_email: auth.principal.email,
    p_review_note: note,
    p_changes: mutations,
  });
  if (error) throw new Error(error.message);
  const result = data as ApplyResult | null;
  return {
    changedPaths: result?.changedPaths ?? [],
    indexPaths: result?.indexPaths ?? [],
  };
}

export async function PATCH(req: Request) {
  const auth = await stewardAccess(orgParam(req));
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    decision?: "approve" | "reject";
    note?: string;
  };
  if (!body.id || !["approve", "reject"].includes(body.decision ?? "")) {
    return Response.json({ error: "id and decision are required" }, { status: 400 });
  }

  const note = body.note?.trim().slice(0, 800) ?? "";
  if (body.decision === "reject") {
    const { data, error } = await auth.admin.rpc("brain_reject_knowledge_proposal", {
      p_organization_id: auth.principal.organizationId,
      p_proposal_id: body.id,
      p_reviewer_user_id: auth.principal.userId,
      p_review_note: note,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Proposal is no longer pending." }, { status: 409 });
    return Response.json({ ok: true, status: "rejected" });
  }

  const { data: proposal, error: proposalError } = await auth.admin
    .from("brain_knowledge_proposals")
    .select("id, operation, target_path, proposed_change, evidence, rationale, status, proposed_by, created_at")
    .eq("organization_id", auth.principal.organizationId)
    .eq("id", body.id)
    .eq("status", "pending")
    .maybeSingle();
  if (proposalError) return Response.json({ error: proposalError.message }, { status: 500 });
  if (!proposal) return Response.json({ error: "Proposal is no longer pending." }, { status: 409 });

  try {
    const applied = await applyProposal(proposal as ProposalRow, note, auth);

    let indexing: "complete" | "deferred" = "complete";
    let indexedChunks = 0;
    if (applied.indexPaths.length) {
      try {
        const openAiKey = await getOrgKey(
          auth.admin,
          "openai",
          auth.principal.organizationId,
        ).catch(() => null);
        const indexed = await indexBrainDocuments({
          admin: auth.admin,
          organizationId: auth.principal.organizationId,
          openAiKey,
          paths: applied.indexPaths,
        });
        indexedChunks = indexed.chunks;
      } catch (indexError) {
        indexing = "deferred";
        console.error(
          "[brain] approved knowledge could not be indexed immediately:",
          indexError instanceof Error ? indexError.message : indexError,
        );
      }
    }

    return Response.json({
      ok: true,
      status: "approved",
      affectedPaths: applied.changedPaths,
      indexing,
      indexedChunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 409 });
  }
}
