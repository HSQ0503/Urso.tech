// Tool belt for Urso Brain — the AI's hands on the vault. Three read tools plus
// FULL write access (create / update / connect / delete), so the brain can grow
// its own knowledge base from conversations. Guardrails:
//   - deletes are SOFT (recoverable) and gated on an explicit `confirm` flag
//   - meta (department/project/type) is validated against the real tables
//   - every write records the acting user's email (updated_by)
//   - AI-written docs get origin='brain' — the vault sync reports rather than
//     overwrites them, and `--export` mirrors them back into Obsidian
// Links are Obsidian-style [[wikilinks]] in the markdown itself; brain_docs.links
// carries the resolved target paths so the graph is queryable (backlinks).

import { tool } from "ai";
import { z } from "zod";
import { ursoDb } from "./supabase";
import {
  getBacklinks,
  getDocByPath,
  getDocManifest,
  getDocTitles,
  insertBrainDoc,
  searchDocs,
  softDeleteBrainDoc,
  updateBrainDoc,
  type BrainDocWrite,
} from "./db";
import { checkMeta, hashDoc, linksFor, normalizeDocPath, sanitizePathPart } from "./write";

const meta = (d: { path: string; title: string; description: string; department_id: string | null; project_id: string | null; doc_type: string }) => ({
  path: d.path,
  title: d.title,
  description: d.description,
  department: d.department_id,
  project: d.project_id,
  type: d.doc_type,
});

// hashDoc / sanitizePathPart / checkMeta / linksFor / normalizeDocPath live in
// lib/brain/write.ts — the ONE validated write path shared with the manual
// editor's API route (/api/brain/docs).

