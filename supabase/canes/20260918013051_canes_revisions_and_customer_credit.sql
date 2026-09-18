begin;
alter table jobs add column if not exists adjustment_cents int not null default 0;
alter table jobs add column if not exists tax_rate_bps int not null default 0;
alter table jobs add column if not exists tax_cents int not null default 0;
alter table jobs add column if not exists subtotal_cents int not null default 0;

update jobs j set tax_rate_bps=e.tax_rate_bps,tax_cents=e.tax_cents,subtotal_cents=e.subtotal_cents,adjustment_cents=e.adjustment_cents from estimates e where j.estimate_id=e.id;
update job_items ji set unit_price_cents=ei.unit_price_cents,discount_mode=ei.discount_mode,discount_value=ei.discount_value,discount_cents=ei.discount_cents,taxable=ei.taxable from estimate_items ei where ji.estimate_item_id=ei.id;

create table invoice_provider_history (
 square_invoice_id text primary key, square_order_id text, invoice_id uuid not null references invoices(id) on delete restrict,
 retired_at timestamptz not null default now()
);
create table job_provider_history (
 square_order_id text primary key,job_id uuid not null references jobs(id) on delete restrict,retired_at timestamptz not null default now()
);
alter table invoice_provider_history enable row level security;
alter table job_provider_history enable row level security;
revoke all on invoice_provider_history,job_provider_history from anon,authenticated;
grant all on invoice_provider_history,job_provider_history to service_role;

alter table invoices add column if not exists credit_link_pending boolean not null default false;

create table customer_credit_transfers(
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 source_invoice_id uuid not null references invoices(id) on delete restrict,
 target_invoice_id uuid not null references invoices(id) on delete restrict,
 amount_cents int not null check(amount_cents>0),reversed_cents int not null default 0 check(reversed_cents>=0 and reversed_cents<=amount_cents),request_key text not null unique,actor text not null,
 check(source_invoice_id<>target_invoice_id)
);
alter table customer_credit_transfers enable row level security;
revoke all on customer_credit_transfers from anon,authenticated;
grant all on customer_credit_transfers to service_role;

create or replace function canes_document_graph(p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e estimates%rowtype;j jobs%rowtype;i invoices%rowtype;ei jsonb;ji jsonb;ii jsonb;g jsonb;repeat_graph jsonb;
begin
 if p_kind='estimate' then select * into e from estimates where id=p_id; select * into j from jobs where estimate_id=e.id;
 elsif p_kind='job' then select * into j from jobs where id=p_id; select * into e from estimates where id=j.estimate_id;
 elsif p_kind='invoice' then select * into i from invoices where id=p_id; select * into j from jobs where id=i.job_id;select * into e from estimates where id=coalesce(i.estimate_id,j.estimate_id);
 else raise exception 'Invalid document kind'; end if;
 if i.id is null and j.id is not null then select * into i from invoices where job_id=j.id and status<>'void' order by created_at desc limit 1; end if;
 if i.id is null and e.id is not null then select * into i from invoices where estimate_id=e.id and status<>'void' order by created_at desc limit 1;end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by position,id),'[]') into ei from estimate_items t where estimate_id=e.id;
 select coalesce(jsonb_agg(to_jsonb(t) order by position,id),'[]') into ji from job_items t where job_id=j.id and not checklist_only;
 select coalesce(jsonb_agg(to_jsonb(t) order by position,id),'[]') into ii from invoice_items t where invoice_id=i.id;
 if j.plan_id is not null then
  select to_jsonb(p)||jsonb_build_object('future',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('has_money',f.deposit_link_id is not null or f.deposit_link_url is not null or exists(select 1 from invoices where job_id=f.id) or exists(select 1 from payments where job_id=f.id)) order by f.id),'[]') from jobs f where f.plan_id=j.plan_id and f.id<>j.id and f.scheduled_at>now() and f.status in('unscheduled','scheduled','confirmed') and f.archived_at is null)) into repeat_graph from recurring_plans p where p.id=j.plan_id;
 end if;
 g:=jsonb_build_object('repeat',repeat_graph,'invoiceRewardCents',(select coalesce(sum(amount_cents),0) from invoice_rewards where invoice_id=i.id and status='approved'),'estimate',case when e.id is null then null else to_jsonb(e)||jsonb_build_object('items',ei) end,
 'job',case when j.id is null then null else (to_jsonb(j)-'deposit_link_operation_id'-'deposit_link_operation_started_at')||jsonb_build_object('items',ji) end,
 'invoice',case when i.id is null then null else (to_jsonb(i)-'billing_operation_id'-'billing_operation_started_at'-'updated_at')||jsonb_build_object('items',ii) end);
 return g||jsonb_build_object('fingerprint',md5(g::text));
end;
$$;
revoke all on function canes_document_graph(text,uuid) from public, anon, authenticated;
grant execute on function canes_document_graph(text,uuid) to service_role;

