begin;

alter table recurring_plans add column if not exists tax_rate_bps int not null default 0;
alter table recurring_plans add column if not exists adjustment_cents int not null default 0;
alter table recurring_plans add column if not exists scheduling_enabled boolean not null default false;
alter table recurring_plans add column if not exists repeat_time time;
alter table recurring_plans add column if not exists anchor_day int check(anchor_day between 1 and 31);
alter table recurring_plans add column if not exists duration_minutes int not null default 120 check(duration_minutes between 15 and 1440);
alter table recurring_plans add column if not exists crew_id uuid references crews(id) on delete set null;
alter table recurring_plans add column if not exists agreement_required boolean not null default true;
alter table jobs add column if not exists scheduling_conflict boolean not null default false;

alter table recurring_plans add column if not exists request_key text unique;
alter table recurring_plan_items add column if not exists discount_mode text not null default 'amount';
alter table recurring_plan_items add column if not exists discount_value int not null default 0;
alter table recurring_plan_items add column if not exists discount_cents int not null default 0;
alter table recurring_plan_items add column if not exists taxable boolean not null default false;
create table recurring_agreement_versions (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references recurring_plans(id) on delete restrict,
 signed_at timestamptz not null, snapshot jsonb not null, unique(plan_id,signed_at)
);
alter table recurring_agreement_versions enable row level security;
revoke all on recurring_agreement_versions from anon,authenticated;
grant all on recurring_agreement_versions to service_role;
insert into recurring_agreement_versions(plan_id,signed_at,snapshot)
select p.id,p.signed_at,to_jsonb(p)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by position),'[]') from recurring_plan_items i where i.plan_id=p.id)) from recurring_plans p where p.signed_at is not null;

create or replace function canes_anchored_month(p_day date,p_months int,p_anchor int)
returns date language sql immutable set search_path=public as $$
  select (date_trunc('month',p_day)+make_interval(months=>p_months))::date +
    least(p_anchor,extract(day from date_trunc('month',p_day)+make_interval(months=>p_months+1)-interval '1 day')::int)-1
$$;
revoke all on function canes_anchored_month(date,int,int) from public, anon, authenticated;
grant execute on function canes_anchored_month(date,int,int) to service_role;

create or replace function mint_scheduled_plan_visit(p_plan_id uuid)
returns table(outcome text,job_id uuid) language plpgsql security definer set search_path=public as $$
declare p recurring_plans%rowtype; due date; slot timestamptz; finish timestamptz; cadence_months int; minted_id uuid; conflict boolean; n int:=0;
begin
  select * into p from recurring_plans where id=p_plan_id for update;
  if not found or p.status<>'active' or not p.scheduling_enabled or p.repeat_time is null then
    return query select 'inactive',null::uuid; return;
  end if;
  if exists(select 1 from jobs where plan_id=p.id and scheduled_at>now() and status in ('scheduled','confirmed','in_progress') and archived_at is null) then
    return query select 'upcoming_exists',null::uuid; return;
  end if;
  cadence_months:=case p.cadence when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
  due:=coalesce(p.next_due_on,p.starts_on);
  slot:=(due+p.repeat_time) at time zone 'America/New_York';
  while slot<=now() or exists(select 1 from jobs where plan_id=p.id and plan_visit_due_on=due) loop
    due:=canes_anchored_month(due,cadence_months,coalesce(p.anchor_day,extract(day from p.starts_on)::int));
    slot:=(due+p.repeat_time) at time zone 'America/New_York';
    n:=n+1;
    if n>1200 then raise exception 'Repeat date is too far in the past'; end if;
  end loop;
  if not exists(select 1 from recurring_plan_items where plan_id=p.id) then raise exception 'Add services before scheduling repeats'; end if;
  finish:=slot+make_interval(mins=>p.duration_minutes);
  conflict:=p.crew_id is not null and exists(select 1 from jobs j where j.crew_id=p.crew_id and j.archived_at is null and j.status in ('scheduled','confirmed','in_progress') and j.scheduled_at<finish and j.ends_at>slot);
  insert into jobs(plan_id,plan_visit_due_on,status,contact_id,customer_name,customer_phone,customer_email,job_name,job_address,total_cents,deposit_cents,scheduled_at,ends_at,duration_minutes,crew_id,assigned_to,recurrence,notes,scheduling_conflict,subtotal_cents,adjustment_cents,tax_rate_bps,tax_cents)
  values(p.id,due,'scheduled',p.contact_id,p.customer_name,p.customer_phone,p.customer_email,p.job_name,p.job_address,p.price_per_visit_cents,0,slot,finish,p.duration_minutes,p.crew_id,(select name from crews where id=p.crew_id),'none',p.number || ' recurring visit',conflict,(select coalesce(sum(line_total_cents),0) from recurring_plan_items where plan_id=p.id),p.adjustment_cents,p.tax_rate_bps,(select round(coalesce(sum(line_total_cents) filter(where taxable),0)*p.tax_rate_bps/10000.0) from recurring_plan_items where plan_id=p.id))
  returning id into minted_id;
  insert into job_items(job_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable)
  select minted_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable from recurring_plan_items where plan_id=p.id;
  insert into tasks(lead_id,kind,dedupe_key,scheduled_for,payload)
  values(null,'job_confirmation','job_confirmation:'||minted_id||':'||to_char(slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),greatest(now(),slot-interval '24 hours'),jsonb_build_object('job_id',minted_id,'scheduled_at',slot))
  on conflict(dedupe_key) do nothing;
  update recurring_plans set last_generated_for=due,next_due_on=canes_anchored_month(due,cadence_months,coalesce(p.anchor_day,extract(day from p.starts_on)::int)),updated_at=now() where id=p.id;
  return query select case when conflict then 'scheduled_with_conflict' else 'scheduled' end,minted_id;
