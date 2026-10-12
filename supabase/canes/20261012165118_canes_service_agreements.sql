-- Service agreements coexist with legacy whole-job plans; no legacy contract is converted.
create table canes_service_enrollments (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices on delete restrict,
 state text not null default 'preparing' check(state in ('preparing','card_ready','applied','needs_review','abandoned')),
 request_key text not null unique, fingerprint text not null, choices jsonb not null, snapshot jsonb not null,
 customer_name text not null, customer_email text not null, terms_text text not null, terms_version text not null,
 square_customer_id text, created_at timestamptz not null default now(), applied_at timestamptz
);
create unique index canes_active_enrollment_invoice on canes_service_enrollments(invoice_id) where state<>'abandoned';
create table canes_card_authorizations (
 id uuid primary key default gen_random_uuid(), enrollment_id uuid not null unique references canes_service_enrollments,
 square_customer_id text not null, square_card_id text not null, card_brand text, card_last4 text,
 verified_at timestamptz not null, accepted_at timestamptz not null default now(), accepted_name text not null,
 terms_version text not null, terms_text text not null, acceptance_snapshot jsonb not null,
 revoked_at timestamptz
);
alter table invoice_items add column service_net_snapshot_cents int check(service_net_snapshot_cents>=0);
alter table invoices add column service_visit boolean not null default false;
alter table invoices add column service_offers_enabled boolean not null default false;
alter table invoices add column service_offer_crew_id uuid references crews;
alter table invoices add column service_offer_durations jsonb not null default '{}';
alter table invoices add column service_autopay_authorization_id uuid references canes_card_authorizations;
alter table invoices add column service_autopay_kind text check(service_autopay_kind in ('enrollment','visit','cancellation'));
alter table invoices add column service_autopay_finalized_at timestamptz;
alter table invoices add column service_payment_issue text;

create table canes_service_agreements (
 id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references canes_service_enrollments,
 source_invoice_id uuid not null references invoices on delete restrict, service_line_id uuid not null,
 card_authorization_id uuid not null references canes_card_authorizations,
 state text not null default 'pending_payment' check(state in ('pending_payment','active','payment_review','cancel_after_next','canceled')),
 contact_id uuid references contacts, customer_name text not null, customer_email text not null, customer_phone text,
 property_key text not null, job_address text not null, service_area text check(service_area in ('north','central','south')),
 marketing_channel_id uuid references canes_marketing_channels, service_name text not null, service_description text,
 service_category text not null check(service_category in ('house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom')),
 source_line jsonb not null, original_service_on date not null, cadence_months int not null check(cadence_months in (3,4,6)),
 original_net_cents int not null check(original_net_cents>0), signup_discount_cents int not null check(signup_discount_cents>=0),
 recurring_price_cents int not null check(recurring_price_cents>0), taxable boolean not null, tax_rate_bps int not null,
 crew_id uuid references crews, duration_minutes int check(duration_minutes between 15 and 720),
 next_due_on date not null, next_cycle int not null default 1, accepted_at timestamptz not null default now(),
 accepted_name text not null, terms_text text not null, terms_version text not null,
 activated_at timestamptz, first_repeat_satisfied_at timestamptz, final_occurrence_id uuid,
 canceled_at timestamptz, cancellation_invoice_id uuid references invoices,
 cancellation_fee_override_cents int check(cancellation_fee_override_cents>=0), cancellation_fee_reason text,
 cancellation_token_hash text unique, cancellation_token_expires_at timestamptz,
 unique(source_invoice_id,service_line_id)
);
create table canes_service_occurrences (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references canes_service_agreements,
 cycle int not null check(cycle>0), due_on date not null,
 auto_schedule_allowed boolean not null default true,
 state text not null default 'needs_scheduling' check(state in ('needs_scheduling','scheduled','completed','paid','canceled')),
 job_id uuid references jobs on delete restrict, invoice_id uuid references invoices on delete restrict,
 completed_at timestamptz, paid_at timestamptz, scheduling_note text,
 unique(agreement_id,cycle),unique(agreement_id,due_on)
);
alter table canes_service_agreements add constraint canes_final_occurrence_fk foreign key(final_occurrence_id) references canes_service_occurrences;
alter table job_items add column service_occurrence_id uuid unique references canes_service_occurrences on delete restrict;
alter table invoice_items add column service_occurrence_id uuid unique references canes_service_occurrences on delete restrict;
create index canes_occurrence_job on canes_service_occurrences(job_id);
create index canes_occurrence_invoice on canes_service_occurrences(invoice_id);
create index canes_agreement_state_due on canes_service_agreements(state,next_due_on);
create table canes_crew_availability (
 crew_id uuid primary key references crews, weekdays int[] not null check(cardinality(weekdays) between 1 and 7 and weekdays<@array[0,1,2,3,4,5,6]),
 start_minute int not null check(start_minute between 0 and 1439), end_minute int not null check(end_minute between 1 and 1440 and end_minute>start_minute),
 travel_buffer_minutes int not null check(travel_buffer_minutes between 0 and 180), updated_at timestamptz not null default now()
);
create table canes_service_agreement_events (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references canes_service_agreements,
 created_at timestamptz not null default now(), actor text not null, kind text not null, detail jsonb not null default '{}'
);
insert into settings(key,value) values('service_cancellation_link_hours','72'::jsonb) on conflict(key) do nothing;

do $$ declare tab text;begin
 foreach tab in array array['canes_service_enrollments','canes_card_authorizations','canes_service_agreements','canes_service_occurrences','canes_crew_availability','canes_service_agreement_events'] loop
  execute format('alter table %I enable row level security',tab);
  execute format('revoke all on %I from anon,authenticated',tab);
  execute format('grant all on %I to service_role',tab);
 end loop;
end $$;

create function canes_service_cycle_due(p_anchor date,p_months int,p_cycle int) returns date
language sql immutable security invoker set search_path=public as $$
 select (p_anchor+make_interval(months=>p_months*p_cycle))::date;
$$;
revoke all on function canes_service_cycle_due(date,int,int) from public,anon,authenticated;
grant execute on function canes_service_cycle_due(date,int,int) to service_role;

create function canes_enrollment_fingerprint(p_invoice uuid) returns text
language sql stable security invoker set search_path=public as $$
 select md5(jsonb_build_object('revision',i.revision,'total',i.total_cents,'paid',i.amount_paid_cents,'date',i.service_date,'email',i.customer_email,'address',i.job_address,'name',i.customer_name,'items',(select jsonb_agg(to_jsonb(l) order by l.id) from invoice_items l where l.invoice_id=i.id))::text) from invoices i where i.id=p_invoice;
