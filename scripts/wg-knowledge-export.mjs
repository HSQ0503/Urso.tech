// Woof Gang knowledge export — turns the Brain corpus into the app's
// lib/ai/business-sections.generated.ts (the BUSINESS_SECTIONS the dashboard
// analyst looks up). The corpus lives in the vault folder
// "08 - Woof Gang Client Corpus" and syncs to Brain org 'woof-gang' via
// scripts/brain-sync.mjs --config=scripts/brain-sync.woof-gang.config.json.
//
// CONTRACT (corpus file → section):
//   key     = filename minus .md          (e.g. grooming-engine.md → "grooming-engine")
//   title   = frontmatter `title`
//   summary = frontmatter `description`
//   body    = markdown body after the frontmatter block, trimmed
//             (identical to how brain-sync.mjs builds brain_docs.content)
//
// Sources:
//   default       Urso HQ DB — brain_docs where organization_id='woof-gang',
//                 live (deleted_at null), doc_type='doc', path under the corpus
//                 folder. Falls back to the vault (with a warning) when the DB
//                 is unreachable or the org/docs don't exist yet.
//   --from-vault  read the corpus folder's markdown directly — works before
//                 the woof-gang org migrations are applied.
//
//   Run:  node scripts/wg-knowledge-export.mjs [--from-vault]
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FROM_VAULT = process.argv.includes("--from-vault");

const wgConfig = JSON.parse(
  readFileSync(new URL("./brain-sync.woof-gang.config.json", import.meta.url), "utf8"),
);
const CORPUS_ROOT = wgConfig.roots[0]; // { dir, department, exclude }
const CORPUS_DIR = join(wgConfig.vaultRoot, CORPUS_ROOT.dir);
const CORPUS_PREFIX = `${CORPUS_ROOT.dir}/`;
const ORGANIZATION_ID = wgConfig.organizationId;
const OUT_FILE = fileURLToPath(new URL("../lib/ai/business-sections.generated.ts", import.meta.url));

// Section order = the order of BUSINESS_SECTIONS in lib/ai/business.ts at seed
// time. The vault has no inherent order, so this array is the order of record;
// keys not listed here (new sections) append alphabetically after.
const KEY_ORDER = [
  "stores-and-org",
  "grooming-engine",
  "retail-strategy",
  "customer-and-dog",
  "groomer-economics",
  "booking-paths",
  "visit-flow",
  "pricing",
  "differentiation",
  "operations",
  "cost-and-profitability",
];

// ── Transient-metric lint ────────────────────────────────────────────────────
// The corpus must carry judgment, not measurements — numbers come from tools.
// Fail if a metric-vocabulary word sits within 40 chars of a digit, unless the
// exact line is in the ALLOWLIST below. The allowlist is the honest ledger of
// every number that lives in the corpus: durable structural constants
// grandfathered verbatim at seed time (2026-07-30), NOT measured values.
const ALLOWLIST = [
  // groomer-economics — the 50%/55% commission split is the deal structure, not a metric reading.
  "Groomers generally receive 50% of the grooming revenue from the grooms they perform. ONE exception: a groomer at Winter Park who is also a manager receives 55%, because of her management role.",
  // cost-and-profitability — durable cost-shape constants (~40%+ payroll share, ~50–55% commission), not month measurements.
  "Cost shape (typical month, varies by store): PAYROLL is the dominant line (often ~40%+ of revenue) — mostly groomer commission (~50–55%), so it scales with grooming volume. Then COST OF GOODS (retail merchandise + grooming supplies), RENT, FRANCHISE ROYALTY (a percentage of sales the franchisor takes), merchant/card fees, store supplies, utilities, insurance, repairs.",
];

const VOCAB =
  /\b(?:bookings?|return rates?|retail attach|(?:avg|average) visits?|(?:avg|average) tickets?|LTV|revenue|net profit|margins?)\b/gi;

function lintBody(key, body) {
  const bad = [];
  for (const line of body.split("\n")) {
    if (ALLOWLIST.includes(line)) continue;
    const digits = [...line.matchAll(/[0-9]/g)].map((m) => m.index);
    if (!digits.length) continue;
    for (const m of line.matchAll(VOCAB)) {
      const near = digits.some((d) => d >= m.index - 40 && d <= m.index + m[0].length + 40);
      if (near) {
        bad.push({ key, word: m[0], line });
        break;
      }
    }
  }
  return bad;
}

// ── Frontmatter parser — replica of scripts/brain-sync.mjs (keep in step) ────

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

const keyOf = (path) => path.split("/").pop().replace(/\.md$/i, "");

// ── Sources ──────────────────────────────────────────────────────────────────

