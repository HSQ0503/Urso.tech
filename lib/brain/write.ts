// Shared write core for Urso Brain docs — ONE validated path for everything
// that writes a doc, whether the author is the AI (lib/brain/tools.ts) or a
// human in the vault browser (/api/brain/docs). Server-only.

import "server-only";

import { createHash } from "crypto";
import type { ursoDb } from "./supabase";
import { getDepartments, getProjects, listLinkTargets, type BrainDocWrite } from "./db";
import { extractWikilinks, resolveLinks } from "./links";
import { DEFAULT_BRAIN_ORGANIZATION_ID } from "./types";

type Db = ReturnType<typeof ursoDb>;

export const DOC_TYPES = ["core", "doc", "rule"] as const;

// Same hash recipe as scripts/brain-sync.mjs, so a brain-written doc that gets
// exported to disk hashes identically on the next sync (no churn).
export const hashDoc = (d: Omit<BrainDocWrite, "path" | "content_hash" | "links">) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        d.title,
        d.description,
        d.department_id,
        d.project_id,
        d.doc_type,
        d.audience,
        d.tags,
        d.visibility ?? "organization",
        d.content,
      ]),
    )
    .digest("hex");

export const sanitizePathPart = (s: string) => s.replace(/[\\:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();

type CatalogItem = { id: string; name: string };

function resolveCatalogId(
  rawValue: string,
  items: CatalogItem[],
  kind: "department" | "project",
): { id: string | null } | { error: string } {
  const value = rawValue.trim();
  const normalized = value.toLowerCase();
  if (
    !value ||
    normalized === "none" ||
    (kind === "project" && (normalized === "company-wide" || normalized === "company wide"))
  ) {
    return { id: null };
  }

  const idMatch = items.find((item) => item.id.toLowerCase() === normalized);
  if (idMatch) return { id: idMatch.id };

  const nameMatches = items.filter((item) => item.name.trim().toLowerCase() === normalized);
  if (nameMatches.length === 1) return { id: nameMatches[0].id };
  if (nameMatches.length > 1) {
    return { error: `Ambiguous ${kind} name "${value}". Use a slug: ${nameMatches.map((item) => item.id).join(", ")}.` };
  }

  return {
    error: `Unknown ${kind} "${value}". Valid: ${items.map((item) => item.id).join(", ")}, or "none".`,
  };
}

// Validate + normalize the meta fields shared by create and update.
export async function checkMeta(
  admin: Db,
  fields: { department?: string; project?: string; type?: string },
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ error?: string; department_id?: string | null; project_id?: string | null; doc_type?: "core" | "doc" | "rule" }> {
  const out: { department_id?: string | null; project_id?: string | null; doc_type?: "core" | "doc" | "rule" } = {};
  if (fields.department !== undefined) {
    const department = resolveCatalogId(
      fields.department,
      await getDepartments(admin, organizationId),
      "department",
    );
    if ("error" in department) return { error: department.error };
    out.department_id = department.id;
  }
  if (fields.project !== undefined) {
    const project = resolveCatalogId(
      fields.project,
      await getProjects(admin, organizationId),
      "project",
    );
    if ("error" in project) return { error: project.error };
    out.project_id = project.id;
  }
  if (fields.type !== undefined) {
    if (!DOC_TYPES.includes(fields.type as (typeof DOC_TYPES)[number])) {
      return { error: `Unknown doc type "${fields.type}". Valid: core, doc, rule.` };
    }
    out.doc_type = fields.type as "core" | "doc" | "rule";
  }
  return out;
}

export async function linksFor(
  admin: Db,
  content: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<string[]> {
  const targets = await listLinkTargets(admin, organizationId);
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