$$;
revoke all on function canes_enrollment_fingerprint(uuid) from public,anon,authenticated;
grant execute on function canes_enrollment_fingerprint(uuid) to service_role;

create function canes_invoice_service_values(p_invoice uuid) returns table(service_line_id uuid,net_cents int)
language sql stable security invoker set search_path=public as $$
 with weights as(select l.id,l.service_line_id,greatest(0,l.line_total_cents) as weight,sum(greatest(0,l.line_total_cents)) over() as total_weight,greatest(0,i.total_cents-i.tax_cents) as target from invoice_items l join invoices i on i.id=l.invoice_id where i.id=p_invoice),
 portions as(select *,floor(target::numeric*weight/nullif(total_weight,0)) as base,mod(target::numeric*weight,nullif(total_weight,0)) as remainder from weights),
 ranked as(select *,row_number() over(order by remainder desc,id) as rank,sum(base) over() as base_sum from portions)
 select service_line_id,(coalesce(base,0)+case when rank<=target-base_sum then 1 else 0 end)::int from ranked;
$$;
revoke all on function canes_invoice_service_values(uuid) from public,anon,authenticated;
grant execute on function canes_invoice_service_values(uuid) to service_role;

create function prepare_canes_service_enrollment(p_invoice uuid,p_revision int,p_choices jsonb,p_name text,p_email text,p_request text,p_terms text,p_terms_version text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare bill invoices%rowtype;existing canes_service_enrollments%rowtype;choice jsonb;line invoice_items%rowtype;net int;months int;saving int;choices jsonb:='[]';enrollment_id uuid;
begin
 select * into bill from invoices where id=p_invoice for update;
 select * into existing from canes_service_enrollments where invoice_id=p_invoice and state<>'abandoned';
 if existing.id is not null then
  if existing.state='applied' then return existing.id;end if;
  if existing.snapshot->'requested_choices' is distinct from p_choices or existing.customer_name<>p_name or existing.customer_email<>p_email then raise exception 'An enrollment is already being processed. Resume it before changing the offer.';end if;
  return existing.id;
 end if;
 if bill.id is null or not bill.service_offers_enabled or bill.status in('paid','void') or bill.amount_paid_cents>=bill.total_cents or bill.revision<>p_revision then raise exception 'This invoice changed or is no longer eligible. Refresh the offer.';end if;
 if bill.service_date is null or bill.service_date>(now() at time zone 'America/New_York')::date or nullif(btrim(bill.job_address),'') is null then raise exception 'Canes must confirm the completed service date and property before enrollment.';end if;
 if bill.job_id is not null and not exists(select 1 from jobs where id=bill.job_id and status in('completed','invoiced','paid') and plan_id is null) then raise exception 'Finish this service first. Existing maintenance plans need a separately accepted replacement.';end if;
 if exists(select 1 from invoice_rewards where invoice_id=bill.id and status='claimed') then raise exception 'Canes must review pending reward claims before recurring enrollment.';end if;
 if jsonb_array_length(p_choices) not between 1 and 200 or nullif(btrim(p_name),'') is null or nullif(btrim(p_email),'') is null then raise exception 'Choose services and enter your name and email.';end if;
 for choice in select * from jsonb_array_elements(p_choices) loop
  select * into line from invoice_items where invoice_id=p_invoice and service_line_id=(choice->>'service_line_id')::uuid;
  months:=(choice->>'months')::int;
  if line.id is null or line.service_category is null or line.service_category not in('house_washing','window_cleaning','gutter_cleaning','paver_concrete_cleaning','custom') or months not in(3,4,6) then raise exception 'Choose an eligible service and cadence.';end if;
  if exists(select 1 from jsonb_array_elements(choices) c where c->>'service_line_id'=line.service_line_id::text) then raise exception 'Choose each service once.';end if;
  select net_cents into net from canes_invoice_service_values(p_invoice) v where v.service_line_id=line.service_line_id;
  saving:=round(net::numeric*case months when 3 then 2000 when 4 then 1500 else 1000 end/10000.0);
  if net<=0 or saving>line.line_total_cents then raise exception 'This adjusted invoice needs owner review before enrollment.';end if;
  choices:=choices||jsonb_build_array(jsonb_build_object('service_line_id',line.service_line_id,'months',months,'original_net_cents',net,'saving_cents',saving,'recurring_cents',net-saving,'line',to_jsonb(line)));
 end loop;
 insert into canes_service_enrollments(invoice_id,request_key,fingerprint,choices,snapshot,customer_name,customer_email,terms_text,terms_version)
 values(p_invoice,p_request,canes_enrollment_fingerprint(p_invoice),choices,jsonb_build_object('invoice',to_jsonb(bill),'requested_choices',p_choices),p_name,p_email,p_terms,p_terms_version) returning id into enrollment_id;
 return enrollment_id;
end $$;
revoke all on function prepare_canes_service_enrollment(uuid,int,jsonb,text,text,text,text,text) from public,anon,authenticated;
grant execute on function prepare_canes_service_enrollment(uuid,int,jsonb,text,text,text,text,text) to service_role;

create function apply_canes_service_enrollment(p_enrollment uuid,p_lease uuid,p_old_square text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare enrollment canes_service_enrollments%rowtype;bill invoices%rowtype;card_auth canes_card_authorizations%rowtype;choice jsonb;line invoice_items%rowtype;agreement_id uuid;subtotal bigint;tax bigint;reward bigint;total bigint;
begin
 select * into enrollment from canes_service_enrollments where id=p_enrollment for update;
 if enrollment.state='applied' then return enrollment.invoice_id;end if;
 perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||enrollment.invoice_id::text,0));
 select * into bill from invoices where id=enrollment.invoice_id for update;
 select * into card_auth from canes_card_authorizations where enrollment_id=p_enrollment and revoked_at is null;
 if bill.job_id is not null and (select deposit_link_operation_id from jobs where id=bill.job_id) is distinct from p_lease then raise exception 'The deposit lease changed. Refresh before continuing.';end if;
 if card_auth.id is null or enrollment.state<>'card_ready' or bill.billing_operation_id is distinct from p_lease or bill.square_invoice_id is distinct from p_old_square then raise exception 'Card setup or invoice verification is incomplete. Refresh before continuing.';end if;
 if bill.status in('paid','void') or bill.square_publish_attempt_key is not null or bill.credit_link_pending or bill.amount_paid_cents>=bill.total_cents or canes_enrollment_fingerprint(bill.id)<>enrollment.fingerprint then raise exception 'The invoice or payment changed. Canes must review this enrollment.';end if;
 perform canes_snapshot_document('invoice',bill.id,enrollment.customer_name,'Before recurring enrollment');
 perform set_config('canes.service_enrollment_write','on',true);
 update invoice_items l set service_net_snapshot_cents=v.net_cents from canes_invoice_service_values(bill.id) v where l.invoice_id=bill.id and l.service_line_id=v.service_line_id;
 update invoice_rewards set status='declined' where invoice_id=bill.id and status='offered';
 for choice in select * from jsonb_array_elements(enrollment.choices) loop
  select * into line from invoice_items where invoice_id=bill.id and service_line_id=(choice->>'service_line_id')::uuid for update;
  update invoice_items set service_net_snapshot_cents=(choice->>'recurring_cents')::int,line_total_cents=line.line_total_cents-(choice->>'saving_cents')::int,discount_mode='amount',discount_cents=round(line.quantity*line.unit_price_cents)::int-line.line_total_cents+(choice->>'saving_cents')::int,discount_value=round(line.quantity*line.unit_price_cents)::int-line.line_total_cents+(choice->>'saving_cents')::int where id=line.id;
  insert into canes_service_agreements(enrollment_id,source_invoice_id,service_line_id,card_authorization_id,contact_id,customer_name,customer_email,customer_phone,property_key,job_address,service_area,marketing_channel_id,service_name,service_description,service_category,source_line,original_service_on,cadence_months,original_net_cents,signup_discount_cents,recurring_price_cents,taxable,tax_rate_bps,crew_id,duration_minutes,next_due_on,accepted_name,terms_text,terms_version)
  values(enrollment.id,bill.id,line.service_line_id,card_auth.id,bill.contact_id,enrollment.customer_name,enrollment.customer_email,bill.customer_phone,coalesce(bill.contact_id::text,bill.id::text)||':'||lower(btrim(bill.job_address)),bill.job_address,bill.service_area,bill.marketing_channel_id,line.name,line.description,line.service_category,to_jsonb(line),bill.service_date,(choice->>'months')::int,(choice->>'original_net_cents')::int,(choice->>'saving_cents')::int,(choice->>'recurring_cents')::int,line.taxable,bill.tax_rate_bps,bill.service_offer_crew_id,(bill.service_offer_durations->>line.service_line_id::text)::int,canes_service_cycle_due(bill.service_date,(choice->>'months')::int,1),enrollment.customer_name,enrollment.terms_text,enrollment.terms_version) returning id into agreement_id;
  insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement_id,enrollment.customer_name,'accepted',choice-'line');
 end loop;
 select coalesce(sum(line_total_cents),0),round(coalesce(sum(line_total_cents) filter(where taxable),0)*bill.tax_rate_bps/10000.0) into subtotal,tax from invoice_items where invoice_id=bill.id;
 select coalesce(sum(amount_cents),0) into reward from invoice_rewards where invoice_id=bill.id and status='approved';
 total:=subtotal+bill.adjustment_cents+tax-reward;
 if total<bill.amount_paid_cents or total<=0 or total>2147483647 then raise exception 'This discount requires an owner-reviewed credit or refund.';end if;
 if bill.job_id is not null then
  insert into job_provider_history(square_order_id,job_id) select deposit_order_id,id from jobs where id=bill.job_id and deposit_order_id is not null on conflict do nothing;
  update jobs set deposit_link_id=null,deposit_link_url=null,deposit_order_id=null,deposit_link_retired_at=now() where id=bill.job_id;
 end if;
 if bill.square_invoice_id is not null then insert into invoice_provider_history(square_invoice_id,square_order_id,invoice_id) values(bill.square_invoice_id,bill.square_order_id,bill.id) on conflict do nothing;end if;
 update invoices set subtotal_cents=subtotal,tax_cents=tax,total_cents=total,revision=revision+1,customer_name=enrollment.customer_name,customer_email=enrollment.customer_email,square_invoice_id=null,square_order_id=null,hosted_payment_url=null,service_autopay_authorization_id=card_auth.id,service_autopay_kind='enrollment',service_autopay_finalized_at=now(),service_offers_enabled=false,updated_at=now() where id=bill.id;
 update canes_service_enrollments set state='applied',applied_at=now() where id=enrollment.id;
 perform recompute_invoice_paid_locked(bill.id);
 perform set_config('canes.service_enrollment_write','off',true);
 return bill.id;
