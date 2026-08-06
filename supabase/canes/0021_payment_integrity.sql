-- Canes Pressure Washing — 0021: payment-ledger integrity hardening.
-- Run after 0018_push_notifications.sql (and 0020, when present).
--
-- This migration is intentionally self-contained and rerunnable. It repairs
-- legacy refund caches, gives each paid lifecycle a stable generation, and
-- replaces the money RPCs whose lock ordering or invoice association could be
-- stale during a concurrent refund, replacement invoice, or Square webhook.

-- Rows created before refunded_cents existed used status='refunded' as the
-- entire refund record. Restore their net value before any cache is rebuilt.
with refund_totals as (
  select payment_id, least(sum(amount_cents), 2147483647)::int as refunded_cents
  from payment_refunds
  group by payment_id
)
update payments p
set refunded_cents = least(
  p.amount_cents,
  greatest(p.refunded_cents, r.refunded_cents)
)
from refund_totals r
where p.id = r.payment_id
  and p.refunded_cents < least(p.amount_cents, r.refunded_cents);

update payments
set refunded_cents = amount_cents
where status = 'refunded'
  and refunded_cents = 0;

-- Keep the status cache consistent with the repaired monetary cache. Partial
-- refunds remain completed; only a zero-net payment is fully refunded.
update payments
set status = case
  when refunded_cents = amount_cents then 'refunded'
  else 'completed'
end
where status is distinct from case
  when refunded_cents = amount_cents then 'refunded'
  else 'completed'
end;

alter table invoices
  add column if not exists settlement_generation int not null default 0;

alter table invoices
  drop constraint if exists invoices_settlement_generation_check;
alter table invoices
  add constraint invoices_settlement_generation_check
  check (settlement_generation >= 0);

-- A pre-migration paid invoice has already completed its first settlement.
update invoices
set settlement_generation = 1
where status = 'paid'
  and settlement_generation = 0;

-- Repair the two derived caches affected by the legacy refund backfill.
with deposit_totals as (
  select
    j.id as job_id,
    coalesce(sum(p.amount_cents - p.refunded_cents), 0) as net_cents,
    min(p.created_at) filter (where p.amount_cents > p.refunded_cents) as first_collected_at,
    (array_agg(p.square_payment_id order by p.created_at, p.id)
      filter (
        where p.amount_cents > p.refunded_cents
          and p.square_payment_id is not null
      ))[1] as first_square_payment_id
  from jobs j
  left join payments p
    on p.job_id = j.id
   and p.kind = 'deposit'
  group by j.id
)
update jobs j
set deposit_collected_cents = d.net_cents::int,
    deposit_paid_at = case
      when d.net_cents > 0 then coalesce(j.deposit_paid_at, d.first_collected_at, now())
      else null
    end,
    deposit_square_payment_id = d.first_square_payment_id
from deposit_totals d
where j.id = d.job_id
  and d.net_cents between 0 and 2147483647;

with invoice_totals as (
  select
    i.id as invoice_id,
    coalesce(sum(p.amount_cents - p.refunded_cents), 0) as net_cents
  from invoices i
  left join payments p on p.invoice_id = i.id
  group by i.id
)
update invoices i
set amount_paid_cents = t.net_cents::int,
    updated_at = now()
from invoice_totals t
where i.id = t.invoice_id
  and t.net_cents between 0 and 2147483647
  and i.amount_paid_cents is distinct from t.net_cents::int;

-- A legacy fully-refunded payment can leave a paid invoice cache behind. Use
-- the same retirement semantics as the live refund RPC: the old Square bill
-- is no longer a valid collection surface, and any remaining credit belongs
-- on a replacement invoice.
with ledger_totals as (
  select
    i.id as invoice_id,
    coalesce(sum(p.amount_cents - p.refunded_cents), 0) as net_cents
  from invoices i
  left join payments p on p.invoice_id = i.id
  group by i.id
), retired as (
  update invoices i
  set status = 'void',
      amount_paid_cents = t.net_cents::int,
      paid_at = null,
      voided_at = coalesce(i.voided_at, now()),
      hosted_payment_url = null,
      billing_operation_id = null,
      billing_operation_started_at = null,
      updated_at = now()
  from ledger_totals t
  where i.id = t.invoice_id
    and i.status = 'paid'
    and t.net_cents between 0 and 2147483647
    and t.net_cents < i.total_cents
  returning i.job_id
)
update jobs j
set status = 'completed'
where j.id in (select job_id from retired where job_id is not null)
  and j.status in ('paid', 'invoiced');

-- The return contracts below are expanded, so PostgreSQL requires a drop
-- rather than CREATE OR REPLACE. Everything is recreated in this transaction.
drop function if exists record_square_deposit_payment_locked(uuid, uuid, int, text, text, text, text);

