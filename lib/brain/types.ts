// Shared types for Urso Brain — the identity-aware company-brain chat (/brain).
// See vault: "07 - Urso Brain/Urso Brain — Product & v1 Spec".

export type BrainProvider = "anthropic" | "openai" | "google" | "moonshot";

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
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  audience: string[];
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

export type BrainThreadSummary = {
  id: string;
  title: string;
  project_id: string | null;
  model: string;
  updated_at: string;
};