end $$;
revoke all on function apply_canes_service_enrollment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function apply_canes_service_enrollment(uuid,uuid,text) to service_role;

-- Payments activate only accepted, verified agreements. Reloads and duplicate
-- provider callbacks cannot create another occurrence or initial discount.
create function reconcile_canes_service_settlement() returns trigger language plpgsql security invoker set search_path=public as $$
declare agreement record;occurrence record;
begin
 if new.status='paid' and new.amount_paid_cents>=new.total_cents then
  for agreement in update canes_service_agreements a set state='active',activated_at=coalesce(activated_at,now()) where a.source_invoice_id=new.id and a.state in('pending_payment','payment_review') and exists(select 1 from canes_card_authorizations c where c.id=a.card_authorization_id and c.verified_at is not null and c.revoked_at is null) returning a.* loop
   insert into canes_service_occurrences(agreement_id,cycle,due_on) values(agreement.id,agreement.next_cycle,agreement.next_due_on) on conflict do nothing;
   insert into canes_service_agreement_events(agreement_id,actor,kind) values(agreement.id,'system','activated');
  end loop;
  perform 1 from canes_service_agreements where id in(select agreement_id from canes_service_occurrences where invoice_id=new.id) order by id for update nowait;
  for occurrence in update canes_service_occurrences o set state='paid',paid_at=coalesce(paid_at,now()) where o.invoice_id=new.id and o.state='completed' and o.completed_at is not null returning o.* loop
   update canes_service_agreements set first_repeat_satisfied_at=coalesce(first_repeat_satisfied_at,now()) where id=occurrence.agreement_id;
   select * into agreement from canes_service_agreements where id=occurrence.agreement_id for update;
   if agreement.state='active' then
    update canes_service_agreements set next_cycle=occurrence.cycle+1,next_due_on=canes_service_cycle_due(original_service_on,cadence_months,occurrence.cycle+1) where id=agreement.id;
    insert into canes_service_occurrences(agreement_id,cycle,due_on) values(agreement.id,occurrence.cycle+1,canes_service_cycle_due(agreement.original_service_on,agreement.cadence_months,occurrence.cycle+1)) on conflict do nothing;
   end if;
  end loop;
 elsif old.status='paid' and new.status<>'paid' then
  update canes_service_agreements set state='payment_review' where source_invoice_id=new.id and state='active';
 end if;
 return new;
