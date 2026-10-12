create table canes_marketing_channels (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 active boolean not null default true, created_at timestamptz not null default now()
);
insert into canes_marketing_channels(name) values ('Meta ads'),('Google ads'),('Website'),('Referral'),('Direct'),('Other');
alter table jobs add column marketing_channel_id uuid references canes_marketing_channels;
alter table estimates add column marketing_channel_id uuid references canes_marketing_channels;
alter table invoices add column marketing_channel_id uuid references canes_marketing_channels;
alter table business_expenses add column marketing_channel_id uuid references canes_marketing_channels;
alter table expense_rules add column marketing_channel_id uuid references canes_marketing_channels;
alter table job_expenses add column service_line_id uuid;
-- Legacy costs were not marked paid. Leave payment date unknown until reviewed.
alter table job_expenses add column paid_on date;
alter table payments add column method_detail text check(method_detail in ('cash','card','check','bank','zelle','venmo','other'));

create function inherit_canes_marketing_channel() returns trigger language plpgsql security invoker set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); parent_channel uuid;lead_source text;
begin
 if new.marketing_channel_id is not null then return new;end if;
 if tg_table_name='jobs' and row_data->>'estimate_id' is not null then
  select marketing_channel_id into parent_channel from estimates where id=(row_data->>'estimate_id')::uuid;
 elsif tg_table_name='invoices' and row_data->>'job_id' is not null then
  select marketing_channel_id into parent_channel from jobs where id=(row_data->>'job_id')::uuid;
 elsif tg_table_name='business_expenses' and row_data->>'rule_id' is not null then
  select marketing_channel_id into parent_channel from expense_rules where id=(row_data->>'rule_id')::uuid;
 elsif row_data->>'lead_id' is not null then
  select source into lead_source from leads where id=(row_data->>'lead_id')::uuid;
  select id into parent_channel from canes_marketing_channels where name=case lead_source when 'meta_ads' then 'Meta ads' when 'website' then 'Website' when 'referral' then 'Referral' else null end;
 end if;
 new.marketing_channel_id:=parent_channel;return new;
end $$;
revoke all on function inherit_canes_marketing_channel() from public,anon,authenticated;
create trigger job_marketing_channel before insert on jobs for each row execute function inherit_canes_marketing_channel();
create trigger estimate_marketing_channel before insert on estimates for each row execute function inherit_canes_marketing_channel();
create trigger invoice_marketing_channel before insert on invoices for each row execute function inherit_canes_marketing_channel();
create trigger expense_marketing_channel before insert on business_expenses for each row execute function inherit_canes_marketing_channel();

create table canes_worker_rates (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references team_members,
 effective_on date not null, hourly_cents int not null check(hourly_cents>=0),
 commission_bps int not null default 0 check(commission_bps between 0 and 10000),
 created_at timestamptz not null default now(), created_by text not null,
 unique(employee_id,effective_on)
);
create table canes_worker_upsells (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references team_members,
 invoice_id uuid not null references invoices, service_line_id uuid not null,
 additional_cents int not null check(additional_cents>0), commission_bps int not null check(commission_bps between 1 and 10000),
 approved_on date not null, approved_by text not null, reason text not null,
 created_at timestamptz not null default now(), unique(invoice_id,service_line_id)
);
create table canes_worker_earnings (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references team_members,
 job_id uuid references jobs on delete restrict, time_entry_id uuid unique references job_time_entries on delete restrict,
 upsell_id uuid references canes_worker_upsells, kind text not null check(kind in ('wage','commission','adjustment')),
 earned_on date not null, amount_cents int not null, minutes int check(minutes>0), hourly_cents int check(hourly_cents>=0),
 reason text not null, approved_by text not null, created_at timestamptz not null default now(), request_key text not null unique
);
create index canes_worker_earnings_employee_date on canes_worker_earnings(employee_id,earned_on);
create index canes_worker_earnings_job on canes_worker_earnings(job_id);
create table canes_worker_payout_allocations (
 id uuid primary key default gen_random_uuid(), expense_id uuid not null references business_expenses on delete restrict,
 earning_id uuid not null references canes_worker_earnings on delete restrict,
 amount_cents int not null check(amount_cents>0), created_at timestamptz not null default now(), unique(expense_id,earning_id)
);