end;
$$;
revoke all on function mint_scheduled_plan_visit(uuid) from public, anon, authenticated;
grant execute on function mint_scheduled_plan_visit(uuid) to service_role;

create or replace function create_canes_repeat_plan(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
<<create_canes_repeat_plan>>
declare source_job jobs%rowtype;plan_id uuid;existing_id uuid;counter int;first_due date;months int;line jsonb;source_key text;
begin
 if nullif(p_input->>'request_key','') is not null then
  perform pg_advisory_xact_lock(hashtextextended('plan-request:'||(p_input->>'request_key'),0));
  select id into existing_id from recurring_plans where request_key=p_input->>'request_key';
  if found then return jsonb_build_object('planId',existing_id,'duplicate',true);end if;
 end if;
 source_key:=coalesce(p_input->>'source_job_id',p_input->>'source_estimate_id',p_input->>'source_invoice_id');
 if source_key is not null then
  perform pg_advisory_xact_lock(hashtextextended('plan-source:'||source_key,0));
  select id into existing_id from recurring_plans where status<>'canceled' and
   (source_job_id::text=source_key or source_estimate_id::text=source_key or source_invoice_id::text=source_key) limit 1;
  if found then return jsonb_build_object('planId',existing_id,'duplicate',true);end if;
 end if;
 select * into source_job from jobs where id=(p_input->>'source_job_id')::uuid for update;
 first_due:=(p_input->>'starts_on')::date;
 if source_job.id is not null and source_job.plan_id is null and source_job.scheduled_at is not null then first_due:=(source_job.scheduled_at at time zone 'America/New_York')::date;end if;
 select next_value into counter from estimate_counters where id='plan' for update;
 update estimate_counters set next_value=counter+1 where id='plan';
 months:=case p_input->>'cadence' when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
 insert into recurring_plans(number,contact_id,source_estimate_id,source_invoice_id,source_job_id,customer_name,customer_phone,customer_email,job_address,job_name,cadence,price_per_visit_cents,status,starts_on,next_due_on,terms,public_token,scheduling_enabled,repeat_time,anchor_day,duration_minutes,crew_id,agreement_required,request_key,tax_rate_bps,adjustment_cents)
 values('PLAN-'||lpad(counter::text,6,'0'),(p_input->>'contact_id')::uuid,(p_input->>'source_estimate_id')::uuid,(p_input->>'source_invoice_id')::uuid,(p_input->>'source_job_id')::uuid,
 p_input->>'customer_name',p_input->>'customer_phone',p_input->>'customer_email',p_input->>'job_address',p_input->>'job_name',p_input->>'cadence',(p_input->>'price_per_visit_cents')::int,
 case when p_input->>'repeat_time' is not null then 'active' else 'draft' end,first_due,first_due,p_input->>'terms',p_input->>'public_token',p_input->>'repeat_time' is not null,(p_input->>'repeat_time')::time,extract(day from first_due)::int,
 coalesce((p_input->>'duration_minutes')::int,source_job.duration_minutes,120),coalesce((p_input->>'crew_id')::uuid,source_job.crew_id),coalesce((p_input->>'agreement_required')::boolean,false),p_input->>'request_key',coalesce((p_input->>'tax_rate_bps')::int,0),coalesce((p_input->>'adjustment_cents')::int,0)) returning id into plan_id;
 for line in select * from jsonb_array_elements(p_input->'items') loop
  insert into recurring_plan_items(plan_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable)
  values(plan_id,(line->>'position')::int,line->>'name',line->>'description',(line->>'quantity')::numeric,(line->>'unit_price_cents')::int,(line->>'line_total_cents')::int,
  coalesce(line->>'discount_mode','amount'),coalesce((line->>'discount_value')::int,0),coalesce((line->>'discount_cents')::int,0),coalesce((line->>'taxable')::boolean,false));
 end loop;
 if source_job.id is not null and source_job.plan_id is null then
  update jobs set plan_id=create_canes_repeat_plan.plan_id,plan_visit_due_on=first_due where id=source_job.id;
  update recurring_plans set last_generated_for=first_due,next_due_on=canes_anchored_month(first_due,months,extract(day from first_due)::int) where id=create_canes_repeat_plan.plan_id;
 end if;
 perform mint_scheduled_plan_visit(plan_id);
 return jsonb_build_object('planId',plan_id,'duplicate',false);
end;
$$;
revoke all on function create_canes_repeat_plan(jsonb) from public, anon, authenticated;
grant execute on function create_canes_repeat_plan(jsonb) to service_role;

create or replace function configure_canes_repeat(p_id uuid,p_date date,p_time time,p_cadence text,p_duration int,p_crew uuid)
returns text language plpgsql security definer set search_path=public as $$
declare p recurring_plans%rowtype;j jobs%rowtype;slot timestamptz;finish timestamptz;months int;future_date date;anchor int;prior_date date;changed boolean:=false;
begin
 select * into p from recurring_plans where id=p_id for update;
 if not found or p.status='canceled' then return 'closed';end if;
 if p_date<(now() at time zone 'America/New_York')::date or p_time is null or p_duration not between 15 and 1440 or p_cadence not in ('monthly','quarterly','semiannual','yearly') then return 'invalid';end if;
 if p_crew is not null and not exists(select 1 from crews where id=p_crew and active) then return 'crew_missing';end if;
 if p.signed_at is not null then insert into recurring_agreement_versions(plan_id,signed_at,snapshot) values(p.id,p.signed_at,to_jsonb(p)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by position),'[]') from recurring_plan_items i where i.plan_id=p.id))) on conflict do nothing;end if;
 months:=case p_cadence when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
 select (scheduled_at at time zone 'America/New_York')::date into prior_date from jobs where plan_id=p.id and archived_at is null and status in ('unscheduled','scheduled','confirmed') and (scheduled_at is null or scheduled_at>now()) order by scheduled_at nulls first,created_at limit 1;
 anchor:=case when p_date=coalesce(prior_date,p.next_due_on) then coalesce(p.anchor_day,extract(day from p.starts_on)::int) else extract(day from p_date)::int end;
 if (p_date+p_time) at time zone 'America/New_York'<=now() then return 'past';end if;
 future_date:=p_date;
 for j in select * from jobs where plan_id=p.id and archived_at is null and status in ('unscheduled','scheduled','confirmed') and (scheduled_at is null or scheduled_at>now()) order by scheduled_at nulls first,created_at for update loop
  slot:=(future_date+p_time) at time zone 'America/New_York';finish:=slot+make_interval(mins=>p_duration);
  if slot<=now() then return 'past';end if;
  update jobs set scheduled_at=slot,ends_at=finish,duration_minutes=p_duration,crew_id=p_crew,assigned_to=(select name from crews where id=p_crew),status='scheduled',confirmed_at=null,
   scheduling_conflict=p_crew is not null and exists(select 1 from jobs other where other.id<>j.id and other.crew_id=p_crew and other.archived_at is null and other.status in ('scheduled','confirmed','in_progress') and other.scheduled_at<finish and other.ends_at>slot)
  where id=j.id;
  update tasks set status='canceled' where kind='job_confirmation' and status='pending' and payload->>'job_id'=j.id::text;
  insert into tasks(kind,dedupe_key,scheduled_for,payload) values('job_confirmation','job_confirmation:'||j.id||':'||to_char(slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),greatest(now(),slot-interval '24 hours'),jsonb_build_object('job_id',j.id,'scheduled_at',slot)) on conflict(dedupe_key) do update set status=case when tasks.status='canceled' then 'pending' else tasks.status end;
  future_date:=canes_anchored_month(future_date,months,anchor);changed:=true;
 end loop;
 update recurring_plans set scheduling_enabled=true,repeat_time=p_time,anchor_day=anchor,duration_minutes=p_duration,crew_id=p_crew,cadence=p_cadence,
  status=case when status='draft' then 'active' else status end,next_due_on=future_date,updated_at=now() where id=p.id;
 perform mint_scheduled_plan_visit(p.id);
 return 'saved';
