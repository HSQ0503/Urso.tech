import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";

type ProposalRow = {
  id: string;
  operation: "assert" | "supersede" | "retire" | "mark_unresolved";
  target_claim_id: string | null;
  proposed_claim: Record<string, unknown>;
  evidence: unknown;
  rationale: string;
  created_at: string;
};

type ClaimRow = {
  id: string;
  subject_entity_id: string;
  predicate_id: string;
  object_type: "text" | "number" | "boolean" | "date" | "entity";
  object_value: unknown;
  object_entity_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  project_id: string | null;
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

const idsFrom = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

const displayValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
};

export async function GET() {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("brain_claim_proposals")
    .select("id, operation, target_claim_id, proposed_claim, evidence, rationale, created_at")
    .eq("organization_id", auth.principal.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ProposalRow[];
  const targetIds = idsFrom(rows.map((row) => row.target_claim_id));
  const { data: targets, error: targetError } = targetIds.length
    ? await auth.admin
        .from("brain_claims")
        .select(
          "id, subject_entity_id, predicate_id, object_type, object_value, object_entity_id, valid_from, valid_until, project_id",
        )
        .eq("organization_id", auth.principal.organizationId)
        .in("id", targetIds)
    : { data: [], error: null };
  if (targetError) return Response.json({ error: targetError.message }, { status: 500 });
  const targetById = new Map(
    ((targets ?? []) as ClaimRow[]).map((claim) => [claim.id, claim]),
  );

  const subjectIds = idsFrom(
    rows.map((row) => {
      const target = row.target_claim_id ? targetById.get(row.target_claim_id) : null;
      return target?.subject_entity_id ??
        (typeof row.proposed_claim.subject_entity_id === "string"
          ? row.proposed_claim.subject_entity_id
          : null);
    }),
  );
  const predicateIds = idsFrom(
    rows.map((row) => {
      const target = row.target_claim_id ? targetById.get(row.target_claim_id) : null;
      return target?.predicate_id ??
        (typeof row.proposed_claim.predicate_id === "string"
          ? row.proposed_claim.predicate_id
          : null);
    }),
  );
  const evidenceItems = rows.flatMap((row) =>
    Array.isArray(row.evidence)
      ? row.evidence.filter(
          (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
        )
      : [],
  );
  const docIds = idsFrom(
    evidenceItems.map((item) => typeof item.doc_id === "string" ? item.doc_id : null),
  );

  const [{ data: entities }, { data: predicates }, { data: docs }] = await Promise.all([
    subjectIds.length
      ? auth.admin
          .from("brain_entities")
          .select("id, name")
          .eq("organization_id", auth.principal.organizationId)
          .in("id", subjectIds)
      : Promise.resolve({ data: [] }),
    predicateIds.length
      ? auth.admin
          .from("brain_predicates")
          .select("id, name")
          .eq("organization_id", auth.principal.organizationId)
          .in("id", predicateIds)
      : Promise.resolve({ data: [] }),
    docIds.length
      ? auth.admin
          .from("brain_docs")
          .select("id, path, title")
          .eq("organization_id", auth.principal.organizationId)
          .in("id", docIds)
      : Promise.resolve({ data: [] }),
  ]);
  const entityById = new Map((entities ?? []).map((row) => [String(row.id), String(row.name)]));
  const predicateById = new Map((predicates ?? []).map((row) => [String(row.id), String(row.name)]));
  const docById = new Map(
    (docs ?? []).map((row) => [
      String(row.id),
      { path: String(row.path), title: String(row.title) },
    ]),
  );

  const proposals = rows.map((row) => {
    const target = row.target_claim_id ? targetById.get(row.target_claim_id) : null;
    const proposed = row.proposed_claim;
    const subjectId =
      target?.subject_entity_id ??
      (typeof proposed.subject_entity_id === "string" ? proposed.subject_entity_id : "");
    const predicateId =
      target?.predicate_id ??
      (typeof proposed.predicate_id === "string" ? proposed.predicate_id : "");
    const firstEvidence = Array.isArray(row.evidence)
      ? row.evidence.find((item) => item && typeof item === "object") as
          | Record<string, unknown>
          | undefined
      : undefined;
    const sourceDoc =
      typeof firstEvidence?.doc_id === "string" ? docById.get(firstEvidence.doc_id) : null;
    const objectType =
      typeof proposed.object_type === "string"
        ? proposed.object_type
        : target?.object_type ?? "text";
    const objectValue =
      proposed.object_value === undefined ? target?.object_value : proposed.object_value;

    return {
      id: row.id,
      operation: row.operation,
      subjectLabel: entityById.get(subjectId) ?? subjectId,
      predicateLabel: predicateById.get(predicateId) ?? predicateId,
      objectValue: displayValue(objectValue),
      objectType,
      validFrom:
        typeof proposed.valid_from === "string"
          ? proposed.valid_from
          : target?.valid_from ?? null,
      validUntil:
        typeof proposed.valid_until === "string"
          ? proposed.valid_until
          : target?.valid_until ?? null,
      projectId:
        typeof proposed.project_id === "string"
          ? proposed.project_id
          : target?.project_id ?? null,
      rationale: row.rationale,
      source:
        firstEvidence && sourceDoc
          ? {
              ...sourceDoc,
              version: Number(firstEvidence.doc_version),
              excerpt: String(firstEvidence.excerpt ?? ""),
            }
          : null,
      supersedes: row.operation === "supersede" && target
        ? [{ id: target.id, label: displayValue(target.object_value) }]
        : [],
      createdAt: row.created_at,
    };
  });

  return Response.json({ proposals });
}

export async function PATCH(request: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    decision?: "approve" | "reject";
    note?: string;
  } | null;
  if (!body?.id || !["approve", "reject"].includes(body.decision ?? "")) {
    return Response.json({ error: "id and a valid decision are required" }, { status: 400 });
  }

  const rpc = body.decision === "approve"
    ? "brain_apply_claim_proposal"
    : "brain_reject_claim_proposal";
  const { data, error } = await auth.admin.rpc(rpc, {
    p_organization_id: auth.principal.organizationId,
    p_proposal_id: body.id,
    p_reviewer_user_id: auth.principal.userId,
    p_review_note: body.note?.trim().slice(0, 1_000) ?? "",
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true, result: data });
}