create function record_square_deposit_payment_locked(
  p_job_id uuid,
  p_invoice_id uuid,
  p_amount_cents int,
  p_currency text,
  p_square_payment_id text,
  p_square_order_id text,
  p_event_id text
) returns table (
  payment_id uuid,
  inserted boolean,
  first_payment boolean,
  owned_event boolean,
  same_event boolean,
  invoice_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_payment_id uuid;
  v_live_invoice_id uuid;
  v_old_invoice_id uuid;
  v_invoice_lock_id uuid;
  v_deposit_net bigint;
  v_remaining_square_payment_id text;
  v_remaining_created_at timestamptz;
  v_first boolean := false;
begin
  if p_amount_cents <= 0 or p_currency is null or p_square_payment_id is null then
    raise exception 'invalid Square deposit payment';
  end if;

  -- Canonical topology order: job/deposit first, then every invoice id in
  -- deterministic order, then payment/job rows. Replacement-invoice attach
  -- and refunds use the same order.
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));

  select i.id
  into v_live_invoice_id
  from invoices i
  where i.job_id = p_job_id
    and i.status <> 'void'
  order by i.created_at desc, i.id desc
  limit 1;

  select p.*
  into v_payment
  from payments p
  where p.square_payment_id = p_square_payment_id;
  if found then v_old_invoice_id := v_payment.invoice_id; end if;

  for v_invoice_lock_id in
    select id
    from (
      select v_live_invoice_id as id
      union
      select v_old_invoice_id as id
    ) lock_ids
    where id is not null
    order by id::text
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('square-invoice:' || v_invoice_lock_id::text, 0)
    );
  end loop;

  -- Revalidate the live invoice after its advisory lock. The argument is only
  -- a caller hint; it must never attach money to a now-void invoice.
  if v_live_invoice_id is not null then
    perform 1
    from invoices i
    where i.id = v_live_invoice_id
      and i.job_id = p_job_id
      and i.status <> 'void'
    for update;
    if not found then v_live_invoice_id := null; end if;
  end if;

  select p.*
  into v_payment
  from payments p
  where p.square_payment_id = p_square_payment_id
  for update;

  if found then
    if v_payment.job_id is distinct from p_job_id
      or v_payment.kind is distinct from 'deposit' then
      return query select
        v_payment.id, false, false, false, false, v_payment.invoice_id;
      return;
    end if;
    if v_payment.status not in ('completed', 'refunded') then
      return query select
        v_payment.id, false, false, false, false, v_payment.invoice_id;
      return;
    end if;
    -- A delayed payment.updated sibling must not revive a payment that a
    -- completed refund has already reduced to zero.
    if v_payment.status = 'refunded' then
      return query select
        v_payment.id, false, false, true, false, v_payment.invoice_id;
      return;
    end if;

    -- A replacement created after the original webhook owns the credit. Move
    -- only from no invoice or a locked void invoice; never steal from a live
    -- invoice selected by another workflow.
    if v_live_invoice_id is not null
      and (
        v_payment.invoice_id is null
        or exists (
          select 1
          from invoices old
          where old.id = v_payment.invoice_id
            and old.status = 'void'
        )
      ) then
      update payments
      set invoice_id = v_live_invoice_id
      where id = v_payment.id;
      v_payment.invoice_id := v_live_invoice_id;

      if v_old_invoice_id is not null
        and v_old_invoice_id <> v_live_invoice_id then
        update invoices old
        set amount_paid_cents = coalesce((
              select sum(p.amount_cents - p.refunded_cents)::int
              from payments p
              where p.invoice_id = old.id
            ), 0),
            updated_at = now()
        where old.id = v_old_invoice_id;
      end if;
    end if;

    select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
    into v_deposit_net
    from payments p
    where p.job_id = p_job_id
      and p.kind = 'deposit';

    select p.square_payment_id, p.created_at
    into v_remaining_square_payment_id, v_remaining_created_at
    from payments p
    where p.job_id = p_job_id
      and p.kind = 'deposit'
      and p.square_payment_id is not null
      and p.amount_cents > p.refunded_cents
    order by p.created_at, p.id
    limit 1;

    if v_deposit_net > 2147483647 then
      raise exception 'Job deposit total exceeds integer cents range';
    end if;
    perform 1 from jobs j where j.id = p_job_id for update;
    update jobs
    set deposit_collected_cents = v_deposit_net::int,
        deposit_paid_at = case
          when v_deposit_net > 0 then coalesce(deposit_paid_at, v_remaining_created_at, now())
          else null
        end,
        deposit_square_payment_id = v_remaining_square_payment_id
    where id = p_job_id;

    v_first := v_payment.refunded_cents = 0
      and v_deposit_net = v_payment.amount_cents;
    return query select
      v_payment.id,
      false,
      v_first,
      true,
      v_payment.external_event_id is not distinct from p_event_id,
      v_payment.invoice_id;
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, square_order_id, external_event_id, recorded_by
  ) values (
    v_live_invoice_id, p_job_id, p_amount_cents, p_currency, 'card',
    'square_webhook', 'completed', 'deposit', p_square_payment_id,
    p_square_order_id, p_event_id, 'square'
  )
  returning id into v_payment_id;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_deposit_net
  from payments p
  where p.job_id = p_job_id
    and p.kind = 'deposit';
  if v_deposit_net > 2147483647 then
    raise exception 'Job deposit total exceeds integer cents range';
  end if;

  perform 1 from jobs j where j.id = p_job_id for update;
  update jobs
  set deposit_collected_cents = v_deposit_net::int,
      deposit_paid_at = coalesce(deposit_paid_at, now()),
      deposit_square_payment_id = coalesce(deposit_square_payment_id, p_square_payment_id)
  where id = p_job_id;
  v_first := v_deposit_net = p_amount_cents;

  return query select
    v_payment_id, true, v_first, true, true, v_live_invoice_id;
end;
$$;

revoke all on function record_square_deposit_payment_locked(uuid, uuid, int, text, text, text, text) from public;
grant execute on function record_square_deposit_payment_locked(uuid, uuid, int, text, text, text, text) to service_role;