end;
$$;
revoke all on function configure_canes_repeat(uuid,date,time,text,int,uuid) from public, anon, authenticated;
grant execute on function configure_canes_repeat(uuid,date,time,text,int,uuid) to service_role;

create or replace function capture_canes_recurring_agreement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.signed_at is not null and new.signed_at is distinct from old.signed_at then
  insert into recurring_agreement_versions(plan_id,signed_at,snapshot)
  values(new.id,new.signed_at,to_jsonb(new)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by position),'[]') from recurring_plan_items i where i.plan_id=new.id))) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function capture_canes_recurring_agreement() from public, anon, authenticated;
create trigger recurring_agreement_snapshot after update on recurring_plans for each row execute function capture_canes_recurring_agreement();

create table expense_rules(
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 legacy_expense_id uuid unique references business_expenses(id) on delete restrict,
 name text not null, category text not null, amount_cents int not null check(amount_cents>0),
 frequency text not null check(frequency in ('monthly','yearly')),
 starts_on date not null, ends_on date, next_due_on date not null,
 anchor_day int not null check(anchor_day between 1 and 31), cutover_on date not null,
 active boolean not null default true,note text
);
alter table expense_rules enable row level security;
revoke all on expense_rules from anon,authenticated;
grant all on expense_rules to service_role;