end $$;
revoke all on function reconcile_canes_service_settlement() from public,anon,authenticated;
create trigger canes_service_settlement after update on invoices for each row execute function reconcile_canes_service_settlement();

create function complete_canes_service_occurrences() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status in('completed','invoiced','paid') and old.status not in('completed','invoiced','paid') then
  perform 1 from canes_service_agreements where id in(select agreement_id from canes_service_occurrences where job_id=new.id) order by id for update nowait;
  update canes_service_occurrences set state='completed',completed_at=coalesce(completed_at,now()) where job_id=new.id and state='scheduled';
  update canes_service_agreements a set state='canceled',canceled_at=now() where state='cancel_after_next' and exists(select 1 from canes_service_occurrences o where o.id=a.final_occurrence_id and o.job_id=new.id and o.state='completed');
 end if;
 return new;
end $$;
revoke all on function complete_canes_service_occurrences() from public,anon,authenticated;
create trigger canes_service_completed after update on jobs for each row execute function complete_canes_service_occurrences();

create function attach_canes_occurrence_invoice() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.job_item_id is not null then select service_occurrence_id into new.service_occurrence_id from job_items where id=new.job_item_id;end if;
 if new.service_occurrence_id is not null then update canes_service_occurrences set invoice_id=new.invoice_id where id=new.service_occurrence_id;end if;
 return new;
end $$;
revoke all on function attach_canes_occurrence_invoice() from public,anon,authenticated;
create trigger canes_occurrence_invoice before insert on invoice_items for each row execute function attach_canes_occurrence_invoice();
-- A void invoice remains in history when its work is re-billed.
alter table invoice_items drop constraint invoice_items_service_occurrence_id_key;
create unique index invoice_occurrence_unique on invoice_items(invoice_id,service_occurrence_id);

create function protect_canes_service_invoice() returns trigger language plpgsql security invoker set search_path=public as $$
declare invoice_uuid uuid;payload jsonb:=coalesce(to_jsonb(new),to_jsonb(old));
begin
 if current_setting('canes.service_enrollment_write',true)='on' then return coalesce(new,old);end if;
 if tg_table_name='invoices' then
  invoice_uuid:=old.id;
  if (old.service_autopay_finalized_at is not null or exists(select 1 from canes_service_agreements where source_invoice_id=old.id)) and
   (new.total_cents is distinct from old.total_cents or new.subtotal_cents is distinct from old.subtotal_cents or new.adjustment_cents is distinct from old.adjustment_cents or new.tax_cents is distinct from old.tax_cents or new.service_date is distinct from old.service_date or new.contact_id is distinct from old.contact_id or new.customer_email is distinct from old.customer_email or new.job_address is distinct from old.job_address or new.job_id is distinct from old.job_id) then raise exception 'This invoice has accepted recurring terms. Create a separately approved scope change or owner-reviewed credit.';end if;
 else
  invoice_uuid:=(payload->>'invoice_id')::uuid;
  if exists(select 1 from canes_service_agreements where source_invoice_id=invoice_uuid) or exists(select 1 from invoices where id=invoice_uuid and service_autopay_finalized_at is not null) then raise exception 'Accepted service lines are locked. New scope needs customer approval.';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function protect_canes_service_invoice() from public,anon,authenticated;
create trigger canes_accepted_invoice before update on invoices for each row execute function protect_canes_service_invoice();
create trigger canes_accepted_lines before insert or update or delete on invoice_items for each row execute function protect_canes_service_invoice();
create trigger canes_accepted_rewards before insert or update or delete on invoice_rewards for each row execute function protect_canes_service_invoice();

create function protect_canes_service_source_date() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.service_completed_on is distinct from old.service_completed_on and exists(select 1 from canes_service_agreements a join invoices i on i.id=a.source_invoice_id where i.job_id=old.id) then raise exception 'The original service date is part of an accepted agreement.';end if;
 return new;
end $$;
revoke all on function protect_canes_service_source_date() from public,anon,authenticated;
create trigger canes_accepted_service_date before update on jobs for each row execute function protect_canes_service_source_date();

create function protect_canes_service_early_payment() returns trigger language plpgsql security invoker set search_path=public as $$
declare work_id uuid;
begin
 work_id:=coalesce(new.job_id,(select job_id from invoices where id=new.invoice_id));
 if exists(select 1 from canes_service_occurrences where job_id=work_id) and not exists(select 1 from jobs where id=work_id and status in('completed','invoiced','paid')) then raise exception 'Recurring visits are billed after service is completed and the invoice is finalized.';end if;
 return new;
end $$;
revoke all on function protect_canes_service_early_payment() from public,anon,authenticated;
create trigger canes_service_payment_timing before insert on payments for each row execute function protect_canes_service_early_payment();

create function canes_crew_slot_open(p_crew uuid,p_start timestamptz,p_end timestamptz,p_buffer int,p_exclude uuid default null) returns boolean
language sql stable security invoker set search_path=public as $$
 select not exists(select 1 from jobs j where j.crew_id=p_crew and j.id is distinct from p_exclude and j.status<>'canceled' and j.archived_at is null and j.scheduled_at<p_end+make_interval(mins=>p_buffer) and coalesce(j.ends_at,j.scheduled_at+make_interval(mins=>j.duration_minutes))>p_start-make_interval(mins=>p_buffer))
 and not exists(select 1 from calendar_events e where (e.crew_id is null or e.crew_id=p_crew) and e.kind<>'note' and e.starts_at<p_end+make_interval(mins=>p_buffer) and e.ends_at>p_start-make_interval(mins=>p_buffer))
 -- Quote visits do not have a crew or duration in the legacy model. Their day
 -- needs manual review instead of guessing which crew/time is available.
 and not exists(select 1 from leads l where l.status in('appointment_set','confirmed') and (l.appointment_at at time zone 'America/New_York')::date=(p_start at time zone 'America/New_York')::date);
$$;
revoke all on function canes_crew_slot_open(uuid,timestamptz,timestamptz,int,uuid) from public,anon,authenticated;
grant execute on function canes_crew_slot_open(uuid,timestamptz,timestamptz,int,uuid) to service_role;

create function lock_canes_crew_schedule() returns trigger language plpgsql security invoker set search_path=public as $$
declare crew_uuid uuid;previous_crew uuid;
begin
 if tg_op='UPDATE' then previous_crew:=old.crew_id;end if;
 for crew_uuid in select distinct c from unnest(array[new.crew_id,previous_crew]) c where c is not null order by c loop
  perform pg_advisory_xact_lock(hashtextextended('canes-crew-schedule:'||crew_uuid::text,0));
 end loop;
 return new;
