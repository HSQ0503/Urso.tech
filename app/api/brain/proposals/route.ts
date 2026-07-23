import { getBrainUser } from "@/lib/brain/access";
import {
  auditBrainEvent,
  canEditBrainTruth,
  getAuthorizedBrainDoc,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import {
  getDocByPath,
  insertBrainDoc,
  softDeleteBrainDoc,
  updateBrainDoc,
  type BrainDocWrite,
} from "@/lib/brain/db";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { checkMeta, hashDoc, linksFor, sanitizePathPart } from "@/lib/brain/write";

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

async function stewardAccess() {
  const user = await getBrainUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const admin = ursoDbSafe();
  if (!admin) return { error: Response.json({ error: URSO_DB_MISSING }, { status: 503 }) };
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal || !canEditBrainTruth(principal)) {
    return { error: Response.json({ error: "knowledge steward access required" }, { status: 403 }) };
  }
  return { admin, principal };
}

export async function GET() {
  const auth = await stewardAccess();
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

async function applyProposal(
  proposal: ProposalRow,
  auth: Exclude<Awaited<ReturnType<typeof stewardAccess>>, { error: Response }>,
): Promise<void> {
  const { admin, principal } = auth;
  const change = proposal.proposed_change;
  const organizationId = principal.organizationId;
  const existing =
    proposal.operation === "create"
      ? null
      : await getAuthorizedBrainDoc(admin, principal, proposal.target_path);

  if (proposal.operation !== "create" && !existing) {
    throw new Error("The target document is no longer available to this steward.");
  }

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
    const row: BrainDocWrite = {
      path: proposal.target_path,
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
    row.content_hash = hashDoc(row);
    await insertBrainDoc(admin, row, principal.email, organizationId);
    return;
  }

  if (!existing) throw new Error("Target document missing.");
  if (proposal.operation === "delete") {
    const deleted = await softDeleteBrainDoc(admin, existing.path, principal.email, organizationId);
    if (!deleted) throw new Error("The target document was already deleted.");
    return;
  }

  if (proposal.operation === "link") {
    const linkedPath = change.linkedPath;
    const linked = linkedPath ? await getAuthorizedBrainDoc(admin, principal, linkedPath) : null;
    if (!linked) throw new Error("The linked document is no longer available.");
    if (existing.links.includes(linked.path)) return;
    const linkLine = `- [[${linked.title}]]`;
    const content = /^##\s+Related\s*$/m.test(existing.content)
      ? existing.content.replace(/^(##\s+Related\s*)$/m, `$1\n${linkLine}`)
      : `${existing.content.trimEnd()}\n\n## Related\n${linkLine}\n`;
    const links = await linksFor(admin, content, organizationId);
    const content_hash = hashDoc({
      title: existing.title,
      description: existing.description,
      department_id: existing.department_id,
      project_id: existing.project_id,
      doc_type: existing.doc_type,
      audience: existing.audience,
      tags: [],
      visibility: existing.visibility,
      content,
    });
    const updated = await updateBrainDoc(
      admin,
      existing.path,
      { content, links, content_hash },
      principal.email,
      organizationId,
    );
    if (!updated) throw new Error("The link update did not apply.");
    return;
  }

  const content = change.content?.trim();
  if (!content) throw new Error("The update proposal has no content.");
  const checked = await checkMeta(
    admin,
    { department: change.department, project: change.project, type: change.documentType },
    organizationId,
  );
  if (checked.error) throw new Error(checked.error);
  const next: Omit<BrainDocWrite, "path"> = {
    title: change.title ? sanitizePathPart(change.title) : existing.title,
    description: change.description !== undefined ? change.description.trim().slice(0, 200) : existing.description,
    department_id: checked.department_id !== undefined ? checked.department_id : existing.department_id,
    project_id: checked.project_id !== undefined ? checked.project_id : existing.project_id,
    doc_type: checked.doc_type ?? existing.doc_type,
    audience: change.audience ?? existing.audience,
    tags: [],
    links: await linksFor(admin, content, organizationId),
    content,
    content_hash: "",
    visibility: change.visibility ?? existing.visibility,
  };
  next.content_hash = hashDoc(next);
  const updated = await updateBrainDoc(admin, existing.path, next, principal.email, organizationId);
  if (!updated) throw new Error("The proposed update did not apply.");
}

export async function PATCH(req: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    decision?: "approve" | "reject";
    note?: string;
  };
  if (!body.id || !["approve", "reject"].includes(body.decision ?? "")) {
    return Response.json({ error: "id and decision are required" }, { status: 400 });
  }

  if (body.decision === "reject") {
    const { data, error } = await auth.admin
      .from("brain_knowledge_proposals")
      .update({
        status: "rejected",
        reviewed_by: auth.principal.userId,
        reviewed_at: new Date().toISOString(),
        review_note: body.note?.trim().slice(0, 800) ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.principal.organizationId)
      .eq("id", body.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Proposal is no longer pending." }, { status: 409 });
    await auditBrainEvent(auth.admin, auth.principal, "knowledge.rejected", "knowledge_proposal", body.id);
    return Response.json({ ok: true, status: "rejected" });
  }

  const { data: claimed, error: claimError } = await auth.admin
    .from("brain_knowledge_proposals")
    .update({
      status: "applying",
      reviewed_by: auth.principal.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", auth.principal.organizationId)
    .eq("id", body.id)
    .eq("status", "pending")
    .select("id, operation, target_path, proposed_change, evidence, rationale, status, proposed_by, created_at")
    .maybeSingle();
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return Response.json({ error: "Proposal is no longer pending." }, { status: 409 });

  try {
    await applyProposal(claimed as ProposalRow, auth);
    const { error } = await auth.admin
      .from("brain_knowledge_proposals")
      .update({
        status: "approved",
        review_note: body.note?.trim().slice(0, 800) ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.principal.organizationId)
      .eq("id", body.id)
      .eq("status", "applying");
    if (error) throw new Error(error.message);
    await auditBrainEvent(auth.admin, auth.principal, "knowledge.approved", "knowledge_proposal", body.id, {
      operation: (claimed as ProposalRow).operation,
      targetPath: (claimed as ProposalRow).target_path,
    });
    return Response.json({ ok: true, status: "approved" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await auth.admin
      .from("brain_knowledge_proposals")
      .update({
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_note: `Last apply failed: ${message}`.slice(0, 800),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.principal.organizationId)
      .eq("id", body.id)
      .eq("status", "applying");
    return Response.json({ error: message }, { status: 409 });
  }
}