drop function if exists refund_square_payment_locked(uuid, text, int, text, text);

create function refund_square_payment_locked(
  p_payment_id uuid,
  p_refund_id text,
  p_amount_cents int,
  p_currency text,
  p_event_id text
) returns table (
  claimed boolean,
  owned_event boolean,
  same_event boolean,
  fully_refunded boolean,
  refunded_cents int,
  invoice_id uuid,
  job_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hint_job_id uuid;
  v_job_id uuid;
  v_invoice_id uuid;
  v_kind text;
  v_status text;
  v_payment_amount int;
  v_payment_currency text;
  v_current_refunded int;
  v_existing_payment_id uuid;
  v_new_refunded int;
  v_invoice_paid bigint;
  v_invoice_total int;
  v_invoice_job_id uuid;
  v_deposit_net bigint;
  v_remaining_square_payment_id text;
  v_remaining_created_at timestamptz;
begin
  if p_refund_id is null or p_refund_id = '' then
    return query select false, false, false, false, 0, null::uuid, null::uuid;
    return;
  end if;

  -- The refund id is Square's idempotency identity. Serialize it before the
  -- early duplicate read so two webhook types for the same refund converge.
  perform pg_advisory_xact_lock(hashtextextended('square-refund:' || p_refund_id, 0));

  select r.payment_id
  into v_existing_payment_id
  from payment_refunds r
  where r.square_refund_id = p_refund_id;
  if found then
    select coalesce(p.job_id, i.job_id)
    into v_hint_job_id
    from payments p
    left join invoices i on i.id = p.invoice_id
    where p.id = v_existing_payment_id;
    if v_hint_job_id is not null then
      perform pg_advisory_xact_lock(
        hashtextextended('square-deposit:' || v_hint_job_id::text, 0)
      );
    end if;

    select coalesce(p.job_id, i.job_id), p.invoice_id
    into v_job_id, v_invoice_id
    from payments p
    left join invoices i on i.id = p.invoice_id
    where p.id = v_existing_payment_id;
    if v_invoice_id is not null then
      perform pg_advisory_xact_lock(
        hashtextextended('square-invoice:' || v_invoice_id::text, 0)
      );
    end if;

    select p.refunded_cents, p.amount_cents, p.invoice_id,
           coalesce(p.job_id, i.job_id)
    into v_current_refunded, v_payment_amount, v_invoice_id, v_job_id
    from payments p
    left join invoices i on i.id = p.invoice_id
    where p.id = v_existing_payment_id
    for update of p;
    return query select
      false,
      v_existing_payment_id = p_payment_id,
      exists (
        select 1
        from payment_refunds r
        where r.square_refund_id = p_refund_id
          and r.external_event_id is not distinct from p_event_id
      ),
      v_current_refunded >= v_payment_amount,
      v_current_refunded,
      v_invoice_id,
      v_job_id;
    return;
  end if;

  -- The job-level lock owns invoice reassociation. Take it before trusting the
  -- payment's invoice_id, then re-read invoice_id and lock that exact invoice.
  select coalesce(p.job_id, i.job_id)
  into v_hint_job_id
  from payments p
  left join invoices i on i.id = p.invoice_id
  where p.id = p_payment_id;
  if not found then
    return query select false, false, false, false, 0, null::uuid, null::uuid;
    return;
  end if;

  if v_hint_job_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('square-deposit:' || v_hint_job_id::text, 0)
    );
  end if;

  select coalesce(p.job_id, i.job_id), p.invoice_id, p.kind
  into v_job_id, v_invoice_id, v_kind
  from payments p
  left join invoices i on i.id = p.invoice_id
  where p.id = p_payment_id;
  if not found then
    return query select false, false, false, false, 0, null::uuid, null::uuid;
    return;
  end if;
  if v_job_id is distinct from v_hint_job_id then
    raise exception 'Payment job association changed while claiming refund';
  end if;

  if v_invoice_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('square-invoice:' || v_invoice_id::text, 0)
    );
  end if;

  select
    coalesce(p.job_id, i.job_id),
    p.invoice_id,
    p.kind,
    p.status,
    p.amount_cents,
    p.currency,
    p.refunded_cents
  into
    v_job_id,
    v_invoice_id,
    v_kind,
    v_status,
    v_payment_amount,
    v_payment_currency,
    v_current_refunded
  from payments p
  left join invoices i on i.id = p.invoice_id
  where p.id = p_payment_id
  for update of p;
  if not found then
    return query select false, false, false, false, 0, null::uuid, null::uuid;
    return;
  end if;

  if p_amount_cents <= 0
    or p_currency is distinct from v_payment_currency
    or v_status not in ('completed', 'refunded') then
    return query select
      false, false, false, v_status = 'refunded', v_current_refunded,
      v_invoice_id, v_job_id;
    return;
  end if;

  v_new_refunded := v_current_refunded + p_amount_cents;
  if v_new_refunded > v_payment_amount then
    return query select
      false, false, false, v_status = 'refunded', v_current_refunded,
      v_invoice_id, v_job_id;
    return;
  end if;

  insert into payment_refunds (
    payment_id, square_refund_id, amount_cents, currency, external_event_id
  ) values (
    p_payment_id, p_refund_id, p_amount_cents, p_currency, p_event_id
  );

  update payments
  set refunded_cents = v_new_refunded,
      status = case
        when v_new_refunded = amount_cents then 'refunded'
        else 'completed'
      end,
      square_refund_id = coalesce(square_refund_id, p_refund_id)
  where id = p_payment_id;

  if v_kind = 'deposit' and v_job_id is not null then
    select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
    into v_deposit_net
    from payments p
    where p.job_id = v_job_id
      and p.kind = 'deposit';
    if v_deposit_net > 2147483647 then
      raise exception 'Job deposit total exceeds integer cents range';
    end if;

    select p.square_payment_id, p.created_at
    into v_remaining_square_payment_id, v_remaining_created_at
    from payments p
    where p.job_id = v_job_id
      and p.kind = 'deposit'
      and p.amount_cents > p.refunded_cents
      and p.square_payment_id is not null
    order by p.created_at, p.id
    limit 1;

    perform 1 from jobs j where j.id = v_job_id for update;
    update jobs
    set deposit_collected_cents = v_deposit_net::int,
        deposit_paid_at = case
          when v_deposit_net > 0 then coalesce(v_remaining_created_at, deposit_paid_at, now())
          else null
        end,
        deposit_square_payment_id = v_remaining_square_payment_id
    where id = v_job_id;
  end if;

  if v_invoice_id is not null then
    select
      coalesce(sum(p.amount_cents - p.refunded_cents), 0),
      i.total_cents,
      i.job_id
    into v_invoice_paid, v_invoice_total, v_invoice_job_id
    from invoices i
    left join payments p on p.invoice_id = i.id
    where i.id = v_invoice_id
    group by i.total_cents, i.job_id;
    if v_invoice_paid > 2147483647 then
      raise exception 'Invoice paid total exceeds integer cents range';
    end if;

    if v_invoice_paid < v_invoice_total then
      update invoices
      set status = 'void',
          amount_paid_cents = v_invoice_paid::int,
          paid_at = null,
          voided_at = coalesce(voided_at, now()),
          hosted_payment_url = null,
          billing_operation_id = null,
          billing_operation_started_at = null,
          updated_at = now()
      where id = v_invoice_id;

      if v_invoice_job_id is not null then
        update jobs
        set status = 'completed'
        where id = v_invoice_job_id
          and status in ('paid', 'invoiced');
      end if;
    else
      update invoices
      set amount_paid_cents = v_invoice_paid::int,
          updated_at = now()
      where id = v_invoice_id;
    end if;
  end if;

  return query select
    true,
    true,
    true,
    v_new_refunded = v_payment_amount,
    v_new_refunded,
    v_invoice_id,
    v_job_id;