end $$;
revoke all on function lock_canes_crew_schedule() from public,anon,authenticated;
create trigger canes_crew_schedule_lock before insert or update of crew_id,scheduled_at,ends_at,status on jobs for each row execute function lock_canes_crew_schedule();

create function generate_canes_service_visits() returns jsonb language plpgsql security invoker set search_path=public as $$
declare occurrence canes_service_occurrences%rowtype;agreement canes_service_agreements%rowtype;availability canes_crew_availability%rowtype;candidate jobs%rowtype;day date;weekday int;offset_day int;minute int;slot timestamptz;finish timestamptz;job_uuid uuid;found_slot boolean;result jsonb:='[]';price int;quantity numeric;unit_price int;discount int;
begin
 for occurrence in select o.* from canes_service_occurrences o join canes_service_agreements a on a.id=o.agreement_id where o.state='needs_scheduling' and o.auto_schedule_allowed and a.state in('active','cancel_after_next') and (a.final_occurrence_id is null or a.final_occurrence_id=o.id) order by o.due_on,o.id limit 50 loop
  select * into agreement from canes_service_agreements where id=occurrence.agreement_id for update skip locked;
  if not found or agreement.state not in('active','cancel_after_next') or (agreement.final_occurrence_id is not null and agreement.final_occurrence_id<>occurrence.id) then continue;end if;
  select * into occurrence from canes_service_occurrences where id=occurrence.id and state='needs_scheduling' for update skip locked;
  if not found then continue;end if;
  select * into availability from canes_crew_availability where crew_id=agreement.crew_id;
  if exists(select 1 from canes_service_occurrences where agreement_id=agreement.id and cycle<occurrence.cycle and state='completed') then update canes_service_occurrences set scheduling_note='Settle the earlier completed visit before scheduling another appointment.' where id=occurrence.id;continue;end if;
  if agreement.crew_id is null or agreement.duration_minutes is null or agreement.service_area is null or availability.crew_id is null or not exists(select 1 from crews where id=agreement.crew_id and active) then
   update canes_service_occurrences set scheduling_note='Set the area, crew, service duration, working hours and travel buffer, or schedule this visit manually.' where id=occurrence.id;continue;
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('canes-crew-schedule:'||agreement.crew_id::text,0)) then continue;end if;
  found_slot:=false;job_uuid:=null;
  for offset_day in 0..14 loop
   day:=occurrence.due_on+offset_day;weekday:=extract(dow from day);
   if weekday=0 or not weekday=any(availability.weekdays) or not ((agreement.service_area='north' and weekday in(1,2)) or (agreement.service_area='central' and weekday in(3,4)) or (agreement.service_area='south' and weekday in(5,6))) then continue;end if;
   for candidate in select j.* from jobs j where j.crew_id=agreement.crew_id and j.status='scheduled' and j.archived_at is null and (j.scheduled_at at time zone 'America/New_York')::date=day and j.scheduled_at>now() and not exists(select 1 from invoices where job_id=j.id) and exists(select 1 from canes_service_occurrences o join canes_service_agreements a on a.id=o.agreement_id where o.job_id=j.id and a.property_key=agreement.property_key and a.card_authorization_id=agreement.card_authorization_id and a.tax_rate_bps=agreement.tax_rate_bps) order by j.scheduled_at for update skip locked loop
    if exists(select 1 from invoices where job_id=candidate.id) then continue;end if;
    slot:=candidate.scheduled_at;finish:=candidate.ends_at+make_interval(mins=>agreement.duration_minutes);
    if finish<=(day::timestamp+make_interval(mins=>availability.end_minute)) at time zone 'America/New_York' and canes_crew_slot_open(agreement.crew_id,slot,finish,availability.travel_buffer_minutes,candidate.id) then
     job_uuid:=candidate.id;found_slot:=true;exit;
    end if;
   end loop;
   if found_slot then exit;end if;
   minute:=availability.start_minute;
   while minute+agreement.duration_minutes<=availability.end_minute loop
    slot:=(day::timestamp+make_interval(mins=>minute)) at time zone 'America/New_York';finish:=slot+make_interval(mins=>agreement.duration_minutes);
    if slot>now() and canes_crew_slot_open(agreement.crew_id,slot,finish,availability.travel_buffer_minutes) then found_slot:=true;exit;end if;
    minute:=minute+15;
   end loop;
   if found_slot then exit;end if;
  end loop;
  if not found_slot then update canes_service_occurrences set scheduling_note='No safe area-day slot within 14 days. Review availability, blocked time and unassigned quote visits, then schedule manually.' where id=occurrence.id;continue;end if;
  price:=agreement.recurring_price_cents+case when agreement.taxable then round(agreement.recurring_price_cents::numeric*agreement.tax_rate_bps/10000.0)::int else 0 end;
  if job_uuid is null then
   insert into jobs(contact_id,customer_name,customer_phone,customer_email,job_address,job_name,status,crew_id,assigned_to,scheduled_at,ends_at,duration_minutes,service_area,service_area_selected,marketing_channel_id,total_cents,subtotal_cents,tax_cents,tax_rate_bps,creation_notification_crew_id,creation_notification_scheduled_at)
   values(agreement.contact_id,agreement.customer_name,agreement.customer_phone,agreement.customer_email,agreement.job_address,agreement.service_name,'scheduled',agreement.crew_id,(select name from crews where id=agreement.crew_id),slot,finish,agreement.duration_minutes,agreement.service_area,true,agreement.marketing_channel_id,price,agreement.recurring_price_cents,price-agreement.recurring_price_cents,agreement.tax_rate_bps,agreement.crew_id,slot) returning id into job_uuid;
   insert into tasks(kind,dedupe_key,scheduled_for,payload) values('job_confirmation','job_confirmation:'||job_uuid||':'||to_char(slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),greatest(now(),slot-interval '24 hours'),jsonb_build_object('job_id',job_uuid,'scheduled_at',slot)) on conflict(dedupe_key) do nothing;
  else
   update jobs set job_name='Recurring service visit',ends_at=finish,duration_minutes=duration_minutes+agreement.duration_minutes,total_cents=total_cents+price,subtotal_cents=subtotal_cents+agreement.recurring_price_cents,tax_cents=tax_cents+price-agreement.recurring_price_cents where id=job_uuid;
  end if;
  quantity:=(agreement.source_line->>'quantity')::numeric;unit_price:=greatest((agreement.source_line->>'unit_price_cents')::int,ceil(agreement.recurring_price_cents/quantity)::int);discount:=round(quantity*unit_price)::int-agreement.recurring_price_cents;
  insert into job_items(job_id,position,name,description,quantity,unit_price_cents,discount_cents,discount_mode,discount_value,line_total_cents,taxable,service_line_id,service_category,service_occurrence_id)
  values(job_uuid,(select coalesce(max(position),-1)+1 from job_items where job_id=job_uuid),agreement.service_name,agreement.service_description,quantity,unit_price,discount,'amount',discount,agreement.recurring_price_cents,agreement.taxable,agreement.service_line_id,agreement.service_category,occurrence.id);
  update jobs set subtotal_cents=(select sum(line_total_cents) from job_items where job_id=job_uuid and not checklist_only),tax_cents=(select round(coalesce(sum(line_total_cents) filter(where taxable),0)*agreement.tax_rate_bps/10000.0) from job_items where job_id=job_uuid and not checklist_only),total_cents=(select sum(line_total_cents)+round(coalesce(sum(line_total_cents) filter(where taxable),0)*agreement.tax_rate_bps/10000.0) from job_items where job_id=job_uuid and not checklist_only) where id=job_uuid;
  update canes_service_occurrences set job_id=job_uuid,state='scheduled',scheduling_note=null where id=occurrence.id;
  insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,'system','scheduled',jsonb_build_object('occurrence_id',occurrence.id,'due_on',occurrence.due_on,'scheduled_at',slot,'job_id',job_uuid));
  result:=result||jsonb_build_array(job_uuid);
 end loop;
 return result;
