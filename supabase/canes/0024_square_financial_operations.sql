-- Canes Pressure Washing — 0024: serialize Square side effects with ledger work.
--
-- Square can deliver sibling webhook event ids for the same payment/refund.
-- Before canceling a hosted invoice, claim the underlying financial identity
-- and pin the exact provider invoice that existed at claim time. A retry of the
-- winning event can resume effects; a sibling can never cancel a replacement.

alter table jobs add column if not exists deposit_link_retired_at timestamptz;
alter table jobs add column if not exists square_financial_operation_key text;
alter table jobs add column if not exists square_financial_operation_started_at timestamptz;

alter table invoices add column if not exists legacy_square_repair_status text not null default 'pending';
alter table invoices add column if not exists legacy_square_repair_attempts int not null default 0;
alter table invoices add column if not exists legacy_square_repair_checked_at timestamptz;
alter table invoices add column if not exists legacy_square_repair_error text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_legacy_square_repair_status_check'
  ) then
    alter table invoices add constraint invoices_legacy_square_repair_status_check
      check (legacy_square_repair_status in ('pending', 'checking', 'repaired', 'needs_review'));
  end if;
end;
$$;

create table if not exists square_financial_operations (
  operation_key text primary key,
  kind text not null check (kind in ('deposit', 'refund')),
  source_id text not null,
  event_id text not null,
  status text not null default 'prepared' check (status in ('prepared', 'finalized')),
  job_id uuid references jobs (id) on delete set null,
  invoice_id uuid references invoices (id) on delete set null,
  square_invoice_id text,
  lease_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finalized_at timestamptz
);
alter table square_financial_operations add column if not exists effects_completed_at timestamptz;
alter table square_financial_operations add column if not exists lease_id uuid;
update square_financial_operations set lease_id = gen_random_uuid() where lease_id is null;
alter table square_financial_operations alter column lease_id set default gen_random_uuid();
alter table square_financial_operations alter column lease_id set not null;

create unique index if not exists square_financial_operations_kind_source_idx
  on square_financial_operations (kind, source_id);
alter table square_financial_operations enable row level security;

