import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { getDepartments, getGraph } from "@/lib/brain/db";
import type { BrainPrincipal } from "@/lib/brain/types";
import {
  getMfDemoPersona,
  MF_BRAIN_ORGANIZATION_ID,
  MF_BRAIN_PROJECT_ID,
} from "./brain-config";

export async function resolveMfDemoPrincipal(
  admin: SupabaseClient,
  roleId: string | null | undefined,
): Promise<BrainPrincipal | null> {
  const persona = getMfDemoPersona(roleId);
  return resolveBrainPrincipal(
    admin,
    { id: persona.userId, email: persona.email, name: persona.name },
    MF_BRAIN_ORGANIZATION_ID,
  );
}

type WorkspaceDocumentRow = {
  id: string;
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  visibility: "organization" | "department" | "project" | "restricted";
  tags: string[];
  links: string[];
  content: string;
  origin: "vault" | "brain";
  current_version: number;
  source_updated_at: string;
  review_due_at: string | null;
};

type ClaimRow = {
  id: string;
  subject_entity_id: string;
  predicate_id: string;
  object_type: "text" | "number" | "boolean" | "date" | "entity";
  object_value: unknown;
  object_entity_id: string | null;
  lifecycle: "active" | "superseded" | "retired";
  resolution: "accepted" | "unresolved" | "contested";
  valid_from: string | null;
  valid_until: string | null;
  project_id: string | null;
};

type EntityRow = { id: string; name: string; canonical_key: string; entity_type: string };
type PredicateRow = { id: string; name: string };
type ClaimEvidenceRow = { claim_id: string; doc_id: string };

const objectLabel = (
  claim: ClaimRow,
  entitiesById: Map<string, EntityRow>,
): string => {
  if (claim.object_type === "entity") {
    return entitiesById.get(claim.object_entity_id ?? "")?.name ?? "Related entity";
  }
  if (typeof claim.object_value === "string") return claim.object_value;
  if (typeof claim.object_value === "number" || typeof claim.object_value === "boolean") {
    return String(claim.object_value);
  }
  return JSON.stringify(claim.object_value);
};

export async function getMfBrainWorkspace(
  admin: SupabaseClient,
  principal: BrainPrincipal,
) {
  const manifest = await getAuthorizedDocManifest(admin, principal, MF_BRAIN_PROJECT_ID);
  const authorizedIds = manifest.map((doc) => doc.id).filter((id): id is string => Boolean(id));
  const authorizedPaths = new Set(manifest.map((doc) => doc.path));

  const [documentResult, graph, departmentRows, entityResult, predicateResult, claimResult, evidenceResult, proposalResult, auditResult] =
    await Promise.all([
      authorizedIds.length
        ? admin
            .from("brain_docs")
            .select("id, path, title, description, department_id, project_id, doc_type, visibility, tags, links, content, origin, current_version, source_updated_at, review_due_at")
            .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
            .in("id", authorizedIds)
            .is("deleted_at", null)
            .order("path")
        : Promise.resolve({ data: [], error: null }),
      getGraph(admin, MF_BRAIN_ORGANIZATION_ID),
      getDepartments(admin, MF_BRAIN_ORGANIZATION_ID),
      admin
        .from("brain_entities")
        .select("id, name, canonical_key, entity_type")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .or(`project_id.eq.${MF_BRAIN_PROJECT_ID},project_id.is.null`),
      admin
        .from("brain_predicates")
        .select("id, name")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID),
      admin
        .from("brain_claims")
        .select("id, subject_entity_id, predicate_id, object_type, object_value, object_entity_id, lifecycle, resolution, valid_from, valid_until, project_id")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .eq("project_id", MF_BRAIN_PROJECT_ID),
      admin
        .from("brain_claim_evidence")
        .select("claim_id, doc_id")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID),
      admin
        .from("brain_claim_proposals")
        .select("id, operation, target_claim_id, proposed_claim, rationale, status, proposed_by, reviewed_by, created_at, reviewed_at")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("brain_audit_events")
        .select("id, actor_user_id, action, resource_type, resource_id, metadata, created_at")
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  if (documentResult.error) throw new Error(`MF document read failed: ${documentResult.error.message}`);
  if (entityResult.error) throw new Error(`MF entity read failed: ${entityResult.error.message}`);
  if (predicateResult.error) throw new Error(`MF predicate read failed: ${predicateResult.error.message}`);
  if (claimResult.error) throw new Error(`MF claim read failed: ${claimResult.error.message}`);
  if (evidenceResult.error) throw new Error(`MF claim evidence read failed: ${evidenceResult.error.message}`);

  const documents = (documentResult.data ?? []) as WorkspaceDocumentRow[];
  const documentIdSet = new Set(documents.map((doc) => doc.id));
  const entities = (entityResult.data ?? []) as EntityRow[];
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const predicates = (predicateResult.data ?? []) as PredicateRow[];
  const predicatesById = new Map(predicates.map((predicate) => [predicate.id, predicate]));
  const evidence = (evidenceResult.data ?? []) as ClaimEvidenceRow[];
  const authorizedClaimIds = new Set(
    evidence.filter((item) => documentIdSet.has(item.doc_id)).map((item) => item.claim_id),
  );
  const claims = ((claimResult.data ?? []) as ClaimRow[])
    .filter((claim) => authorizedClaimIds.has(claim.id))
    .map((claim) => ({
      id: claim.id,
      subject: entitiesById.get(claim.subject_entity_id)?.name ?? "Project claim",
      predicate: predicatesById.get(claim.predicate_id)?.name ?? claim.predicate_id,
      object: objectLabel(claim, entitiesById),
      lifecycle: claim.lifecycle,
      resolution: claim.resolution,
      validFrom: claim.valid_from,
      validUntil: claim.valid_until,
      evidenceDocumentIds: evidence
        .filter((item) => item.claim_id === claim.id && documentIdSet.has(item.doc_id))
        .map((item) => item.doc_id),
    }));

  return {
    connected: true as const,
    organization: MF_BRAIN_ORGANIZATION_ID,
    project: MF_BRAIN_PROJECT_ID,
    scope: {
      name: principal.name,
      title: principal.title,
      departmentId: principal.departmentId,
      role: principal.role,
      permittedDocuments: documents.length,
    },
    departments: departmentRows,
    documents,
    graph: graph
      .filter((doc) => authorizedPaths.has(doc.path))
      .map((doc) => ({ ...doc, links: doc.links.filter((path) => authorizedPaths.has(path)) })),
    claims,
    proposals: proposalResult.error ? [] : (proposalResult.data ?? []),
    audit: auditResult.error ? [] : (auditResult.data ?? []),
  };
}