end $$;
revoke all on function generate_canes_service_visits() from public,anon,authenticated;
grant execute on function generate_canes_service_visits() to service_role;

create function cancel_canes_service_agreement(p_agreement uuid,p_token_hash text,p_mode text,p_expected_fee int,p_expected_final_due date) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare agreement canes_service_agreements%rowtype;occurrence canes_service_occurrences%rowtype;work jobs%rowtype;fee int;final_cycle int;final_due date;bill record;fee_invoice_id uuid;remaining int;crew_uuid uuid;
begin
 for crew_uuid in select distinct crew_id from jobs where id in(select job_id from canes_service_occurrences where agreement_id=p_agreement) and crew_id is not null order by crew_id loop
  if not pg_try_advisory_xact_lock(hashtextextended('canes-crew-schedule:'||crew_uuid::text,0)) then raise exception 'Scheduling is updating this service. Refresh and retry cancellation.';end if;
 end loop;
 select * into agreement from canes_service_agreements where id=p_agreement for update nowait;
 if agreement.id is null or agreement.cancellation_token_hash is distinct from p_token_hash or agreement.cancellation_token_expires_at<=now() then raise exception 'This link expired or was replaced. Request a fresh link from Canes.';end if;
 if agreement.state='canceled' then return jsonb_build_object('state','canceled','invoice_id',agreement.cancellation_invoice_id);end if;
 if agreement.activated_at is null or p_mode not in('now','after_next') then raise exception 'This agreement needs owner review.';end if;
 fee:=case when agreement.first_repeat_satisfied_at is null then agreement.signup_discount_cents+5000 else 0 end;
 fee:=least(fee,coalesce(agreement.cancellation_fee_override_cents,fee));
 if p_mode='now' and fee is distinct from p_expected_fee then raise exception 'The cancellation amount changed. Refresh to review it.';end if;
 if p_mode='after_next' then
  select * into occurrence from canes_service_occurrences where agreement_id=agreement.id and state in('needs_scheduling','scheduled') order by cycle limit 1 for update nowait;
  if occurrence.id is null then
   select coalesce(max(cycle),0)+1 into final_cycle from canes_service_occurrences where agreement_id=agreement.id;
   final_due:=canes_service_cycle_due(agreement.original_service_on,agreement.cadence_months,final_cycle);
  else final_cycle:=occurrence.cycle;final_due:=occurrence.due_on;end if;
  if final_due is distinct from p_expected_final_due then raise exception 'The final visit changed. Refresh to review it.';end if;
  if occurrence.id is null then insert into canes_service_occurrences(agreement_id,cycle,due_on) values(agreement.id,final_cycle,final_due) returning * into occurrence;end if;
  update canes_service_agreements set state='cancel_after_next',final_occurrence_id=occurrence.id,next_cycle=final_cycle,next_due_on=final_due where id=agreement.id;
  insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,'customer','cancel_after_next',jsonb_build_object('occurrence_id',occurrence.id,'due_on',final_due));
  return jsonb_build_object('state','cancel_after_next','due_on',final_due);
 end if;
 -- Cancellation is committed before any external collection attempt. A failed
 -- fee payment remains a receivable and can never restart future service.
 update canes_service_agreements set state='canceled',canceled_at=now() where id=agreement.id;
 for occurrence in select * from canes_service_occurrences where agreement_id=agreement.id and state in('needs_scheduling','scheduled') for update nowait loop
  select * into work from jobs where id=occurrence.job_id for update nowait;
  if work.id is not null then perform 1 from invoices where job_id=work.id order by id for update nowait;end if;
  if work.id is not null and work.status in('in_progress','completed','invoiced','paid') then continue;end if;
  if work.id is not null and exists(select 1 from invoices where job_id=work.id and (square_invoice_id is not null or amount_paid_cents>0)) then
   if not exists(select 1 from canes_service_occurrences where job_id=work.id and id<>occurrence.id and state<>'canceled') then update jobs set status='canceled',canceled_reason='Service agreement canceled; review any earlier invoice.' where id=work.id;end if;
   update canes_service_occurrences set state='canceled',scheduling_note='Canceled. Owner must review the earlier invoice.' where id=occurrence.id;
   continue;
  end if;
  if work.id is not null then
   delete from invoice_items where service_occurrence_id=occurrence.id;
   delete from job_items where service_occurrence_id=occurrence.id;
  end if;
  update canes_service_occurrences set state='canceled' where id=occurrence.id;
  if work.id is not null then
   select count(*) into remaining from canes_service_occurrences where job_id=work.id and state<>'canceled';
   if remaining=0 then
    update jobs set status='canceled',canceled_reason='Service agreement canceled' where id=work.id;
    update invoices set status='void',voided_at=now() where job_id=work.id and status='draft';
    update tasks set status='canceled' where kind='job_confirmation' and status='pending' and payload->>'job_id'=work.id::text;
   else
    update jobs set subtotal_cents=(select coalesce(sum(line_total_cents),0) from job_items where job_id=work.id and not checklist_only),duration_minutes=greatest(15,duration_minutes-coalesce(agreement.duration_minutes,0)),ends_at=ends_at-make_interval(mins=>coalesce(agreement.duration_minutes,0)) where id=work.id;
    update jobs set tax_cents=(select round(coalesce(sum(line_total_cents) filter(where taxable),0)*work.tax_rate_bps/10000.0) from job_items where job_id=work.id and not checklist_only),total_cents=subtotal_cents+(select round(coalesce(sum(line_total_cents) filter(where taxable),0)*work.tax_rate_bps/10000.0) from job_items where job_id=work.id and not checklist_only) where id=work.id;
    update invoices i set subtotal_cents=j.subtotal_cents,tax_cents=j.tax_cents,total_cents=j.total_cents,revision=i.revision+1 from jobs j where i.job_id=j.id and j.id=work.id and i.status='draft';
   end if;
  end if;
 end loop;
 if fee>0 then
  select * into bill from initialize_manual_invoice_locked(agreement.contact_id,agreement.customer_name,agreement.customer_phone,agreement.customer_email,agreement.job_address,'Early cancellation — '||agreement.service_name,fee,'Cancellation fee authorized in your recurring service agreement.','Original signup savings plus $50, reduced by any owner waiver.',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'[]');
  if bill.outcome<>'ready' then raise exception 'The cancellation invoice could not be recorded.';end if;
  fee_invoice_id:=bill.invoice_id;
  update invoices set service_autopay_authorization_id=agreement.card_authorization_id,service_autopay_kind='cancellation',service_autopay_finalized_at=now(),marketing_channel_id=agreement.marketing_channel_id where id=bill.invoice_id;
  update canes_service_agreements set cancellation_invoice_id=bill.invoice_id where id=agreement.id;
 end if;
 insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,'customer','canceled_now',jsonb_build_object('fee_cents',fee,'invoice_id',fee_invoice_id));
 return jsonb_build_object('state','canceled','fee_cents',fee,'invoice_id',fee_invoice_id);
