-- Canonical choices apply to new work; historical descriptions and prices stay unchanged.
alter table service_catalog add column service_category text check(service_category in ('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom'));
alter table estimate_items add column service_category text check(service_category in ('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom'));
alter table estimate_items add column service_line_id uuid not null default gen_random_uuid();
create unique index estimate_items_service_line_unique on estimate_items(estimate_id,service_line_id);
alter table job_items add column service_category text check(service_category in ('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom'));
alter table job_items add column service_line_id uuid not null default gen_random_uuid();
create unique index job_items_service_line_unique on job_items(job_id,service_line_id);
alter table invoice_items add column service_category text check(service_category in ('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom'));
alter table invoice_items add column service_line_id uuid not null default gen_random_uuid();
create unique index invoice_items_service_line_unique on invoice_items(invoice_id,service_line_id);
alter table recurring_plan_items add column service_category text check(service_category in ('paver_sealing','roof_washing','house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom'));
alter table recurring_plan_items add column service_line_id uuid not null default gen_random_uuid();
create unique index recurring_plan_items_service_line_unique on recurring_plan_items(plan_id,service_line_id);
update job_items j set service_line_id=e.service_line_id from estimate_items e where j.estimate_item_id=e.id;
update invoice_items i set service_line_id=j.service_line_id from job_items j where i.job_item_id=j.id;

do $$
declare service record; catalog_uuid uuid;
begin
 for service in select * from (values
 ('paver_sealing','Paver Sealing',0),('roof_washing','Roof Washing',1),
 ('house_washing','House Washing',2),('window_cleaning','Window Cleaning',3),
 ('gutter_cleaning','Gutter Cleaning',4),('paver_concrete_cleaning','Paver/Concrete Cleaning',5)
 ) as s(category,name,position) loop
  select id into catalog_uuid from service_catalog where kind='service' and lower(btrim(name))=lower(service.name) order by active desc,created_at,id limit 1;
  if catalog_uuid is null then
   insert into service_catalog(name,kind,default_price_cents,unit,active,position,service_category)
   values(service.name,'service',0,'each',true,service.position,service.category);
  else
   update service_catalog set name=service.name,service_category=service.category,active=true,position=service.position where id=catalog_uuid;
  end if;
 end loop;
 update service_catalog set active=false where kind='service' and service_category is null;
end $$;
create unique index service_catalog_standard_unique on service_catalog(service_category) where service_category is not null and service_category<>'custom';

-- Conversion paths continue to work for old clients. Explicitly categorized new
-- work inherits its category; historic unclassified lines remain unclassified.
create function inherit_canes_service_line() returns trigger language plpgsql security invoker set search_path=public as $$
declare parent_line jsonb;
begin
 if tg_table_name='estimate_items' and (to_jsonb(new)->>'catalog_id')::uuid is not null then
  select to_jsonb(c) into parent_line from service_catalog c where c.id=(to_jsonb(new)->>'catalog_id')::uuid;
  new.service_category:=parent_line->>'service_category';
 elsif tg_table_name='job_items' and (to_jsonb(new)->>'estimate_item_id')::uuid is not null then
  select to_jsonb(e) into parent_line from estimate_items e where e.id=(to_jsonb(new)->>'estimate_item_id')::uuid;
  new.service_line_id:=coalesce((parent_line->>'service_line_id')::uuid,new.service_line_id);
  new.service_category:=parent_line->>'service_category';
 elsif tg_table_name='invoice_items' and (to_jsonb(new)->>'job_item_id')::uuid is not null then
  select to_jsonb(j) into parent_line from job_items j where j.id=(to_jsonb(new)->>'job_item_id')::uuid;
  new.service_line_id:=coalesce((parent_line->>'service_line_id')::uuid,new.service_line_id);
  new.service_category:=parent_line->>'service_category';
 end if;
 return new;
end $$;
revoke all on function inherit_canes_service_line() from public,anon,authenticated;
create trigger estimate_service_identity before insert on estimate_items for each row execute function inherit_canes_service_line();
create trigger job_service_identity before insert on job_items for each row execute function inherit_canes_service_line();
create trigger invoice_service_identity before insert on invoice_items for each row execute function inherit_canes_service_line();

