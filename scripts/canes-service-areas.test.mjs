import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(resolve(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, exports);
  return exports;
}
const areas = load("packages/types/src/service-areas.ts");

test("area weekdays use calendar dates with Sunday uncolored", () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, offset) => areas.serviceAreaForDate(`2026-10-${11 + offset}`)?.key ?? null),
    [null, "north", "north", "central", "central", "south", "south"]);
  for (const invalid of ["", "2026-02-30", "2026-13-01", "2026-1-2"]) assert.equal(areas.serviceAreaForDate(invalid), null);
});

test("schedule exceptions remain allowed and use the Eastern weekday", () => {
  assert.match(areas.serviceAreaScheduleNotice("north", "2026-10-12T00:30:00Z"), /Sunday/);
  assert.equal(areas.serviceAreaScheduleNotice("north", "2026-10-12T13:00:00Z"), null);
  assert.equal(areas.serviceAreaScheduleNotice(null, "2026-10-12T13:00:00Z"), null);
  assert.equal(areas.serviceAreaForDate("2026-11-01"), null);
  assert.equal(areas.serviceAreaForDate("2026-11-02").key, "north");
});

test("area mutations retain domain permissions and reject malformed values", async () => {
  let permissions = new Set(["estimates"]);
  const writes = [];
  const action = load("app/CanesPressure/area-actions.ts", {
    "@urso/types": areas,
    "next/cache": { revalidatePath() {} },
    "@/lib/canes/access": { denyUnlessPermitted: async (key) => permissions.has(key) ? null : { ok: false, notice: "Denied" } },
    "@/lib/canes/supabase": { canesConfigured: () => true, canesDb: () => ({ from: (table) => ({
      update: (patch) => ({ eq: (key, id) => ({ select: () => ({ maybeSingle: async () => {
        writes.push({ table, patch, key, id }); return { data: { id }, error: null };
      } }) }) }),
    }) }) },
  });
  assert.equal((await action.setDocumentServiceArea("job", "job-id", "north")).ok, false);
  assert.equal((await action.setDocumentServiceArea("plan", "plan-id", "north")).ok, false);
  assert.equal((await action.setDocumentServiceArea("estimate", "estimate-id", "elsewhere")).ok, false);
  assert.equal((await action.setDocumentServiceArea("__proto__", "id", "north")).ok, false);
  assert.equal(writes.length, 0);
  assert.equal((await action.setDocumentServiceArea("estimate", "estimate-id", null)).ok, true);
  assert.deepEqual(writes[0].patch, { service_area: null, service_area_selected: true });
  permissions = new Set(["estimates", "schedule"]);
  assert.equal((await action.setDocumentServiceArea("plan", "plan-id", "south")).ok, true);
  assert.equal(writes[1].table, "recurring_plans");
});

test("area migration preserves history and inherits across converted documents", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const files = readdirSync(resolve(root, "supabase/canes")).filter((name) => name.endsWith(".sql")).sort();
    const areaMigration = files.find((name) => name.endsWith("_canes_service_areas.sql"));
    for (const file of files.filter((name) => name !== areaMigration)) await db.exec(readFileSync(resolve(root, "supabase/canes", file), "utf8"));
    const old = await scalar("insert into estimates(number,estimate_type,public_token) values ('EST-AREA-OLD','standard','area-old-token') returning id");
    await db.exec(readFileSync(resolve(root, "supabase/canes", areaMigration), "utf8"));
    assert.equal(await scalar("select service_area from estimates where id=$1", [old]), null);
    const estimate = await scalar("insert into estimates(number,estimate_type,service_area,service_area_selected,public_token) values ('EST-AREA','standard','north',true,'area-estimate-token') returning id");
    const job = await scalar("insert into jobs(estimate_id) values ($1) returning id", [estimate]);
    assert.equal(await scalar("select service_area from jobs where id=$1", [job]), "north");
    const invoice = await scalar("insert into invoices(number,job_id,public_token) values ('INV-AREA',$1,'area-invoice-token') returning id", [job]);
    assert.equal(await scalar("select service_area from invoices where id=$1", [invoice]), "north");
    const plan = await scalar("insert into recurring_plans(number,source_invoice_id,cadence,price_per_visit_cents,starts_on,public_token) values ('PLAN-AREA',$1,'quarterly',10000,'2027-01-10','area-plan-token') returning id", [invoice]);
    assert.equal(await scalar("select service_area from recurring_plans where id=$1", [plan]), "north");
    const visit = await scalar("insert into jobs(plan_id) values ($1) returning id", [plan]);
    assert.equal(await scalar("select service_area from jobs where id=$1", [visit]), "north");
    const explicitNone = await scalar("insert into jobs(plan_id,service_area_selected) values ($1,true) returning id", [plan]);
    assert.equal(await scalar("select service_area from jobs where id=$1", [explicitNone]), null);
    const noneInvoice = await scalar("insert into invoices(number,job_id,estimate_id,public_token) values ('INV-NONE',$1,$2,'area-none-invoice-token') returning id", [explicitNone, estimate]);
    assert.equal(await scalar("select service_area from invoices where id=$1", [noneInvoice]), null);
    await db.query("update jobs set notes='old client edit' where id=$1", [job]);
    assert.equal(await scalar("select service_area from jobs where id=$1", [job]), "north");
    await db.query("update estimates set service_area='south' where id=$1", [estimate]);
    assert.equal(await scalar("select service_area from jobs where id=$1", [job]), "north");
    assert.equal(await scalar("select service_area from invoices where id=$1", [invoice]), "north");
    await assert.rejects(db.query("update jobs set service_area='unknown' where id=$1", [job]));
    for (const role of ["anon", "authenticated"]) assert.equal(await scalar("select has_function_privilege($1,'public.inherit_canes_service_area()','execute')", [role]), false);
    await db.exec(readFileSync(resolve(root, "supabase/canes", areaMigration), "utf8"));
    assert.equal(await scalar("select service_area from jobs where id=$1", [job]), "north");
  } finally { await db.close(); }
});
