// Isolation gate for the Woof Gang tenant inside the Urso HQ Brain. READ-ONLY.
//
// The WG corpus must live strictly inside organization 'woof-gang':
//   (a) zero brain_docs path overlap with org 'urso'
//   (b) every wg:-namespaced twin membership belongs to 'woof-gang' only
//   (c) the org exists and has at least one department
//   (d) no WG doc rides the always-on 'core' path (company-core is per-org, but
//       the WG sections are deliberately doc_type='doc' so they can never leak
//       into org urso's always-loaded context)
//   (e) the proposals API refuses anonymous reads for the WG org
//
//   Run:  node scripts/brain-wg-isolation.mjs
import { readFileSync } from "node:fs";

// Load .env.local (then .env) with no dependency, like the other scripts.
for (const file of ["../.env.local", "../.env"]) {
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
  console.error("✖ Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

// Page through a REST select (Supabase caps any response at 1,000 rows).
async function allRows(pathAndQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}&limit=1000&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

const checks = []; // { name, ok: true | false | "skip", detail }
async function check(name, fn) {
  try {
    checks.push({ name, ...(await fn()) });
  } catch (e) {
    checks.push({ name, ok: false, detail: e.message });
  }
}

await check("(a) no brain_docs path overlap urso ↔ woof-gang", async () => {
  const urso = await allRows("brain_docs?select=path&organization_id=eq.urso");
  const wg = await allRows("brain_docs?select=path&organization_id=eq.woof-gang");
  const ursoSet = new Set(urso.map((r) => r.path));
  const overlap = wg.map((r) => r.path).filter((p) => ursoSet.has(p));
  const detail = `urso ${urso.length} docs, woof-gang ${wg.length} docs, overlap ${overlap.length}`;
  return overlap.length
    ? { ok: false, detail: `${detail} — ${overlap.slice(0, 5).join(", ")}${overlap.length > 5 ? ", …" : ""}` }
    : { ok: true, detail };
});

await check("(b) wg:-twin memberships stay inside woof-gang", async () => {
  const rows = await allRows("brain_memberships?select=user_id,organization_id&user_id=like.wg:*");
  const strays = rows.filter((r) => r.organization_id !== "woof-gang");
  return strays.length
    ? { ok: false, detail: `${strays.length} of ${rows.length} wg: memberships in other orgs: ${strays.slice(0, 5).map((s) => `${s.user_id}→${s.organization_id}`).join(", ")}` }
    : { ok: true, detail: `${rows.length} wg: memberships, all in woof-gang` };
});

await check("(c) org 'woof-gang' exists with ≥1 department", async () => {
  const org = await allRows("brain_organizations?select=id&id=eq.woof-gang");
  if (!org.length) return { ok: false, detail: "org 'woof-gang' not found — apply supabase/urso/0010" };
  const depts = await allRows("brain_departments?select=id&organization_id=eq.woof-gang");
  return depts.length
    ? { ok: true, detail: `departments: ${depts.map((d) => d.id).join(", ")}` }
    : { ok: false, detail: "org exists but has zero departments" };
});

await check("(d) no woof-gang doc on the always-on 'core' path", async () => {
  const core = await allRows("brain_docs?select=path&organization_id=eq.woof-gang&doc_type=eq.core&deleted_at=is.null");
  return core.length
    ? { ok: false, detail: `${core.length} core docs: ${core.slice(0, 5).map((r) => r.path).join(", ")}` }
    : { ok: true, detail: "0 core docs (WG sections are doc_type='doc')" };
});

await check("(e) anonymous /api/brain/proposals?org=woof-gang is rejected", async () => {
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (!app) return { ok: "skip", detail: "NEXT_PUBLIC_APP_URL not set" };
  let res;
  try {
    res = await fetch(`${app.replace(/\/$/, "")}/api/brain/proposals?org=woof-gang`, { redirect: "manual" });
  } catch (e) {
    return { ok: "skip", detail: `app unreachable at ${app} (${e.cause?.code ?? e.message})` };
  }
  return res.status === 401
    ? { ok: true, detail: "401 as expected" }
    : { ok: false, detail: `expected 401, got ${res.status}` };
});

console.log("\nBrain WG isolation gate:\n");
let anyFail = false;
for (const c of checks) {
  const mark = c.ok === true ? "✓" : c.ok === "skip" ? "○" : "✖";
  if (c.ok === false) anyFail = true;
  console.log(`  ${mark} ${c.name}\n      ${c.detail}`);
}
console.log(anyFail ? "\n✖ Isolation gate FAILED.\n" : "\n✓ Isolation gate passed.\n");
process.exit(anyFail ? 1 : 0);