create or replace function prepare_square_financial_operation(
  p_kind text,
  p_source_id text,
  p_event_id text,
  p_job_id uuid default null,
  p_payment_id uuid default null
) returns table (
  outcome text,
  operation_key text,
  job_id uuid,
  invoice_id uuid,
  square_invoice_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_operation square_financial_operations%rowtype;
  v_job_id uuid;
  v_invoice_id uuid;
  v_square_invoice_id text;
  v_lease_id uuid;
  v_busy boolean := false;
  v_old_invoice_id uuid;
begin
  if p_kind not in ('deposit', 'refund') or p_source_id is null or p_source_id = ''
    or p_event_id is null or p_event_id = '' then
    return query select 'invalid', null::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  v_key := p_kind || ':' || p_source_id;
  perform pg_advisory_xact_lock(hashtextextended('square-financial:' || v_key, 0));

  select * into v_operation
  from square_financial_operations o
  where o.operation_key = v_key
  for update;

  if found then
    v_lease_id := v_operation.lease_id;
    if v_operation.event_id = p_event_id then
      if v_operation.status = 'finalized' then
        return query select 'resume_effects',
        v_operation.operation_key, v_operation.job_id, v_operation.invoice_id,
        v_operation.square_invoice_id;
        return;
      end if;
      -- The same delivery is resuming a prepared operation. Reclaim its
      -- durable leases below before touching Square or the ledger.
    end if;
    if v_operation.event_id <> p_event_id and v_operation.status = 'finalized' then
      return query select 'duplicate', v_operation.operation_key, v_operation.job_id,
        v_operation.invoice_id, v_operation.square_invoice_id;
      return;
    end if;
    if v_operation.event_id <> p_event_id
      and v_operation.started_at >= now() - interval '10 minutes' then
      return query select 'busy', v_operation.operation_key, v_operation.job_id,
        v_operation.invoice_id, v_operation.square_invoice_id;
      return;
    end if;

    if v_operation.job_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || v_operation.job_id::text, 0));
      -- A prepared operation can have committed its ledger row before the
      -- process crashed. Another workflow may then legitimately replace or
      -- reassociate the invoice. Always re-pin to the current locked topology;
      -- otherwise a retry can remain stuck on a retired invoice forever.
      v_old_invoice_id := v_operation.invoice_id;
      if v_operation.kind = 'deposit' then
        select i.id, i.square_invoice_id
        into v_invoice_id, v_square_invoice_id
        from invoices i
        where i.job_id = v_operation.job_id and i.status <> 'void'
        order by i.created_at desc, i.id desc
        limit 1;
      else
        select p.invoice_id, i.square_invoice_id
        into v_invoice_id, v_square_invoice_id
        from payments p
        left join invoices i on i.id = p.invoice_id
        where p.id = p_payment_id;
      end if;
      if v_invoice_id is distinct from v_operation.invoice_id
        or v_square_invoice_id is distinct from v_operation.square_invoice_id then
        if v_old_invoice_id is not null then
          perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_old_invoice_id::text, 0));
          update invoices set billing_operation_id = null,
            billing_operation_started_at = null
          where id = v_old_invoice_id and billing_operation_id = v_lease_id;
        end if;
        update square_financial_operations as operation
        set invoice_id = v_invoice_id, square_invoice_id = v_square_invoice_id
        where operation.operation_key = v_key;
        v_operation.invoice_id := v_invoice_id;
        v_operation.square_invoice_id := v_square_invoice_id;
      end if;
      select exists (
        select 1 from jobs j where j.id = v_operation.job_id
          and j.square_financial_operation_key is not null
          and j.square_financial_operation_key <> v_key
          and j.square_financial_operation_started_at >= now() - interval '15 minutes'
      ) into v_busy;
    end if;
    if not v_busy and v_operation.invoice_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_operation.invoice_id::text, 0));
      select exists (
        select 1 from invoices i where i.id = v_operation.invoice_id
          and i.billing_operation_id is not null
          and i.billing_operation_id <> v_lease_id
          and i.billing_operation_started_at >= now() - interval '15 minutes'
      ) into v_busy;
    end if;
    if v_busy then
      return query select 'busy', v_key, v_operation.job_id,
        v_operation.invoice_id, v_operation.square_invoice_id;
      return;
    end if;
    update square_financial_operations
    set event_id = p_event_id, started_at = now()
    where square_financial_operations.operation_key = v_key;
    if v_operation.job_id is not null then
      update jobs set square_financial_operation_key = v_key,
        square_financial_operation_started_at = now()
      where id = v_operation.job_id;
    end if;
    if v_operation.invoice_id is not null then
      update invoices set billing_operation_id = v_lease_id,
        billing_operation_started_at = now()
      where id = v_operation.invoice_id;
    end if;
    return query select 'resume', v_key, v_operation.job_id,
      v_operation.invoice_id, v_operation.square_invoice_id;
    return;
  end if;

  if p_kind = 'deposit' then
    v_job_id := p_job_id;
    select i.id, i.square_invoice_id
    into v_invoice_id, v_square_invoice_id
    from invoices i
    where i.job_id = p_job_id and i.status <> 'void'
    order by i.created_at desc, i.id desc
    limit 1;
  else
    select coalesce(p.job_id, i.job_id), p.invoice_id, i.square_invoice_id
    into v_job_id, v_invoice_id, v_square_invoice_id
    from payments p
    left join invoices i on i.id = p.invoice_id
    where p.id = p_payment_id;
  end if;

  -- Do not short-circuit when a pre-0024 ledger row already exists. Creating
  -- the durable operation lets the idempotent ledger RPC resume the missing
  -- recompute, notification, and provider-retirement effects from that old
  -- crash window.
  if p_kind = 'deposit' and not exists (select 1 from jobs j where j.id = v_job_id) then
    return query select 'invalid', v_key, null::uuid, null::uuid, null::text;
    return;
  end if;
  if p_kind = 'refund' and p_payment_id is not null and v_job_id is null and v_invoice_id is null
    and not exists (select 1 from payments p where p.id = p_payment_id) then
    return query select 'invalid', v_key, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_job_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || v_job_id::text, 0));
    -- The first lookup only discovers which job lock to take. Re-read the
    -- provider topology under that lock so an invoice created just before the
    -- lease is pinned, never skipped.
    if p_kind = 'deposit' then
      select i.id, i.square_invoice_id
      into v_invoice_id, v_square_invoice_id
      from invoices i
      where i.job_id = v_job_id and i.status <> 'void'
      order by i.created_at desc, i.id desc
      limit 1;
    else
      select coalesce(p.job_id, i.job_id), p.invoice_id, i.square_invoice_id
      into v_job_id, v_invoice_id, v_square_invoice_id
      from payments p
      left join invoices i on i.id = p.invoice_id
      where p.id = p_payment_id;
    end if;
    select exists (
      select 1 from jobs j where j.id = v_job_id
        and j.square_financial_operation_key is not null
        and j.square_financial_operation_started_at >= now() - interval '15 minutes'
    ) into v_busy;
  end if;
  if not v_busy and v_invoice_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_invoice_id::text, 0));
    select exists (
      select 1 from invoices i where i.id = v_invoice_id
        and i.billing_operation_id is not null
        and i.billing_operation_started_at >= now() - interval '15 minutes'
    ) into v_busy;
  end if;
  if v_busy then
    return query select 'busy', v_key, v_job_id, v_invoice_id, v_square_invoice_id;
    return;
  end if;
  v_lease_id := gen_random_uuid();
  insert into square_financial_operations (
    operation_key, kind, source_id, event_id, job_id, invoice_id, square_invoice_id, lease_id
  ) values (
    v_key, p_kind, p_source_id, p_event_id, v_job_id, v_invoice_id, v_square_invoice_id, v_lease_id
  );
  if v_job_id is not null then
    update jobs set square_financial_operation_key = v_key,
      square_financial_operation_started_at = now()
    where id = v_job_id;
  end if;
  if v_invoice_id is not null then
    update invoices set billing_operation_id = v_lease_id,
      billing_operation_started_at = now()
    where id = v_invoice_id;
  end if;
  return query select 'new', v_key, v_job_id, v_invoice_id, v_square_invoice_id;