function readFromVault() {
  if (!existsSync(CORPUS_DIR)) {
    console.error(`✖ Corpus folder not found: ${CORPUS_DIR}`);
    process.exit(1);
  }
  const excluded = CORPUS_ROOT.exclude ?? [];
  const sections = [];
  for (const name of readdirSync(CORPUS_DIR).sort()) {
    if (!/\.md$/i.test(name)) continue;
    if (excluded.some((e) => name.startsWith(e))) continue;
    const { meta, body } = parseFrontmatter(readFileSync(join(CORPUS_DIR, name), "utf8"));
    sections.push({
      key: keyOf(name),
      title: meta.title ?? "",
      summary: meta.description ?? "",
      body: body.trim(),
    });
  }
  return sections;
}

async function readFromDb() {
  // Load env with no dependency, exactly like brain-sync.mjs (.env.local wins).
  for (const file of ["../.env", "../.env.local"]) {
    try {
      const env = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const line of env.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    } catch {}
  }
  const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
  const key = process.env.URSO_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("brain_docs")
    .select("path, title, description, content")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("doc_type", "doc")
    .is("deleted_at", null)
    .like("path", `${CORPUS_PREFIX}%`);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`no live docs under "${CORPUS_PREFIX}" for org '${ORGANIZATION_ID}'`);
  return data.map((r) => ({
    key: keyOf(r.path),
    title: r.title ?? "",
    summary: r.description ?? "",
    body: (r.content ?? "").trim(),
  }));
}

let sections;
let source;
if (FROM_VAULT) {
  sections = readFromVault();
  source = "vault";
} else {
  try {
    sections = await readFromDb();
    source = `Brain org '${ORGANIZATION_ID}'`;
  } catch (err) {
    console.warn(`⚠ Brain DB unavailable (${err.message}) — falling back to the vault corpus.`);
    sections = readFromVault();
    source = "vault (DB fallback)";
  }
}

// ── Order, then guard ────────────────────────────────────────────────────────

const rank = new Map(KEY_ORDER.map((k, i) => [k, i]));
sections.sort((a, b) => {
  const ra = rank.get(a.key) ?? Infinity;
  const rb = rank.get(b.key) ?? Infinity;
  if (ra !== rb) return ra - rb;
  return a.key.localeCompare(b.key); // unknown new keys: alphabetical, after known
});

for (const s of sections) {
  if (!s.key || !s.title || !s.summary || !s.body) {
    console.error(`✖ Section "${s.key || "?"}" is missing a field (title/description frontmatter or body).`);
    process.exit(1);
  }
}
const dupes = sections.map((s) => s.key).filter((k, i, all) => all.indexOf(k) !== i);
if (dupes.length) {
  console.error(`✖ Duplicate section keys: ${[...new Set(dupes)].join(", ")}`);
  process.exit(1);
}

// Completeness: a soft-deleted or re-typed corpus doc must fail the export
// loudly — a silently thinner snapshot would change the analyst's prompts
// without anyone deciding that. Removing a section on purpose means editing
// KEY_ORDER in the same change.
const have = new Set(sections.map((s) => s.key));
const gone = KEY_ORDER.filter((k) => !have.has(k));
if (gone.length) {
  console.error(`✖ Expected section(s) missing from the corpus: ${gone.join(", ")}`);
  console.error("  (soft-deleted or re-typed in the Brain? removed from the vault? If intentional, update KEY_ORDER.)");
  process.exit(1);
}

const totalBodyChars = sections.reduce((n, s) => n + s.body.length, 0);
const approxTokens = Math.ceil(totalBodyChars / 4);
if (approxTokens > 6000) {
  console.error(`✖ Corpus too large: ~${approxTokens} tokens of body (limit 6000). Trim sections — never truncate.`);
  process.exit(1);
}

const lintHits = sections.flatMap((s) => lintBody(s.key, s.body));
if (lintHits.length) {
  console.error("✖ Transient-metric lint: metric vocabulary next to a number. Measured values must NEVER live in the corpus.");
  console.error("  If a line is a durable constant (a deal term, not a reading), add it VERBATIM to ALLOWLIST in this script.");
  for (const h of lintHits) console.error(`  [${h.key}] near "${h.word}": ${h.line}`);
  process.exit(1);
}

// ── Emit ─────────────────────────────────────────────────────────────────────

const lines = [
  "// GENERATED by scripts/wg-knowledge-export.mjs — DO NOT EDIT. Source: Woof Gang Brain corpus (vault 08 folder / Brain org woof-gang).",
  "// Shape mirrors BusinessSection in ./business.ts, declared structurally because business.ts imports this file.",
  "export const GENERATED_BUSINESS_SECTIONS: { key: string; title: string; summary: string; body: string }[] = [",
];
for (const s of sections) {
  lines.push(
    "  {",
    `    key: ${JSON.stringify(s.key)},`,
    `    title: ${JSON.stringify(s.title)},`,
    `    summary: ${JSON.stringify(s.summary)},`,
    `    body: ${JSON.stringify(s.body)},`,
    "  },",
  );
}
lines.push("];", "");

writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
console.log(
  `✓ Wrote ${sections.length} sections (~${approxTokens} tokens of body) from ${source} → lib/ai/business-sections.generated.ts`,
);
console.log(`  order: ${sections.map((s) => s.key).join(", ")}`);