create or replace function revise_canes_documents(p_kind text,p_id uuid,p_fingerprint text,p_lines jsonb,p_patch jsonb,p_actor text,p_mode text,p_invoice_lease uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
<<revise_canes_documents>>
declare g jsonb;e_id uuid;j_id uuid;i_id uuid;line jsonb;n int:=0;subtotal bigint:=0;discount bigint:=0;taxable bigint:=0;tax bigint;total bigint;adjustment int;rate int;invoice_row invoices%rowtype;future_job jobs%rowtype;plan_id uuid;
begin
 g:=canes_document_graph(p_kind,p_id);e_id:=(g->'estimate'->>'id')::uuid;j_id:=(g->'job'->>'id')::uuid;i_id:=(g->'invoice'->>'id')::uuid;
 if g->p_kind is null or g->p_kind='null'::jsonb then return jsonb_build_object('outcome','not_found');end if;
 plan_id:=(g->'repeat'->>'id')::uuid;
 if coalesce((p_patch->>'future_visits')::boolean,false) and plan_id is not null then perform 1 from recurring_plans where id=plan_id for update;end if;
 if j_id is not null then perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||j_id::text,0));end if;
 if i_id is not null then perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||i_id::text,0));end if;
 perform 1 from estimates where id=e_id for update;perform 1 from jobs where id=j_id for update;select * into invoice_row from invoices where id=i_id for update;
 g:=canes_document_graph(p_kind,p_id);
 if g->>'fingerprint' is distinct from p_fingerprint then return jsonb_build_object('outcome','conflict');end if;
 if j_id is not null and (select deposit_link_operation_id from jobs where id=j_id) is distinct from p_invoice_lease then return jsonb_build_object('outcome','lease_lost');end if;
 if i_id is not null and invoice_row.billing_operation_id is distinct from p_invoice_lease then return jsonb_build_object('outcome','lease_lost');end if;
 if coalesce((p_patch->>'future_visits')::boolean,false) and (plan_id is null or exists(select 1 from jsonb_array_elements(g->'repeat'->'future') f where (f->>'has_money')::boolean)) then return jsonb_build_object('outcome','future_billed');end if;
 if invoice_row.square_publish_attempt_key is not null then return jsonb_build_object('outcome','square_pending');end if;
 if p_mode not in ('resend','verbal') or jsonb_array_length(p_lines) not between 1 and 200 then return jsonb_build_object('outcome','invalid');end if;
 adjustment:=coalesce((p_patch->>'adjustment_cents')::int,0);rate:=coalesce((p_patch->>'tax_rate_bps')::int,0);
 if rate not between 0 and 10000 then return jsonb_build_object('outcome','invalid');end if;
 for line in select * from jsonb_array_elements(p_lines) loop
   if nullif(btrim(line->>'name'),'') is null or (line->>'quantity')::numeric<=0 or (line->>'unit_price_cents')::int<0 or (line->>'discount_cents')::int<0 or (line->>'line_total_cents')::int<0 then return jsonb_build_object('outcome','invalid');end if;
   if not coalesce((line->>'is_option')::boolean,false) or coalesce((line->>'is_mandatory')::boolean,false) or coalesce((line->>'is_selected')::boolean,true) then
   subtotal:=subtotal+(line->>'line_total_cents')::int;discount:=discount+(line->>'discount_cents')::int;
   if coalesce((line->>'taxable')::boolean,false) then taxable:=taxable+(line->>'line_total_cents')::int;end if;
   end if;
 end loop;
 tax:=round(taxable*rate/10000.0);total:=subtotal+adjustment+tax;
 if total not between 0 and 2147483647 then return jsonb_build_object('outcome','invalid');end if;
 if e_id is not null then perform canes_snapshot_document('estimate',e_id,p_actor,'before revision');end if;
 if j_id is not null then perform canes_snapshot_document('job',j_id,p_actor,'before revision');end if;
 if i_id is not null then perform canes_snapshot_document('invoice',i_id,p_actor,'before revision');end if;
 if invoice_row.square_invoice_id is not null then insert into invoice_provider_history(square_invoice_id,square_order_id,invoice_id) values(invoice_row.square_invoice_id,invoice_row.square_order_id,i_id) on conflict do nothing;end if;
 if j_id is not null and g->'job'->>'deposit_order_id' is not null then insert into job_provider_history(square_order_id,job_id) values(g->'job'->>'deposit_order_id',j_id) on conflict do nothing;end if;
 delete from estimate_items where estimate_id=e_id;
 delete from job_items where job_id=j_id and not checklist_only;
 delete from invoice_items where invoice_id=i_id;
 for line in select * from jsonb_array_elements(p_lines) loop
  if e_id is not null then insert into estimate_items(estimate_id,position,name,description,kind,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents,is_option,is_mandatory,is_selected,package_group)
  values(e_id,n,line->>'name',line->>'description',coalesce(line->>'kind','service'),(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int,coalesce((line->>'is_option')::boolean,false),coalesce((line->>'is_mandatory')::boolean,false),coalesce((line->>'is_selected')::boolean,true),line->>'package_group');end if;
  if not coalesce((line->>'is_option')::boolean,false) or coalesce((line->>'is_mandatory')::boolean,false) or coalesce((line->>'is_selected')::boolean,true) then
  if j_id is not null then insert into job_items(job_id,position,name,description,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents)
  values(j_id,n,line->>'name',line->>'description',(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int);end if;
  if i_id is not null then insert into invoice_items(invoice_id,position,name,description,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents)
  values(i_id,n,line->>'name',line->>'description',(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int);end if;
  end if;
  n:=n+1;
 end loop;
 update estimates set revision=revision+1,status=case when p_mode='verbal' then 'approved' else 'draft' end,
 subtotal_cents=subtotal,discount_cents=discount,adjustment_cents=adjustment,tax_rate_bps=rate,tax_cents=tax,total_cents=total,deposit_cents=round(total*deposit_percent/100.0),
 terms=coalesce(p_patch->>'terms',terms),signature_name=case when p_mode='verbal' then coalesce(customer_name,'Customer')||' (agreed by phone / in person)' else null end,
 signature_data=null,approval_source=case when p_mode='verbal' then 'in_person' else null end,approved_at=case when p_mode='verbal' then now() else null end,
 expires_at=case when p_mode='resend' and expires_at<now() then now()+interval '14 days' else expires_at end,sent_at=null,viewed_at=null,declined_at=null,updated_at=now() where id=e_id;
 if p_mode='verbal' and e_id is not null then perform canes_snapshot_document('estimate',e_id,p_actor,'accepted by phone / in person');end if;
 update jobs set deposit_cents=coalesce((select deposit_cents from estimates where id=e_id),deposit_cents),revision=revision+1,total_cents=total,subtotal_cents=subtotal,adjustment_cents=adjustment,tax_cents=tax,tax_rate_bps=rate,
 deposit_link_id=null,deposit_link_url=null,deposit_order_id=null,deposit_link_retired_at=now() where id=j_id;
 update invoices set revision=revision+1,subtotal_cents=subtotal,adjustment_cents=adjustment,tax_rate_bps=rate,tax_cents=tax,total_cents=greatest(0,total-(g->>'invoiceRewardCents')::int),
 terms=coalesce(p_patch->>'terms',terms),square_invoice_id=null,square_order_id=null,hosted_payment_url=null,
 status=case when status='void' then 'draft' else status end,viewed_at=null,sent_at=null,updated_at=now() where id=i_id;
 if coalesce((p_patch->>'future_visits')::boolean,false) and plan_id is not null then
  delete from recurring_plan_items r where r.plan_id=revise_canes_documents.plan_id;
  insert into recurring_plan_items(plan_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable)
  select revise_canes_documents.plan_id,(t.ordinality-1)::int,t.line->>'name',t.line->>'description',(t.line->>'quantity')::numeric,(t.line->>'unit_price_cents')::int,(t.line->>'line_total_cents')::int,t.line->>'discount_mode',(t.line->>'discount_value')::int,(t.line->>'discount_cents')::int,coalesce((t.line->>'taxable')::boolean,false)
  from jsonb_array_elements(p_lines) with ordinality t(line,ordinality) where not coalesce((t.line->>'is_option')::boolean,false) or coalesce((t.line->>'is_mandatory')::boolean,false) or coalesce((t.line->>'is_selected')::boolean,true);
  update recurring_plans set price_per_visit_cents=total,adjustment_cents=adjustment,tax_rate_bps=rate,updated_at=clock_timestamp() where id=plan_id;
  for future_job in select * from jobs f where f.plan_id=revise_canes_documents.plan_id and f.id<>j_id and f.scheduled_at>now() and f.status in('unscheduled','scheduled','confirmed') and f.archived_at is null order by f.id loop
   perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||future_job.id::text,0));
   select * into future_job from jobs where id=future_job.id for update;
   if future_job.status not in('unscheduled','scheduled','confirmed') or future_job.archived_at is not null then raise exception 'A future visit changed';end if;
   if future_job.deposit_link_operation_id is not null or future_job.deposit_link_id is not null or future_job.deposit_link_url is not null or exists(select 1 from invoices where job_id=future_job.id) or exists(select 1 from payments where job_id=future_job.id) then raise exception 'A future visit changed; retry this visit separately';end if;
   perform canes_snapshot_document('job',future_job.id,p_actor,'before future revision');
   delete from job_items where job_id=future_job.id and not checklist_only;
   insert into job_items(job_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable) select future_job.id,r.position,r.name,r.description,r.quantity,r.unit_price_cents,r.line_total_cents,r.discount_mode,r.discount_value,r.discount_cents,r.taxable from recurring_plan_items r where r.plan_id=revise_canes_documents.plan_id;
   update jobs set total_cents=total,subtotal_cents=subtotal,adjustment_cents=adjustment,tax_cents=tax,tax_rate_bps=rate,revision=revision+1 where id=future_job.id;
  end loop;
 end if;
 if i_id is not null then perform recompute_invoice_paid_locked(i_id);end if;
 return jsonb_build_object('outcome','saved','estimateId',e_id,'jobId',j_id,'invoiceId',i_id,'totalCents',total);
end;
$$;
revoke all on function revise_canes_documents(text,uuid,text,jsonb,jsonb,text,text,uuid) from public, anon, authenticated;
grant execute on function revise_canes_documents(text,uuid,text,jsonb,jsonb,text,text,uuid) to service_role;

create or replace function recompute_invoice_paid_locked(
  p_invoice_id uuid
) returns table (
  paid_cents int,
  total_cents int,
  fully_paid boolean,
  newly_settled boolean,
  newly_unsettled boolean,
  overpaid_cents int,
  settlement_generation int,
  invoice_status text,
  invoice_number text,
  customer_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
  v_in bigint; v_out bigint; v_excess bigint; v_reverse int; v_transfer customer_credit_transfers%rowtype;
  v_targets uuid[] := '{}'; v_target uuid;
  v_total int;
  v_status text;
  v_final_status text;
  v_job_id uuid;
  v_number text;
  v_customer_name text;
  v_generation int;
  v_fully_paid boolean;
  v_newly_settled boolean := false;
  v_newly_unsettled boolean := false;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(
    hashtextextended('square-invoice:' || p_invoice_id::text, 0)
  );

  select
    i.total_cents,
    i.status,
    i.job_id,
    i.number,
    i.customer_name,
    i.settlement_generation
  into
    v_total,
    v_status,
    v_job_id,
    v_number,
    v_customer_name,
    v_generation
  from invoices i
  where i.id = p_invoice_id
  for update;
  if not found then return; end if;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_paid
  from payments p
  where p.invoice_id = p_invoice_id
    and p.status in ('completed', 'refunded');
  select coalesce(sum(amount_cents-reversed_cents),0) into v_in from customer_credit_transfers where target_invoice_id=p_invoice_id;
  select coalesce(sum(amount_cents-reversed_cents),0) into v_out from customer_credit_transfers where source_invoice_id=p_invoice_id;
  v_excess:=greatest(0,v_out-greatest(0,v_paid+v_in-v_total));
  if v_excess>0 then
    for v_transfer in select * from customer_credit_transfers where source_invoice_id=p_invoice_id and reversed_cents<amount_cents order by created_at desc,id for update loop
      v_reverse:=least(v_excess,v_transfer.amount_cents-v_transfer.reversed_cents)::int;
      update customer_credit_transfers set reversed_cents=reversed_cents+v_reverse where id=v_transfer.id;
      update invoices set credit_link_pending=(square_invoice_id is not null),hosted_payment_url=null where id=v_transfer.target_invoice_id;
      v_targets:=array_append(v_targets,v_transfer.target_invoice_id);
      v_excess:=v_excess-v_reverse;v_out:=v_out-v_reverse;
      exit when v_excess=0;
    end loop;
  end if;
  v_paid:=greatest(0,v_paid+v_in-v_out);
  if v_paid > 2147483647 then
    raise exception 'Invoice paid total exceeds integer cents range';
  end if;

  v_fully_paid := v_total >= 0 and v_paid >= v_total;
  if v_fully_paid and v_status in ('draft', 'sent', 'viewed') then
    update invoices i
    set amount_paid_cents = v_paid::int,
        status = 'paid',
        paid_at = v_now,
        settlement_generation = i.settlement_generation + 1,
        billing_operation_id = null,
        billing_operation_started_at = null,
        updated_at = v_now
    where i.id = p_invoice_id
      and i.status in ('draft', 'sent', 'viewed')
    returning i.status, i.settlement_generation
    into v_final_status, v_generation;
    v_newly_settled := found;
  elsif not v_fully_paid and v_status = 'paid' then
    update invoices i
    set amount_paid_cents = v_paid::int,
        status = 'sent',
        paid_at = null,
        updated_at = v_now
    where i.id = p_invoice_id
      and i.status = 'paid'
    returning i.status, i.settlement_generation
    into v_final_status, v_generation;
    v_newly_unsettled := found;
  else
    update invoices i
    set amount_paid_cents = v_paid::int,
        updated_at = v_now
    where i.id = p_invoice_id
    returning i.status, i.settlement_generation
    into v_final_status, v_generation;
  end if;

  if v_newly_settled and v_job_id is not null then
    update jobs
    set status = 'paid'
    where id = v_job_id
      and status <> 'canceled';
  elsif v_newly_unsettled and v_job_id is not null then
    update jobs
    set status = 'invoiced'
    where id = v_job_id
      and status = 'paid';
  end if;

  foreach v_target in array v_targets loop perform recompute_invoice_paid_locked(v_target);end loop;

  return query select
    v_paid::int,
    v_total,
    v_fully_paid,
    v_newly_settled,
    v_newly_unsettled,
    greatest(0, v_paid::int - v_total),
    v_generation,
    v_final_status,
    v_number,
    v_customer_name;
end;
$$;

revoke all on function recompute_invoice_paid_locked(uuid) from public, anon, authenticated;
grant execute on function recompute_invoice_paid_locked(uuid) to service_role;

create or replace function apply_canes_customer_credit(p_source uuid,p_target uuid,p_amount int,p_key text,p_actor text,p_target_lease uuid)
returns text language plpgsql security definer set search_path=public as $$
declare s invoices%rowtype;t invoices%rowtype;ident uuid;existing customer_credit_transfers%rowtype;
begin
 if p_source=p_target or p_amount<=0 then return 'invalid';end if;
 for ident in select distinct job_id from invoices where id in(p_source,p_target) and job_id is not null order by job_id loop perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||ident::text,0));end loop;
 for ident in select id from invoices where id in(p_source,p_target) order by id loop perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||ident::text,0));end loop;
 perform 1 from invoices where id in(p_source,p_target) order by id for update;
 select * into existing from customer_credit_transfers where request_key=p_key;
 if found then
  if existing.source_invoice_id=p_source and existing.target_invoice_id=p_target and existing.amount_cents=p_amount then return 'duplicate';end if;
  return 'request_changed';
 end if;
 perform recompute_invoice_paid_locked(p_source);perform recompute_invoice_paid_locked(p_target);
 select * into s from invoices where id=p_source;select * into t from invoices where id=p_target;
 if s.id is null or t.id is null or s.contact_id is null or s.contact_id is distinct from t.contact_id then return 'customer_mismatch';end if;
 if t.status in('void','paid') or t.archived_at is not null or t.billing_operation_id is distinct from p_target_lease then return 'closed';end if;
 if t.hosted_payment_url is not null or t.square_publish_attempt_key is not null then return 'square_live';end if;
 if p_amount>greatest(0,s.amount_paid_cents-s.total_cents) or p_amount>greatest(0,t.total_cents-t.amount_paid_cents) then return 'amount_changed';end if;
 if t.square_invoice_id is not null then insert into invoice_provider_history(square_invoice_id,square_order_id,invoice_id) values(t.square_invoice_id,t.square_order_id,t.id) on conflict do nothing; update invoices set square_invoice_id=null,square_order_id=null,hosted_payment_url=null where id=t.id;end if;
 insert into customer_credit_transfers(source_invoice_id,target_invoice_id,amount_cents,request_key,actor) values(p_source,p_target,p_amount,p_key,p_actor);
 perform recompute_invoice_paid_locked(p_source);perform recompute_invoice_paid_locked(p_target);
 return 'applied';