end;
$$;

revoke all on function refund_square_payment_locked(uuid, text, int, text, text) from public;
grant execute on function refund_square_payment_locked(uuid, text, int, text, text) to service_role;

-- Current Square order tenders have real payment ids. When the old webhook
-- reconciler already wrote the same money under evt:<event_id>, adopt exactly
-- one amount/currency-compatible synthetic row instead of double-counting it.
-- A complete order snapshot can replace the entire synthetic set atomically.
-- This handles legacy cumulative rows (including rows whose individual values
-- do not line up with tender boundaries) without ever counting both formats.
create or replace function reconcile_legacy_square_invoice_payments_locked(
  p_invoice_id uuid,
  p_job_id uuid,
  p_tenders jsonb,
  p_event_id text
) returns table (
  had_legacy boolean,
  reconciled boolean,
  inserted_cents int,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_job_id uuid;
  v_target_invoice_id uuid;
  v_invoice_lock_id uuid;
  v_legacy_count int;
  v_eligible_count int;
  v_legacy_cents bigint;
  v_missing_cents bigint;
begin
  if jsonb_typeof(p_tenders) is distinct from 'array' then
    return query select false, false, 0, 'invalid tender payload'::text;
    return;
  end if;

  -- Job invoices are a single money topology. Serialize replacement lookup
  -- before taking invoice locks so a repair aimed at a retired invoice cannot
  -- leave its recovered tender stranded there. Manual invoices deliberately
  -- have no job topology and retain their original invoice association.
  if p_job_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('square-deposit:' || p_job_id::text, 0)
    );
  end if;

  select i.job_id into v_invoice_job_id
  from invoices i
  where i.id = p_invoice_id;
  if not found or v_invoice_job_id is distinct from p_job_id then
    return query select false, false, 0, 'invoice association changed'::text;
    return;
  end if;

  v_target_invoice_id := p_invoice_id;
  if p_job_id is not null then
    select i.id
    into v_target_invoice_id
    from invoices i
    where i.job_id = p_job_id
      and i.status <> 'void'
      and i.voided_at is null
    order by i.created_at desc, i.id desc
    limit 1;
    if not found then v_target_invoice_id := p_invoice_id; end if;
  end if;

  -- Advisory and row locks use the same stable UUID order as
  -- attach_job_deposits_locked. Lock every invoice in a job because the final
  -- carry-forward sweeps positive credit from every retired generation.
  for v_invoice_lock_id in
    select i.id
    from invoices i
    where i.id = p_invoice_id
      or (p_job_id is not null and i.job_id = p_job_id)
    order by i.id::text
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('square-invoice:' || v_invoice_lock_id::text, 0)
    );
  end loop;

  perform 1
  from invoices i
  where i.id = p_invoice_id
    and i.job_id is not distinct from p_job_id
  for update;
  if not found then
    return query select false, false, 0, 'invoice association changed'::text;
    return;
  end if;

  if p_job_id is not null
    and v_target_invoice_id is distinct from p_invoice_id then
    perform 1
    from invoices i
    where i.id = v_target_invoice_id
      and i.job_id = p_job_id
      and i.status <> 'void'
      and i.voided_at is null
    for update;
    if not found then
      return query select false, false, 0, 'replacement invoice changed'::text;
      return;
    end if;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tenders) as t(payment_id text, amount_cents int, currency text)
    where t.payment_id is null or t.payment_id = ''
      or t.amount_cents is null or t.amount_cents <= 0
      or t.currency is distinct from 'USD'
  ) or exists (
    select t.payment_id
    from jsonb_to_recordset(p_tenders) as t(payment_id text, amount_cents int, currency text)
    group by t.payment_id
    having count(*) > 1
  ) then
    return query select false, false, 0, 'invalid or duplicate tender'::text;
    return;
  end if;

  select count(*), coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_legacy_count, v_legacy_cents
  from payments p
  where p.invoice_id = p_invoice_id
    and p.job_id is not distinct from p_job_id
    and p.kind = 'balance'
    and p.source = 'square_webhook'
    and p.square_payment_id like 'evt:%'
    and p.external_event_id is not null
    and p.square_payment_id = 'evt:' || p.external_event_id;

  if v_legacy_count = 0 then
    if p_job_id is not null
      and exists (
        select 1
        from invoices i
        where i.id = v_target_invoice_id
          and i.job_id = p_job_id
          and i.status <> 'void'
          and i.voided_at is null
      ) then
      -- A complete snapshot can contain only real tenders that were recorded
      -- against the retired Square invoice before its replacement existed.
      perform attach_job_deposits_locked(p_job_id, v_target_invoice_id);
    end if;
    return query select false, true, 0, null::text;
    return;
  end if;

  select count(*)
  into v_eligible_count
  from payments p
  where p.invoice_id = p_invoice_id
    and p.job_id is not distinct from p_job_id
    and p.kind = 'balance'
    and p.source = 'square_webhook'
    and p.status = 'completed'
    and p.refunded_cents = 0
    and p.square_payment_id like 'evt:%'
    and p.external_event_id is not null
    and p.square_payment_id = 'evt:' || p.external_event_id
    and not exists (select 1 from payment_refunds r where r.payment_id = p.id);
  if v_eligible_count <> v_legacy_count then
    return query select true, false, 0, 'legacy rows include refund history'::text;
    return;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tenders) as t(payment_id text, amount_cents int, currency text)
    join payments p on p.square_payment_id = t.payment_id
    left join invoices pi on pi.id = p.invoice_id
    where (
        p_job_id is null
        and (
          p.invoice_id is distinct from p_invoice_id
          or p.job_id is not null
        )
      )
      or (
        p_job_id is not null
        and (
          coalesce(p.job_id, pi.job_id) is distinct from p_job_id
          or pi.job_id is distinct from p_job_id
        )
      )
      or p.kind is distinct from 'balance'
      or p.source is distinct from 'square_webhook'
      or p.amount_cents is distinct from t.amount_cents
      or p.currency is distinct from t.currency
  ) then
    return query select true, false, 0, 'real tender conflicts with ledger'::text;
    return;
  end if;

  select coalesce(sum(t.amount_cents), 0)
  into v_missing_cents
  from jsonb_to_recordset(p_tenders) as t(payment_id text, amount_cents int, currency text)
  where not exists (
    select 1 from payments p where p.square_payment_id = t.payment_id
  );

  -- RetrieveOrder is the authoritative, complete tender snapshot. Legacy
  -- evt:* amounts were sometimes cumulative ($100 then $200 for two $100
  -- tenders), so comparing their corrupt sum to the real sum would preserve
  -- the exact inflation this repair exists to remove. With no refund history
  -- or identity conflict, replace the entire synthetic set unconditionally.
  if v_missing_cents > 2147483647 then
    raise exception 'Square payment total exceeds integer cents range';
  end if;

  delete from payments p
  where p.invoice_id = p_invoice_id
    and p.job_id is not distinct from p_job_id
    and p.kind = 'balance'
    and p.source = 'square_webhook'
    and p.status = 'completed'
    and p.refunded_cents = 0
    and p.square_payment_id like 'evt:%'
    and p.external_event_id is not null
    and p.square_payment_id = 'evt:' || p.external_event_id;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, external_event_id, recorded_by
  )
  select
    v_target_invoice_id, p_job_id, t.amount_cents, t.currency, 'card',
    'square_webhook', 'completed', 'balance', t.payment_id, p_event_id, 'square'
  from jsonb_to_recordset(p_tenders) as t(payment_id text, amount_cents int, currency text)
  where not exists (
    select 1 from payments p where p.square_payment_id = t.payment_id
  );

  if p_job_id is not null
    and exists (
      select 1
      from invoices i
      where i.id = v_target_invoice_id
        and i.job_id = p_job_id
        and i.status <> 'void'
        and i.voided_at is null
    ) then
    -- This also adopts compatible real tenders that were already recorded on
    -- the retired source and recomputes both old and replacement caches.
    perform attach_job_deposits_locked(p_job_id, v_target_invoice_id);
  else
    -- No job means this is an intentional manual invoice. Never infer a
    -- replacement across unrelated manual invoices.
    perform recompute_invoice_paid_locked(p_invoice_id);
  end if;

  return query select true, true, v_missing_cents::int, null::text;
