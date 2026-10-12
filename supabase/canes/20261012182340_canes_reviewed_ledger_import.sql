create table canes_import_batches (
 id uuid primary key default gen_random_uuid(), source_name text not null,
 created_by text not null, created_at timestamptz not null default now()
);
create table canes_import_rows (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references canes_import_batches,
 source_key text not null, payload jsonb not null, state text not null check(state in('ready','duplicate','conflict','applied')),
 notice text not null, target_id uuid, applied_at timestamptz, applied_by text,
 unique(batch_id,source_key)
);
create table canes_import_receipts (
 source_name text not null, source_key text not null, payload jsonb not null,
 target_id uuid not null, row_id uuid not null references canes_import_rows, primary key(source_name,source_key)
);
do $$declare tab text;begin
 foreach tab in array array['canes_import_batches','canes_import_rows','canes_import_receipts'] loop
 execute format('alter table %I enable row level security',tab);
 execute format('revoke all on %I from anon,authenticated',tab);
 execute format('grant all on %I to service_role',tab);
 end loop;
end $$;

-- Preview and commit use the same checks. Matching live rows require explicit reconciliation.
create function check_canes_import_row(p_source text,p_key text,p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare receipt canes_import_receipts%rowtype;kind text:=p->>'kind';amount int;day date;target uuid;bill invoices%rowtype;
begin
 select * into receipt from canes_import_receipts where source_name=p_source and source_key=p_key;
 if found then return jsonb_build_object('state',case when receipt.payload=p then 'duplicate' else 'conflict' end,'notice',case when receipt.payload=p then 'Already imported.' else 'This source ID was imported with different values.' end,'target_id',receipt.target_id);end if;
 if nullif(btrim(p_key),'') is null or length(p_key)>160 or nullif(btrim(p->>'name'),'') is null then raise exception 'Source ID and name are required.';end if;
 if kind not in('customer','completed_job','payment','expense','worker_balance') or kind is null then raise exception 'Choose customer, completed_job, payment, expense, or worker_balance.';end if;
 if kind<>'customer' then
  amount:=(p->>'amount_cents')::int;day:=(p->>'date')::date;
  if amount is null or amount=0 or (amount<0 and kind<>'worker_balance') or day is null or day>(now() at time zone 'America/New_York')::date then raise exception 'Use a past date and nonzero integer cents. Only a worker balance can be negative.';end if;
 end if;
 if nullif(p->>'target_id','') is not null then target:=(p->>'target_id')::uuid;end if;
 if kind='customer' then
  if exists(select 1 from contacts where lower(name)=lower(p->>'name') or (nullif(p->>'email','') is not null and lower(email)=lower(p->>'email')) or (nullif(p->>'phone','') is not null and phone=p->>'phone')) then raise exception 'A matching customer exists. Use that customer ID for work; do not duplicate it.';end if;
 elsif kind='completed_job' then
  if nullif(p->>'customer_name','') is null then raise exception 'A customer name is required.';end if;
  if coalesce((p->>'tax_cents')::int,0) not between 0 and amount then raise exception 'Tax must be between zero and the total.';end if;
  if target is not null and not exists(select 1 from contacts where id=target) then raise exception 'Customer ID not found.';end if;
  if exists(select 1 from jobs where lower(job_name)=lower(p->>'name') and lower(customer_name)=lower(p->>'customer_name') and service_completed_on=day) then raise exception 'Matching completed work exists. Review it before importing.';end if;
  if nullif(p->>'category','') is not null and p->>'category' not in('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom') then raise exception 'Unknown service category.';end if;
 elsif kind='payment' then
  select * into bill from invoices where id=target;
  if bill.id is null or bill.status in('paid','void') or bill.square_invoice_id is not null or bill.hosted_payment_url is not null or bill.square_publish_attempt_key is not null or bill.billing_operation_id is not null or bill.service_autopay_authorization_id is not null or exists(select 1 from jobs where id=bill.job_id and plan_id is not null) then raise exception 'Payment imports require an unpaid manual invoice with no provider link, billing operation, or recurring agreement.';end if;
  if amount+bill.amount_paid_cents>bill.total_cents then raise exception 'This payment exceeds the remaining invoice balance.';end if;
  if coalesce(p->>'method','') not in('cash','card','check','bank','zelle','venmo','other') then raise exception 'Choose a recorded payment method.';end if;
  if exists(select 1 from payments where invoice_id=target and amount_cents=amount and (created_at at time zone 'America/New_York')::date=day) then raise exception 'A matching payment already exists; review it before importing.';end if;
 elsif kind='expense' then
  if exists(select 1 from business_expenses where active and lower(name)=lower(p->>'name') and amount_cents=amount and incurred_on=day) then raise exception 'A matching expense exists; review it before importing.';end if;
  if target is not null and not exists(select 1 from team_members where id=target) then raise exception 'Worker ID not found.';end if;
  if nullif(p->>'channel','') is not null and not exists(select 1 from canes_marketing_channels where name=p->>'channel') then raise exception 'Create the marketing channel first, using its exact name.';end if;
 elsif kind='worker_balance' then
  if not exists(select 1 from team_members where id=target) then raise exception 'Worker balances require an existing worker ID.';end if;
  if exists(select 1 from canes_worker_earnings where employee_id=target and earned_on=day and amount_cents=amount and kind='adjustment') then raise exception 'A matching worker adjustment exists; review it before importing.';end if;
 end if;
 return jsonb_build_object('state','ready','notice','Ready for owner review.');
exception when others then return jsonb_build_object('state','conflict','notice',sqlerrm);
end $$;
revoke all on function check_canes_import_row(text,text,jsonb) from public,anon,authenticated;
grant execute on function check_canes_import_row(text,text,jsonb) to service_role;

create function stage_canes_import(p_source text,p_rows jsonb,p_actor text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare batch uuid;row jsonb;checked jsonb;
begin
 if length(btrim(p_source)) not between 1 and 100 or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Use a stable source name and 1–500 rows per batch.';end if;
 insert into canes_import_batches(source_name,created_by) values(btrim(p_source),p_actor) returning id into batch;
 for row in select value from jsonb_array_elements(p_rows) loop
  checked:=check_canes_import_row(btrim(p_source),row->>'source_id',row-'source_id');
  insert into canes_import_rows(batch_id,source_key,payload,state,notice,target_id) values(batch,row->>'source_id',row-'source_id',checked->>'state',checked->>'notice',(checked->>'target_id')::uuid);
 end loop;
 return batch;
end $$;
revoke all on function stage_canes_import(text,jsonb,text) from public,anon,authenticated;
grant execute on function stage_canes_import(text,jsonb,text) to service_role;

create function apply_canes_import(p_batch uuid,p_rows uuid[],p_actor text) returns int
language plpgsql security invoker set search_path=public as $$
declare batch canes_import_batches%rowtype;row canes_import_rows%rowtype;p jsonb;checked jsonb;target uuid;job_uuid uuid;invoice_uuid uuid;source_target uuid;kind text;amount int;tax int;day date;count_applied int:=0;created record;
begin
 -- Imports are infrequent; serialize them to close duplicate-preview races.
 perform pg_advisory_xact_lock(hashtextextended('canes-reviewed-import',0));
 select * into batch from canes_import_batches where id=p_batch for update;
 if not found or cardinality(p_rows) not between 1 and 500 then raise exception 'Choose a staged batch and rows.';end if;
 if (select count(*) from canes_import_rows where batch_id=p_batch and id=any(p_rows))<>cardinality(p_rows) then raise exception 'Rows must belong to this batch.';end if;
 for row in select * from canes_import_rows where batch_id=p_batch and id=any(p_rows) order by id for update loop
  if row.state='applied' then continue;end if;
  p:=row.payload;kind:=p->>'kind';source_target:=nullif(p->>'target_id','')::uuid;
  if kind='payment' then perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||source_target::text,0));perform 1 from invoices where id=source_target for update;end if;
  checked:=check_canes_import_row(batch.source_name,row.source_key,p);
  if checked->>'state'='duplicate' then update canes_import_rows set state='duplicate',notice=checked->>'notice',target_id=(checked->>'target_id')::uuid where id=row.id;continue;end if;
  if checked->>'state'<>'ready' then raise exception 'Source %: %',row.source_key,checked->>'notice';end if;
  amount:=(p->>'amount_cents')::int;tax:=coalesce((p->>'tax_cents')::int,0);day:=(p->>'date')::date;
  if kind='customer' then
   insert into contacts(name,email,phone,source) values(p->>'name',nullif(p->>'email',''),nullif(p->>'phone',''),'other') returning id into target;
   if nullif(p->>'address','') is not null then insert into addresses(contact_id,line,is_primary) values(target,p->>'address',true);end if;
  elsif kind='completed_job' then
   insert into jobs(job_name,customer_name,customer_email,customer_phone,job_address,contact_id,status,total_cents,subtotal_cents,tax_cents,service_completed_on,created_at,notes)
   values(p->>'name',p->>'customer_name',nullif(p->>'email',''),nullif(p->>'phone',''),nullif(p->>'address',''),source_target,'completed',amount,amount-tax,tax,day,day::timestamp at time zone 'America/New_York','Historical ledger import; no appointment or customer message created.') returning id into job_uuid;
   insert into job_items(job_id,position,name,quantity,unit_price_cents,line_total_cents,service_category) values(job_uuid,0,p->>'name',1,amount-tax,amount-tax,nullif(p->>'category',''));
   select * into created from initialize_manual_invoice_locked(source_target,p->>'customer_name',nullif(p->>'phone',''),nullif(p->>'email',''),nullif(p->>'address',''),p->>'name',amount,'Historical ledger import.',null,replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'[]');
   if created.outcome<>'ready' then raise exception 'Historical invoice could not be initialized.';end if;
   invoice_uuid:=created.invoice_id;
   delete from invoice_items where invoice_id=invoice_uuid;
   update invoices set job_id=job_uuid,subtotal_cents=amount-tax,tax_cents=tax,service_date=day,created_at=day::timestamp at time zone 'America/New_York' where id=invoice_uuid;
   insert into invoice_items(invoice_id,job_item_id,position,name,quantity,unit_price_cents,line_total_cents,service_line_id,service_category) select invoice_uuid,id,position,name,quantity,unit_price_cents,line_total_cents,service_line_id,service_category from job_items where job_id=job_uuid;
   target:=invoice_uuid;
  elsif kind='payment' then
   insert into payments(invoice_id,job_id,amount_cents,method,method_detail,source,created_at,recorded_by,note)
   select id,job_id,amount,case when p->>'method' in('cash','card') then p->>'method' else 'other' end,p->>'method','manual',day::timestamp at time zone 'America/New_York',p_actor,'Reviewed historical import: '||batch.source_name||' / '||row.source_key from invoices where id=source_target returning id into target;
   perform recompute_invoice_paid_locked(source_target);
  elsif kind='expense' then
   insert into business_expenses(name,amount_cents,category,employee_id,incurred_on,occurrence_on,frequency,note,request_key,marketing_channel_id)
   values(p->>'name',amount,coalesce(nullif(p->>'category',''),'Other'),source_target,day,day,'one_time','Reviewed import: '||batch.source_name||' / '||row.source_key,'import:'||row.id,(select id from canes_marketing_channels where name=p->>'channel')) returning id into target;
  elsif kind='worker_balance' then
   target:=record_canes_worker_adjustment(source_target,null,day,amount,p->>'name',p_actor,'import:'||row.id);
  end if;
  insert into canes_import_receipts(source_name,source_key,payload,target_id,row_id) values(batch.source_name,row.source_key,p,target,row.id);
  update canes_import_rows set state='applied',notice='Imported after owner review.',target_id=target,applied_at=now(),applied_by=p_actor where id=row.id;
  count_applied:=count_applied+1;
 end loop;
 return count_applied;