end;
$$;
revoke all on function apply_canes_customer_credit(uuid,uuid,int,text,text,uuid) from public, anon, authenticated;
grant execute on function apply_canes_customer_credit(uuid,uuid,int,text,text,uuid) to service_role;

alter table payment_refunds add column if not exists recorded_by text;

create or replace function record_canes_manual_refund(p_payment uuid,p_amount int,p_key text,p_actor text)
returns text language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r payment_refunds%rowtype;j uuid;i uuid;
begin
 select job_id,invoice_id into j,i from payments where id=p_payment;
 if j is not null then perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||j::text,0));end if;
 if i is not null then perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||i::text,0));end if;
 select * into p from payments where id=p_payment for update;
 if not found or p.square_payment_id is not null or p.source<>'manual' then return 'not_manual';end if;
 select * into r from payment_refunds where square_refund_id='manual:'||p_key;
 if found then return case when r.payment_id=p_payment and r.amount_cents=p_amount then 'duplicate' else 'request_changed' end;end if;
 if exists(select 1 from invoices where id=p.invoice_id and (billing_operation_id is not null or square_publish_attempt_key is not null)) or exists(select 1 from jobs where id=p.job_id and deposit_link_operation_id is not null) or exists(select 1 from square_financial_operations where invoice_id=p.invoice_id and effects_completed_at is null) then return 'busy';end if;
 if p_amount<=0 or p_amount>p.amount_cents-p.refunded_cents then return 'invalid_amount';end if;
 insert into payment_refunds(payment_id,square_refund_id,amount_cents,currency,external_event_id,recorded_by) values(p.id,'manual:'||p_key,p_amount,p.currency,'manual-refund:'||p_key,p_actor);
 update payments set refunded_cents=refunded_cents+p_amount,status=case when refunded_cents+p_amount=amount_cents then 'refunded' else 'completed' end where id=p.id;
 if p.kind='deposit' and p.job_id is not null then update jobs set deposit_collected_cents=(select coalesce(sum(amount_cents-refunded_cents),0) from payments where job_id=p.job_id and kind='deposit') where id=p.job_id;end if;
 if p.invoice_id is not null then perform recompute_invoice_paid_locked(p.invoice_id);end if;
 return 'recorded';
