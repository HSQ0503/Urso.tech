import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";

type ConflictRow = {
  id: string;
  subject_entity_id: string;
  predicate_id: string;
  claim_a_id: string;
  claim_b_id: string;
  conflict_type: "exclusive_value" | "explicit";
  created_at: string;
};

type ClaimRow = {
  id: string;
  object_type: "text" | "number" | "boolean" | "date" | "entity";
  object_value: unknown;
  object_entity_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

type EvidenceRow = {
  claim_id: string;
  doc_id: string;
  doc_version: number;
  excerpt: string;
  evidence_role: "authoritative" | "supporting";
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

const unique = (values: string[]): string[] => [...new Set(values)];

const displayValue = (claim: ClaimRow | undefined, entityNames: Map<string, string>): string => {
  if (!claim) return "";
  if (claim.object_type === "entity" && claim.object_entity_id) {
    return entityNames.get(claim.object_entity_id) ?? claim.object_entity_id;
  }
  if (typeof claim.object_value === "string") return claim.object_value;
  return claim.object_value === null || claim.object_value === undefined
    ? ""
    : JSON.stringify(claim.object_value);
};

export async function GET() {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("brain_claim_conflicts")
    .select(
      "id, subject_entity_id, predicate_id, claim_a_id, claim_b_id, conflict_type, created_at",
    )
    .eq("organization_id", auth.principal.organizationId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as ConflictRow[];
  if (!rows.length) return Response.json({ conflicts: [] });

  const claimIds = unique(rows.flatMap((row) => [row.claim_a_id, row.claim_b_id]));
  const subjectIds = unique(rows.map((row) => row.subject_entity_id));
  const predicateIds = unique(rows.map((row) => row.predicate_id));
  const [{ data: claims, error: claimError }, { data: evidence }, { data: subjects }, { data: predicates }] =
    await Promise.all([
      auth.admin
        .from("brain_claims")
        .select("id, object_type, object_value, object_entity_id, valid_from, valid_until")
        .eq("organization_id", auth.principal.organizationId)
        .in("id", claimIds),
      auth.admin
        .from("brain_claim_evidence")
        .select("claim_id, doc_id, doc_version, excerpt, evidence_role")
        .eq("organization_id", auth.principal.organizationId)
        .in("claim_id", claimIds)
        .order("created_at"),
      auth.admin
        .from("brain_entities")
        .select("id, name")
        .eq("organization_id", auth.principal.organizationId)
        .in("id", subjectIds),
      auth.admin
        .from("brain_predicates")
        .select("id, name")
        .eq("organization_id", auth.principal.organizationId)
        .in("id", predicateIds),
    ]);
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

  const claimRows = (claims ?? []) as ClaimRow[];
  const objectEntityIds = unique(
    claimRows
      .map((claim) => claim.object_entity_id)
      .filter((id): id is string => Boolean(id)),
  );
  const evidenceRows = (evidence ?? []) as EvidenceRow[];
  const docIds = unique(evidenceRows.map((item) => item.doc_id));
  const [{ data: objectEntities }, { data: docs }] = await Promise.all([
    objectEntityIds.length
      ? auth.admin
          .from("brain_entities")
          .select("id, name")
          .eq("organization_id", auth.principal.organizationId)
          .in("id", objectEntityIds)
      : Promise.resolve({ data: [] }),
    docIds.length
      ? auth.admin
          .from("brain_docs")
          .select("id, path, title")
          .eq("organization_id", auth.principal.organizationId)
          .in("id", docIds)
      : Promise.resolve({ data: [] }),
  ]);

  const claimById = new Map(claimRows.map((claim) => [claim.id, claim]));
  const subjectById = new Map((subjects ?? []).map((row) => [String(row.id), String(row.name)]));
  const predicateById = new Map((predicates ?? []).map((row) => [String(row.id), String(row.name)]));
  const objectEntityById = new Map(
    (objectEntities ?? []).map((row) => [String(row.id), String(row.name)]),
  );
  const docById = new Map(
    (docs ?? []).map((row) => [
      String(row.id),
      { path: String(row.path), title: String(row.title) },
    ]),
  );
  const sourceFor = (claimId: string) => {
    const item =
      evidenceRows.find(
        (candidate) =>
          candidate.claim_id === claimId && candidate.evidence_role === "authoritative",
      ) ?? evidenceRows.find((candidate) => candidate.claim_id === claimId);
    const doc = item ? docById.get(item.doc_id) : null;
    return item && doc
      ? {
          ...doc,
          version: item.doc_version,
          excerpt: item.excerpt,
        }
      : null;
  };
  const side = (claimId: string) => {
    const claim = claimById.get(claimId);
    return {
      id: claimId,
      objectValue: displayValue(claim, objectEntityById),
      validFrom: claim?.valid_from ?? null,
      validUntil: claim?.valid_until ?? null,
      source: sourceFor(claimId),
    };
  };

  return Response.json({
    conflicts: rows.map((row) => ({
      id: row.id,
      subjectLabel: subjectById.get(row.subject_entity_id) ?? row.subject_entity_id,
      predicateLabel: predicateById.get(row.predicate_id) ?? row.predicate_id,
      message:
        row.conflict_type === "exclusive_value"
          ? "Two accepted values overlap for an exclusive predicate."
          : "These claims were explicitly marked as contradictory.",
      left: side(row.claim_a_id),
      right: side(row.claim_b_id),
      createdAt: row.created_at,
    })),
  });
}

export async function PATCH(request: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    resolution?:
      | "supersede_left"
      | "supersede_right"
      | "keep_unresolved"
      | "dismiss_duplicate";
    note?: string;
  } | null;
  const allowed = new Set([
    "supersede_left",
    "supersede_right",
    "keep_unresolved",
    "dismiss_duplicate",
  ]);
  if (!body?.id || !body.resolution || !allowed.has(body.resolution)) {
    return Response.json({ error: "id and a valid resolution are required" }, { status: 400 });
  }

  const { data, error } = await auth.admin.rpc("brain_resolve_claim_conflict", {
    p_organization_id: auth.principal.organizationId,
    p_conflict_id: body.id,
    p_reviewer_user_id: auth.principal.userId,
    p_resolution: body.resolution,
    p_review_note: body.note?.trim().slice(0, 1_000) ?? "",
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true, result: data });
}