alter table business_expenses add column if not exists rule_id uuid references expense_rules(id) on delete restrict;
alter table business_expenses add column if not exists occurrence_on date;
alter table business_expenses add column if not exists legacy_template boolean not null default false;
alter table business_expenses add column if not exists employee_id uuid references team_members(id) on delete restrict;
alter table business_expenses add column if not exists payment_method text;
alter table business_expenses add column if not exists request_key text;
alter table business_expenses add column if not exists skipped boolean not null default false;
create unique index expense_occurrence_uidx on business_expenses(rule_id,occurrence_on) where rule_id is not null;
create unique index employee_expense_request_uidx on business_expenses(request_key) where request_key is not null;

insert into settings(key,value) values('expense_occurrences_cutover_on',to_jsonb((now() at time zone 'America/New_York')::date::text)) on conflict(key) do nothing;
insert into expense_rules(legacy_expense_id,name,category,amount_cents,frequency,starts_on,ends_on,next_due_on,anchor_day,cutover_on,active,note)
select id,name,category,amount_cents,frequency,incurred_on,ends_on,incurred_on,extract(day from incurred_on)::int,
 (select (value #>> '{}')::date from settings where key='expense_occurrences_cutover_on'),active,note
from business_expenses where recurring and frequency in ('monthly','yearly') and amount_cents>0;
update business_expenses b set legacy_template=true, ends_on=least(coalesce(b.ends_on,r.cutover_on-1),r.cutover_on-1)
from expense_rules r where b.id=r.legacy_expense_id;

create or replace function canes_employee_payment_totals()
returns table(id uuid,name text,month_cents bigint,all_time_cents bigint)
language sql security definer set search_path=public as $$
 select m.id,m.name,
 coalesce(sum(e.amount_cents) filter(where e.incurred_on>=date_trunc('month',now() at time zone 'America/New_York')::date and e.incurred_on<(date_trunc('month',now() at time zone 'America/New_York')+interval '1 month')::date),0)::bigint,
 coalesce(sum(e.amount_cents),0)::bigint
 from team_members m left join business_expenses e on e.employee_id=m.id and e.active and not e.skipped
 where m.role in ('worker','ops_manager') group by m.id,m.name
$$;
revoke all on function canes_employee_payment_totals() from public, anon, authenticated;
grant execute on function canes_employee_payment_totals() to service_role;

create or replace function generate_expense_occurrences()
returns int language plpgsql security definer set search_path=public as $$
declare r expense_rules%rowtype; due date; today date:=(now() at time zone 'America/New_York')::date; count_created int:=0; inserted int; iterations int;
begin
 for r in select * from expense_rules where active and next_due_on<=today for update skip locked loop
  due:=r.next_due_on; iterations:=0;
  while due<=today and (r.ends_on is null or due<=r.ends_on) loop
   if due>=r.cutover_on then
    insert into business_expenses(name,amount_cents,category,recurring,frequency,incurred_on,note,rule_id,occurrence_on)
    values(r.name,r.amount_cents,r.category,true,r.frequency,due,r.note,r.id,due)
    on conflict(rule_id,occurrence_on) where rule_id is not null do nothing;
    get diagnostics inserted=row_count;
    count_created:=count_created+inserted;
   end if;
   due:=canes_anchored_month(due,case r.frequency when 'yearly' then 12 else 1 end,r.anchor_day);
   iterations:=iterations+1;
   if iterations>1200 then raise exception 'Expense date is too far in the past'; end if;
  end loop;
  update expense_rules set next_due_on=due where id=r.id;
 end loop;
 return count_created;
end;
$$;
revoke all on function generate_expense_occurrences() from public, anon, authenticated;
grant execute on function generate_expense_occurrences() to service_role;

create or replace function edit_canes_repeat_plan(p_id uuid,p_updated timestamptz,p_patch jsonb,p_items jsonb default null)
returns text language plpgsql security definer set search_path=public as $$
declare p recurring_plans%rowtype;n recurring_plans%rowtype;
begin
 select * into p from recurring_plans where id=p_id for update;
 if not found or p.status='canceled' then return 'closed';end if;
 if p.updated_at<>p_updated then return 'changed';end if;
 n:=jsonb_populate_record(p,p_patch);
 if p_items is not null then
  if jsonb_array_length(p_items) not between 1 and 200 then return 'invalid';end if;
  delete from recurring_plan_items where plan_id=p.id;
  insert into recurring_plan_items(plan_id,position,name,description,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable)
  select p.id,r.position,r.name,r.description,r.quantity,r.unit_price_cents,r.line_total_cents,r.discount_mode,r.discount_value,r.discount_cents,r.taxable
  from jsonb_to_recordset(p_items) as r(position int,name text,description text,quantity numeric,unit_price_cents int,line_total_cents int,discount_mode text,discount_value int,discount_cents int,taxable boolean);
 end if;
 update recurring_plans set customer_name=n.customer_name,customer_phone=n.customer_phone,customer_email=n.customer_email,job_name=n.job_name,job_address=n.job_address,cadence=n.cadence,starts_on=n.starts_on,next_due_on=n.next_due_on,repeat_time=n.repeat_time,scheduling_enabled=n.scheduling_enabled,anchor_day=n.anchor_day,lead_days=n.lead_days,notice_days=n.notice_days,message_to_customer=n.message_to_customer,price_per_visit_cents=n.price_per_visit_cents,updated_at=clock_timestamp() where id=p.id;
 if p_patch ? 'repeat_time' then perform mint_scheduled_plan_visit(p.id);end if;
 return 'saved';
end;
$$;
revoke all on function edit_canes_repeat_plan(uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function edit_canes_repeat_plan(uuid,timestamptz,jsonb,jsonb) to service_role;

create or replace function create_canes_expense_rule(p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare created_id uuid;
begin
 insert into expense_rules(name,category,amount_cents,frequency,starts_on,next_due_on,ends_on,anchor_day,cutover_on,note)
 values(p_input->>'name',p_input->>'category',(p_input->>'amount_cents')::int,p_input->>'frequency',(p_input->>'starts_on')::date,(p_input->>'next_due_on')::date,(p_input->>'ends_on')::date,(p_input->>'anchor_day')::int,(p_input->>'cutover_on')::date,p_input->>'note') returning id into created_id;
 perform generate_expense_occurrences();
 return created_id;
end;
$$;
revoke all on function create_canes_expense_rule(jsonb) from public, anon, authenticated;
grant execute on function create_canes_expense_rule(jsonb) to service_role;

create or replace function edit_canes_expense_rule(p_id uuid,p_patch jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare r expense_rules%rowtype;n expense_rules%rowtype;today date:=(now() at time zone 'America/New_York')::date;
begin
 select * into r from expense_rules where id=p_id for update;
 if not found then return 'missing';end if;
 perform generate_expense_occurrences();
 select * into r from expense_rules where id=p_id;
 n:=jsonb_populate_record(r,p_patch);
 if n.active and not r.active and not(p_patch ? 'next_due_on') then
  while n.next_due_on<today loop n.next_due_on:=canes_anchored_month(n.next_due_on,case n.frequency when 'yearly' then 12 else 1 end,n.anchor_day);end loop;
 end if;
 update expense_rules set amount_cents=n.amount_cents,active=n.active,next_due_on=n.next_due_on,ends_on=n.ends_on,anchor_day=n.anchor_day where id=p_id;
 return 'saved';
end;
$$;
revoke all on function edit_canes_expense_rule(uuid,jsonb) from public, anon, authenticated;
grant execute on function edit_canes_expense_rule(uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