end;
$$;
revoke all on function record_canes_manual_refund(uuid,int,text,text) from public, anon, authenticated;
grant execute on function record_canes_manual_refund(uuid,int,text,text) to service_role;

create or replace function claim_canes_invoice_revision(p_invoice_id uuid,p_operation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare i invoices%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||p_invoice_id::text,0));
 select * into i from invoices where id=p_invoice_id for update;
 if not found or i.archived_at is not null or i.square_publish_attempt_key is not null then return false;end if;
 if i.billing_operation_id is not null and i.billing_operation_started_at>now()-interval '15 minutes' then return false;end if;
 if exists(select 1 from square_financial_operations where invoice_id=i.id and effects_completed_at is null) then return false;end if;
 update invoices set billing_operation_id=p_operation_id,billing_operation_started_at=now() where id=i.id;
 return true;
end;
$$;
revoke all on function claim_canes_invoice_revision(uuid,uuid) from public, anon, authenticated;
grant execute on function claim_canes_invoice_revision(uuid,uuid) to service_role;

create or replace function canes_customer_credit_sources(p_contact uuid)
returns table(id uuid,number text,available_cents bigint)
language sql security definer set search_path=public as $$
 select i.id,i.number,
 coalesce((select sum(p.amount_cents-p.refunded_cents) from payments p where p.invoice_id=i.id),0)
 +coalesce((select sum(t.amount_cents-t.reversed_cents) from customer_credit_transfers t where t.target_invoice_id=i.id),0)
 -coalesce((select sum(t.amount_cents-t.reversed_cents) from customer_credit_transfers t where t.source_invoice_id=i.id),0)-i.total_cents as available_cents
 from invoices i where i.contact_id=p_contact and i.status<>'void'
 and coalesce((select sum(p.amount_cents-p.refunded_cents) from payments p where p.invoice_id=i.id),0)
 +coalesce((select sum(t.amount_cents-t.reversed_cents) from customer_credit_transfers t where t.target_invoice_id=i.id),0)
 -coalesce((select sum(t.amount_cents-t.reversed_cents) from customer_credit_transfers t where t.source_invoice_id=i.id),0)>i.total_cents