end $$;
revoke all on function cancel_canes_service_agreement(uuid,text,text,int,date) from public,anon,authenticated;
grant execute on function cancel_canes_service_agreement(uuid,text,text,int,date) to service_role;

create function finalize_canes_service_invoice(p_invoice uuid,p_actor text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare bill invoices%rowtype;occurrence record;authorization_id uuid;card_id text;count_lines int:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('square-invoice:'||p_invoice::text,0));
 select * into bill from invoices where id=p_invoice for update;
 if bill.id is null or bill.status='void' then raise exception 'Invoice not found.';end if;
 if bill.service_autopay_finalized_at is not null then return bill.service_autopay_authorization_id;end if;
 if bill.square_invoice_id is not null or bill.square_publish_attempt_key is not null or bill.billing_operation_id is not null then raise exception 'Resolve the existing payment attempt before finalizing.';end if;
 if not exists(select 1 from jobs where id=bill.job_id and status in('completed','invoiced','paid')) then raise exception 'Complete the service before finalizing its bill.';end if;
 for occurrence in select o.*,a.card_authorization_id,a.recurring_price_cents,a.service_name,a.service_description,a.service_category,a.source_line,a.taxable,a.tax_rate_bps,c.square_card_id,c.revoked_at from canes_service_occurrences o join canes_service_agreements a on a.id=o.agreement_id join canes_card_authorizations c on c.id=a.card_authorization_id where o.invoice_id=bill.id and o.state in('completed','paid') and o.completed_at is not null loop
  if occurrence.revoked_at is not null or (card_id is not null and card_id<>occurrence.square_card_id) then raise exception 'Services need compatible verified payment authorization.';end if;
  if not exists(select 1 from invoice_items where invoice_id=bill.id and service_occurrence_id=occurrence.id and line_total_cents=occurrence.recurring_price_cents and name=occurrence.service_name and description is not distinct from occurrence.service_description and service_category=occurrence.service_category and quantity=(occurrence.source_line->>'quantity')::numeric and taxable=occurrence.taxable and bill.tax_rate_bps=occurrence.tax_rate_bps) then raise exception 'Service price or scope changed. Get fresh customer acceptance before charging.';end if;
  card_id:=occurrence.square_card_id;authorization_id:=occurrence.card_authorization_id;count_lines:=count_lines+1;
 end loop;
 if count_lines=0 or count_lines<>(select count(*) from invoice_items where invoice_id=bill.id) or bill.adjustment_cents<>0 or exists(select 1 from invoice_rewards where invoice_id=bill.id and status='approved') then raise exception 'Additional or changed scope needs separate customer approval.';end if;
 if bill.total_cents<>(select sum(line_total_cents)+round(coalesce(sum(line_total_cents) filter(where taxable),0)*bill.tax_rate_bps/10000.0) from invoice_items where invoice_id=bill.id) then raise exception 'Verify this invoice’s totals before finalizing.';end if;
 update invoices set service_autopay_authorization_id=authorization_id,service_autopay_kind='visit',service_autopay_finalized_at=now() where id=bill.id;
 insert into canes_service_agreement_events(agreement_id,actor,kind,detail) select agreement_id,p_actor,'invoice_finalized',jsonb_build_object('invoice_id',bill.id) from canes_service_occurrences where invoice_id=bill.id;
 return authorization_id;
end $$;
revoke all on function finalize_canes_service_invoice(uuid,text) from public,anon,authenticated;
grant execute on function finalize_canes_service_invoice(uuid,text) to service_role;

create function flag_canes_service_invoice() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 new.service_visit:=exists(select 1 from canes_service_occurrences where job_id=new.job_id);
 return new;
end $$;
revoke all on function flag_canes_service_invoice() from public,anon,authenticated;
create trigger canes_service_invoice_flag before insert on invoices for each row execute function flag_canes_service_invoice();

create function waive_canes_service_fee(p_agreement uuid,p_fee int,p_reason text,p_actor text) returns void language plpgsql security invoker set search_path=public as $$
declare agreement canes_service_agreements%rowtype;maximum int;
begin
 select * into agreement from canes_service_agreements where id=p_agreement for update;
 maximum:=case when agreement.first_repeat_satisfied_at is null then agreement.signup_discount_cents+5000 else 0 end;
 if agreement.id is null or agreement.state='canceled' or p_fee<0 or p_fee>maximum or nullif(btrim(p_reason),'') is null then raise exception 'Only an open agreement’s fee can be reduced. Paid charges require a reviewed credit or refund.';end if;
 update canes_service_agreements set cancellation_fee_override_cents=p_fee,cancellation_fee_reason=p_reason where id=agreement.id;
 insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,p_actor,'fee_reduced',jsonb_build_object('amount_cents',p_fee,'reason',p_reason));
