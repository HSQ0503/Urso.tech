// Data access for Urso Brain. Everything runs through the URSO HQ project's
// secret-key client (lib/brain/supabase.ts ursoDb — brain_* tables are RLS-on /
// no-policies); the calling route has already authenticated the user, and
// ownership is enforced in code. Server-only. NEVER the Woof Gang client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptApiKey } from "./crypto";
import type { BrainDepartment, BrainDoc, BrainDocMeta, BrainProfile, BrainProject, BrainProvider } from "./types";

type Admin = SupabaseClient;

const DOC_META_COLS = "path, title, description, department_id, project_id, doc_type, audience";

export async function getDepartments(admin: Admin): Promise<BrainDepartment[]> {
  const { data } = await admin.from("brain_departments").select("id, name, blurb").order("sort");
  return (data ?? []) as BrainDepartment[];
}

export async function getProjects(admin: Admin): Promise<BrainProject[]> {
  const { data } = await admin.from("brain_projects").select("id, name, blurb, status").eq("status", "active").order("sort");
  return (data ?? []) as BrainProject[];
}

export async function getProfile(admin: Admin, userId: string): Promise<BrainProfile | null> {
  const { data } = await admin
    .from("brain_profiles")
    .select("user_id, name, department_id, title")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BrainProfile | null) ?? null;
}

export async function upsertProfile(admin: Admin, profile: BrainProfile): Promise<void> {
  const { error } = await admin
    .from("brain_profiles")
    .upsert({ ...profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`profile save failed: ${error.message}`);
}

// The full doc manifest (metadata only) — the model's map of what it can fetch.
export async function getDocManifest(admin: Admin): Promise<BrainDocMeta[]> {
  const { data } = await admin.from("brain_docs").select(DOC_META_COLS).is("deleted_at", null).order("path");
  return (data ?? []) as BrainDocMeta[];
}

// Always-on docs: company core + the standing rules addressed to this department.
export async function getAlwaysOnDocs(admin: Admin, departmentId: string): Promise<{ core: BrainDoc[]; rules: BrainDoc[] }> {
  const { data } = await admin
    .from("brain_docs")
    .select(`${DOC_META_COLS}, links, origin, content`)
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

export async function getDocByPath(admin: Admin, path: string): Promise<BrainDoc | null> {
  const { data } = await admin
    .from("brain_docs")
    .select(`${DOC_META_COLS}, links, origin, content`)
    .eq("path", path)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as BrainDoc | null) ?? null;
}

// Case-insensitive search over title, description, and content. Fine at
// company-vault scale (hundreds of docs); revisit with FTS/embeddings later.
export async function searchDocs(admin: Admin, query: string, limit = 12): Promise<BrainDocMeta[]> {
  // Strip chars that are syntax inside a PostgREST .or() filter expression.
  const q = query.replace(/[%_,()."\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const { data } = await admin
    .from("brain_docs")
    .select(DOC_META_COLS)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%,content.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(limit);
  return (data ?? []) as BrainDocMeta[];
}

// ---------- the doc graph + brain-side writes ----------

// Every live doc as a wikilink resolution target.
export async function listLinkTargets(admin: Admin): Promise<{ path: string; title: string }[]> {
  const { data } = await admin.from("brain_docs").select("path, title").is("deleted_at", null);
  return (data ?? []) as { path: string; title: string }[];
}

// Docs whose content links TO this path (the Obsidian backlinks pane).
export async function getBacklinks(admin: Admin, path: string): Promise<{ path: string; title: string }[]> {
  const { data } = await admin
    .from("brain_docs")
    .select("path, title")
    .contains("links", [path])
    .is("deleted_at", null);
  return (data ?? []) as { path: string; title: string }[];
}

export async function getDocTitles(admin: Admin, paths: string[]): Promise<{ path: string; title: string }[]> {
  if (!paths.length) return [];
  const { data } = await admin.from("brain_docs").select("path, title").in("path", paths).is("deleted_at", null);
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
};

// Insert an AI/app-authored doc. origin='brain' → the DB owns it; the sync
// script will never overwrite it and `--export` mirrors it into the vault.
export async function insertBrainDoc(admin: Admin, row: BrainDocWrite, by: string): Promise<void> {
  const { error } = await admin
    .from("brain_docs")
    .insert({ ...row, origin: "brain", updated_by: by, synced_at: new Date().toISOString() });
  if (error) throw new Error(`create failed: ${error.message}`);
}

// Patch a live doc. Flips origin to 'brain' — from here the DB copy is the
// truth and sync reports (never clobbers) the divergence from disk.
export async function updateBrainDoc(
  admin: Admin,
  path: string,
  patch: Partial<BrainDocWrite>,
  by: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("brain_docs")
    .update({ ...patch, origin: "brain", updated_by: by, synced_at: new Date().toISOString() })
    .eq("path", path)
    .is("deleted_at", null)
    .select("path");
  if (error) throw new Error(`update failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// Soft delete — recoverable by clearing deleted_at in SQL. Vault-origin docs
// stay deleted in the brain even if the file remains on disk (sync reports it).
export async function softDeleteBrainDoc(admin: Admin, path: string, by: string): Promise<boolean> {
  const { data, error } = await admin
    .from("brain_docs")
    .update({ deleted_at: new Date().toISOString(), origin: "brain", updated_by: by })
    .eq("path", path)
    .is("deleted_at", null)
    .select("path");
  if (error) throw new Error(`delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// Which providers have an org key stored (for the model picker), last-4 only.
export async function getOrgKeyStatus(admin: Admin): Promise<{ provider: BrainProvider; last4: string }[]> {
  const { data } = await admin.from("brain_org_keys").select("provider, key_last4");
  return ((data ?? []) as { provider: BrainProvider; key_last4: string }[]).map((r) => ({
    provider: r.provider,
    last4: r.key_last4,
  }));
}

// The decrypted org key for a provider, or null if not configured.
export async function getOrgKey(admin: Admin, provider: BrainProvider): Promise<string | null> {
  const { data } = await admin.from("brain_org_keys").select("key_ciphertext").eq("provider", provider).maybeSingle();
  const ct = (data as { key_ciphertext: string } | null)?.key_ciphertext;
  return ct ? decryptApiKey(ct) : null;
}
