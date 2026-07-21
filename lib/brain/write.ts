// Shared write core for Urso Brain docs — ONE validated path for everything
// that writes a doc, whether the author is the AI (lib/brain/tools.ts) or a
// human in the vault browser (/api/brain/docs). Server-only.

import { createHash } from "crypto";
import type { ursoDb } from "./supabase";
import { getDepartments, getProjects, listLinkTargets, type BrainDocWrite } from "./db";
import { extractWikilinks, resolveLinks } from "./links";

type Db = ReturnType<typeof ursoDb>;

export const DOC_TYPES = ["core", "doc", "rule"] as const;

// Same hash recipe as scripts/brain-sync.mjs, so a brain-written doc that gets
// exported to disk hashes identically on the next sync (no churn).
export const hashDoc = (d: Omit<BrainDocWrite, "path" | "content_hash" | "links">) =>
  createHash("sha256")
    .update(JSON.stringify([d.title, d.description, d.department_id, d.project_id, d.doc_type, d.audience, d.tags, d.content]))
    .digest("hex");

export const sanitizePathPart = (s: string) => s.replace(/[\\:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();

// Validate + normalize the meta fields shared by create and update.
export async function checkMeta(
  admin: Db,
  fields: { department?: string; project?: string; type?: string },
): Promise<{ error?: string; department_id?: string | null; project_id?: string | null; doc_type?: "core" | "doc" | "rule" }> {
  const out: { department_id?: string | null; project_id?: string | null; doc_type?: "core" | "doc" | "rule" } = {};
  if (fields.department !== undefined) {
    if (fields.department === "" || fields.department === "none") out.department_id = null;
    else {
      const deps = await getDepartments(admin);
      if (!deps.some((d) => d.id === fields.department)) {
        return { error: `Unknown department "${fields.department}". Valid: ${deps.map((d) => d.id).join(", ")}, or "none".` };
      }
      out.department_id = fields.department;
    }
  }
  if (fields.project !== undefined) {
    if (fields.project === "" || fields.project === "none") out.project_id = null;
    else {
      const projs = await getProjects(admin);
      if (!projs.some((p) => p.id === fields.project)) {
        return { error: `Unknown project "${fields.project}". Valid: ${projs.map((p) => p.id).join(", ")}, or "none".` };
      }
      out.project_id = fields.project;
    }
  }
  if (fields.type !== undefined) {
    if (!DOC_TYPES.includes(fields.type as (typeof DOC_TYPES)[number])) {
      return { error: `Unknown doc type "${fields.type}". Valid: core, doc, rule.` };
    }
    out.doc_type = fields.type as "core" | "doc" | "rule";
  }
  return out;
}

export async function linksFor(admin: Db, content: string): Promise<string[]> {
  const targets = await listLinkTargets(admin);
  return resolveLinks(extractWikilinks(content), targets);
}

// Normalize a caller-supplied (or default) doc path. Returns an error string
// for anything that could escape or collide weirdly.
export function normalizeDocPath(raw: string | undefined, title: string): { path?: string; error?: string } {
  let path = raw ? sanitizePathPart(raw).replace(/^\/+/, "") : `_Brain/${sanitizePathPart(title)}.md`;
  if (path.includes("..")) return { error: "Path must not contain '..'." };
  if (!/\.md$/i.test(path)) path += ".md";
  if (path.length > 200) return { error: "Path too long (max 200 chars)." };
  if (!path.replace(/\.md$/i, "").trim()) return { error: "Path is empty after sanitization." };
  return { path };
}