end;
$$;

revoke all on function reconcile_legacy_square_invoice_payments_locked(uuid, uuid, jsonb, text) from public;
grant execute on function reconcile_legacy_square_invoice_payments_locked(uuid, uuid, jsonb, text) to service_role;

create or replace function record_square_invoice_payment_locked(
  p_invoice_id uuid,
  p_job_id uuid,
  p_amount_cents int,
  p_currency text,
  p_square_payment_id text,
  p_event_id text
) returns table (
  payment_id uuid,
  amount_cents int,
  inserted boolean,
  owned_event boolean,
  same_event boolean,
  payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_new_id uuid;
  v_invoice_job_id uuid;
  v_target_invoice_id uuid;
  v_old_invoice_id uuid;
  v_old_invoice_job_id uuid;
  v_old_invoice_status text;
  v_old_invoice_voided_at timestamptz;
  v_invoice_lock_id uuid;
begin
  if p_amount_cents <= 0 or p_square_payment_id is null or p_currency is null then
    raise exception 'Square payment must have a positive amount, currency, and payment id';
  end if;

  -- Replacement selection and invoice association are one job-level money
  -- topology. Take the job lock first, then every invoice lock in UUID order.
  -- A null job is an intentional manual invoice and must never be redirected.
  if p_job_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('square-deposit:' || p_job_id::text, 0)
    );
  end if;

  select i.job_id
  into v_invoice_job_id
  from invoices i
  where i.id = p_invoice_id;
  if not found or v_invoice_job_id is distinct from p_job_id then
    return query select
      null::uuid, p_amount_cents, false, false, false, 'association_changed'::text;
    return;
  end if;

  v_target_invoice_id := p_invoice_id;
  if p_job_id is not null then
    select i.id
    into v_target_invoice_id
    from invoices i
    where i.job_id = p_job_id
      and i.status <> 'void'
      and i.voided_at is null
    order by i.created_at desc, i.id desc
    limit 1;
    if not found then v_target_invoice_id := p_invoice_id; end if;
  end if;

  select p.invoice_id
  into v_old_invoice_id
  from payments p
  where p.square_payment_id = p_square_payment_id;

  for v_invoice_lock_id in
    select id
    from (
      select i.id
      from invoices i
      where i.id = p_invoice_id
        or (p_job_id is not null and i.job_id = p_job_id)
      union
      select v_old_invoice_id
    ) lock_ids(id)
    where id is not null
    order by id::text
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('square-invoice:' || v_invoice_lock_id::text, 0)
    );
  end loop;

  perform 1
  from invoices i
  where i.id = p_invoice_id
    and i.job_id is not distinct from p_job_id
  for update;
  if not found then
    return query select
      null::uuid, p_amount_cents, false, false, false, 'association_changed'::text;
    return;
  end if;

  if p_job_id is not null
    and v_target_invoice_id is distinct from p_invoice_id then
    perform 1
    from invoices i
    where i.id = v_target_invoice_id
      and i.job_id = p_job_id
      and i.status <> 'void'
      and i.voided_at is null
    for update;
    if not found then
      return query select
        null::uuid, p_amount_cents, false, false, false, 'association_changed'::text;
      return;
    end if;
  end if;

  select p.*
  into v_payment
  from payments p
  where p.square_payment_id = p_square_payment_id
  for update;
  if found then
    if v_payment.invoice_id is not null then
      select i.job_id, i.status, i.voided_at
      into v_old_invoice_job_id, v_old_invoice_status, v_old_invoice_voided_at
      from invoices i
      where i.id = v_payment.invoice_id;
    else
      v_old_invoice_job_id := null;
      v_old_invoice_status := null;
      v_old_invoice_voided_at := null;
    end if;

    if v_payment.kind is distinct from 'balance'
      or v_payment.source is distinct from 'square_webhook'
      or v_payment.amount_cents is distinct from p_amount_cents
      or v_payment.currency is distinct from p_currency
      or (
        p_job_id is null
        and (
          v_payment.invoice_id is distinct from p_invoice_id
          or v_payment.job_id is not null
        )
      )
      or (
        p_job_id is not null
        and (
          coalesce(v_payment.job_id, v_old_invoice_job_id) is distinct from p_job_id
          or (
            v_payment.invoice_id is not null
            and v_old_invoice_job_id is distinct from p_job_id
          )
        )
      ) then
      return query select
        v_payment.id, v_payment.amount_cents, false, false, false, v_payment.status;
      return;
    end if;

    if p_job_id is not null
      and v_payment.amount_cents > v_payment.refunded_cents
      and exists (
        select 1
        from invoices i
        where i.id = v_target_invoice_id
          and i.job_id = p_job_id
          and i.status <> 'void'
          and i.voided_at is null
      ) then
      if v_payment.invoice_id is null
        or v_payment.invoice_id = v_target_invoice_id
        or v_old_invoice_status = 'void'
        or v_old_invoice_voided_at is not null then
        update payments p
        set invoice_id = v_target_invoice_id,
            job_id = coalesce(p.job_id, p_job_id)
        where p.id = v_payment.id;
        v_payment.invoice_id := v_target_invoice_id;
        v_payment.job_id := coalesce(v_payment.job_id, p_job_id);
        perform attach_job_deposits_locked(p_job_id, v_target_invoice_id);
      else
        return query select
          v_payment.id, v_payment.amount_cents, false, false, false, v_payment.status;
        return;
      end if;
    end if;

    return query select
      v_payment.id,
      v_payment.amount_cents,
      false,
      true,
      v_payment.external_event_id is not distinct from p_event_id,
      v_payment.status;
    return;
  end if;

  select p.*
  into v_payment
  from payments p
  where p.invoice_id = p_invoice_id
    and p.job_id is not distinct from p_job_id
    and p.kind = 'balance'
    and p.source = 'square_webhook'
    and p.status in ('completed', 'refunded')
    and p.amount_cents = p_amount_cents
    and p.currency = p_currency
    and p.square_payment_id like 'evt:%'
    and p.external_event_id is not null
    and p.square_payment_id = 'evt:' || p.external_event_id
  order by p.created_at, p.id
  for update
  limit 1;

  if found then
    update payments
    set square_payment_id = p_square_payment_id,
        invoice_id = case
          when p_job_id is not null
            and v_payment.amount_cents > v_payment.refunded_cents
            and exists (
              select 1
              from invoices i
              where i.id = v_target_invoice_id
                and i.job_id = p_job_id
                and i.status <> 'void'
                and i.voided_at is null
            ) then v_target_invoice_id
          else invoice_id
        end,
        job_id = case
          when p_job_id is not null then coalesce(job_id, p_job_id)
          else job_id
        end
    where id = v_payment.id;
    if p_job_id is not null
      and exists (
        select 1
        from invoices i
        where i.id = v_target_invoice_id
          and i.job_id = p_job_id
          and i.status <> 'void'
          and i.voided_at is null
      ) then
      perform attach_job_deposits_locked(p_job_id, v_target_invoice_id);
    end if;
    return query select
      v_payment.id,
      v_payment.amount_cents,
      false,
      true,
      v_payment.external_event_id is not distinct from p_event_id,
      v_payment.status;
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, external_event_id, recorded_by
  ) values (
    v_target_invoice_id, p_job_id, p_amount_cents, p_currency, 'card',
    'square_webhook', 'completed', 'balance', p_square_payment_id,
    p_event_id, 'square'
  )
  returning id into v_new_id;

  if p_job_id is not null
    and exists (
      select 1
      from invoices i
      where i.id = v_target_invoice_id
        and i.job_id = p_job_id
        and i.status <> 'void'
        and i.voided_at is null
    ) then
    perform attach_job_deposits_locked(p_job_id, v_target_invoice_id);
  end if;

  return query select
    v_new_id, p_amount_cents, true, true, true, 'completed'::text;
