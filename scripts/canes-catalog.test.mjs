import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("canonical catalog retains history and service identity survives conversion and revisions", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const directory = resolve(import.meta.dirname, "../supabase/canes");
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const migration = "20261012161321_canes_service_catalog_identity.sql";
    for (const file of readdirSync(directory).filter(name => name.endsWith(".sql") && name < migration).sort()) await db.exec(readFileSync(resolve(directory, file), "utf8"));
    const historic = await scalar("insert into service_catalog(name,kind,default_price_cents) values ('Legacy special wash','service',12345) returning id");
    const estimate = await scalar("insert into estimates(number,estimate_type,public_token) values ('TEST-CATALOG','standard','catalog-test') returning id");
    const oldItem = await scalar("insert into estimate_items(estimate_id,catalog_id,name,kind,quantity,unit_price_cents,line_total_cents) values ($1,$2,'Original description','service',1,12345,12345) returning id", [estimate,historic]);
    await db.exec(readFileSync(resolve(directory, migration), "utf8"));
    assert.equal(await scalar("select count(*)::int from service_catalog where kind='service' and active"),6);
    assert.deepEqual((await db.query("select name,default_price_cents,active from service_catalog where id=$1",[historic])).rows[0], {name:"Legacy special wash",default_price_cents:12345,active:false});
    const old = (await db.query("select * from estimate_items where id=$1",[oldItem])).rows[0];
    assert.equal(old.name,"Original description"); assert.equal(old.service_category,null);
    const catalog = await scalar("select id from service_catalog where service_category='house_washing'");
    const item = await scalar("insert into estimate_items(estimate_id,catalog_id,name,kind,quantity,unit_price_cents,line_total_cents,position) values ($1,$2,'House Washing','service',1,30000,30000,1) returning id",[estimate,catalog]);
    const identity = await scalar("select service_line_id from estimate_items where id=$1",[item]);
    const job = await scalar("insert into jobs(estimate_id) values ($1) returning id",[estimate]);
    const jobItem = await scalar("insert into job_items(job_id,estimate_item_id,name,quantity,unit_price_cents,line_total_cents) values ($1,$2,'House Washing',1,30000,30000) returning id",[job,item]);
    const invoice = await scalar("insert into invoices(number,job_id,public_token) values ('TEST-CAT-INV',$1,'cat-inv') returning id",[job]);
    await db.query("insert into invoice_items(invoice_id,job_item_id,name,quantity,unit_price_cents,line_total_cents) values ($1,$2,'House Washing',1,30000,30000)",[invoice,jobItem]);
    assert.equal(await scalar("select service_line_id from invoice_items where invoice_id=$1",[invoice]),identity);
    assert.equal(await scalar("select service_category from invoice_items where invoice_id=$1",[invoice]),"house_washing");

    // Replacing a draft's rows must retain identity even for an older app payload.
    const revision = await scalar("select revision from estimates where id=$1",[estimate]);
    const lines = [old,{catalog_id:catalog,position:1,name:"House Washing",kind:"service",quantity:1,unit_price_cents:30000,line_total_cents:30000,discount_cents:0,discount_mode:"amount",discount_value:0,taxable:false,is_option:false,is_mandatory:false,is_selected:true}];
    assert.equal(await scalar("select replace_canes_estimate_items($1,$2,$3::jsonb)",[estimate,revision,JSON.stringify(lines)]),"saved");
    assert.equal(await scalar("select service_line_id from estimate_items where estimate_id=$1 and position=1",[estimate]),identity);
    assert.equal(await scalar("select service_line_id from estimate_items where estimate_id=$1 and position=0",[estimate]),old.service_line_id);

    const graph = await scalar("select canes_document_graph('estimate',$1)",[estimate]);
    const revised = [{service_line_id:identity,service_category:"house_washing",name:"House Washing — rear wall included",kind:"service",quantity:1,unit_price_cents:31000,line_total_cents:31000,discount_cents:0,discount_mode:"amount",discount_value:0,taxable:false}];
    const result = await scalar("select revise_canes_documents('estimate',$1,$2,$3::jsonb,'{}'::jsonb,'test','verbal')",[estimate,graph.fingerprint,JSON.stringify(revised)]);
    assert.equal(result.outcome,"saved");
    for (const [table,key,id] of [["estimate_items","estimate_id",estimate],["job_items","job_id",job],["invoice_items","invoice_id",invoice]]) {
      assert.equal(await scalar(`select service_line_id from ${table} where ${key}=$1`,[id]),identity);
      assert.equal(await scalar(`select service_category from ${table} where ${key}=$1`,[id]),"house_washing");
    }
    await assert.rejects(db.query("select normalize_canes_service_lines($1::jsonb,'[]')",[JSON.stringify(revised)]),/identity changed/);
    assert.equal(await scalar("select has_function_privilege('authenticated','normalize_canes_service_lines(jsonb,jsonb)','execute')"),false);
  } finally { await db.close(); }
});
