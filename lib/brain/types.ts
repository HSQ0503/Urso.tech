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
  visibility?: BrainVisibility;
  current_version?: number;
  review_due_at?: string | null;
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

export type BrainContextEvidence = {
  id: string;
  path: string;
  title: string;
  heading: string;
  excerpt: string;
  version: number;
  reasons: string[];
  lexicalScore: number;
  semanticScore: number;
  fusedScore: number;
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
    policy: "membership + document visibility + ACL";
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
  conflicts: string[];
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