export function buildBrainTools(actor: { email: string }) {
  return {
    fetch_doc: tool({
      description:
        "Read one vault doc in full by its exact path. Returns the content plus its graph edges: outgoing links (docs it references) and backlinks (docs that reference it).",
      inputSchema: z.object({ path: z.string().describe("Exact doc path from the manifest") }),
      execute: async ({ path }) => {
        const admin = ursoDb();
        const doc = await getDocByPath(admin, path);
        if (!doc) return { error: `No doc at "${path}". Check the manifest or use search_docs.` };
        const [outgoing, backlinks] = await Promise.all([getDocTitles(admin, doc.links), getBacklinks(admin, path)]);
        return { ...meta(doc), origin: doc.origin, content: doc.content, links: outgoing, backlinks };
      },
    }),

    search_docs: tool({
      description:
        "Search the vault by keywords (matches titles, descriptions, and full text). Returns doc metadata — follow up with fetch_doc to read one.",
      inputSchema: z.object({ query: z.string().describe("Keywords, a doc title, or a [[wikilink]] title") }),
      execute: async ({ query }) => {
        const admin = ursoDb();
        const hits = await searchDocs(admin, query.replace(/^\[\[|\]\]$/g, ""));
        return hits.length ? { results: hits.map(meta) } : { results: [], note: "No matches — try different keywords." };
      },
    }),

    list_docs: tool({
      description: "List vault docs, optionally filtered to one project or one department.",
      inputSchema: z.object({
        project: z.string().optional().describe("Project slug, e.g. 'canes'"),
        department: z.string().optional().describe("Department slug, e.g. 'legal'"),
      }),
      execute: async ({ project, department }) => {
        const admin = ursoDb();
        let docs = await getDocManifest(admin);
        if (project) docs = docs.filter((d) => d.project_id === project);
        if (department) docs = docs.filter((d) => d.department_id === department);
        return { docs: docs.map(meta) };
      },
    }),

    create_doc: tool({
      description:
        "Create a new vault doc. Use when the user asks to save, note down, or document something — or when a conversation produces knowledge worth keeping. Connect it to related docs by writing [[Doc Title]] wikilinks in the content.",
      inputSchema: z.object({
        title: z.string().min(2).max(120).describe("Doc title (also the H1)"),
        content: z.string().min(1).describe("Full markdown body. Use [[Doc Title]] wikilinks to connect related docs."),
        description: z.string().max(200).optional().describe("One-line summary for the manifest"),
        department: z.string().optional().describe("Owning department slug, or omit"),
        project: z.string().optional().describe("Owning project slug, or omit"),
        type: z.enum(["doc", "rule"]).optional().describe("'rule' only for standing rules other departments must follow"),
        audience: z.array(z.string()).optional().describe("For rules: department slugs (or 'all') the rule binds"),
        path: z.string().optional().describe("Optional explicit path; defaults to _Brain/<title>.md"),
      }),
      execute: async ({ title, content, description, department, project, type, audience, path }) => {
        const admin = ursoDb();
        const checked = await checkMeta(admin, { department, project, type });
        if (checked.error) return { error: checked.error };

        const cleanTitle = sanitizePathPart(title);
        const normalized = normalizeDocPath(path, cleanTitle);
        if (normalized.error || !normalized.path) return { error: normalized.error ?? "Invalid path." };
        const docPath = normalized.path;

        if (await getDocByPath(admin, docPath)) {
          return { error: `A doc already exists at "${docPath}" — use update_doc to change it, or pick another path.` };
        }

        const row: BrainDocWrite = {
          path: docPath,
          title: cleanTitle,
          description: (description ?? "").trim().slice(0, 200),
          department_id: checked.department_id ?? null,
          project_id: checked.project_id ?? null,
          doc_type: checked.doc_type ?? "doc",
          audience: checked.doc_type === "rule" ? (audience?.length ? audience : ["all"]) : [],
          tags: [],
          links: await linksFor(admin, content),
          content: content.trim(),
          content_hash: "",
        };
        row.content_hash = hashDoc(row);
        await insertBrainDoc(admin, row, actor.email);
        return { created: docPath, links: row.links, note: "Doc created. It syncs back to the Obsidian vault on the next export." };
      },
    }),

    update_doc: tool({
      description:
        "Update an existing vault doc — content and/or metadata. ALWAYS fetch_doc first and pass the complete new content (this replaces the whole body). Adding or removing [[wikilinks]] in the content is how connections change.",
      inputSchema: z.object({
        path: z.string().describe("Exact path of the doc to update"),
        content: z.string().optional().describe("Complete new markdown body (full replacement)"),
        title: z.string().min(2).max(120).optional(),
        description: z.string().max(200).optional(),
        department: z.string().optional().describe("New department slug, or 'none' to clear"),
        project: z.string().optional().describe("New project slug, or 'none' to clear"),
        type: z.enum(["core", "doc", "rule"]).optional(),
        audience: z.array(z.string()).optional().describe("For rules: department slugs (or 'all')"),
      }),
      execute: async ({ path, content, title, description, department, project, type, audience }) => {
        const admin = ursoDb();
        const existing = await getDocByPath(admin, path);
        if (!existing) return { error: `No doc at "${path}". Check the manifest or use search_docs.` };

        const checked = await checkMeta(admin, { department, project, type });
        if (checked.error) return { error: checked.error };

        const next: BrainDocWrite = {
          path,
          title: title ? sanitizePathPart(title) : existing.title,
          description: description !== undefined ? description.trim().slice(0, 200) : existing.description,
          department_id: checked.department_id !== undefined ? checked.department_id : existing.department_id,
          project_id: checked.project_id !== undefined ? checked.project_id : existing.project_id,
          doc_type: checked.doc_type ?? existing.doc_type,
          audience: audience ?? existing.audience,
          tags: [],
          links: content !== undefined ? await linksFor(admin, content) : existing.links,
          content: content !== undefined ? content.trim() : existing.content,
          content_hash: "",
        };
        next.content_hash = hashDoc(next);
        const patch: Omit<BrainDocWrite, "path"> & { path?: string } = { ...next };
        delete patch.path;
        const ok = await updateBrainDoc(admin, path, patch, actor.email);
        if (!ok) return { error: `Update didn't apply — the doc at "${path}" may have just been deleted.` };
        return {
          updated: path,
          links: next.links,
          note:
            existing.origin === "vault"
              ? "Updated. This doc came from the Obsidian vault — the brain now holds the newer copy; the disk file follows on the next export."
              : "Updated.",
        };
      },
    }),

    link_docs: tool({
      description:
        "Connect two docs: appends a [[wikilink]] to the target under a 'Related' section in the source doc. For richer connections, prefer update_doc and weave the link into the prose.",
      inputSchema: z.object({
        from: z.string().describe("Path of the doc to add the link IN"),
        to: z.string().describe("Path of the doc to link TO"),
      }),
      execute: async ({ from, to }) => {
        const admin = ursoDb();
        const [src, dst] = await Promise.all([getDocByPath(admin, from), getDocByPath(admin, to)]);
        if (!src) return { error: `No doc at "${from}".` };
        if (!dst) return { error: `No doc at "${to}".` };
        if (src.links.includes(to)) return { already: true, note: `"${from}" already links to "${dst.title}".` };

        const linkLine = `- [[${dst.title}]]`;
        const content = /^##\s+Related\s*$/m.test(src.content)
          ? src.content.replace(/^(##\s+Related\s*)$/m, `$1\n${linkLine}`)
          : `${src.content.trimEnd()}\n\n## Related\n${linkLine}\n`;

        const links = await linksFor(admin, content);
        const content_hash = hashDoc({
          title: src.title, description: src.description, department_id: src.department_id,
          project_id: src.project_id, doc_type: src.doc_type, audience: src.audience, tags: [], content,
        });
        const ok = await updateBrainDoc(admin, from, { content, links, content_hash }, actor.email);
        if (!ok) return { error: "Link didn't apply — the source doc may have just been deleted." };
        return { linked: { from, to }, note: `"${src.title}" now links to "${dst.title}".` };
      },
    }),

    delete_doc: tool({
      description:
        "Delete a vault doc. ONLY when the user explicitly asked to delete it — never as cleanup on your own initiative. The delete is soft (recoverable by an admin).",
      inputSchema: z.object({
        path: z.string().describe("Exact path of the doc to delete"),
        confirm: z.boolean().describe("Must be true. Set only after the user explicitly asked for this deletion."),
      }),
      execute: async ({ path, confirm }) => {
        if (!confirm) return { error: "Refused: deletion requires the user's explicit request (confirm=true)." };
        const admin = ursoDb();
        const ok = await softDeleteBrainDoc(admin, path, actor.email);
        if (!ok) return { error: `No live doc at "${path}" — nothing deleted.` };
        return { deleted: path, note: "Soft-deleted (an admin can restore it). If the doc also exists in the Obsidian vault on disk, the file remains there; the brain just stops reading it." };
      },
    }),
  };
}
