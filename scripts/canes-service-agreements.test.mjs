import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync,readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("independent agreements activate on settlement, group visits, and honor cancellation boundaries",async(t)=>{
  const db=new PGlite({extensions:{pgcrypto}});
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  let sequence=0;
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const directory=resolve(import.meta.dirname,"../supabase/canes");
    for(const file of readdirSync(directory).filter(file=>file.endsWith(".sql")).sort())await db.exec(readFileSync(resolve(directory,file),"utf8"));
    const today=await scalar("select (now() at time zone 'America/New_York')::date::text");
    const crew=await scalar("insert into crews(name) values ('Agreement test crew') returning id");
    await db.query("insert into canes_crew_availability values ($1,array[1,2,3,4,5,6],480,1020,15,now())",[crew]);
    async function seed({second=false,area="north",duration=60}={}){
      sequence++;
      const job=await scalar("insert into jobs(status,customer_name,customer_email,job_address,job_name,service_completed_on,total_cents) values ('completed','Agreement test','agreement@example.test','100 Test Street','House Washing',$1,$2) returning id",[today,second?50000:30000]);
      const invoice=await scalar("insert into invoices(number,job_id,customer_name,customer_email,job_address,job_name,service_date,service_area,service_area_selected,service_offers_enabled,service_offer_crew_id,subtotal_cents,total_cents,public_token,initialization_completed_at) values ($1,$2,'Agreement test','agreement@example.test','100 Test Street','House Washing',$3,$4,true,true,$5,$6,$6,$7,now()) returning id",[`SRC-${sequence}`,job,today,area,crew,second?50000:30000,`source-${sequence}`]);
      const line=await scalar("insert into invoice_items(invoice_id,name,quantity,unit_price_cents,line_total_cents,service_category,taxable) values ($1,'House Washing',1,30000,30000,'house_washing',false) returning service_line_id",[invoice]);
      const choices=[{service_line_id:line,months:3}],durations=duration?{[line]:duration}:{};
      if(second){const extra=await scalar("insert into invoice_items(invoice_id,position,name,quantity,unit_price_cents,line_total_cents,service_category,taxable) values ($1,1,'Window Cleaning',1,20000,20000,'window_cleaning',false) returning service_line_id",[invoice]);choices.push({service_line_id:extra,months:3});durations[extra]=45;}
      await db.query("update invoices set service_offer_durations=$2::jsonb where id=$1",[invoice,JSON.stringify(durations)]);
      const revision=await scalar("select revision from invoices where id=$1",[invoice]);
      const enrollment=await scalar("select prepare_canes_service_enrollment($1,$2,$3::jsonb,'Agreement test','agreement@example.test',$4,'Approved test terms','test-v1')",[invoice,revision,JSON.stringify(choices),randomUUID()]);
      await db.query("insert into canes_card_authorizations(enrollment_id,square_customer_id,square_card_id,verified_at,accepted_name,terms_version,terms_text,acceptance_snapshot) values ($1,$2,$3,now(),'Agreement test','test-v1','Approved test terms','{}')",[enrollment,`customer-${sequence}`,`card-${sequence}`]);
      await db.query("update canes_service_enrollments set state='card_ready' where id=$1",[enrollment]);
      const lease=randomUUID();
      await db.query("select claim_job_cancellation_billing_locked($1,'completed',$2)",[job,lease]);
      await db.query("select claim_canes_invoice_revision($1,$2)",[invoice,lease]);
      assert.equal(await scalar("select apply_canes_service_enrollment($1,$2,null)",[enrollment,lease]),invoice);
      await db.query("select release_invoice_billing_operation($1,$2)",[invoice,lease]);
      await db.query("select release_job_deposit_link_operation($1,$2)",[job,lease]);
      const agreements=(await db.query("select * from canes_service_agreements where source_invoice_id=$1 order by service_name",[invoice])).rows;
      return {job,invoice,line,enrollment,agreements,total:second?40000:24000};
    }
    async function pay(invoice,cents){await db.query("insert into payments(invoice_id,amount_cents,method,source) values ($1,$2,'cash','manual')",[invoice,cents]);await db.query("select recompute_invoice_paid_locked($1)",[invoice]);}
    async function token(agreement){await db.query("update canes_service_agreements set cancellation_token_hash=$2,cancellation_token_expires_at=now()+interval '1 day' where id=$1",[agreement,`token-${agreement}`]);return `token-${agreement}`;}

    await t.test("no appointment exists before current settlement and grouped services keep separate agreements",async()=>{
      const source=await seed({second:true});
      assert.equal(source.agreements.length,2);
      assert.equal(await scalar("select total_cents from invoices where id=$1",[source.invoice]),40000);
      assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=any($1::uuid[])",[source.agreements.map(row=>row.id)]),0);
      await pay(source.invoice,20000);
      assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=any($1::uuid[])",[source.agreements.map(row=>row.id)]),0);
      await pay(source.invoice,20000);
      await db.query("select generate_canes_service_visits()");
      const visits=(await db.query("select * from canes_service_occurrences where agreement_id=any($1::uuid[])",[source.agreements.map(row=>row.id)])).rows;
      assert.equal(visits.length,2);assert.equal(new Set(visits.map(row=>row.job_id)).size,1);assert.ok(visits[0].job_id);
      assert.equal(await scalar("select duration_minutes from jobs where id=$1",[visits[0].job_id]),105);
      assert.ok([1,2].includes(Number(await scalar("select extract(dow from scheduled_at at time zone 'America/New_York') from jobs where id=$1",[visits[0].job_id]))));
      await db.query("select generate_canes_service_visits()");assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=any($1::uuid[])",[source.agreements.map(row=>row.id)]),2);
      await assert.rejects(db.query("update invoice_items set line_total_cents=1 where invoice_id=$1",[source.invoice]),/locked/);
      const agreement=source.agreements[0],hash=await token(agreement.id);
      const result=await scalar("select cancel_canes_service_agreement($1,$2,'now',$3,null)",[agreement.id,hash,agreement.signup_discount_cents+5000]);
      assert.equal(result.state,"canceled");assert.ok(result.invoice_id);
      assert.equal(await scalar("select status from jobs where id=$1",[visits[0].job_id]),"scheduled");
      assert.equal(await scalar("select count(*)::int from job_items where job_id=$1",[visits[0].job_id]),1);
      assert.equal(await scalar("select state from canes_service_agreements where id=$1",[source.agreements[1].id]),"active");
      assert.equal((await scalar("select cancel_canes_service_agreement($1,$2,'now',$3,null)",[agreement.id,hash,agreement.signup_discount_cents+5000])).invoice_id,result.invoice_id);
    });
    await t.test("missing duration stays unscheduled, while four-month dates clamp from the original anchor",async()=>{
      const source=await seed({duration:null});await pay(source.invoice,source.total);await db.query("select generate_canes_service_visits()");
      const row=(await db.query("select * from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id])).rows[0];
      assert.equal(row.state,"needs_scheduling");assert.equal(row.job_id,null);assert.match(row.scheduling_note,/duration/);
      assert.equal(await scalar("select canes_service_cycle_due('2026-10-31',4,1)::text"),"2027-02-28");
      assert.equal(await scalar("select canes_service_cycle_due('2026-10-31',4,2)::text"),"2027-06-30");
      assert.equal(await scalar("select canes_service_cycle_due('2026-10-31',4,3)::text"),"2027-10-31");
    });
    await t.test("cancel after next ends at completion even with an unpaid final bill",async()=>{
      const source=await seed();await pay(source.invoice,source.total);await db.query("select generate_canes_service_visits()");
      const occurrence=(await db.query("select * from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id])).rows[0];
      const hash=await token(source.agreements[0].id);
      await db.query("select cancel_canes_service_agreement($1,$2,'after_next',11000,$3)",[source.agreements[0].id,hash,occurrence.due_on]);
      await db.query("update jobs set status='completed' where id=$1",[occurrence.job_id]);
      assert.equal(await scalar("select state from canes_service_agreements where id=$1",[source.agreements[0].id]),"canceled");
      const bill=(await db.query("select * from initialize_invoice_from_job_locked($1,$2,'Final service','Test terms','[]')",[occurrence.job_id,randomUUID()])).rows[0];
      await db.query("select finalize_canes_service_invoice($1,'owner')",[bill.invoice_id]);
      assert.equal(await scalar("select service_autopay_kind from invoices where id=$1",[bill.invoice_id]),"visit");
      await db.query("select generate_canes_service_visits()");assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id]),1);
      assert.equal(await scalar("select cancellation_invoice_id from canes_service_agreements where id=$1",[source.agreements[0].id]),null);
      await pay(bill.invoice_id,source.total);
      assert.ok(await scalar("select first_repeat_satisfied_at from canes_service_agreements where id=$1",[source.agreements[0].id]));
      assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id]),1);
    });
    await t.test("after the first paid repeat, cancel now has no fee and no rolling obligation",async()=>{
      const source=await seed();await pay(source.invoice,source.total);await db.query("select generate_canes_service_visits()");
      const first=(await db.query("select * from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id])).rows[0];
      await db.query("update jobs set status='completed' where id=$1",[first.job_id]);
      const bill=(await db.query("select * from initialize_invoice_from_job_locked($1,$2,'Repeat service','Test terms','[]')",[first.job_id,randomUUID()])).rows[0];
      await db.query("select finalize_canes_service_invoice($1,'owner')",[bill.invoice_id]);await pay(bill.invoice_id,source.total);
      assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=$1",[source.agreements[0].id]),2);
      const hash=await token(source.agreements[0].id);
      const result=await scalar("select cancel_canes_service_agreement($1,$2,'now',0,null)",[source.agreements[0].id,hash]);
      assert.equal(result.fee_cents,0);assert.equal(result.invoice_id,null);
      await db.query("select generate_canes_service_visits()");assert.equal(await scalar("select count(*)::int from canes_service_occurrences where agreement_id=$1 and state in('scheduled','needs_scheduling')",[source.agreements[0].id]),0);
    });
    await t.test("customer tokens expire and privileged lifecycle functions stay private",async()=>{
      const source=await seed();await pay(source.invoice,source.total);const hash=await token(source.agreements[0].id);
      await db.query("update canes_service_agreements set cancellation_token_expires_at=now()-interval '1 second' where id=$1",[source.agreements[0].id]);
      await assert.rejects(db.query("select cancel_canes_service_agreement($1,$2,'now',11000,null)",[source.agreements[0].id,hash]),/expired/);
      for(const fn of ["apply_canes_service_enrollment(uuid,uuid,text)","cancel_canes_service_agreement(uuid,text,text,int,date)","generate_canes_service_visits()"]){assert.equal(await scalar("select has_function_privilege('authenticated',$1,'execute')",[fn]),false);assert.equal(await scalar("select has_function_privilege('service_role',$1,'execute')",[fn]),true);}
    });
  }finally{await db.close();}
});
