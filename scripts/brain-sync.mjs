// Urso Brain vault sync — the two-way bridge between the Obsidian markdown
// vault on disk and brain_docs in the Urso HQ Supabase project.
//
// Ownership model (brain_docs.origin):
//   'vault'  disk owns it  → sync hash-upserts it, extracts [[wikilinks]] into
//            the `links` graph column, prunes it (with --prune) when the file
//            is gone
//   'brain'  the AI wrote/edited it in the app → the DB owns it; sync NEVER
//            overwrites it. `--export` writes it back to the vault folder
//            (with frontmatter) and flips it to 'vault' so Obsidian shows it.
// Soft-deleted docs (deleted_at) are skipped and reported — the disk file, if
// any, is never touched.
//
//   Run:  node scripts/brain-sync.mjs [--prune] [--export] [--dry]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load env with no dependency (this repo keeps keys in .env; .env.local wins).
for (const file of ["../.env", "../.env.local"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

// The DEDICATED Urso HQ project — never the Woof Gang or Canes keys.
const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const key = process.env.URSO_SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const PRUNE = process.argv.includes("--prune");
const EXPORT = process.argv.includes("--export");
const DRY = process.argv.includes("--dry");

const config = JSON.parse(readFileSync(new URL("./brain-sync.config.json", import.meta.url), "utf8"));
const VAULT = config.vaultRoot;

// ---------- frontmatter + markdown helpers ----------

const asList = (v) =>
  Array.isArray(v)
    ? v.map(String)
    : String(v ?? "")
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };
  const meta = {};
  for (const line of raw.slice(3, end).split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  return { meta, body: raw.slice(end + 4).replace(/^\r?\n/, "") };
}

const stripMd = (s) =>
  s
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function deriveTitle(body, filename) {
  const h1 = body.match(/^#\s+(.+)$/m);
  return h1 ? stripMd(h1[1]) : filename.replace(/\.md$/i, "");
}

function deriveDescription(body) {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("---") || t.startsWith("|") || t.startsWith("```")) continue;
    const clean = stripMd(t.replace(/^>+\s*/, "").replace(/^[-*]\s+/, ""));
    if (clean.length > 20) return clean.slice(0, 180);
  }
  return "";
}

// ---------- wikilink graph (mirror of lib/brain/links.ts — keep in step) ----------

function extractWikilinks(content) {
  const out = new Set();
  for (const m of content.matchAll(/(?<!\!)\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|[^\][]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t) out.add(t);
  }
  return [...out];
}

const norm = (s) => s.toLowerCase().trim();
const stemOf = (path) => norm((path.split("/").pop() ?? path).replace(/\.md$/i, ""));

function makeResolver(targets) {
  const byTitle = new Map();
  const byStem = new Map();
  for (const t of targets) {
    if (!byTitle.has(norm(t.title))) byTitle.set(norm(t.title), t.path);
    if (!byStem.has(stemOf(t.path))) byStem.set(stemOf(t.path), t.path);
  }
  return (titles) => {
    const resolved = new Set();
    for (const t of titles) {
      // Third fallback handles path-style links ([[Folder/Sub/Doc]]) via the
      // link's own last segment. Keep in step with lib/brain/links.ts.
      const hit = byTitle.get(norm(t)) ?? byStem.get(norm(t)) ?? byStem.get(stemOf(t));
      if (hit) resolved.add(hit);
    }
    return [...resolved].sort();
  };
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

// ---------- walk the configured roots ----------

function* mdFiles(dir, recursive) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!recursive) continue;
      if (/^documents$/i.test(name) || name.startsWith(".") || name === "_Inbox") continue;
      yield* mdFiles(full, true);
    } else if (/\.md$/i.test(name)) {
      yield full;
    }
  }
}