$$;
revoke all on function canes_customer_credit_sources(uuid) from public, anon, authenticated;
grant execute on function canes_customer_credit_sources(uuid) to service_role;

create or replace function initialize_invoice_from_job_unleased_locked(
  p_job_id uuid,
  p_public_token text,
  p_message_to_customer text,
  p_terms text,
  p_reward_offers jsonb default '[]'::jsonb
) returns table (
  outcome text,
  invoice_id uuid,
  invoice_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_invoice invoices%rowtype;
  v_next_number bigint;
  v_number text;
  v_item_count int;
  v_subtotal bigint;
  v_tax int;
  v_reward bigint;
  v_total bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('invoice-job:' || p_job_id::text, 0));
  -- Canonical money-lock order (0021): deposit/job before invoice. The nested
  -- attach call is re-entrant and can never deadlock a deposit webhook that is
  -- waiting to attach to the invoice being initialized.
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));

  select * into v_job from jobs where id = p_job_id;
  if not found then
    return query select 'not_found', null::uuid, null::text;
    return;
  end if;

  select * into v_invoice
  from invoices i
  where i.job_id = p_job_id and i.status <> 'void'
  order by i.created_at desc
  limit 1;

  if found then
    -- Never hold the job row while waiting for an invoice lock. Payment
    -- recompute owns the opposite topology (invoice, then job), so taking the
    -- invoice advisory lock here first is what prevents a lock cycle.
    perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_invoice.id::text, 0));
    select * into v_invoice
    from invoices i
    where i.id = v_invoice.id and i.status <> 'void'
    for update;
  end if;

  if not found then
    select next_value into v_next_number
    from estimate_counters where id = 'invoice' for update;
    if v_next_number is null then
      raise exception 'invoice counter missing';
    end if;
    update estimate_counters set next_value = v_next_number + 1 where id = 'invoice';
    v_number := 'INV-' || lpad(v_next_number::text, 6, '0');

    insert into invoices (
      job_id, estimate_id, lead_id, contact_id, number, status,
      customer_name, customer_phone, customer_email, job_address, job_name,
      message_to_customer, terms, tax_rate_bps, public_token,
      initialization_completed_at
    ) values (
      v_job.id, v_job.estimate_id, v_job.lead_id, v_job.contact_id, v_number, 'draft',
      v_job.customer_name, v_job.customer_phone, v_job.customer_email,
      v_job.job_address, v_job.job_name,
      p_message_to_customer, p_terms, v_job.tax_rate_bps, p_public_token, null
    ) returning * into v_invoice;
  elsif v_invoice.initialization_completed_at is not null
    and exists (select 1 from invoice_items ii where ii.invoice_id = v_invoice.id) then
    -- A retry still re-attaches any job deposit that arrived after the first
    -- initialization, then verifies the paid cache below.
    perform attach_job_deposits_locked(p_job_id, v_invoice.id);
    update invoices set initialization_completed_at = initialization_completed_at
      where id = v_invoice.id;
    return query select 'existing', v_invoice.id, v_invoice.number;
    return;
  elsif v_invoice.status <> 'draft' then
    return query select 'incomplete_closed', v_invoice.id, v_invoice.number;
    return;
  else
    -- Repair a legacy half-created draft. Only null initialization markers are
    -- eligible; migrated, user-edited invoices were backfilled above.
    delete from invoice_items where invoice_id = v_invoice.id;
    delete from invoice_rewards where invoice_id = v_invoice.id;
  end if;

  insert into invoice_items (
    invoice_id, job_item_id, position, name, description,
    quantity, unit_price_cents, line_total_cents, discount_mode, discount_value, discount_cents, taxable
  )
  select
    v_invoice.id, ji.id, row_number() over (order by ji.position, ji.id)::int - 1,
    ji.name, ji.description, ji.quantity,
    coalesce(ji.unit_price_cents,case when ji.quantity > 0 then round(ji.line_total_cents / ji.quantity)::int else ji.line_total_cents end),
    ji.line_total_cents, ji.discount_mode, ji.discount_value, ji.discount_cents, ji.taxable
  from job_items ji
  where ji.job_id = p_job_id and not ji.checklist_only
  order by ji.position, ji.id;
  get diagnostics v_item_count = row_count;

  if v_item_count = 0 then
    insert into invoice_items (
      invoice_id, position, name, quantity, unit_price_cents, line_total_cents
    ) values (
      v_invoice.id, 0, coalesce(v_job.job_name, 'Pressure washing service'),
      1, v_job.total_cents, v_job.total_cents
    );
  end if;

  insert into invoice_rewards (invoice_id, kind, label, amount_cents, status)
  select
    v_invoice.id,
    offer.kind,
    offer.label,
    offer.amount_cents,
    'offered'
  from jsonb_to_recordset(coalesce(p_reward_offers, '[]'::jsonb))
    as offer(kind text, label text, amount_cents int)
  where offer.kind in ('google_review', 'facebook_review', 'social_follow')
    and offer.amount_cents > 0
    and nullif(btrim(offer.label), '') is not null
  on conflict on constraint invoice_rewards_invoice_id_kind_key do nothing;

  select coalesce(sum(ii.line_total_cents), 0) into v_subtotal
  from invoice_items ii where ii.invoice_id = v_invoice.id;
  select round(coalesce(sum(line_total_cents) filter(where taxable),0)*v_invoice.tax_rate_bps/10000.0)::int into v_tax from invoice_items ii where ii.invoice_id=v_invoice.id;
  select coalesce(sum(r.amount_cents), 0) into v_reward
  from invoice_rewards r where r.invoice_id = v_invoice.id and r.status = 'approved';
  v_total := greatest(0, v_job.total_cents - v_reward);
  if v_subtotal > 2147483647 or v_total > 2147483647 then
    raise exception 'invoice total exceeds integer cents range';
  end if;

  update invoices
  set subtotal_cents = v_subtotal::int,
      adjustment_cents = v_job.total_cents - v_subtotal::int - v_tax,
      tax_cents = v_tax,
      total_cents = v_total::int,
      initialization_completed_at = now(),
      updated_at = now()
  where id = v_invoice.id;

  perform attach_job_deposits_locked(p_job_id, v_invoice.id);
  return query select 'ready', v_invoice.id, v_invoice.number;
