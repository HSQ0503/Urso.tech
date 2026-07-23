// Data access for Urso Brain. Everything runs through the URSO HQ project's
// secret-key client (lib/brain/supabase.ts ursoDb — brain_* tables are RLS-on /
// no-policies); the calling route has already authenticated the user, and
// ownership is enforced in code. Server-only. NEVER the Woof Gang client.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptApiKey } from "./crypto";
import {
  DEFAULT_BRAIN_ORGANIZATION_ID,
  type BrainDepartment,
  type BrainDoc,
  type BrainDocMeta,
  type BrainProfile,
  type BrainProject,
  type BrainProvider,
} from "./types";

type Admin = SupabaseClient;

const DOC_META_COLS =
  "id, organization_id, path, title, description, department_id, project_id, doc_type, audience, visibility, current_version, review_due_at";

export async function getDepartments(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainDepartment[]> {
  const { data } = await admin
    .from("brain_departments")
    .select("id, name, blurb")
    .eq("organization_id", organizationId)
    .order("sort");
  return (data ?? []) as BrainDepartment[];
}

export async function getProjects(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainProject[]> {
  const { data } = await admin
    .from("brain_projects")
    .select("id, name, blurb, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("sort");
  return (data ?? []) as BrainProject[];
}

export async function getProfile(
  admin: Admin,
  userId: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainProfile | null> {
  const { data } = await admin
    .from("brain_profiles")
    .select("user_id, name, department_id, title")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BrainProfile | null) ?? null;
}

export async function upsertProfile(
  admin: Admin,
  profile: BrainProfile,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<void> {
  const { error } = await admin
    .from("brain_profiles")
    .upsert(
      { ...profile, organization_id: organizationId, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,user_id" },
    );
  if (error) throw new Error(`profile save failed: ${error.message}`);

  const { error: membershipError } = await admin.from("brain_memberships").upsert(
    {
      organization_id: organizationId,
      user_id: profile.user_id,
      department_id: profile.department_id,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id", ignoreDuplicates: false },
  );
  if (membershipError) throw new Error(`membership save failed: ${membershipError.message}`);
}

// Organization-scoped metadata catalog. Never pass this unfiltered to a model;
// authorization.ts narrows it before the compiler or UI uses it.
export async function getDocManifest(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainDocMeta[]> {
  const { data } = await admin
    .from("brain_docs")
    .select(DOC_META_COLS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("path");
  return (data ?? []) as BrainDocMeta[];
}

// Always-on docs: company core + the standing rules addressed to this department.
export async function getAlwaysOnDocs(
  admin: Admin,
  departmentId: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ core: BrainDoc[]; rules: BrainDoc[] }> {
  const { data } = await admin
    .from("brain_docs")
    .select(`${DOC_META_COLS}, links, origin, content`)
    .eq("organization_id", organizationId)
    .in("doc_type", ["core", "rule"])
    .is("deleted_at", null)
    .order("path");
  const docs = (data ?? []) as BrainDoc[];
  return {
    core: docs.filter((d) => d.doc_type === "core"),
    rules: docs.filter(
      (d) => d.doc_type === "rule" && (d.audience.includes("all") || d.audience.includes(departmentId)),
    ),
  };
}

export async function getDocByPath(
  admin: Admin,
  path: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainDoc | null> {
  const { data } = await admin
    .from("brain_docs")
    .select(`${DOC_META_COLS}, links, origin, content`)
    .eq("organization_id", organizationId)
    .eq("path", path)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as BrainDoc | null) ?? null;
}

// Case-insensitive search over title, description, and content. Fine at
// company-vault scale (hundreds of docs); revisit with FTS/embeddings later.
export async function searchDocs(
  admin: Admin,
  query: string,
  limit = 12,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainDocMeta[]> {
  // Strip chars that are syntax inside a PostgREST .or() filter expression.
  const q = query.replace(/[%_,()."\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const { data } = await admin
    .from("brain_docs")
    .select(DOC_META_COLS)
    .eq("organization_id", organizationId)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%,content.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(limit);
  return (data ?? []) as BrainDocMeta[];
}

// ---------- the doc graph + brain-side writes ----------

export type GraphDoc = {
  path: string;
  title: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  origin: "vault" | "brain";
  links: string[];
};

// Every live doc with its edges — the full graph for /brain/graph.
export async function getGraph(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<GraphDoc[]> {
  const { data } = await admin
    .from("brain_docs")
    .select("path, title, department_id, project_id, doc_type, origin, links")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("path");
  return (data ?? []) as GraphDoc[];
}

// Every live doc as a wikilink resolution target.
export async function listLinkTargets(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ path: string; title: string }[]> {
  const { data } = await admin
    .from("brain_docs")
    .select("path, title")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  return (data ?? []) as { path: string; title: string }[];
}

// Docs whose content links TO this path (the Obsidian backlinks pane).
export async function getBacklinks(
  admin: Admin,
  path: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ path: string; title: string }[]> {
  const { data } = await admin
    .from("brain_docs")
    .select("path, title")
    .eq("organization_id", organizationId)
    .contains("links", [path])
    .is("deleted_at", null);
  return (data ?? []) as { path: string; title: string }[];
}

export async function getDocTitles(
  admin: Admin,
  paths: string[],
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ path: string; title: string }[]> {
  if (!paths.length) return [];
  const { data } = await admin
    .from("brain_docs")
    .select("path, title")
    .eq("organization_id", organizationId)
    .in("path", paths)
    .is("deleted_at", null);
  return (data ?? []) as { path: string; title: string }[];
}

export type BrainDocWrite = {
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  audience: string[];
  tags: string[];
  links: string[];
  content: string;
  content_hash: string;
  visibility?: "organization" | "department" | "project" | "restricted";
};

// Insert an AI/app-authored doc. origin='brain' → the DB owns it; the sync
// script will never overwrite it and `--export` mirrors it into the vault.
export async function insertBrainDoc(
  admin: Admin,
  row: BrainDocWrite,
  by: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<void> {
  const { error } = await admin
    .from("brain_docs")
    .insert({
      ...row,
      organization_id: organizationId,
      origin: "brain",
      updated_by: by,
      synced_at: new Date().toISOString(),
    });
  if (error) throw new Error(`create failed: ${error.message}`);
}

// Patch a live doc. Flips origin to 'brain' — from here the DB copy is the
// truth and sync reports (never clobbers) the divergence from disk.
export async function updateBrainDoc(
  admin: Admin,
  path: string,
  patch: Partial<BrainDocWrite>,
  by: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<boolean> {
  const { data, error } = await admin
    .from("brain_docs")
    .update({ ...patch, origin: "brain", updated_by: by, synced_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("path", path)
    .is("deleted_at", null)
    .select("path");
  if (error) throw new Error(`update failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// Soft delete — recoverable by clearing deleted_at in SQL. Vault-origin docs
// stay deleted in the brain even if the file remains on disk (sync reports it).
export async function softDeleteBrainDoc(
  admin: Admin,
  path: string,
  by: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<boolean> {
  const { data, error } = await admin
    .from("brain_docs")
    .update({ deleted_at: new Date().toISOString(), origin: "brain", updated_by: by })
    .eq("organization_id", organizationId)
    .eq("path", path)
    .is("deleted_at", null)
    .select("path");
  if (error) throw new Error(`delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// Which providers have an org key stored (for the model picker), last-4 only.
export async function getOrgKeyStatus(
  admin: Admin,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ provider: BrainProvider; last4: string }[]> {
  const { data } = await admin
    .from("brain_org_keys")
    .select("provider, key_last4")
    .eq("organization_id", organizationId);
  return ((data ?? []) as { provider: BrainProvider; key_last4: string }[]).map((r) => ({
    provider: r.provider,
    last4: r.key_last4,
  }));
}

// The decrypted org key for a provider, or null if not configured.
export async function getOrgKey(
  admin: Admin,
  provider: BrainProvider,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<string | null> {
  const { data } = await admin
    .from("brain_org_keys")
    .select("key_ciphertext")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();
  const ct = (data as { key_ciphertext: string } | null)?.key_ciphertext;
  return ct ? decryptApiKey(ct) : null;
}
