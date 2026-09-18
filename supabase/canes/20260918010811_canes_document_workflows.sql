begin;

alter table estimates add column if not exists archived_at timestamptz;
alter table estimates add column if not exists archived_by text;
alter table invoices add column if not exists archived_at timestamptz;
alter table invoices add column if not exists archived_by text;
alter table jobs add column if not exists archived_at timestamptz;
alter table jobs add column if not exists archived_by text;
alter table estimates add column if not exists revision int not null default 1;
alter table invoices add column if not exists revision int not null default 1;
alter table jobs add column if not exists revision int not null default 1;
alter table estimates add column if not exists signature_data jsonb;
alter table jobs add column if not exists public_token text not null default gen_random_uuid()::text;
create unique index if not exists jobs_public_token_uidx on jobs(public_token);

alter table estimate_items add column if not exists discount_mode text not null default 'amount' check(discount_mode in ('amount','percent'));
alter table estimate_items add column if not exists discount_value int not null default 0 check(discount_value >= 0);
update estimate_items set discount_value = discount_cents where discount_cents > 0 and discount_value = 0;
alter table job_items add column if not exists unit_price_cents int;
alter table job_items add column if not exists discount_mode text not null default 'amount' check(discount_mode in ('amount','percent'));
alter table job_items add column if not exists discount_value int not null default 0 check(discount_value >= 0);
alter table job_items add column if not exists discount_cents int not null default 0;
alter table job_items add column if not exists taxable boolean not null default false;
update job_items set unit_price_cents = case when quantity > 0 then round(line_total_cents / quantity)::int else 0 end where unit_price_cents is null;
alter table invoice_items add column if not exists discount_mode text not null default 'amount' check(discount_mode in ('amount','percent'));
alter table invoice_items add column if not exists discount_value int not null default 0 check(discount_value >= 0);
alter table invoice_items add column if not exists discount_cents int not null default 0;
alter table invoice_items add column if not exists taxable boolean not null default false;

update invoice_items ii set taxable=true from invoices i where ii.invoice_id=i.id and i.tax_rate_bps>0;

create table if not exists document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_kind text not null check(document_kind in ('estimate','job','invoice')),
  document_id uuid not null,
  revision int not null,
  created_at timestamptz not null default now(),
  actor text,
  reason text not null,
  snapshot jsonb not null,
  unique(document_kind, document_id, revision)
);
alter table document_revisions enable row level security;
revoke all on document_revisions from anon, authenticated;
grant all on document_revisions to service_role;

create or replace function canes_snapshot_document(p_kind text, p_id uuid, p_actor text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_doc jsonb; v_items jsonb;
begin
  if p_kind = 'estimate' then
    select to_jsonb(e) into v_doc from estimates e where e.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]') into v_items from estimate_items i where i.estimate_id = p_id;
  elsif p_kind = 'job' then
    select to_jsonb(j) into v_doc from jobs j where j.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]') into v_items from job_items i where i.job_id = p_id and not i.checklist_only;
  elsif p_kind = 'invoice' then
    select to_jsonb(i) into v_doc from invoices i where i.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]') into v_items from invoice_items i where i.invoice_id = p_id;
  else raise exception 'Invalid document kind'; end if;
  if v_doc is null then raise exception 'Document not found'; end if;
  insert into document_revisions(document_kind, document_id, revision, actor, reason, snapshot)
  values (p_kind,p_id,(v_doc->>'revision')::int,p_actor,p_reason,v_doc || jsonb_build_object('items',v_items))
  on conflict(document_kind,document_id,revision) do nothing;
end;
$$;
revoke all on function canes_snapshot_document(text,uuid,text,text) from public, anon, authenticated;
grant execute on function canes_snapshot_document(text,uuid,text,text) to service_role;

create or replace function canes_capture_acceptance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    perform canes_snapshot_document('estimate',new.id,new.signature_name,'accepted');
  end if;
  return new;
end;
$$;
revoke all on function canes_capture_acceptance() from public, anon, authenticated;
create trigger canes_estimate_acceptance after update on estimates for each row execute function canes_capture_acceptance();

-- Preserve the current historical record without asserting a missing drawn signature.
select canes_snapshot_document('estimate',id,signature_name,'historical acceptance imported')
from estimates where status = 'approved';

create or replace function accept_canes_estimate(p_id uuid,p_revision int,p_name text,p_source text,p_drawing jsonb,p_selected jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e estimates%rowtype; subtotal bigint; discount bigint; taxable bigint; tax bigint; total bigint;
begin
 select * into e from estimates where id=p_id for update;
 if not found or e.archived_at is not null then return jsonb_build_object('outcome','not_found'); end if;
 if e.revision<>p_revision then return jsonb_build_object('outcome','conflict'); end if;
 if e.status='approved' then return jsonb_build_object('outcome','already_approved'); end if;
 if p_source not in ('customer','in_person') or nullif(btrim(p_name),'') is null then return jsonb_build_object('outcome','invalid'); end if;
 if (p_source='customer' and (e.status not in ('sent','viewed') or e.expires_at<now() or p_drawing is null)) or
    (p_source='in_person' and e.status not in ('draft','sent','viewed')) then return jsonb_build_object('outcome','closed'); end if;
 select coalesce(sum(line_total_cents),0),coalesce(sum(discount_cents),0),coalesce(sum(line_total_cents) filter(where estimate_items.taxable),0)
 into subtotal,discount,taxable from estimate_items where estimate_id=e.id and (is_mandatory or not is_option or case when e.estimate_type='options' and p_selected is not null then id::text in(select jsonb_array_elements_text(p_selected)) else is_selected end);
 tax:=round(taxable*e.tax_rate_bps/10000.0); total:=subtotal+e.adjustment_cents+tax;
 if total<0 or total>2147483647 then return jsonb_build_object('outcome','invalid'); end if;
 if e.estimate_type='options' and p_selected is not null then
  update estimate_items set is_selected=(is_mandatory or id::text in(select jsonb_array_elements_text(p_selected))) where estimate_id=e.id and is_option;
 end if;
 update estimates set status='approved',approved_at=now(),approval_source=p_source,signature_name=p_name,signature_data=p_drawing,
 subtotal_cents=subtotal,discount_cents=discount,tax_cents=tax,total_cents=total,deposit_cents=round(total*deposit_percent/100.0),updated_at=now()
 where id=e.id returning * into e;
 return jsonb_build_object('outcome','approved','estimate',to_jsonb(e));
end;
$$;
revoke all on function accept_canes_estimate(uuid,int,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function accept_canes_estimate(uuid,int,text,text,jsonb,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