end;
$$;

revoke all on function initialize_invoice_from_job_unleased_locked(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function initialize_invoice_from_job_unleased_locked(uuid, text, text, text, jsonb) to service_role;


create or replace function replace_invoice_items_locked(
  p_invoice_id uuid,
  p_items jsonb,
  p_expected_status text,
  p_expected_total_cents int,
  p_expected_paid_cents int,
  p_expected_square_invoice_id text,
  p_operation_id uuid
) returns table (outcome text, total_cents int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_subtotal bigint;
  v_tax int;
  v_reward bigint;
  v_total bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then return query select 'not_found', 0; return; end if;
  if v_invoice.billing_operation_id is distinct from p_operation_id then
    return query select 'lease_lost', v_invoice.total_cents; return;
  end if;
  if v_invoice.status is distinct from p_expected_status
    or v_invoice.total_cents <> p_expected_total_cents
    or v_invoice.amount_paid_cents <> p_expected_paid_cents
    or v_invoice.square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', v_invoice.total_cents; return;
  end if;
  if v_invoice.initialization_completed_at is null then
    return query select 'initializing', v_invoice.total_cents; return;
  end if;
  if v_invoice.square_publish_attempt_key is not null then
    return query select 'square_pending', v_invoice.total_cents; return;
  end if;
  if v_invoice.hosted_payment_url is not null and v_invoice.square_invoice_id is null then
    return query select 'square_pending', v_invoice.total_cents; return;
  end if;
  if v_invoice.status <> 'draft' then return query select 'frozen', v_invoice.total_cents; return; end if;
  if v_invoice.square_invoice_id is not null then return query select 'square_live', v_invoice.total_cents; return; end if;
  if exists (select 1 from payments p where p.invoice_id = p_invoice_id) then
    return query select 'has_payments', v_invoice.total_cents; return;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return query select 'invalid', v_invoice.total_cents; return;
  end if;

  delete from invoice_items where invoice_id = p_invoice_id;
  insert into invoice_items (
    invoice_id, position, name, description, quantity, unit_price_cents, line_total_cents, discount_mode, discount_value, discount_cents, taxable
  )
  select
    p_invoice_id,
    (entry.ordinality - 1)::int,
    coalesce(nullif(btrim(entry.item->>'name'), ''), 'Service'),
    nullif(btrim(entry.item->>'description'), ''),
    (entry.item->>'quantity')::numeric,
    (entry.item->>'unit_price_cents')::int,
    coalesce((entry.item->>'line_total_cents')::int,round((entry.item->>'quantity')::numeric * (entry.item->>'unit_price_cents')::int)::int),
    coalesce(entry.item->>'discount_mode','amount'),coalesce((entry.item->>'discount_value')::int,0),coalesce((entry.item->>'discount_cents')::int,0),coalesce((entry.item->>'taxable')::boolean,false)
  from jsonb_array_elements(p_items) with ordinality as entry(item, ordinality);

  select coalesce(sum(ii.line_total_cents), 0) into v_subtotal
  from invoice_items ii where ii.invoice_id = p_invoice_id;
  select round(coalesce(sum(line_total_cents) filter(where taxable),0)*v_invoice.tax_rate_bps/10000.0)::int into v_tax from invoice_items ii where ii.invoice_id=v_invoice.id;
  select coalesce(sum(r.amount_cents), 0) into v_reward
  from invoice_rewards r where r.invoice_id = p_invoice_id and r.status = 'approved';
  v_total := greatest(0, v_subtotal + v_invoice.adjustment_cents + v_tax - v_reward);
  if v_subtotal > 2147483647 or v_total > 2147483647 then
    raise exception 'invoice total exceeds integer cents range';
  end if;
  update invoices
  set subtotal_cents = v_subtotal::int, tax_cents = v_tax,
      total_cents = v_total::int, updated_at = now()
  where id = p_invoice_id;
  return query select 'saved', v_total::int;
end;
$$;

revoke all on function replace_invoice_items_locked(uuid, jsonb, text, int, int, text, uuid) from public, anon, authenticated;
grant execute on function replace_invoice_items_locked(uuid, jsonb, text, int, int, text, uuid) to service_role;


create or replace function canes_bump_estimate_version()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.revision<=old.revision and
 (to_jsonb(new)-array['updated_at','viewed_at','sent_at','approved_at','declined_at','signature_name','signature_data','status','approval_source','archived_at'])
 is distinct from
 (to_jsonb(old)-array['updated_at','viewed_at','sent_at','approved_at','declined_at','signature_name','signature_data','status','approval_source','archived_at']) then
  new.revision:=old.revision+1;
 end if;
 return new;
end;
$$;
create trigger estimate_version before update on estimates for each row execute function canes_bump_estimate_version();

create or replace function canes_bump_estimate_lines()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update estimates set revision=revision+1,updated_at=now() where id=case when tg_op='DELETE' then old.estimate_id else new.estimate_id end;
 return null;
end;
$$;
revoke all on function canes_bump_estimate_lines() from public, anon, authenticated;
create trigger estimate_lines_version after insert or update or delete on estimate_items for each row execute function canes_bump_estimate_lines();

create or replace function replace_canes_estimate_items(p_id uuid,p_revision int,p_items jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare e estimates%rowtype;subtotal bigint;discount bigint;taxable_base bigint;tax bigint;total bigint;
begin
 select * into e from estimates where id=p_id for update;
 if not found or e.status<>'draft' or e.archived_at is not null then return 'closed';end if;
 if e.revision<>p_revision then return 'changed';end if;
 delete from estimate_items where estimate_id=e.id;
 insert into estimate_items(estimate_id,catalog_id,position,name,description,kind,quantity,unit_price_cents,discount_cents,discount_mode,discount_value,taxable,line_total_cents,is_option,is_mandatory,is_selected,package_group)
 select e.id,r.catalog_id,r.position,r.name,r.description,r.kind,r.quantity,r.unit_price_cents,r.discount_cents,r.discount_mode,r.discount_value,r.taxable,r.line_total_cents,r.is_option,r.is_mandatory,r.is_selected,r.package_group
 from jsonb_to_recordset(p_items) as r(catalog_id uuid,position int,name text,description text,kind text,quantity numeric,unit_price_cents int,discount_cents int,discount_mode text,discount_value int,taxable boolean,line_total_cents int,is_option boolean,is_mandatory boolean,is_selected boolean,package_group text);
 select coalesce(sum(line_total_cents),0),coalesce(sum(discount_cents),0),coalesce(sum(line_total_cents) filter(where taxable),0) into subtotal,discount,taxable_base from estimate_items where estimate_id=e.id and (is_mandatory or not is_option or is_selected);
 tax:=round(taxable_base*e.tax_rate_bps/10000.0);total:=subtotal+e.adjustment_cents+tax;
 update estimates set subtotal_cents=subtotal,discount_cents=discount,tax_cents=tax,total_cents=total,deposit_cents=round(total*deposit_percent/100.0),updated_at=now() where id=e.id;
 return 'saved';
end;
$$;
revoke all on function replace_canes_estimate_items(uuid,int,jsonb) from public, anon, authenticated;
grant execute on function replace_canes_estimate_items(uuid,int,jsonb) to service_role;

create or replace function patch_invoice_locked(
  p_invoice_id uuid,
  p_patch jsonb,
  p_contact_only boolean,
  p_expected_status text,
  p_expected_total_cents int,
  p_expected_paid_cents int,
  p_expected_square_invoice_id text,
  p_operation_id uuid
) returns table (outcome text, total_cents int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_subtotal bigint;
  v_tax int;
  v_reward bigint;
  v_total bigint;
  v_settled boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then return query select 'not_found', 0; return; end if;
  if v_invoice.billing_operation_id is distinct from p_operation_id then
    return query select 'lease_lost', v_invoice.total_cents; return;
  end if;
  if v_invoice.status is distinct from p_expected_status
    or v_invoice.total_cents <> p_expected_total_cents
    or v_invoice.amount_paid_cents <> p_expected_paid_cents
    or v_invoice.square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', v_invoice.total_cents; return;
  end if;
  if v_invoice.initialization_completed_at is null then
    return query select 'initializing', v_invoice.total_cents; return;
  end if;
  if v_invoice.square_publish_attempt_key is not null then
    return query select 'square_pending', v_invoice.total_cents; return;
  end if;
  if not p_contact_only and v_invoice.hosted_payment_url is not null
    and v_invoice.square_invoice_id is null then
    return query select 'square_pending', v_invoice.total_cents; return;
  end if;
  if v_invoice.status <> 'draft' and not p_contact_only then
    return query select 'frozen', v_invoice.total_cents; return;
  end if;
  if p_patch ? 'adjustment_cents' and v_invoice.square_invoice_id is not null then
    return query select 'square_live', v_invoice.total_cents; return;
  end if;

  select coalesce(sum(ii.line_total_cents), 0) into v_subtotal
  from invoice_items ii where ii.invoice_id = p_invoice_id;
  select round(coalesce(sum(ii.line_total_cents) filter(where ii.taxable),0)*v_invoice.tax_rate_bps/10000.0)::int into v_tax from invoice_items ii where ii.invoice_id=v_invoice.id;
  select coalesce(sum(r.amount_cents), 0) into v_reward
  from invoice_rewards r where r.invoice_id = p_invoice_id and r.status = 'approved';
  v_total := greatest(
    0,
    v_subtotal
      + case when p_patch ? 'adjustment_cents'
          then (p_patch->>'adjustment_cents')::int else v_invoice.adjustment_cents end
      + v_tax - v_reward
  );
  if v_subtotal > 2147483647 or v_total > 2147483647 then
    raise exception 'invoice total exceeds integer cents range';
  end if;
  if p_patch ? 'adjustment_cents' then
    if v_total = 0 and v_invoice.amount_paid_cents = 0 then
      return query select 'zero_total', v_invoice.total_cents;
      return;
    end if;
    if v_total < v_invoice.amount_paid_cents then
      return query select 'over_paid', v_invoice.total_cents;
      return;
    end if;
    v_settled := v_invoice.amount_paid_cents > 0
      and v_total = v_invoice.amount_paid_cents;
  end if;

  update invoices as target
  set customer_name = case when p_patch ? 'customer_name' then nullif(p_patch->>'customer_name', '') else target.customer_name end,
      customer_phone = case when p_patch ? 'customer_phone' then nullif(p_patch->>'customer_phone', '') else target.customer_phone end,
      customer_email = case when p_patch ? 'customer_email' then nullif(p_patch->>'customer_email', '') else target.customer_email end,
      contact_id = case when p_patch ? 'contact_id' then nullif(p_patch->>'contact_id', '')::uuid else target.contact_id end,
      job_name = case when p_patch ? 'job_name' then nullif(p_patch->>'job_name', '') else target.job_name end,
      job_address = case when p_patch ? 'job_address' then nullif(p_patch->>'job_address', '') else target.job_address end,
      adjustment_cents = case when p_patch ? 'adjustment_cents' then (p_patch->>'adjustment_cents')::int else target.adjustment_cents end,
      message_to_customer = case when p_patch ? 'message_to_customer' then nullif(p_patch->>'message_to_customer', '') else target.message_to_customer end,
      terms = case when p_patch ? 'terms' then nullif(p_patch->>'terms', '') else target.terms end,
      internal_notes = case when p_patch ? 'internal_notes' then nullif(p_patch->>'internal_notes', '') else target.internal_notes end,
      subtotal_cents = case when target.status = 'draft' then v_subtotal::int else target.subtotal_cents end,
      tax_cents = case when target.status = 'draft' then v_tax else target.tax_cents end,
      total_cents = case when target.status = 'draft' then v_total::int else target.total_cents end,
      status = case when v_settled then 'paid' else target.status end,
      paid_at = case when v_settled then now() else target.paid_at end,
      settlement_generation = case when v_settled then target.settlement_generation + 1 else target.settlement_generation end,
      updated_at = now()
  where target.id = p_invoice_id;
  if v_settled and v_invoice.job_id is not null then
    update jobs set status = 'paid'
    where id = v_invoice.job_id and status <> 'canceled';
  end if;
  return query select case when v_settled then 'settled' else 'saved' end,
    case when v_invoice.status = 'draft' then v_total::int else v_invoice.total_cents end;
end;
$$;

create or replace function resolve_invoice_reward_locked(
  p_reward_id uuid,
  p_approve boolean,
  p_attributed_member_id uuid,
  p_expected_status text,
  p_expected_total_cents int,
  p_expected_paid_cents int,
  p_expected_square_invoice_id text,
  p_square_canceled boolean,
  p_operation_id uuid
) returns table (
  outcome text,
  invoice_id uuid,
  total_cents int,
  settled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward invoice_rewards%rowtype;
  v_invoice invoices%rowtype;
  v_subtotal bigint;
  v_tax int;
  v_approved bigint;
  v_total bigint;
  v_settled boolean := false;
begin
  select * into v_reward from invoice_rewards where id = p_reward_id;
  if not found then return query select 'reward_not_found', null::uuid, 0, false; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_reward.invoice_id::text, 0));
  select * into v_invoice from invoices where id = v_reward.invoice_id for update;
  if not found then return query select 'invoice_not_found', v_reward.invoice_id, 0, false; return; end if;
  if v_invoice.billing_operation_id is distinct from p_operation_id then
    return query select 'lease_lost', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_invoice.status is distinct from p_expected_status
    or v_invoice.total_cents <> p_expected_total_cents
    or v_invoice.amount_paid_cents <> p_expected_paid_cents
    or v_invoice.square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_invoice.status in ('paid', 'void') then
    return query select 'closed', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_invoice.square_publish_attempt_key is not null then
    return query select 'square_pending', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_reward.status not in ('offered', 'claimed') then
    return query select 'resolved', v_invoice.id, v_invoice.total_cents, false; return;
  end if;

  if not p_approve then
    update invoice_rewards
    set status = 'declined', resolved_at = now(), resolved_by = 'owner', updated_at = now(),
        attributed_member_id = coalesce(p_attributed_member_id, attributed_member_id)
    where id = p_reward_id and status in ('offered', 'claimed');
    return query select 'declined', v_invoice.id, v_invoice.total_cents, false;
    return;
  end if;

  if v_invoice.hosted_payment_url is not null and v_invoice.square_invoice_id is null then
    return query select 'square_pending', v_invoice.id, v_invoice.total_cents, false; return;
  end if;

  if v_invoice.square_invoice_id is not null and not p_square_canceled then
    return query select 'square_live', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  select coalesce(sum(ii.line_total_cents), 0) into v_subtotal
  from invoice_items ii where ii.invoice_id = v_invoice.id;
  select round(coalesce(sum(ii.line_total_cents) filter(where ii.taxable),0)*v_invoice.tax_rate_bps/10000.0)::int into v_tax from invoice_items ii where ii.invoice_id=v_invoice.id;
  select coalesce(sum(r.amount_cents), 0) into v_approved
  from invoice_rewards r
  where r.invoice_id = v_invoice.id and r.status = 'approved';
  v_total := greatest(0, v_subtotal + v_invoice.adjustment_cents + v_tax - v_approved - v_reward.amount_cents);
  if v_total = 0 and v_invoice.amount_paid_cents = 0 then
    return query select 'zero_total', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_total < v_invoice.amount_paid_cents then
    return query select 'over_paid', v_invoice.id, v_invoice.total_cents, false; return;
  end if;
  if v_total > 2147483647 then raise exception 'invoice total exceeds integer cents range'; end if;

  update invoice_rewards
  set status = 'approved', resolved_at = now(), resolved_by = 'owner', updated_at = now(),
      attributed_member_id = coalesce(p_attributed_member_id, attributed_member_id)
  where id = p_reward_id and status in ('offered', 'claimed');
  if not found then return query select 'resolved', v_invoice.id, v_invoice.total_cents, false; return; end if;

  v_settled := v_invoice.amount_paid_cents > 0 and v_total = v_invoice.amount_paid_cents;
  update invoices
  set subtotal_cents = v_subtotal::int,
      tax_cents = v_tax,
      total_cents = v_total::int,
      status = case when v_settled then 'paid' else status end,
      paid_at = case when v_settled then now() else paid_at end,
      settlement_generation = case
        when v_settled then invoices.settlement_generation + 1
        else invoices.settlement_generation
      end,
      -- Keep provider identities forever for delayed/in-flight webhook
      -- matching. Cancellation only retires the charge surface.
      square_invoice_id = square_invoice_id,
      square_order_id = square_order_id,
      hosted_payment_url = case when p_square_canceled then null else hosted_payment_url end,
      updated_at = now()
  where id = v_invoice.id;
  if v_settled and v_invoice.job_id is not null then
    update jobs set status = 'paid' where id = v_invoice.job_id and status <> 'canceled';
  end if;
  return query select 'approved', v_invoice.id, v_total::int, v_settled;
end;
$$;

create or replace function delete_canes_unused_document(p_kind text,p_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare e estimates%rowtype;j jobs%rowtype;i invoices%rowtype;
begin
 if exists(select 1 from document_revisions where document_kind=p_kind and document_id=p_id) then return 'history';end if;
 if p_kind='estimate' then
  select * into e from estimates where id=p_id for update;
  if not found then return 'missing';end if;
  if e.status<>'draft' or e.sent_at is not null or e.approved_at is not null or e.signature_name is not null or exists(select 1 from jobs where estimate_id=p_id) or exists(select 1 from invoices where estimate_id=p_id) or exists(select 1 from estimate_expenses where estimate_id=p_id) then return 'history';end if;
  delete from estimates where id=p_id;
 elsif p_kind='job' then
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||p_id::text,0));
  select * into j from jobs where id=p_id for update;
  if not found then return 'missing';end if;
  if j.deposit_link_operation_id is not null then return 'busy';end if;
  if j.status<>'unscheduled' or j.estimate_id is not null or j.plan_id is not null or j.scheduled_at is not null or j.deposit_link_id is not null or j.deposit_order_id is not null or j.deposit_link_url is not null
   or exists(select 1 from invoices where job_id=p_id) or exists(select 1 from payments where job_id=p_id) or exists(select 1 from job_time_entries where job_id=p_id) or exists(select 1 from job_expenses where job_id=p_id) or exists(select 1 from job_media where job_id=p_id) or exists(select 1 from job_provider_history where job_id=p_id) then return 'history';end if;
  delete from jobs where id=p_id;
 elsif p_kind='invoice' then
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||p_id::text,0));
  select * into i from invoices where id=p_id for update;
  if not found then return 'missing';end if;
  if i.billing_operation_id is not null or i.square_publish_attempt_key is not null then return 'busy';end if;
  if i.status<>'draft' or i.job_id is not null or i.sent_at is not null or i.square_invoice_id is not null or i.amount_paid_cents>0 or exists(select 1 from payments where invoice_id=p_id) or exists(select 1 from invoice_provider_history where invoice_id=p_id) or exists(select 1 from customer_credit_transfers where source_invoice_id=p_id or target_invoice_id=p_id) then return 'history';end if;
  delete from invoices where id=p_id;
 else return 'invalid';end if;
 update tasks set status='canceled' where status='pending' and (payload->>'estimate_id'=p_id::text or payload->>'job_id'=p_id::text or payload->>'invoice_id'=p_id::text);
 return 'deleted';
end;
$$;
revoke all on function delete_canes_unused_document(text,uuid) from public, anon, authenticated;
grant execute on function delete_canes_unused_document(text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
