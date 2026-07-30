// Hosts lint for the AI layer. Static scan, no network.
//
// lib/ai/* and app/api/ai/* run against the WOOF GANG project and may reach the
// Urso HQ Brain ONLY through lib/ai/brain-bridge.ts:
//   - DEFAULT_BRAIN_ORGANIZATION_ID is banned everywhere in scope, INCLUDING
//     the bridge — the Brain org for this layer is the literal 'woof-gang',
//     never the app-wide default ('urso').
//   - lib/brain/supabase-client is the BROWSER client; server AI code must not
//     import it.
//   - No hand-rolled Urso HQ clients (NEXT_PUBLIC_URSO_* env) — the sanctioned
//     client is ursoDb from lib/brain/supabase, and only the bridge may import
//     from lib/brain at all.
//   - CANES_ env is a different tenant entirely.
//
//   Run:  node scripts/check-brain-hosts.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["lib/ai", "app/api/ai"];
const BRIDGE = "lib/ai/brain-bridge.ts";

const RULES = [
  { re: /DEFAULT_BRAIN_ORGANIZATION_ID/, bridgeExempt: false, why: "org must be the literal 'woof-gang', not the app-wide default" },
  { re: /lib\/brain\/supabase-client/, bridgeExempt: false, why: "browser Brain client in server AI code" },
  { re: /NEXT_PUBLIC_URSO_/, bridgeExempt: false, why: "hand-rolled Urso HQ client — the bridge imports ursoDb from '@/lib/brain/supabase' instead" },
  { re: /\bCANES_/, bridgeExempt: false, why: "Canes env in the AI layer (wrong tenant)" },
  { re: /from\s+["'](?:[^"']*lib\/brain\/|\.\.\/brain\/)/, bridgeExempt: true, why: "only lib/ai/brain-bridge.ts may import from lib/brain" },
];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

const hits = [];
let scanned = 0;
for (const dir of SCAN_DIRS) {
  for (const abs of walk(join(ROOT, dir))) {
    scanned++;
    const rel = abs.startsWith(ROOT) ? abs.slice(ROOT.length) : abs;
    const isBridge = rel === BRIDGE;
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const rule of RULES) {
        if (rule.bridgeExempt && isBridge) continue;
        if (rule.re.test(text)) hits.push({ rel, line: i + 1, text: text.trim(), why: rule.why });
      }
    });
  }
}

if (hits.length) {
  console.error(`\n✖ Brain hosts lint — ${hits.length} violation(s) in ${scanned} files:\n`);
  for (const h of hits) console.error(`  ${h.rel}:${h.line}  ${h.why}\n      ${h.text.slice(0, 120)}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ Brain hosts lint clean (${scanned} files scanned in ${SCAN_DIRS.join(", ")}).\n`);
