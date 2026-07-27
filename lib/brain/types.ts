// Shared types for Urso Brain — the identity-aware company-brain chat (/brain).
// See vault: "07 - Urso Brain/Urso Brain — Product & v1 Spec".

export type BrainProvider = "anthropic" | "openai" | "google" | "moonshot";
export type BrainRole = "org_admin" | "knowledge_steward" | "member" | "viewer";
export type BrainVisibility = "organization" | "department" | "project" | "restricted";

export const DEFAULT_BRAIN_ORGANIZATION_ID = "urso";

export type BrainDepartment = {
  id: string;
  name: string;
  blurb: string;
};

export type BrainProject = {
  id: string;
  name: string;
  blurb: string;
  status: "active" | "archived";
};

// Doc metadata as it appears in manifests (content deliberately excluded —
// full text is fetched on demand by the fetch_doc tool).
export type BrainDocMeta = {
  id?: string;
  organization_id?: string;
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  audience: string[];
  tags: string[];
  visibility?: BrainVisibility;
  current_version?: number;
  review_due_at?: string | null;
  // The project scope that made this document readable. Null means the
  // document is readable without activating a project.
  access_project_id?: string | null;
};

export type BrainDoc = BrainDocMeta & {
  content: string;
  links: string[]; // resolved outgoing wikilink target paths (the doc graph)
  origin: "vault" | "brain"; // who owns the copy: the disk vault or the DB
};

export type BrainProfile = {
  user_id: string;
  name: string;
  department_id: string;
  title: string;
};

export type BrainPrincipal = {
  organizationId: string;
  userId: string;
  name: string;
  email: string;
  title: string;
  departmentId: string;
  role: BrainRole;
};

export type BrainRetrievalMode = "hybrid" | "lexical" | "none";

export type BrainClaimLifecycle = "active" | "superseded" | "retired";
export type BrainClaimResolution = "accepted" | "unresolved" | "contested";
export type BrainClaimTemporalStatus = "current" | "historical" | "future";

export type BrainContextClaim = {
  id: string;
  subject: { id: string; label: string };
  predicate: { id: string; label: string };
  object: {
    type: "text" | "number" | "boolean" | "date" | "entity";
    value: string;
    label?: string;
  };
  lifecycle: BrainClaimLifecycle;
  resolution: BrainClaimResolution;
  validFrom: string | null;
  validUntil: string | null;
  temporalStatus: BrainClaimTemporalStatus;
  supersedes: string[];
  supersededBy: string[];
};

export type BrainContextEvidence = {
  id: string;
  sourceKind: "document_chunk" | "temporal_claim";
  accessProjectId: string | null;
  path: string;
  title: string;
  documentType: "core" | "doc" | "rule";
  authority: "governing" | "reference";
  heading: string;
  excerpt: string;
  version: number;
  reasons: string[];
  lexicalScore: number;
  semanticScore: number;
  fusedScore: number;
  claim?: BrainContextClaim;
};

export type BrainContextConflict = {
  id: string;
  subjectLabel: string;
  predicateLabel: string;
  status: "open" | "resolved" | "dismissed";
  claimIds: string[];
  message: string;
};

export type BrainContextReceipt = {
  runId: string;
  createdAt: string;
  scope: {
    organization: string;
    department: string;
    role: BrainRole;
    project: { id: string; name: string } | null;
  };
  plan: {
    query: string;
    terms: string[];
    requestedProjectId: string | null;
    tokenBudget: number;
  };
  authorization: {
    policy: "organization membership + explicit project membership + document visibility + ACL";
    permittedEvidenceCount: number;
  };
  retrieval: {
    mode: BrainRetrievalMode;
    searchedChunks: number;
    selectedChunks: number;
    estimatedTokens: number;
    latencyMs: number;
  };
  evidence: BrainContextEvidence[];
  temporal?: {
    queryTime: {
      mode: "current" | "as_of";
      effectiveAt: string;
      source: "default_today" | "explicit";
    };
    checkedClaimCount: number;
    selectedClaimCount: number;
    claims: BrainContextClaim[];
  };
  conflictAnalysis:
    | {
        status: "not_performed";
        message: string;
      }
    | {
        status: "performed";
        effectiveAt: string;
        checkedClaimCount: number;
        conflicts: BrainContextConflict[];
        message: string;
      };
  // Pre-M5 receipts stored conflicts as strings. New receipts keep structured
  // conflicts inside conflictAnalysis so authorization-sensitive counts cannot
  // be confused with the historical placeholder.
  conflicts?: string[];
  missing: string[];
};

export type BrainUIData = {
  "context-receipt": BrainContextReceipt;
};

export type BrainThreadSummary = {
  id: string;
  title: string;
  project_id: string | null;
  model: string;
  updated_at: string;
};
