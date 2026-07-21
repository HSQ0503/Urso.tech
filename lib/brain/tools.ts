// Tool belt for Urso Brain: three small tools over the synced vault. All brain
// members can read all docs in v1 (per-doc access control is schema-ready but
// deliberately not enforced yet — see the spec's "out of scope").

import { tool } from "ai";
import { z } from "zod";
import { ursoDb } from "./supabase";
import { getDocByPath, getDocManifest, searchDocs } from "./db";

const meta = (d: { path: string; title: string; description: string; department_id: string | null; project_id: string | null; doc_type: string }) => ({
  path: d.path,
  title: d.title,
  description: d.description,
  department: d.department_id,
  project: d.project_id,
  type: d.doc_type,
});

export function buildBrainTools() {
  return {
    fetch_doc: tool({
      description:
        "Read one vault doc in full by its exact path (as listed in the manifest or returned by search_docs/list_docs).",
      inputSchema: z.object({ path: z.string().describe("Exact doc path from the manifest") }),
      execute: async ({ path }) => {
        const admin = ursoDb();
        const doc = await getDocByPath(admin, path);
        if (!doc) return { error: `No doc at "${path}". Check the manifest or use search_docs.` };
        return { ...meta(doc), content: doc.content };
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
  };
}