end $$;
revoke all on function apply_canes_import(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function apply_canes_import(uuid,uuid[],text) to service_role;

create function review_canes_cancellation_invoice(p_invoice uuid,p_actor text) returns text
language plpgsql security invoker set search_path=public as $$
declare bill invoices%rowtype;agreement canes_service_agreements%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||p_invoice::text,0));
 select * into bill from invoices where id=p_invoice for update;
 select * into agreement from canes_service_agreements where cancellation_invoice_id=p_invoice for update nowait;
 if agreement.id is null or bill.service_autopay_kind<>'cancellation' then raise exception 'Cancellation invoice not found.';end if;
 if bill.service_autopay_finalized_at is not null then return bill.status;end if;
 if bill.square_invoice_id is not null or bill.square_publish_attempt_key is not null or bill.billing_operation_id is not null or bill.amount_paid_cents<>0 then raise exception 'Reconcile the existing billing operation first.';end if;
 if agreement.first_repeat_satisfied_at is not null then
  update invoices set status='void',voided_at=now(),service_payment_issue=null where id=bill.id;
  insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,p_actor,'cancellation_fee_voided',jsonb_build_object('invoice_id',bill.id,'reason','First repeat completed and paid.'));
  return 'void';
 end if;
 update invoices set service_autopay_finalized_at=now(),service_payment_issue=null where id=bill.id;
 insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,p_actor,'cancellation_fee_reviewed',jsonb_build_object('invoice_id',bill.id));
 return 'ready';
end $$;
revoke all on function review_canes_cancellation_invoice(uuid,text) from public,anon,authenticated;
grant execute on function review_canes_cancellation_invoice(uuid,text) to service_role;

create function canes_service_revenue_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'mrr_cents',(select coalesce(round(sum(recurring_price_cents::numeric/cadence_months)),0) from canes_service_agreements where state='active'),
  'active_agreements',(select count(*) from canes_service_agreements where state='active'),
  'movements',coalesce((select jsonb_agg(m) from (
   select p.created_at,p.amount_cents from payments p left join invoices i on i.id=p.invoice_id left join jobs j on j.id=coalesce(p.job_id,i.job_id) where (j.plan_id is not null or i.service_visit) and p.created_at>=now()-interval '13 months'
   union all
   select r.created_at,-r.amount_cents from payment_refunds r join payments p on p.id=r.payment_id left join invoices i on i.id=p.invoice_id left join jobs j on j.id=coalesce(p.job_id,i.job_id) where (j.plan_id is not null or i.service_visit) and r.created_at>=now()-interval '13 months'
  )m),'[]'::jsonb)
 )
$$;
revoke all on function canes_service_revenue_snapshot() from public,anon,authenticated;
grant execute on function canes_service_revenue_snapshot() to service_role;