end $$;
revoke all on function waive_canes_service_fee(uuid,int,text,text) from public,anon,authenticated;
grant execute on function waive_canes_service_fee(uuid,int,text,text) to service_role;

create function manually_schedule_canes_service(p_occurrence uuid,p_slot timestamptz,p_crew uuid,p_duration int,p_actor text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare occurrence canes_service_occurrences%rowtype;agreement canes_service_agreements%rowtype;work_id uuid;quantity numeric;unit_price int;discount int;tax int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('canes-crew-schedule:'||p_crew::text,0)) then raise exception 'The crew schedule is changing. Refresh before booking.';end if;
 select * into occurrence from canes_service_occurrences where id=p_occurrence;
 select * into agreement from canes_service_agreements where id=occurrence.agreement_id for update nowait;
 select * into occurrence from canes_service_occurrences where id=p_occurrence for update nowait;
 if occurrence.id is null or occurrence.state<>'needs_scheduling' or occurrence.job_id is not null or agreement.state not in('active','cancel_after_next') or (agreement.final_occurrence_id is not null and agreement.final_occurrence_id<>occurrence.id) then raise exception 'Choose a pending visit on an active agreement.';end if;
 if p_slot<=now() or p_duration not between 15 and 720 or not exists(select 1 from crews where id=p_crew and active) then raise exception 'Choose a future appointment, active crew and valid duration.';end if;
 perform pg_advisory_xact_lock(hashtextextended('canes-crew-schedule:'||p_crew::text,0));
 quantity:=(agreement.source_line->>'quantity')::numeric;unit_price:=greatest((agreement.source_line->>'unit_price_cents')::int,ceil(agreement.recurring_price_cents/quantity)::int);discount:=round(quantity*unit_price)::int-agreement.recurring_price_cents;
 tax:=case when agreement.taxable then round(agreement.recurring_price_cents::numeric*agreement.tax_rate_bps/10000.0)::int else 0 end;
 insert into jobs(contact_id,customer_name,customer_phone,customer_email,job_address,job_name,status,crew_id,assigned_to,scheduled_at,ends_at,duration_minutes,service_area,service_area_selected,marketing_channel_id,total_cents,subtotal_cents,tax_cents,tax_rate_bps,creation_notification_crew_id,creation_notification_scheduled_at)
 values(agreement.contact_id,agreement.customer_name,agreement.customer_phone,agreement.customer_email,agreement.job_address,agreement.service_name,'scheduled',p_crew,(select name from crews where id=p_crew),p_slot,p_slot+make_interval(mins=>p_duration),p_duration,agreement.service_area,true,agreement.marketing_channel_id,agreement.recurring_price_cents+tax,agreement.recurring_price_cents,tax,agreement.tax_rate_bps,p_crew,p_slot) returning id into work_id;
 insert into job_items(job_id,position,name,description,quantity,unit_price_cents,discount_cents,discount_mode,discount_value,line_total_cents,taxable,service_line_id,service_category,service_occurrence_id) values(work_id,0,agreement.service_name,agreement.service_description,quantity,unit_price,discount,'amount',discount,agreement.recurring_price_cents,agreement.taxable,agreement.service_line_id,agreement.service_category,occurrence.id);
 update canes_service_occurrences set job_id=work_id,state='scheduled',scheduling_note=null where id=occurrence.id;
 insert into tasks(kind,dedupe_key,scheduled_for,payload) values('job_confirmation','job_confirmation:'||work_id||':'||to_char(p_slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),greatest(now(),p_slot-interval '24 hours'),jsonb_build_object('job_id',work_id,'scheduled_at',p_slot)) on conflict(dedupe_key) do nothing;
 insert into canes_service_agreement_events(agreement_id,actor,kind,detail) values(agreement.id,p_actor,'manually_scheduled',jsonb_build_object('job_id',work_id,'due_on',occurrence.due_on,'scheduled_at',p_slot));
 return work_id;
end $$;
revoke all on function manually_schedule_canes_service(uuid,timestamptz,uuid,int,text) from public,anon,authenticated;
grant execute on function manually_schedule_canes_service(uuid,timestamptz,uuid,int,text) to service_role;

create function recover_canes_canceled_visit() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status='canceled' and old.status<>'canceled' then
  update job_items set service_occurrence_id=null where job_id=new.id and service_occurrence_id in(select id from canes_service_occurrences where job_id=new.id and state='scheduled' and agreement_id in(select id from canes_service_agreements where state<>'canceled'));
  update canes_service_occurrences set state='needs_scheduling',job_id=null,auto_schedule_allowed=false,scheduling_note='This visit was removed from the calendar. Choose a replacement appointment manually.' where job_id=new.id and state='scheduled' and agreement_id in(select id from canes_service_agreements where state<>'canceled');
 end if;
 return new;
end $$;
revoke all on function recover_canes_canceled_visit() from public,anon,authenticated;
create trigger canes_service_visit_removed after update on jobs for each row execute function recover_canes_canceled_visit();

create function abandon_canes_service_enrollment(p_invoice uuid) returns void language plpgsql security invoker set search_path=public as $$
declare bill invoices%rowtype;enrollment canes_service_enrollments%rowtype;
begin
 select * into bill from invoices where id=p_invoice for update;
 select * into enrollment from canes_service_enrollments where invoice_id=p_invoice and state<>'abandoned' for update;
 if enrollment.id is null then return;end if;
 if enrollment.state='applied' or bill.billing_operation_id is not null or exists(select 1 from canes_service_agreements where enrollment_id=enrollment.id) then raise exception 'This enrollment is already being applied or accepted. Refresh its status before making another change.';end if;
 update canes_card_authorizations set revoked_at=now() where enrollment_id=enrollment.id;
 update canes_service_enrollments set state='abandoned' where id=enrollment.id;
end $$;
revoke all on function abandon_canes_service_enrollment(uuid) from public,anon,authenticated;
grant execute on function abandon_canes_service_enrollment(uuid) to service_role;

create function protect_canes_card_acceptance() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='INSERT' and not exists(select 1 from canes_service_enrollments where id=new.enrollment_id and state in('preparing','card_ready')) then raise exception 'This enrollment was replaced. Start again from its current offer.';end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'Card acceptance evidence is immutable.';end if;
 return new;
end $$;
revoke all on function protect_canes_card_acceptance() from public,anon,authenticated;
create trigger canes_card_acceptance_history before insert or update on canes_card_authorizations for each row execute function protect_canes_card_acceptance();
