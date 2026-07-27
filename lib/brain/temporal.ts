import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrainClaimLifecycle,
  BrainClaimResolution,
  BrainClaimTemporalStatus,
  BrainContextClaim,
  BrainContextConflict,
  BrainPrincipal,
} from "./types";

type Admin = SupabaseClient;

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);

const isoDate = (year: number, month: number, day: number): string | null => {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
};

export type BrainTemporalQuery = {
  mode: "current" | "as_of";
  effectiveAt: string;
  source: "default_today" | "explicit";
};

export function resolveTemporalQuery(query: string, today: string): BrainTemporalQuery {
  const explicitIso = query.match(
    /\b(?:as\s+of|on|at|effective(?:\s+on)?)\s+(20\d{2})-(\d{2})-(\d{2})\b/i,
  );
  if (explicitIso) {
    const parsed = isoDate(
      Number(explicitIso[1]),
      Number(explicitIso[2]),
      Number(explicitIso[3]),
    );
    if (parsed) return { mode: "as_of", effectiveAt: parsed, source: "explicit" };
  }

  const explicitNamed = query.match(
    /\b(?:as\s+of|on|at|effective(?:\s+on)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i,
  );
  if (explicitNamed) {
    const parsed = isoDate(
      Number(explicitNamed[3]),
      MONTHS.get(explicitNamed[1].toLowerCase()) ?? 0,
      Number(explicitNamed[2]),
    );
    if (parsed) return { mode: "as_of", effectiveAt: parsed, source: "explicit" };
  }

  return { mode: "current", effectiveAt: today, source: "default_today" };
}

export type BrainTemporalEvidenceSource = {
  docId: string;
  path: string;
  title: string;
  documentType: "core" | "doc" | "rule";
  version: number;
  excerpt: string;
  role: "authoritative" | "supporting";
};

export type BrainTemporalClaimResult = {
  claim: BrainContextClaim;
  projectId: string | null;
  evidence: BrainTemporalEvidenceSource[];
  conflicts: BrainContextConflict[];
};

type TemporalClaimRow = {
  claim_id: string;
  project_id?: string | null;
  subject_entity_id: string;
  subject_key: string;
  subject_name: string;
  predicate_id: string;
  predicate_name: string;
  object_type: BrainContextClaim["object"]["type"];
  object_value: unknown;
  object_entity_id: string | null;
  object_entity_key?: string | null;
  object_entity_name?: string | null;
  lifecycle: BrainClaimLifecycle;
  resolution: BrainClaimResolution;
  valid_from: string | null;
  valid_until: string | null;
  evidence: unknown;
  conflicts: unknown;
  supersedes?: unknown;
  superseded_by?: unknown;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const objectValue = (row: TemporalClaimRow): BrainContextClaim["object"] => {
  if (row.object_type === "entity") {
    return {
      type: "entity",
      value: row.object_entity_id ?? row.object_entity_key ?? "",
      label: row.object_entity_name ?? row.object_entity_key ?? undefined,
    };
  }
  const raw =
    row.object_value && typeof row.object_value === "object" && "value" in row.object_value
      ? (row.object_value as { value: unknown }).value
      : row.object_value;
  return {
    type: row.object_type,
    value: typeof raw === "string" ? raw : JSON.stringify(raw),
  };
};

const temporalStatus = (
  row: Pick<TemporalClaimRow, "valid_from" | "valid_until">,
  effectiveAt: string,
): BrainClaimTemporalStatus => {
  if (row.valid_from && effectiveAt < row.valid_from) return "future";
  if (row.valid_until && effectiveAt >= row.valid_until) return "historical";
  return "current";
};

const evidenceRows = (value: unknown): BrainTemporalEvidenceSource[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const docId = typeof row.doc_id === "string" ? row.doc_id : "";
    const path = typeof row.path === "string" ? row.path : "";
    const title = typeof row.title === "string" ? row.title : "";
    const excerpt = typeof row.excerpt === "string" ? row.excerpt : "";
    const version = Number(row.doc_version);
    const documentType =
      row.doc_type === "core" || row.doc_type === "rule" ? row.doc_type : "doc";
    if (!docId || !path || !title || !excerpt || !Number.isInteger(version)) return [];
    return [{
      docId,
      path,
      title,
      documentType,
      version,
      excerpt,
      role: row.evidence_role === "supporting" ? "supporting" as const : "authoritative" as const,
    }];
  });
};

const conflictRows = (value: unknown): BrainContextConflict[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return [];
    const status =
      row.status === "resolved" || row.status === "dismissed" ? row.status : "open";
    return [{
      id,
      subjectLabel: typeof row.subject_name === "string" ? row.subject_name : "",
      predicateLabel: typeof row.predicate_name === "string" ? row.predicate_name : "",
      status,
      claimIds: stringArray(row.claim_ids),
      message:
        typeof row.message === "string"
          ? row.message
          : "Authorized claims disagree for this subject and predicate.",
    }];
  });
};

const mapClaim = (row: TemporalClaimRow, effectiveAt: string): BrainTemporalClaimResult => ({
  claim: {
    id: row.claim_id,
    subject: { id: row.subject_entity_id, label: row.subject_name || row.subject_key },
    predicate: { id: row.predicate_id, label: row.predicate_name || row.predicate_id },
    object: objectValue(row),
    lifecycle: row.lifecycle,
    resolution: row.resolution,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    temporalStatus: temporalStatus(row, effectiveAt),
    supersedes: stringArray(row.supersedes),
    supersededBy: stringArray(row.superseded_by),
  },
  projectId: row.project_id ?? null,
  evidence: evidenceRows(row.evidence),
  conflicts: conflictRows(row.conflicts),
});

export async function searchAuthorizedTemporalClaims(opts: {
  admin: Admin;
  principal: BrainPrincipal;
  projectId: string | null;
  query: string;
  effectiveAt: string;
  limit?: number;
}): Promise<BrainTemporalClaimResult[]> {
  const { data, error } = await opts.admin.rpc("brain_authorized_temporal_claim_search", {
    p_organization_id: opts.principal.organizationId,
    p_user_id: opts.principal.userId,
    p_project_id: opts.projectId,
    p_as_of: opts.effectiveAt,
    p_query: opts.query,
    p_limit: opts.limit ?? 12,
  });
  if (error) throw new Error(`authorized temporal claim search failed: ${error.message}`);
  return ((data ?? []) as TemporalClaimRow[])
    .map((row) => mapClaim(row, opts.effectiveAt))
    .filter((item) => item.evidence.length > 0);
}

export async function getAuthorizedClaimsForDoc(opts: {
  admin: Admin;
  principal: BrainPrincipal;
  docId: string;
  projectId: string | null;
  effectiveAt: string;
  includeHistory: boolean;
}): Promise<BrainTemporalClaimResult[]> {
  const { data, error } = await opts.admin.rpc("brain_authorized_claims_for_doc", {
    p_organization_id: opts.principal.organizationId,
    p_user_id: opts.principal.userId,
    p_doc_id: opts.docId,
    p_project_id: opts.projectId,
    p_as_of: opts.effectiveAt,
    p_include_history: opts.includeHistory,
  });
  if (error) throw new Error(`authorized document claim history failed: ${error.message}`);
  return ((data ?? []) as TemporalClaimRow[])
    .map((row) => mapClaim(row, opts.effectiveAt))
    .filter((item) => item.evidence.length > 0);
}
