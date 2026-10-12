import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync,readdirSync } from "node:fs";
import { resolve,dirname } from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname,"..");
function load(file,mocks={}) {
  const exports={};
  const code=ts.transpileModule(readFileSync(resolve(root,file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","exports",code)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith(".")) return load(resolve(dirname(resolve(root,file)),`${name}.ts`),mocks);
    throw new Error(`Unexpected import ${name}`);
  },exports); return exports;
}
const shared={...load("packages/types/src/money.ts"),...load("packages/types/src/service-categories.ts")};
const { buildMoneyReport }=load("lib/canes/money.ts",{"@urso/types":shared,"./supabase":{},"./data":{},"./payouts":{},"./fixtures":{}});
const empty=()=>({jobs:[],invoices:[],invoiceItems:[],jobItems:[],payments:[],refunds:[],costs:[],expenses:[],channels:[],workers:[],rates:[],earnings:[],allocations:[],time:[],accounts:[],upsells:[]});
const report=(source,month)=>buildMoneyReport(source,"month",`2026-${month}-01T04:00:00.000Z`,`2026-${String(Number(month)+1).padStart(2,"0")}-01T04:00:00.000Z`,"2026-10-12T16:00:00.000Z");

test("cent allocations conserve positive and negative movements with deterministic ties",()=>{
  for (const amount of [-2147483647,-101,-1,0,1,101,2147483647]) {
    const weights=[{id:"c",weight:2147483647},{id:"a",weight:2147483647},{id:"b",weight:2147483647}];
    const a=shared.allocateCents(amount,weights),b=shared.allocateCents(amount,[...weights].reverse());
    assert.equal([...a.values()].reduce((sum,cents)=>sum+cents,0),amount);
    assert.deepEqual(a,b);
  }
  assert.equal(shared.csvCell("=HYPERLINK(\"bad\")"),'"\'=HYPERLINK(""bad"")"');
});

test("deposits and balance payments do not repeat job costs across periods",()=>{
  const source=empty();
  source.jobs=[{id:"j",created_at:"2026-08-01T10:00:00.000Z",status:"paid",service_completed_on:"2026-09-10",total_cents:303,marketing_channel_id:"meta"}];
  source.invoices=[{id:"i",job_id:"j",total_cents:303,tax_cents:0,status:"paid",marketing_channel_id:"meta"}];
  source.invoiceItems=[{id:"a",invoice_id:"i",service_category:"house_washing",line_total_cents:101},{id:"b",invoice_id:"i",service_category:"window_cleaning",line_total_cents:202}];
  source.payments=[{id:"deposit",invoice_id:"i",job_id:"j",amount_cents:100,created_at:"2026-08-02T10:00:00.000Z",method:"card"},{id:"balance",invoice_id:"i",job_id:"j",amount_cents:203,created_at:"2026-09-10T10:00:00.000Z",method:"card"}];
  source.costs=[{id:"cost",job_id:"j",amount_cents:60,category:"Materials",paid_on:"2026-09-09"}];
  source.channels=[{id:"meta",name:"Meta ads",active:true}];
  const august=report(source,"08"),september=report(source,"09");
  assert.equal(august.cash.collectedCents,100);assert.equal(september.cash.collectedCents,203);
  assert.equal(august.services.reduce((sum,row)=>sum+row.costCents,0),0);
  assert.equal(september.services.reduce((sum,row)=>sum+row.costCents,0),60);
  assert.equal(september.services.find(row=>row.key==="house_washing").allocatedCostCents,20);
  assert.equal(september.marketing.find(row=>row.id==="meta").roas,null);
});

test("refunds reduce collections while historical payroll stays distinct from approved earnings",()=>{
  const source=empty();source.payments=[{id:"p",amount_cents:1000,created_at:"2026-08-03T10:00:00.000Z",method:"other",method_detail:"zelle"}];
  source.refunds=[{id:"r",payment_id:"p",amount_cents:200,created_at:"2026-09-03T10:00:00.000Z"}];
  source.workers=[{id:"w",name:"Worker",role:"worker"}];source.earnings=[{id:"e",employee_id:"w",earned_on:"2026-09-01",amount_cents:600,minutes:60}];
  source.expenses=[{id:"old",employee_id:"w",amount_cents:1000,incurred_on:"2026-08-01",category:"Labor",active:true},{id:"new",employee_id:"w",amount_cents:300,incurred_on:"2026-09-01",category:"Labor",active:true}];
  source.allocations=[{expense_id:"new",earning_id:"e",amount_cents:300}];
  const result=report(source,"09");assert.equal(result.cash.collectedCents,-200);assert.equal(result.cash.spentCents,300);
  assert.equal(result.workers[0].unpaidCents,300);assert.equal(result.workers[0].unallocatedPaidCents,1000);assert.equal(result.payments[0].method,"zelle");
});

test("worker approval, rate snapshots, payouts, and marketing writes are transactional",async()=>{
  const db=new PGlite({extensions:{pgcrypto}}),scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const directory=resolve(root,"supabase/canes");for(const file of readdirSync(directory).filter(file=>file.endsWith(".sql")).sort())await db.exec(readFileSync(resolve(directory,file),"utf8"));
    const worker=await scalar("insert into team_members(name,role) values ('Ledger test','worker') returning id");
    const job=await scalar("insert into jobs(job_name) values ('Test work') returning id");
    await assert.rejects(db.query("select approve_canes_worker_time($1,$2,'2026-01-01',90,null,'Actual hours','owner','wage-key-001')",[worker,job]),/Set a rate/);
    await db.query("insert into canes_worker_rates(employee_id,effective_on,hourly_cents,created_by) values ($1,'2026-01-01',2000,'owner')",[worker]);
    const earning=await scalar("select approve_canes_worker_time($1,$2,'2026-01-01',90,null,'Actual hours','owner','wage-key-001')",[worker,job]);
    assert.equal(await scalar("select amount_cents from canes_worker_earnings where id=$1",[earning]),3000);
    assert.equal(await scalar("select approve_canes_worker_time($1,$2,'2026-01-01',90,null,'Actual hours','owner','wage-key-001')",[worker,job]),earning);
    await assert.rejects(db.query("select approve_canes_worker_time($1,$2,'2026-01-01',120,null,'Actual hours','owner','wage-key-001')",[worker,job]),/different hours/);
    await db.query("insert into canes_worker_rates(employee_id,effective_on,hourly_cents,created_by) values ($1,'2026-02-01',2500,'owner')",[worker]);
    assert.equal(await scalar("select hourly_cents from canes_worker_earnings where id=$1",[earning]),2000);
    const paid=await scalar("insert into business_expenses(name,category,employee_id,amount_cents,incurred_on,frequency,request_key) values ('Wages','Labor',$1,1000,'2026-02-02','one_time','paid-key-001') returning id",[worker]);
    assert.equal(await scalar("select amount_cents from canes_worker_payout_allocations where expense_id=$1",[paid]),1000);
    await assert.rejects(db.query("update business_expenses set amount_cents=2000 where id=$1",[paid]),/earned-wage allocations/);
    const channel=await scalar("select id from canes_marketing_channels where name='Meta ads'");
    const expense=await scalar("select record_canes_marketing_spend($1,'2026-01-01',5000,'January ads','ad-request-001')",[channel]);
    assert.equal(await scalar("select record_canes_marketing_spend($1,'2026-01-01',5000,'January ads','ad-request-001')",[channel]),expense);
    await assert.rejects(db.query("select record_canes_marketing_spend($1,'2026-01-01',6000,'January ads','ad-request-001')",[channel]),/different spending/);
    assert.equal(await scalar("select has_function_privilege('authenticated','approve_canes_worker_time(uuid,uuid,date,int,uuid,text,text,text)','execute')"),false);
    assert.equal(await scalar("select has_table_privilege('anon','canes_worker_earnings','select')"),false);
    const stage=async(rows)=>scalar("select stage_canes_import('Ledger test',$1::jsonb,'owner')",[JSON.stringify(rows)]);
    const apply=async(batch)=>scalar("select apply_canes_import($1,array(select id from canes_import_rows where batch_id=$1),'owner')",[batch]);
    const historical={source_id:"work-001",kind:"completed_job",name:"Historical house wash",customer_name:"Import customer",amount_cents:"30000",tax_cents:"0",date:"2026-01-02",category:"house_washing"};
    const batch=await stage([historical]);assert.equal(await apply(batch),1);assert.equal(await apply(batch),0);
    const importedInvoice=await scalar("select target_id from canes_import_rows where batch_id=$1",[batch]);
    assert.equal(await scalar("select count(*)::int from invoice_items where invoice_id=$1",[importedInvoice]),1);
    assert.equal(await scalar("select total_cents from invoices where id=$1",[importedInvoice]),30000);
    const duplicate=await stage([historical]);assert.equal(await scalar("select state from canes_import_rows where batch_id=$1",[duplicate]),"duplicate");assert.equal(await apply(duplicate),0);
    const conflict=await stage([{...historical,amount_cents:"31000"}]);assert.equal(await scalar("select state from canes_import_rows where batch_id=$1",[conflict]),"conflict");await assert.rejects(apply(conflict),/different values/);
    const payment=await stage([{source_id:"payment-001",kind:"payment",name:"Received cash",date:"2026-01-03",amount_cents:"30000",target_id:importedInvoice,method:"cash"}]);assert.equal(await apply(payment),1);
    assert.equal(await scalar("select status from invoices where id=$1",[importedInvoice]),"paid");
    assert.equal(await scalar("select (created_at at time zone 'America/New_York')::date::text from payments where invoice_id=$1",[importedInvoice]),"2026-01-03");
    const expenseRows=[{source_id:"expense-001",kind:"expense",name:"Historical detergent",date:"2026-01-03",amount_cents:"2500",category:"Materials"}];
    const expenseBatch=await stage(expenseRows);assert.equal(await apply(expenseBatch),1);
    const otherSource=await scalar("select stage_canes_import('Other export',$1::jsonb,'owner')",[JSON.stringify(expenseRows)]);assert.equal(await scalar("select state from canes_import_rows where batch_id=$1",[otherSource]),"conflict");
    const customerBatch=await stage([{source_id:"customer-001",kind:"customer",name:"Imported customer",phone:"+12025550122",address:"100 Test Street"}]);assert.equal(await apply(customerBatch),1);
    assert.equal(await scalar("select count(*)::int from addresses where line='100 Test Street'"),1);
    assert.equal(await scalar("select has_function_privilege('anon','apply_canes_import(uuid,uuid[],text)','execute')"),false);

  }finally{await db.close();}
});


test("ledger CSV preserves quoted descriptions and rejects duplicate source IDs",()=>{
 const {parseLedgerCsv,IMPORT_COLUMNS}=load("lib/canes/ledger-import.ts");
 const header=IMPORT_COLUMNS.join(",");
 const row=['source-1','expense','"Detergent, soap"','2026-01-02','2500','','','','','','Materials','','',''].join(',');
 assert.equal(parseLedgerCsv(header+'\r\n'+row)[0].name,'Detergent, soap');
 assert.throws(()=>parseLedgerCsv(header+'\n'+row+'\n'+row),/unique source ID/);
 assert.throws(()=>parseLedgerCsv(header+'\n'+row.replace('2500','25.00')),/integer cents/);
});