end;
$$;

revoke all on function prepare_square_financial_operation(text, text, text, uuid, uuid) from public;
grant execute on function prepare_square_financial_operation(text, text, text, uuid, uuid) to service_role;

create or replace function finalize_square_financial_operation(
  p_operation_key text,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  v_operation square_financial_operations%rowtype;
begin
  select * into v_operation from square_financial_operations
  where operation_key = p_operation_key and event_id = p_event_id
  for update;
  if not found then return false; end if;
  update square_financial_operations
  set status = 'finalized', finalized_at = coalesce(finalized_at, now())
  where operation_key = p_operation_key and event_id = p_event_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function finalize_square_financial_operation(text, text) from public;
grant execute on function finalize_square_financial_operation(text, text) to service_role;

create or replace function complete_square_financial_operation(
  p_operation_key text,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation square_financial_operations%rowtype;
begin
  select * into v_operation from square_financial_operations
  where operation_key = p_operation_key and event_id = p_event_id
    and status = 'finalized'
  for update;
  if not found then return false; end if;
  update square_financial_operations
  set effects_completed_at = coalesce(effects_completed_at, now())
  where operation_key = p_operation_key;
  if v_operation.job_id is not null then
    update jobs set square_financial_operation_key = null,
      square_financial_operation_started_at = null
    where id = v_operation.job_id
      and square_financial_operation_key = p_operation_key;
  end if;
  if v_operation.invoice_id is not null then
    update invoices set billing_operation_id = null,
      billing_operation_started_at = null
    where id = v_operation.invoice_id
      and billing_operation_id = v_operation.lease_id;
  end if;
  return true;
end;
$$;

revoke all on function complete_square_financial_operation(text, text) from public;
grant execute on function complete_square_financial_operation(text, text) to service_role;

create or replace function claim_legacy_square_repair_candidates(
  p_limit int default 5
) returns table (
  id uuid,
  number text,
  job_id uuid,
  square_order_id text,
  attempt_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update invoices
  set legacy_square_repair_status = 'pending'
  where legacy_square_repair_status = 'checking'
    and legacy_square_repair_checked_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select i.id
    from invoices i
    where i.legacy_square_repair_status = 'pending'
      and exists (
        select 1 from payments p
        where p.invoice_id = i.id and p.square_payment_id like 'evt:%'
      )
    order by i.created_at, i.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update invoices i
  set legacy_square_repair_status = 'checking',
      legacy_square_repair_attempts = i.legacy_square_repair_attempts + 1,
      legacy_square_repair_checked_at = now()
  from candidates c
  where i.id = c.id
  returning i.id, i.number, i.job_id, i.square_order_id,
    i.legacy_square_repair_attempts;
end;
$$;

revoke all on function claim_legacy_square_repair_candidates(int) from public;
grant execute on function claim_legacy_square_repair_candidates(int) to service_role;

-- Invoice creation and off-platform deposits also take the square-deposit
-- advisory lock. Wrap their hardened 0022 implementations with a durable job
-- lease check so nothing can publish/reassociate money after a Square webhook
-- has pinned its provider state and before that ledger mutation finalizes.
do $$
begin
  if to_regprocedure('initialize_invoice_from_job_unleased_locked(uuid,text,text,text,jsonb)') is null then
    alter function initialize_invoice_from_job_locked(uuid, text, text, text, jsonb)
      rename to initialize_invoice_from_job_unleased_locked;
  end if;
  if to_regprocedure('record_manual_job_deposit_unleased_locked(uuid,integer,text,integer,text,text,text,text,text)') is null then
    alter function record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text, text)
      rename to record_manual_job_deposit_unleased_locked;
  end if;
end;
$$;

create or replace function initialize_invoice_from_job_locked(
  p_job_id uuid,
  p_public_token text,
  p_message_to_customer text,
  p_terms text,
  p_reward_offers jsonb default '[]'::jsonb
) returns table (outcome text, invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  if exists (
    select 1 from jobs j where j.id = p_job_id
      and (
        j.status = 'canceled'
        or j.deposit_link_operation_id is not null
        or (
          j.square_financial_operation_key is not null
          and j.square_financial_operation_started_at >= now() - interval '15 minutes'
        )
      )
  ) then
    return query select 'financial_busy', null::uuid, null::text;
    return;
  end if;
  return query
  select * from initialize_invoice_from_job_unleased_locked(
    p_job_id, p_public_token, p_message_to_customer, p_terms, p_reward_offers
  );
end;
$$;

revoke all on function initialize_invoice_from_job_locked(uuid, text, text, text, jsonb) from public;
grant execute on function initialize_invoice_from_job_locked(uuid, text, text, text, jsonb) to service_role;

create or replace function record_manual_job_deposit_locked(
  p_job_id uuid,
  p_amount_cents int,
  p_method text,
  p_expected_collected_cents int,
  p_expected_square_payment_id text,
  p_expected_link_id text,
  p_expected_link_url text,
  p_expected_order_id text,
  p_idempotency_key text
) returns table (
  outcome text,
  payment_id uuid,
  invoice_id uuid,
  collected_cents int,
  job_total_cents int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  if exists (
    select 1 from jobs j where j.id = p_job_id
      and j.square_financial_operation_key is not null
      and j.square_financial_operation_started_at >= now() - interval '15 minutes'
  ) then
    return query select 'financial_busy', null::uuid, null::uuid, 0, 0;
    return;
  end if;
  return query
  select * from record_manual_job_deposit_unleased_locked(
    p_job_id, p_amount_cents, p_method, p_expected_collected_cents,
    p_expected_square_payment_id, p_expected_link_id,
    p_expected_link_url, p_expected_order_id, p_idempotency_key
  );
end;
$$;

revoke all on function record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text, text) from public;
grant execute on function record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text, text) to service_role;