const disk = new Map(); // path -> row (links resolved later)
for (const root of config.roots) {
  const dir = join(VAULT, root.dir);
  const excluded = (root.exclude ?? []).map((e) => join(dir, e));
  let count = 0;
  for (const file of mdFiles(dir, root.recursive !== false)) {
    if (excluded.some((e) => file.startsWith(e))) continue;
    const raw = readFileSync(file, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const relPath = relative(VAULT, file).replaceAll("\\", "/");
    const filename = relPath.split("/").pop();

    const doc_type = ["core", "doc", "rule"].includes(meta.type) ? meta.type : root.type ?? "doc";
    const project = meta.project === "none" ? null : meta.project || root.project || null;
    const department = meta.department === "none" ? null : meta.department || root.department || null;
    const row = {
      path: relPath,
      title: meta.title || deriveTitle(body, filename),
      description: meta.description || deriveDescription(body),
      department_id: department,
      project_id: project,
      doc_type,
      audience: doc_type === "rule" ? (asList(meta.audience).length ? asList(meta.audience) : ["all"]) : [],
      tags: asList(meta.tags),
      content: body.trim(),
      origin: "vault",
    };
    row.content_hash = createHash("sha256")
      .update(JSON.stringify([row.title, row.description, row.department_id, row.project_id, row.doc_type, row.audience, row.tags, row.content]))
      .digest("hex");
    disk.set(relPath, row);
    count++;
  }
  console.log(`  ${root.dir || "."} → ${count} docs`);
}

// ---------- read DB state ----------

const { data: existing, error: readErr } = await supabase
  .from("brain_docs")
  .select("path, title, content_hash, links, origin, deleted_at");
if (readErr) {
  console.error(`✖ Could not read brain_docs: ${readErr.message}\n  (run supabase/urso/0001_brain.sql in the URSO HQ project's SQL editor first)`);
  process.exit(1);
}
const db = new Map((existing ?? []).map((r) => [r.path, r]));

// Link targets: everything that will exist after this sync — all disk docs plus
// live brain-origin DB docs (AI-created, possibly not on disk yet).
const targets = [
  ...[...disk.values()].map((d) => ({ path: d.path, title: d.title })),
  ...(existing ?? []).filter((r) => r.origin === "brain" && !r.deleted_at).map((r) => ({ path: r.path, title: r.title })),
];
const resolve = makeResolver(targets);
for (const row of disk.values()) row.links = resolve(extractWikilinks(row.content));

// ---------- partition ----------

const toUpsert = [];
const diverged = []; // on disk, but the brain's copy is newer (origin='brain')
const deletedInBrain = []; // on disk, but soft-deleted in the brain
for (const row of disk.values()) {
  const cur = db.get(row.path);
  if (!cur) { toUpsert.push(row); continue; }
  if (cur.deleted_at) { deletedInBrain.push(row.path); continue; }
  if (cur.origin === "brain") { diverged.push(row.path); continue; }
  if (cur.content_hash !== row.content_hash || !sameSet(cur.links ?? [], row.links)) toUpsert.push(row);
}
const gone = (existing ?? []).filter((r) => r.origin === "vault" && !r.deleted_at && !disk.has(r.path)).map((r) => r.path);
const brainDocs = (existing ?? []).filter((r) => r.origin === "brain" && !r.deleted_at);

console.log(`\n${disk.size} docs on disk · ${toUpsert.length} new/changed · ${diverged.length} brain-newer · ${brainDocs.length} brain-origin in DB · ${gone.length} vault docs missing on disk`);
if (DRY) {
  for (const d of toUpsert) console.log(`  ~ ${d.path}`);
  for (const p of diverged) console.log(`  ⚠ diverged (brain newer): ${p}`);
  for (const p of gone) console.log(`  - ${p}`);
  process.exit(0);
}

// ---------- upsert vault-owned rows ----------

const now = new Date().toISOString();
for (let i = 0; i < toUpsert.length; i += 20) {
  const batch = toUpsert.slice(i, i + 20).map((d) => ({ ...d, synced_at: now }));
  const { error } = await supabase.from("brain_docs").upsert(batch, { onConflict: "path" });
  if (error) {
    console.error(`✖ Upsert failed: ${error.message}`);
    process.exit(1);
  }
}
if (toUpsert.length) console.log(`✓ Upserted ${toUpsert.length} docs`);

// ---------- export brain-owned rows back to the vault (two-way bridge) ----------

if (EXPORT && brainDocs.length) {
  const { data: fullRows, error } = await supabase
    .from("brain_docs")
    .select("path, title, description, department_id, project_id, doc_type, audience, tags, content")
    .in("path", brainDocs.map((r) => r.path));
  if (error) {
    console.error(`✖ Export read failed: ${error.message}`);
  } else {
    for (const r of fullRows ?? []) {
      const fm = ["---", `title: ${r.title}`];
      if (r.description) fm.push(`description: ${r.description}`);
      if (r.doc_type !== "doc") fm.push(`type: ${r.doc_type}`);
      if (r.department_id) fm.push(`department: ${r.department_id}`);
      if (r.project_id) fm.push(`project: ${r.project_id}`);
      if (r.doc_type === "rule" && r.audience?.length) fm.push(`audience: [${r.audience.join(", ")}]`);
      if (r.tags?.length) fm.push(`tags: [${r.tags.join(", ")}]`);
      fm.push("---", "");
      const file = join(VAULT, r.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, fm.join("\n") + r.content + "\n", "utf8");
      console.log(`  ⇩ exported ${r.path}`);
    }
    // Disk now mirrors the DB — hand ownership back to the vault.
    const { error: flipErr } = await supabase
      .from("brain_docs")
      .update({ origin: "vault", synced_at: now })
      .in("path", (fullRows ?? []).map((r) => r.path));
    if (flipErr) console.error(`✖ Origin flip failed: ${flipErr.message}`);
    else console.log(`✓ Exported ${fullRows?.length ?? 0} brain docs to the vault (now vault-owned)`);
  }
} else if (brainDocs.length) {
  console.log(`ℹ ${brainDocs.length} brain-origin docs live only in the DB — run with --export to write them into the vault:`);
  for (const r of brainDocs) console.log(`   ⇩ ${r.path}`);
}

if (diverged.length && !EXPORT) {
  console.log(`⚠ ${diverged.length} docs are NEWER in the brain than on disk (AI-edited) — sync left them alone; --export writes them back:`);
  for (const p of diverged) console.log(`   ⚠ ${p}`);
}
if (deletedInBrain.length) {
  console.log(`ℹ ${deletedInBrain.length} docs are deleted in the brain but still on disk (files untouched):`);
  for (const p of deletedInBrain) console.log(`   ∅ ${p}`);
}

// ---------- prune vault-owned rows whose files are gone ----------

if (gone.length) {
  if (PRUNE) {
    const { error } = await supabase.from("brain_docs").delete().in("path", gone);
    if (error) console.error(`✖ Prune failed: ${error.message}`);
    else console.log(`✓ Pruned ${gone.length} deleted docs`);
  } else {
    console.log(`⚠ ${gone.length} vault docs exist in the DB but not on disk (re-run with --prune to delete):`);
    for (const p of gone) console.log(`   - ${p}`);
  }
}
console.log("Done.");
