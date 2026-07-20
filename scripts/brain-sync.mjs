// Urso Brain vault sync: walks the markdown vault (scripts/brain-sync.config.json),
// parses frontmatter with folder-based defaults, and hash-upserts into brain_docs
// via the service-role key. Re-run whenever the vault changes; unchanged docs are
// skipped. Docs that vanished from disk are reported (deleted with --prune).
//   Run:  node scripts/brain-sync.mjs [--prune] [--dry]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const PRUNE = process.argv.includes("--prune");
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

const docs = new Map(); // path -> row
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
    };
    row.content_hash = createHash("sha256")
      .update(JSON.stringify([row.title, row.description, row.department_id, row.project_id, row.doc_type, row.audience, row.tags, row.content]))
      .digest("hex");
    docs.set(relPath, row);
    count++;
  }
  console.log(`  ${root.dir || "."} → ${count} docs`);
}

// ---------- diff against the DB, upsert changed, report/prune deleted ----------

const { data: existing, error: readErr } = await supabase.from("brain_docs").select("path, content_hash");
if (readErr) {
  console.error(`✖ Could not read brain_docs: ${readErr.message}\n  (run supabase/migrations/0026_brain.sql first)`);
  process.exit(1);
}
const existingByPath = new Map((existing ?? []).map((r) => [r.path, r.content_hash]));

const changed = [...docs.values()].filter((d) => existingByPath.get(d.path) !== d.content_hash);
const gone = [...existingByPath.keys()].filter((p) => !docs.has(p));

console.log(`\n${docs.size} docs on disk · ${changed.length} new/changed · ${gone.length} in DB but not on disk`);
if (DRY) {
  for (const d of changed) console.log(`  ~ ${d.path}`);
  for (const p of gone) console.log(`  - ${p}`);
  process.exit(0);
}

const now = new Date().toISOString();
for (let i = 0; i < changed.length; i += 20) {
  const batch = changed.slice(i, i + 20).map((d) => ({ ...d, synced_at: now }));
  const { error } = await supabase.from("brain_docs").upsert(batch, { onConflict: "path" });
  if (error) {
    console.error(`✖ Upsert failed: ${error.message}`);
    process.exit(1);
  }
}
if (changed.length) console.log(`✓ Upserted ${changed.length} docs`);

if (gone.length) {
  if (PRUNE) {
    const { error } = await supabase.from("brain_docs").delete().in("path", gone);
    if (error) console.error(`✖ Prune failed: ${error.message}`);
    else console.log(`✓ Pruned ${gone.length} deleted docs`);
  } else {
    console.log(`⚠ ${gone.length} docs exist in the DB but not on disk (re-run with --prune to delete):`);
    for (const p of gone) console.log(`   - ${p}`);
  }
}
console.log("Done.");