end;
$$;

revoke all on function record_square_invoice_payment_locked(uuid, uuid, int, text, text, text) from public;
grant execute on function record_square_invoice_payment_locked(uuid, uuid, int, text, text, text) to service_role;

-- Return-contract expansion requires dependent wrappers to be replaced in the
-- same migration. PL/pgSQL resolves their calls again after recreation.
drop function if exists record_manual_invoice_payment_locked(uuid, int, text, int, int, uuid);
drop function if exists attach_job_deposits_locked(uuid, uuid);
drop function if exists recompute_invoice_paid_locked(uuid);

create function recompute_invoice_paid_locked(
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
  if v_paid > 2147483647 then
    raise exception 'Invoice paid total exceeds integer cents range';
  end if;

  v_fully_paid := v_total > 0 and v_paid >= v_total;
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

revoke all on function recompute_invoice_paid_locked(uuid) from public;
grant execute on function recompute_invoice_paid_locked(uuid) to service_role;

-- Despite its historical name, replacement billing must carry every positive
-- net credit from the job's void invoices, not just booking deposits. A cash
-- partial or prior real card tender is still customer money after an invoice
-- is retired. Legacy evt:* rows are order snapshots rather than stable tender
-- identities, so they stay on their original Square invoice until
-- reconcile_legacy_square_invoice_payments_locked replaces them with real
-- tender ids. Fully refunded (zero-net) rows remain on the historical invoice.
create function attach_job_deposits_locked(
  p_job_id uuid,
  p_invoice_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attached int := 0;
  v_invoice_lock_id uuid;
  v_old_invoice_ids uuid[];
begin
  perform pg_advisory_xact_lock(
    hashtextextended('square-deposit:' || p_job_id::text, 0)
  );

  -- Lock target plus every historical invoice deterministically. Locking all
  -- void invoices (including those with no payment yet) closes the window for
  -- an in-flight real-tender writer before the carry-forward update.
  for v_invoice_lock_id in
    select i.id
    from invoices i
    where i.job_id = p_job_id
      and (i.id = p_invoice_id or i.status = 'void')
    order by i.id::text
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('square-invoice:' || v_invoice_lock_id::text, 0)
    );
  end loop;

  perform 1
  from invoices i
  where i.id = p_invoice_id
    and i.job_id = p_job_id
    and i.status <> 'void'
  for update;
  if not found then
    raise exception 'live invoice does not belong to job';
  end if;

  perform 1
  from invoices i
  where i.job_id = p_job_id
    and i.status = 'void'
  order by i.id::text
  for update;

  select array_agg(i.id order by i.id::text)
  into v_old_invoice_ids
  from invoices i
  where i.job_id = p_job_id
    and i.status = 'void';

  if exists (
    select 1
    from payments p
    where p.invoice_id = any(coalesce(v_old_invoice_ids, '{}'::uuid[]))
      and p.amount_cents > p.refunded_cents
      and p.job_id is not null
      and p.job_id <> p_job_id
  ) then
    raise exception 'void invoice contains a payment owned by another job';
  end if;

  update payments p
  set invoice_id = p_invoice_id,
      job_id = coalesce(p.job_id, p_job_id)
  where p.amount_cents > p.refunded_cents
    and not (
      p.source = 'square_webhook'
      and p.square_payment_id like 'evt:%'
    )
    and (
      (p.kind = 'deposit' and p.invoice_id is null and p.job_id = p_job_id)
      or p.invoice_id = any(coalesce(v_old_invoice_ids, '{}'::uuid[]))
    );
  get diagnostics v_attached = row_count;

  update invoices old
  set amount_paid_cents = coalesce((
        select sum(p.amount_cents - p.refunded_cents)::int
        from payments p
        where p.invoice_id = old.id
      ), 0),
      updated_at = now()
  where old.id = any(coalesce(v_old_invoice_ids, '{}'::uuid[]));

  perform recompute_invoice_paid_locked(p_invoice_id);
  return v_attached;
end;
$$;

revoke all on function attach_job_deposits_locked(uuid, uuid) from public;
grant execute on function attach_job_deposits_locked(uuid, uuid) to service_role;

-- A replacement invoice may already have existed before the stronger webhook
-- topology above was deployed. Carry every stable positive-net payment off
-- retired generations now. Synthetic evt:* snapshots remain anchored to their
-- original Square order until the legacy reconciler replaces them with real
-- tenders. The predicate becomes false after a successful move, so a migration
-- replay is a no-op; the helper owns deterministic locks and rebuilds the
-- retired and replacement invoice caches from the ledger.
do $$
declare
  v_repair record;
begin
  for v_repair in
    select
      j.id as job_id,
      live.id as live_invoice_id
    from jobs j
    cross join lateral (
      select i.id
      from invoices i
      where i.job_id = j.id
        and i.status <> 'void'
        and i.voided_at is null
      order by i.created_at desc, i.id desc
      limit 1
    ) live
    where exists (
      select 1
      from invoices retired
      join payments p on p.invoice_id = retired.id
      where retired.job_id = j.id
        and (retired.status = 'void' or retired.voided_at is not null)
        and p.amount_cents > p.refunded_cents
        and not (
          p.source = 'square_webhook'
          and p.square_payment_id like 'evt:%'
        )
    )
    order by j.id::text
  loop
    perform attach_job_deposits_locked(
      v_repair.job_id,
      v_repair.live_invoice_id
    );
    -- attach_job_deposits_locked already recomputes this cache. Repeating the
    -- idempotent ledger fold here makes the backfill's cache guarantee explicit.
    perform recompute_invoice_paid_locked(v_repair.live_invoice_id);
  end loop;
end;
$$;

create function record_manual_invoice_payment_locked(
  p_invoice_id uuid,
  p_amount_cents int,
  p_method text,
  p_expected_paid_cents int,
  p_expected_total_cents int,
  p_operation_id uuid
) returns table (
  outcome text,
  payment_id uuid,
  paid_cents int,
  total_cents int,
  fully_paid boolean,
  newly_settled boolean,
  overpaid_cents int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_job_id uuid;
  v_total int;
  v_cached_paid int;
  v_ledger_paid bigint;
  v_payment_id uuid;
  v_result record;
  v_operation_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('square-invoice:' || p_invoice_id::text, 0)
  );

  select
    i.status,
    i.job_id,
    i.total_cents,
    i.amount_paid_cents,
    i.billing_operation_id
  into v_status, v_job_id, v_total, v_cached_paid, v_operation_id
  from invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    return query select 'not_found', null::uuid, 0, 0, false, false, 0;
    return;
  end if;
  if v_status = 'paid' then
    return query select
      'already_paid', null::uuid, v_cached_paid, v_total, true, false,
      greatest(0, v_cached_paid - v_total);
    return;
  end if;
  if v_status = 'void' then
    return query select 'void', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if v_operation_id is distinct from p_operation_id then
    return query select 'conflict', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if p_amount_cents <= 0 or p_method not in ('cash', 'card', 'other') then
    return query select 'invalid', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_ledger_paid
  from payments p
  where p.invoice_id = p_invoice_id
    and p.status in ('completed', 'refunded');

  if v_total <> p_expected_total_cents
    or v_cached_paid <> p_expected_paid_cents
    or v_ledger_paid <> v_cached_paid
    or v_ledger_paid + p_amount_cents > v_total then
    return query select
      'conflict', null::uuid, v_ledger_paid::int, v_total,
      v_ledger_paid >= v_total and v_total > 0, false,
      greatest(0, v_ledger_paid::int - v_total);
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, recorded_by
  ) values (
    p_invoice_id, v_job_id, p_amount_cents, 'USD', p_method, 'manual',
    'completed', 'balance', 'owner'
  )
  returning id into v_payment_id;

  select *
  into v_result
  from recompute_invoice_paid_locked(p_invoice_id);
  return query select
    'recorded',
    v_payment_id,
    v_result.paid_cents,
    v_result.total_cents,
    v_result.fully_paid,
    v_result.newly_settled,
    v_result.overpaid_cents;
end;
$$;

revoke all on function record_manual_invoice_payment_locked(uuid, int, text, int, int, uuid) from public;
grant execute on function record_manual_invoice_payment_locked(uuid, int, text, int, int, uuid) to service_role;