create function approve_canes_worker_time(p_employee uuid,p_job uuid,p_date date,p_minutes int,p_entry uuid,p_reason text,p_actor text,p_request text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare wage_id uuid;rate int;entry job_time_entries%rowtype;member uuid;
begin
 perform 1 from team_members where id=p_employee for update;
 if not found then raise exception 'Worker not found.';end if;
 select id into wage_id from canes_worker_earnings where request_key=p_request;
 if wage_id is not null then
  if not exists(select 1 from canes_worker_earnings where id=wage_id and employee_id=p_employee and job_id is not distinct from p_job and time_entry_id is not distinct from p_entry and earned_on=p_date and minutes=p_minutes and reason=p_reason) then raise exception 'This request was already used for different hours.';end if;
  return wage_id;
 end if;
 if p_minutes not between 1 and 1440 or nullif(btrim(p_reason),'') is null or p_date>(now() at time zone 'America/New_York')::date then raise exception 'Enter valid completed hours and a reason.';end if;
 if p_entry is not null then
  select * into entry from job_time_entries where id=p_entry for update;
  select team_member_id into member from crew_accounts where id=entry.account_id;
  if member is distinct from p_employee or entry.job_id is distinct from p_job or entry.checked_out_at is null then raise exception 'Choose this worker’s completed time entry.';end if;
  if p_date is distinct from (entry.checked_in_at at time zone 'America/New_York')::date then raise exception 'Use the time entry’s service date.';end if;
 end if;
 select hourly_cents into rate from canes_worker_rates where employee_id=p_employee and effective_on<=p_date order by effective_on desc limit 1;
 if rate is null then raise exception 'Set a rate effective on the work date before approval.';end if;
 insert into canes_worker_earnings(employee_id,job_id,time_entry_id,kind,earned_on,amount_cents,minutes,hourly_cents,reason,approved_by,request_key)
 values(p_employee,p_job,p_entry,'wage',p_date,round(p_minutes*rate/60.0),p_minutes,rate,btrim(p_reason),p_actor,p_request) returning id into wage_id;
 return wage_id;
end $$;
revoke all on function approve_canes_worker_time(uuid,uuid,date,int,uuid,text,text,text) from public,anon,authenticated;
grant execute on function approve_canes_worker_time(uuid,uuid,date,int,uuid,text,text,text) to service_role;

create function allocate_canes_worker_payment() returns trigger language plpgsql security invoker set search_path=public as $$
declare remaining int;balance bigint;earning record;allocated int;
begin
 if new.employee_id is null or not new.active or new.skipped or new.legacy_template then return new;end if;
 perform 1 from team_members where id=new.employee_id for update;
 select coalesce(sum(amount_cents),0) into balance from canes_worker_earnings where employee_id=new.employee_id;
 select balance-coalesce(sum(a.amount_cents),0) into balance from canes_worker_payout_allocations a join canes_worker_earnings e on e.id=a.earning_id where e.employee_id=new.employee_id;
 remaining:=least(new.amount_cents,greatest(balance,0));
 for earning in select e.id,e.amount_cents-coalesce(sum(a.amount_cents),0) as due from canes_worker_earnings e left join canes_worker_payout_allocations a on a.earning_id=e.id where e.employee_id=new.employee_id and e.amount_cents>0 group by e.id order by e.earned_on,e.created_at,e.id loop
  exit when remaining<=0;
  allocated:=least(remaining,greatest(earning.due,0));
  if allocated>0 then insert into canes_worker_payout_allocations(expense_id,earning_id,amount_cents) values(new.id,earning.id,allocated);remaining:=remaining-allocated;end if;
 end loop;
 return new;
end $$;
revoke all on function allocate_canes_worker_payment() from public,anon,authenticated;
create trigger worker_payment_allocation after insert on business_expenses for each row execute function allocate_canes_worker_payment();

create function reconcile_canes_upsell(p_upsell uuid) returns int language plpgsql security invoker set search_path=public as $$
declare upsell canes_worker_upsells%rowtype;bill invoices%rowtype;net bigint;before_tax bigint;collected bigint;target int;earned bigint;delta int;line_value int;
begin
 select * into upsell from canes_worker_upsells where id=p_upsell for update;
 if not found then raise exception 'Upsell not found.';end if;
 perform 1 from team_members where id=upsell.employee_id for update;
 select * into bill from invoices where id=upsell.invoice_id for update;
 select coalesce(sum(amount_cents),0) into net from payments where invoice_id=bill.id;
 select net-coalesce(sum(r.amount_cents),0) into net from payment_refunds r join payments p on p.id=r.payment_id where p.invoice_id=bill.id;
 before_tax:=case when bill.total_cents>0 then round(least(greatest(net,0),bill.total_cents)::numeric*greatest(0,bill.total_cents-bill.tax_cents)/bill.total_cents) else 0 end;
 with weights as (select id,service_line_id,greatest(0,line_total_cents) as weight,sum(greatest(0,line_total_cents)) over() as total_weight from invoice_items where invoice_id=bill.id),
 portions as(select *,floor(before_tax::numeric*weight/nullif(total_weight,0)) as base,mod(before_tax::numeric*weight,nullif(total_weight,0)) as remainder from weights),
 ranked as(select *,row_number() over(order by remainder desc,id) as rank,sum(base) over() as base_sum from portions)
 select coalesce(base,0)+case when rank<=before_tax-base_sum then 1 else 0 end,weight into collected,line_value from ranked where service_line_id=upsell.service_line_id;
 target:=case when coalesce(line_value,0)>0 then round(round(coalesce(collected,0)::numeric*least(upsell.additional_cents,line_value)/line_value)*upsell.commission_bps/10000.0) else 0 end;
 select coalesce(sum(amount_cents),0) into earned from canes_worker_earnings where upsell_id=p_upsell;
 delta:=target-earned;
 if delta<>0 then
  insert into canes_worker_earnings(employee_id,job_id,upsell_id,kind,earned_on,amount_cents,reason,approved_by,request_key)
  values(upsell.employee_id,bill.job_id,p_upsell,'commission',(now() at time zone 'America/New_York')::date,delta,case when delta>0 then 'Collected upsell commission' else 'Refund / collection adjustment' end,'system','commission:'||gen_random_uuid());
 end if;
 return delta;
end $$;
revoke all on function reconcile_canes_upsell(uuid) from public,anon,authenticated;
grant execute on function reconcile_canes_upsell(uuid) to service_role;

-- Recorded payouts and approved earnings are history, corrected with new entries.
create function protect_canes_worker_payout() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from canes_worker_payout_allocations where expense_id=old.id) and (tg_op='DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then raise exception 'This payment has earned-wage allocations. Record an adjustment instead.';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function protect_canes_worker_payout() from public,anon,authenticated;
create trigger worker_payment_history before update or delete on business_expenses for each row execute function protect_canes_worker_payout();

do $$ declare tab text;begin
 foreach tab in array array['canes_marketing_channels','canes_worker_rates','canes_worker_upsells','canes_worker_earnings','canes_worker_payout_allocations'] loop
  execute format('alter table %I enable row level security',tab);
  execute format('revoke all on %I from anon,authenticated',tab);
  execute format('grant all on %I to service_role',tab);
 end loop;
end $$;

alter table jobs add column service_completed_on date;
alter table invoices add column service_date date;
update jobs set service_completed_on=(technician_completed_at at time zone 'America/New_York')::date where technician_completed_at is not null;
update invoices i set service_date=j.service_completed_on from jobs j where i.job_id=j.id and j.service_completed_on is not null;
create function stamp_canes_service_date() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='jobs' then
  if new.status in ('completed','invoiced','paid') and old.status not in ('completed','invoiced','paid') and new.service_completed_on is null then new.service_completed_on:=(now() at time zone 'America/New_York')::date;end if;
 else
  if new.job_id is not null and new.service_date is null then select service_completed_on into new.service_date from jobs where id=new.job_id;end if;
 end if;
 return new;
end $$;
revoke all on function stamp_canes_service_date() from public,anon,authenticated;
create trigger job_service_date before update on jobs for each row execute function stamp_canes_service_date();
create trigger invoice_service_date before insert on invoices for each row execute function stamp_canes_service_date();

create function record_canes_worker_adjustment(p_employee uuid,p_job uuid,p_date date,p_amount int,p_reason text,p_actor text,p_request text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare existing canes_worker_earnings%rowtype;new_id uuid;
begin
 perform 1 from team_members where id=p_employee for update;
 select * into existing from canes_worker_earnings where request_key=p_request;
 if found then
  if existing.employee_id is distinct from p_employee or existing.job_id is distinct from p_job or existing.amount_cents<>p_amount or existing.earned_on<>p_date or existing.reason<>p_reason then raise exception 'This request was already used for a different adjustment.';end if;
  return existing.id;
 end if;
 insert into canes_worker_earnings(employee_id,job_id,kind,earned_on,amount_cents,reason,approved_by,request_key) values(p_employee,p_job,'adjustment',p_date,p_amount,p_reason,p_actor,p_request) returning id into new_id;
 return new_id;
end $$;
revoke all on function record_canes_worker_adjustment(uuid,uuid,date,int,text,text,text) from public,anon,authenticated;
grant execute on function record_canes_worker_adjustment(uuid,uuid,date,int,text,text,text) to service_role;

create function approve_canes_upsell(p_employee uuid,p_invoice uuid,p_line uuid,p_additional int,p_reason text,p_actor text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare line invoice_items%rowtype;bill invoices%rowtype;bps int;upsell_id uuid;
begin
 select * into bill from invoices where id=p_invoice for update;
 select * into line from invoice_items where invoice_id=p_invoice and service_line_id=p_line;
 if line.id is null or p_additional<=0 or p_additional>line.line_total_cents or bill.status='void' then raise exception 'Choose a current service and its additional pre-tax amount.';end if;
 if bill.service_visit or bill.service_autopay_kind='cancellation' or exists(select 1 from jobs where id=bill.job_id and plan_id is not null) then raise exception 'Renewal services do not earn upsell commission.';end if;
 select commission_bps into bps from canes_worker_rates where employee_id=p_employee and effective_on<=(now() at time zone 'America/New_York')::date order by effective_on desc limit 1;
 if coalesce(bps,0)=0 then raise exception 'Enable an upsell commission rate for this worker first.';end if;
 select id into upsell_id from canes_worker_upsells where invoice_id=p_invoice and service_line_id=p_line;
 if upsell_id is not null then raise exception 'This additional service already has a commission approval.';end if;
 insert into canes_worker_upsells(employee_id,invoice_id,service_line_id,additional_cents,commission_bps,approved_on,approved_by,reason) values(p_employee,p_invoice,p_line,p_additional,bps,(now() at time zone 'America/New_York')::date,p_actor,p_reason) returning id into upsell_id;
 return upsell_id;
end $$;
revoke all on function approve_canes_upsell(uuid,uuid,uuid,int,text,text) from public,anon,authenticated;
grant execute on function approve_canes_upsell(uuid,uuid,uuid,int,text,text) to service_role;

create function record_canes_marketing_spend(p_channel uuid,p_date date,p_amount int,p_note text,p_request text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare existing business_expenses%rowtype;expense_id uuid;channel_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended('canes-spend:'||p_request,0));
 select * into existing from business_expenses where request_key=p_request;
 if found then
  if existing.marketing_channel_id is distinct from p_channel or existing.incurred_on<>p_date or existing.amount_cents<>p_amount or existing.note<>p_note then raise exception 'This request was already used for different spending.';end if;
  return existing.id;
 end if;
 select name into channel_name from canes_marketing_channels where id=p_channel and active;
 if channel_name is null or p_amount<=0 then raise exception 'Choose a channel and amount.';end if;
 insert into business_expenses(name,category,amount_cents,incurred_on,occurrence_on,recurring,frequency,marketing_channel_id,note,request_key)
 values(channel_name,'Marketing',p_amount,p_date,p_date,false,'one_time',p_channel,p_note,p_request) returning id into expense_id;
 return expense_id;
end $$;
revoke all on function record_canes_marketing_spend(uuid,date,int,text,text) from public,anon,authenticated;
grant execute on function record_canes_marketing_spend(uuid,date,int,text,text) to service_role;

create function set_canes_job_marketing_channel(p_job uuid,p_channel uuid,p_actor text) returns void
language plpgsql security invoker set search_path=public as $$
declare work jobs%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('square-deposit:'||p_job::text,0));
 select * into work from jobs where id=p_job for update;
 if work.id is null then raise exception 'Work order not found.';end if;
 if exists(select 1 from payments where job_id=p_job or invoice_id in(select id from invoices where job_id=p_job)) then raise exception 'This work has payment history. Keep its acquisition snapshot; choose a channel on new work.';end if;
 if p_channel is not null and not exists(select 1 from canes_marketing_channels where id=p_channel and active) then raise exception 'Choose an active channel.';end if;
 update jobs set marketing_channel_id=p_channel where id=p_job;
 update estimates set marketing_channel_id=p_channel where id=work.estimate_id;
 update invoices set marketing_channel_id=p_channel where job_id=p_job;
 insert into job_activity_events(job_id,event_type,detail) values(p_job,'marketing_channel_changed',jsonb_build_object('actor',p_actor,'before',work.marketing_channel_id,'after',p_channel));
end $$;
revoke all on function set_canes_job_marketing_channel(uuid,uuid,text) from public,anon,authenticated;
grant execute on function set_canes_job_marketing_channel(uuid,uuid,text) to service_role;

create function set_canes_completed_service_date(p_job uuid,p_date date) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from jobs where id=p_job and status in('completed','invoiced','paid') for update;
 if not found then raise exception 'Choose completed work.';end if;
 update jobs set service_completed_on=p_date where id=p_job;
 update invoices set service_date=p_date where job_id=p_job;
end $$;
revoke all on function set_canes_completed_service_date(uuid,date) from public,anon,authenticated;
grant execute on function set_canes_completed_service_date(uuid,date) to service_role;

create function classify_canes_job_cost(p_cost uuid,p_line uuid,p_paid date) returns void
language plpgsql security invoker set search_path=public as $$
declare work_id uuid;
begin
 select job_id into work_id from job_expenses where id=p_cost for update;
 if work_id is null then raise exception 'Cost not found.';end if;
 if p_line is not null and not exists(select 1 from job_items where job_id=work_id and service_line_id=p_line) then raise exception 'Choose a service on this work order.';end if;
 update job_expenses set service_line_id=p_line,paid_on=p_paid where id=p_cost;
end $$;
revoke all on function classify_canes_job_cost(uuid,uuid,date) from public,anon,authenticated;
grant execute on function classify_canes_job_cost(uuid,uuid,date) to service_role;

-- One MVCC snapshot keeps report joins coherent while payments arrive. JSON
-- aggregation has no PostgREST row limit; exports use the same report contract.
create function canes_money_sources() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'jobs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from jobs r),
  'invoices',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from invoices r),
  'invoiceItems',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from invoice_items r),
  'jobItems',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from job_items r),
  'payments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from payments r),
  'refunds',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from payment_refunds r),
  'costs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from job_expenses r),
  'expenses',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from business_expenses r),
  'channels',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from canes_marketing_channels r),
  'workers',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from team_members r),
  'rates',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from canes_worker_rates r),
  'earnings',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from canes_worker_earnings r),
  'allocations',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from canes_worker_payout_allocations r),
  'time',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from job_time_entries r),
  'accounts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from crew_accounts r),
  'upsells',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from canes_worker_upsells r)
 );
$$;
revoke all on function canes_money_sources() from public,anon,authenticated;
grant execute on function canes_money_sources() to service_role;