-- A submitted identity must belong to this document. Legacy clients can retain
-- an unchanged row by position/name; ambiguous replacements get a fresh identity.
create function normalize_canes_service_lines(p_lines jsonb,p_previous jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare line jsonb;old_line jsonb;result jsonb:='[]';n int:=0;identity uuid;
begin
 for line in select * from jsonb_array_elements(p_lines) loop
  old_line:=null;
  if nullif(line->>'service_line_id','') is not null then
   select v into old_line from jsonb_array_elements(coalesce(p_previous,'[]')) v where v->>'service_line_id'=line->>'service_line_id';
   if old_line is null then raise exception 'Service identity changed. Refresh before editing.';end if;
  else
   select v into old_line from jsonb_array_elements(coalesce(p_previous,'[]')) v where (v->>'position')::int=n and v->>'name'=line->>'name';
  end if;
  identity:=coalesce((old_line->>'service_line_id')::uuid,gen_random_uuid());
  if exists(select 1 from jsonb_array_elements(result) v where v->>'service_line_id'=identity::text) then raise exception 'A service identity cannot be repeated.';end if;
  line:=line||jsonb_build_object('service_line_id',identity,'service_category',case when line ? 'service_category' then line->'service_category' else old_line->'service_category' end);
  result:=result||jsonb_build_array(line);n:=n+1;
 end loop;
 return result;
end $$;
revoke all on function normalize_canes_service_lines(jsonb,jsonb) from public,anon,authenticated;
grant execute on function normalize_canes_service_lines(jsonb,jsonb) to service_role;

create or replace function replace_canes_estimate_items(p_id uuid,p_revision int,p_items jsonb)
returns text language plpgsql security invoker set search_path=public as $$
declare e estimates%rowtype;subtotal bigint;discount bigint;taxable_base bigint;tax bigint;total bigint;
begin
 select * into e from estimates where id=p_id for update;
 if not found or e.status<>'draft' or e.archived_at is not null then return 'closed';end if;
 if e.revision<>p_revision then return 'changed';end if;
 p_items:=normalize_canes_service_lines(p_items,(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from estimate_items i where estimate_id=e.id));
 delete from estimate_items where estimate_id=e.id;
 insert into estimate_items(service_line_id,service_category,estimate_id,catalog_id,position,name,description,kind,quantity,unit_price_cents,discount_cents,discount_mode,discount_value,taxable,line_total_cents,is_option,is_mandatory,is_selected,package_group)
 select r.service_line_id,r.service_category,e.id,r.catalog_id,r.position,r.name,r.description,r.kind,r.quantity,r.unit_price_cents,r.discount_cents,r.discount_mode,r.discount_value,r.taxable,r.line_total_cents,r.is_option,r.is_mandatory,r.is_selected,r.package_group
 from jsonb_to_recordset(p_items) as r(service_line_id uuid,service_category text,catalog_id uuid,position int,name text,description text,kind text,quantity numeric,unit_price_cents int,discount_cents int,discount_mode text,discount_value int,taxable boolean,line_total_cents int,is_option boolean,is_mandatory boolean,is_selected boolean,package_group text);
 select coalesce(sum(line_total_cents),0),coalesce(sum(discount_cents),0),coalesce(sum(line_total_cents) filter(where taxable),0) into subtotal,discount,taxable_base from estimate_items where estimate_id=e.id and (is_mandatory or not is_option or is_selected);
 tax:=round(taxable_base*e.tax_rate_bps/10000.0);total:=subtotal+e.adjustment_cents+tax;
 update estimates set subtotal_cents=subtotal,discount_cents=discount,tax_cents=tax,total_cents=total,deposit_cents=round(total*deposit_percent/100.0),updated_at=now() where id=e.id;
 return 'saved';
end;
$$;

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
security invoker
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

  p_items:=normalize_canes_service_lines(p_items,(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from invoice_items i where invoice_id=p_invoice_id));
  delete from invoice_items where invoice_id = p_invoice_id;
  insert into invoice_items (
    service_line_id, service_category, invoice_id, position, name, description, quantity, unit_price_cents, line_total_cents, discount_mode, discount_value, discount_cents, taxable
  )
  select
    (entry.item->>'service_line_id')::uuid, entry.item->>'service_category', p_invoice_id,
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

create or replace function revise_canes_documents(p_kind text,p_id uuid,p_fingerprint text,p_lines jsonb,p_patch jsonb,p_actor text,p_mode text,p_invoice_lease uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
 p_lines:=normalize_canes_service_lines(p_lines,coalesce(g->p_kind->'items','[]')||coalesce(g->'estimate'->'items','[]')||coalesce(g->'job'->'items','[]')||coalesce(g->'invoice'->'items','[]'));
 delete from estimate_items where estimate_id=e_id;
 delete from job_items where job_id=j_id and not checklist_only;
 delete from invoice_items where invoice_id=i_id;
 for line in select * from jsonb_array_elements(p_lines) loop
  if e_id is not null then insert into estimate_items(service_line_id,service_category,estimate_id,position,name,description,kind,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents,is_option,is_mandatory,is_selected,package_group)
  values((line->>'service_line_id')::uuid,line->>'service_category',e_id,n,line->>'name',line->>'description',coalesce(line->>'kind','service'),(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int,coalesce((line->>'is_option')::boolean,false),coalesce((line->>'is_mandatory')::boolean,false),coalesce((line->>'is_selected')::boolean,true),line->>'package_group');end if;
  if not coalesce((line->>'is_option')::boolean,false) or coalesce((line->>'is_mandatory')::boolean,false) or coalesce((line->>'is_selected')::boolean,true) then
  if j_id is not null then insert into job_items(service_line_id,service_category,job_id,position,name,description,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents)
  values((line->>'service_line_id')::uuid,line->>'service_category',j_id,n,line->>'name',line->>'description',(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int);end if;
  if i_id is not null then insert into invoice_items(service_line_id,service_category,invoice_id,position,name,description,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,taxable,line_total_cents)
  values((line->>'service_line_id')::uuid,line->>'service_category',i_id,n,line->>'name',line->>'description',(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,line->>'discount_mode',(line->>'discount_value')::int,(line->>'discount_cents')::int,(line->>'taxable')::boolean,(line->>'line_total_cents')::int);end if;
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
  insert into recurring_plan_items(service_line_id,service_category,plan_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable)
  select (t.line->>'service_line_id')::uuid,t.line->>'service_category',revise_canes_documents.plan_id,(t.ordinality-1)::int,t.line->>'name',t.line->>'description',(t.line->>'quantity')::numeric,(t.line->>'unit_price_cents')::int,(t.line->>'line_total_cents')::int,t.line->>'discount_mode',(t.line->>'discount_value')::int,(t.line->>'discount_cents')::int,coalesce((t.line->>'taxable')::boolean,false)
  from jsonb_array_elements(p_lines) with ordinality t(line,ordinality) where not coalesce((t.line->>'is_option')::boolean,false) or coalesce((t.line->>'is_mandatory')::boolean,false) or coalesce((t.line->>'is_selected')::boolean,true);
  update recurring_plans set price_per_visit_cents=total,adjustment_cents=adjustment,tax_rate_bps=rate,updated_at=clock_timestamp() where id=plan_id;
  for future_job in select * from jobs f where f.plan_id=revise_canes_documents.plan_id and f.id<>j_id and f.scheduled_at>now() and f.status in('unscheduled','scheduled','confirmed') and f.archived_at is null order by f.id loop
   perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||future_job.id::text,0));
   select * into future_job from jobs where id=future_job.id for update;
   if future_job.status not in('unscheduled','scheduled','confirmed') or future_job.archived_at is not null then raise exception 'A future visit changed';end if;
   if future_job.deposit_link_operation_id is not null or future_job.deposit_link_id is not null or future_job.deposit_link_url is not null or exists(select 1 from invoices where job_id=future_job.id) or exists(select 1 from payments where job_id=future_job.id) then raise exception 'A future visit changed; retry this visit separately';end if;
   perform canes_snapshot_document('job',future_job.id,p_actor,'before future revision');
   delete from job_items where job_id=future_job.id and not checklist_only;
   insert into job_items(service_line_id,service_category,job_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable) select r.service_line_id,r.service_category,future_job.id,r.position,r.name,r.description,r.quantity,r.unit_price_cents,r.line_total_cents,r.discount_mode,r.discount_value,r.discount_cents,r.taxable from recurring_plan_items r where r.plan_id=revise_canes_documents.plan_id;
   update jobs set total_cents=total,subtotal_cents=subtotal,adjustment_cents=adjustment,tax_cents=tax,tax_rate_bps=rate,revision=revision+1 where id=future_job.id;
  end loop;
 end if;
 if i_id is not null then perform recompute_invoice_paid_locked(i_id);end if;
 return jsonb_build_object('outcome','saved','estimateId',e_id,'jobId',j_id,'invoiceId',i_id,'totalCents',total);
end;
$$;
