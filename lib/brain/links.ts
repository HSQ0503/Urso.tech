// The doc graph: [[wikilinks]] are the connection mechanism, exactly like
// Obsidian. Links live IN the markdown; this module extracts them and resolves
// them to doc paths. Both the sync script (via its own copy of the regex) and
// the AI write tools use this so brain_docs.links stays the queryable graph.

export type LinkTarget = { path: string; title: string };

// [[Title]] and [[Title|alias]] → "Title". Ignores ![[embeds]].
export function extractWikilinks(content: string): string[] {
  const out: string[] = [];
  const re = /(?<!\!)\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|[^\][]*)?\]\]/g;
  for (const m of content.matchAll(re)) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

const norm = (s: string) => s.toLowerCase().trim();

// Filename stem: "02 - Woof Gang/The Pilot.md" → "the pilot".
const stemOf = (path: string) => {
  const base = path.split("/").pop() ?? path;
  return norm(base.replace(/\.md$/i, ""));
};

// Resolve link titles against the doc set, Obsidian-style: exact title match,
// then filename stem — including path-style links like [[Folder/Sub/Doc Name]],
// whose last segment is the stem. Unresolved links stay text-only (fine — they
// mark docs worth writing, same as in Obsidian).
export function resolveLinks(linkTitles: string[], docs: LinkTarget[]): string[] {
  const byTitle = new Map<string, string>();
  const byStem = new Map<string, string>();
  for (const d of docs) {
    if (!byTitle.has(norm(d.title))) byTitle.set(norm(d.title), d.path);
    const stem = stemOf(d.path);
    if (!byStem.has(stem)) byStem.set(stem, d.path);
  }
  const resolved = new Set<string>();
  for (const t of linkTitles) {
    const hit = byTitle.get(norm(t)) ?? byStem.get(norm(t)) ?? byStem.get(stemOf(t));
    if (hit) resolved.add(hit);
  }
  return [...resolved];
}
