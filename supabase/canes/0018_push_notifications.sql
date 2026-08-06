-- Canes Pressure Washing — 0018: native push notification delivery.
-- Run in the Canes Supabase project after 0017_schema_migrations.sql.
--
-- Devices and preferences are server-only. The Expo app authenticates through
-- /api/v1 and the server derives the recipient identity; clients never choose
-- another account to register a token for. RLS therefore remains deny-all.

-- The deposit stamp previously recorded only when the first payment arrived,
-- not WHICH Square payment won the claim. Persisting that identity lets a
-- webhook retry distinguish its own unfinished first payment from a genuine
-- second charge even when two deposits race.
alter table jobs add column if not exists deposit_square_payment_id text;
alter table jobs add column if not exists deposit_collected_cents int not null default 0;
alter table jobs add column if not exists deposit_link_operation_id uuid;
alter table jobs add column if not exists deposit_link_operation_started_at timestamptz;
alter table jobs drop constraint if exists jobs_deposit_collected_cents_check;
alter table jobs add constraint jobs_deposit_collected_cents_check
  check (deposit_collected_cents >= 0);
create unique index if not exists jobs_deposit_square_payment_key
  on jobs (deposit_square_payment_id)
  where deposit_square_payment_id is not null;

create or replace function claim_job_deposit_link_operation(
  p_job_id uuid,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid_at timestamptz;
  v_collected int;
  v_link_url text;
  v_operation_id uuid;
  v_started_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  select deposit_paid_at, deposit_collected_cents, deposit_link_url,
         deposit_link_operation_id, deposit_link_operation_started_at
  into v_paid_at, v_collected, v_link_url, v_operation_id, v_started_at
  from jobs where id = p_job_id for update;
  if not found or v_paid_at is not null or v_collected > 0 or v_link_url is not null then
    return false;
  end if;
  -- The operation id is the durable Square idempotency key, not proof that a
  -- caller owns the lease. Even a retry presenting the same key must wait
  -- while another request is active; once stale, that exact key is reused.
  if v_operation_id is not null
    and v_started_at > now() - interval '15 minutes' then
    return false;
  end if;
  if v_operation_id is not null and v_operation_id <> p_operation_id then
    return false;
  end if;
  update jobs
  set deposit_link_operation_id = p_operation_id,
      deposit_link_operation_started_at = now()
  where id = p_job_id;
  return true;
end;
$$;

create or replace function release_job_deposit_link_operation(
  p_job_id uuid,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update jobs
  set deposit_link_operation_id = null,
      deposit_link_operation_started_at = null
  where id = p_job_id and deposit_link_operation_id = p_operation_id;
  return found;
end;
$$;

revoke all on function claim_job_deposit_link_operation(uuid, uuid) from public;
grant execute on function claim_job_deposit_link_operation(uuid, uuid) to service_role;
revoke all on function release_job_deposit_link_operation(uuid, uuid) from public;
grant execute on function release_job_deposit_link_operation(uuid, uuid) to service_role;

-- `processed=false` is not itself a claim: two concurrent deliveries can both
-- observe it and fan out paid receipts. This timestamp is a short processing
-- lease; an abandoned event becomes retryable after the lease expires.
alter table square_webhook_events
  add column if not exists processing_started_at timestamptz;

-- A Square publish/cancel call spans a remote request and cannot hold a
-- database transaction open. This recoverable lease serializes that remote
-- operation against cash and manual-deposit writers.
alter table invoices add column if not exists billing_operation_id uuid;
alter table invoices add column if not exists billing_operation_started_at timestamptz;

-- Payment/deposit emails use the existing durable task outbox. Provider
-- idempotency keys are derived from these task rows, so a crash after Resend
-- accepts a message cannot duplicate it on retry.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder',
  'job_confirmation',
  'invoice_send', 'invoice_reminder',
  'confirmation_final',
  'payment_owner_receipt', 'payment_customer_receipt',
  'deposit_owner_receipt'
));

-- Identifies the refund event that owns a refunded ledger transition. A retry
-- of that same event can finish cache repair; sibling refund.created/updated
-- events remain harmless duplicates.
alter table payments add column if not exists square_refund_id text;
alter table payments add column if not exists refunded_cents int not null default 0;
alter table payments drop constraint if exists payments_refunded_cents_check;
alter table payments add constraint payments_refunded_cents_check
  check (refunded_cents >= 0 and refunded_cents <= amount_cents);
update jobs j
set deposit_collected_cents = totals.net_cents
from (
  select p.job_id, coalesce(sum(p.amount_cents - p.refunded_cents), 0)::int as net_cents
  from payments p
  where p.job_id is not null and p.kind = 'deposit'
  group by p.job_id
) totals
where j.id = totals.job_id;
create unique index if not exists payments_square_refund_key
  on payments (square_refund_id)
  where square_refund_id is not null;

create table if not exists payment_refunds (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  payment_id        uuid not null references payments (id) on delete restrict,
  square_refund_id  text not null unique,
  amount_cents      int not null check (amount_cents > 0),
  currency          text not null,
  external_event_id text not null
);
create index if not exists payment_refunds_payment_idx
  on payment_refunds (payment_id, created_at);
alter table payment_refunds enable row level security;

create table if not exists push_devices (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  disabled_at         timestamptz,
  device_install_id   text not null unique,
  expo_push_token     text not null unique,
  recipient_kind      text not null check (recipient_kind in ('owner', 'crew')),
  recipient_id        text not null,
  workspace           text not null check (workspace in ('owner', 'crew')),
  platform            text not null check (platform in ('ios', 'android')),
  timezone            text not null default 'America/New_York',
  device_name         text,
  app_version         text,
  build_number        text,
  enabled             boolean not null default true
);
create index if not exists push_devices_recipient_idx
  on push_devices (recipient_kind, recipient_id, workspace)
  where enabled = true;
alter table push_devices enable row level security;

-- Preferences are account-wide, not per device. Reinstalling the app or using
-- a second phone must not silently reset the owner's alert choices.
create table if not exists push_notification_preferences (
  recipient_kind      text not null check (recipient_kind in ('owner', 'crew')),
  recipient_id        text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  categories          jsonb not null default '{}'::jsonb,
  enabled             boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  quiet_start_hour    int not null default 21 check (quiet_start_hour between 0 and 23),
  quiet_end_hour      int not null default 7 check (quiet_end_hour between 0 and 23),
  timezone            text not null default 'America/New_York',
  primary key (recipient_kind, recipient_id)
);
alter table push_notification_preferences enable row level security;

-- One row is the idempotency lock for one business event and audience. A
-- webhook retry or overlapping cron run cannot fan the same alert out twice.
create table if not exists push_notification_events (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  dedupe_key        text not null,
  audience_key      text not null,
  category          text not null check (category in (
                      'new_lead', 'customer_message', 'lead_uncontacted',
                      'estimate_approved', 'deposit_received', 'invoice_paid',
                      'payment_issue', 'job_changed', 'checklist_blocked',
                      'crew_late', 'morning_summary', 'daily_followups'
                    )),
  urgency           text not null check (urgency in ('time_sensitive', 'active', 'summary')),
  title             text not null,
  body              text not null,
  data              jsonb not null default '{}'::jsonb,
  attempt_count     int not null default 0 check (attempt_count >= 0),
  last_attempt_at   timestamptz,
  next_retry_at     timestamptz,
  status            text not null default 'processing'
                    check (status in ('queued', 'processing', 'sent', 'partial', 'failed', 'skipped')),
  error             text,
  unique (dedupe_key, audience_key)
);
create index if not exists push_notification_events_status_idx
  on push_notification_events (status, next_retry_at, updated_at);
alter table push_notification_events enable row level security;

-- A delivery is one event sent to one installation. Expo tickets and receipts
-- are kept for reconciliation and invalid-token cleanup without putting any
-- customer message contents into logs.
create table if not exists push_notification_deliveries (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz,
  receipt_checked_at timestamptz,
  event_id          uuid not null references push_notification_events (id) on delete cascade,
  device_id         uuid not null references push_devices (id) on delete cascade,
  expo_ticket_id    text,
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'delivered', 'failed', 'invalid_device')),
  error_code        text,
  error_message     text,
  unique (event_id, device_id)
);
create index if not exists push_notification_deliveries_receipt_idx
  on push_notification_deliveries (status, sent_at)
  where expo_ticket_id is not null;
alter table push_notification_deliveries enable row level security;

-- Token rotation and account switching touch two independent unique keys. Do
-- the merge under transaction-scoped advisory locks so two launches cannot
-- race a token refresh into a constraint error or duplicate active token.
create or replace function register_push_device(
  p_device_install_id text,
  p_expo_push_token text,
  p_recipient_kind text,
  p_recipient_id text,
  p_workspace text,
  p_platform text,
  p_timezone text,
  p_device_name text,
  p_app_version text,
  p_build_number text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  install_row_id uuid;
  token_row_id uuid;
  selected_id uuid;
  lock_a text := least(p_device_install_id, p_expo_push_token);
  lock_b text := greatest(p_device_install_id, p_expo_push_token);
begin
  perform pg_advisory_xact_lock(hashtextextended('push-device:' || lock_a, 0));
  perform pg_advisory_xact_lock(hashtextextended('push-device:' || lock_b, 0));

  select id into install_row_id
  from push_devices
  where device_install_id = p_device_install_id
  for update;

  select id into token_row_id
  from push_devices
  where expo_push_token = p_expo_push_token
  for update;

  if install_row_id is not null then
    selected_id := install_row_id;
    if token_row_id is not null and token_row_id <> install_row_id then
      update push_devices
      set expo_push_token = 'retired[' || id::text || ']',
          enabled = false,
          disabled_at = now(),
          updated_at = now()
      where id = token_row_id;
    end if;
  elsif token_row_id is not null then
    selected_id := token_row_id;
  else
    insert into push_devices (
      device_install_id, expo_push_token, recipient_kind, recipient_id,
      workspace, platform, timezone, device_name, app_version, build_number
    ) values (
      p_device_install_id, p_expo_push_token, p_recipient_kind, p_recipient_id,
      p_workspace, p_platform, p_timezone, p_device_name, p_app_version, p_build_number
    ) returning id into selected_id;
  end if;

  update push_devices
  set device_install_id = p_device_install_id,
      expo_push_token = p_expo_push_token,
      recipient_kind = p_recipient_kind,
      recipient_id = p_recipient_id,
      workspace = p_workspace,
      platform = p_platform,
      timezone = p_timezone,
      device_name = p_device_name,
      app_version = p_app_version,
      build_number = p_build_number,
      enabled = true,
      disabled_at = null,
      last_seen_at = now(),
      updated_at = now()
  where id = selected_id;

  return selected_id;
end;
$$;

revoke all on function register_push_device(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function register_push_device(text, text, text, text, text, text, text, text, text, text) to service_role;

-- Deposit payment insertion and the job's paid stamp are one money operation.
-- The shared per-job lock also serializes this path against refunds, so a
-- refund can never clear a newer valid deposit using a stale survivor read.
create or replace function record_square_deposit_payment_locked(
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
  same_event boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_existing_job_id uuid;
  v_existing_kind text;
  v_existing_event_id text;
  v_existing_status text;
  v_existing_refunded int;
  v_deposit_payment_id text;
  v_deposit_net bigint;
  v_remaining_square_payment_id text;
  v_remaining_created_at timestamptz;
  v_first boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));

  select p.id, p.job_id, p.kind, p.external_event_id, p.status, p.refunded_cents
  into v_payment_id, v_existing_job_id, v_existing_kind, v_existing_event_id, v_existing_status, v_existing_refunded
  from payments p
  where p.square_payment_id = p_square_payment_id;

  if v_payment_id is not null then
    if v_existing_job_id is distinct from p_job_id
      or v_existing_kind is distinct from 'deposit' then
      return query select v_payment_id, false, false, false, false;
      return;
    end if;
    -- A delayed payment.updated sibling can arrive after this exact deposit
    -- has already been refunded. It owns the same ledger identity, but must
    -- never restore the deposit stamp or raise a cross-ledger collision.
    if v_existing_status = 'refunded' then
      return query select v_payment_id, false, false, true, false;
      return;
    end if;
    if v_existing_status is distinct from 'completed' then
      return query select v_payment_id, false, false, false, false;
      return;
    end if;

    select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
    into v_deposit_net
    from payments p
    where p.job_id = p_job_id and p.kind = 'deposit';
    select p.square_payment_id, p.created_at
    into v_remaining_square_payment_id, v_remaining_created_at
    from payments p
    where p.job_id = p_job_id
      and p.kind = 'deposit'
      and p.square_payment_id is not null
      and p.amount_cents > p.refunded_cents
    order by p.created_at asc
    limit 1;
    select j.deposit_square_payment_id
    into v_deposit_payment_id
    from jobs j where j.id = p_job_id for update;
    update jobs
    set deposit_collected_cents = v_deposit_net::int,
        deposit_paid_at = case when v_deposit_net > 0 then coalesce(deposit_paid_at, v_remaining_created_at, now()) else null end,
        deposit_square_payment_id = v_remaining_square_payment_id
    where id = p_job_id;
    v_first := v_existing_refunded = 0
      and v_deposit_net = (select amount_cents from payments where id = v_payment_id);
    return query select
      v_payment_id,
      false,
      v_first,
      true,
      v_existing_event_id is not distinct from p_event_id;
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, square_order_id, external_event_id, recorded_by
  ) values (
    p_invoice_id, p_job_id, p_amount_cents, p_currency, 'card',
    'square_webhook', 'completed', 'deposit', p_square_payment_id,
    p_square_order_id, p_event_id, 'square'
  ) returning id into v_payment_id;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_deposit_net
  from payments p
  where p.job_id = p_job_id and p.kind = 'deposit';
  update jobs
  set deposit_collected_cents = v_deposit_net::int,
      deposit_paid_at = coalesce(deposit_paid_at, now()),
      deposit_square_payment_id = coalesce(deposit_square_payment_id, p_square_payment_id)
  where id = p_job_id;
  v_first := v_deposit_net = p_amount_cents;

  return query select v_payment_id, true, v_first, true, true;
end;
$$;

revoke all on function record_square_deposit_payment_locked(uuid, uuid, int, text, text, text, text) from public;
grant execute on function record_square_deposit_payment_locked(uuid, uuid, int, text, text, text, text) to service_role;

-- Refunds share the same deposit and invoice locks as payment writers. The
-- ledger status and surviving deposit stamp therefore commit together, even
-- when Square sends a refund while another payment webhook is running.
create or replace function refund_square_payment_locked(
  p_payment_id uuid,
  p_refund_id text,
  p_amount_cents int,
  p_currency text,
  p_event_id text
) returns table (
  claimed boolean,
  owned_event boolean,
  fully_refunded boolean,
  refunded_cents int
)
language plpgsql
security definer
set search_path = public
as $$
declare
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
  select r.payment_id into v_existing_payment_id
  from payment_refunds r
  where r.square_refund_id = p_refund_id;
  if found then
    select p.refunded_cents, p.amount_cents
    into v_current_refunded, v_payment_amount
    from payments p where p.id = v_existing_payment_id;
    return query select
      false,
      v_existing_payment_id = p_payment_id,
      v_current_refunded >= v_payment_amount,
      v_current_refunded;
    return;
  end if;

  select p.job_id, p.invoice_id, p.kind, p.amount_cents, p.currency
  into v_job_id, v_invoice_id, v_kind, v_payment_amount, v_payment_currency
  from payments p
  where p.id = p_payment_id;
  if not found then
    return query select false, false, false, 0;
    return;
  end if;

  if v_kind = 'deposit' and v_job_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || v_job_id::text, 0));
  end if;
  if v_invoice_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_invoice_id::text, 0));
  end if;

  select p.status, p.refunded_cents
  into v_status, v_current_refunded
  from payments p
  where p.id = p_payment_id
  for update;
  if p_amount_cents <= 0 or p_currency is distinct from v_payment_currency then
    return query select false, false, v_status = 'refunded', v_current_refunded;
    return;
  end if;
  v_new_refunded := v_current_refunded + p_amount_cents;
  if v_new_refunded > v_payment_amount then
    return query select false, false, v_status = 'refunded', v_current_refunded;
    return;
  end if;

  insert into payment_refunds (
    payment_id, square_refund_id, amount_cents, currency, external_event_id
  ) values (
    p_payment_id, p_refund_id, p_amount_cents, p_currency, p_event_id
  );
  update payments
  set refunded_cents = v_new_refunded,
      status = case when v_new_refunded = amount_cents then 'refunded' else 'completed' end,
      square_refund_id = coalesce(square_refund_id, p_refund_id)
  where id = p_payment_id;

  if v_kind = 'deposit' and v_job_id is not null then
    select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
    into v_deposit_net
    from payments p
    where p.job_id = v_job_id
      and p.kind = 'deposit';
    perform 1 from jobs j where j.id = v_job_id for update;

    select p.square_payment_id, p.created_at
    into v_remaining_square_payment_id, v_remaining_created_at
    from payments p
    where p.job_id = v_job_id
      and p.kind = 'deposit'
      and p.amount_cents > p.refunded_cents
    order by p.created_at asc
    limit 1;

    update jobs
    set deposit_collected_cents = v_deposit_net::int,
        deposit_paid_at = case when v_deposit_net > 0 then coalesce(v_remaining_created_at, deposit_paid_at) else null end,
        deposit_square_payment_id = v_remaining_square_payment_id,
        deposit_link_id = null,
        deposit_link_url = null
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
    if v_invoice_paid < v_invoice_total then
      update invoices
      set status = 'void',
          amount_paid_cents = v_invoice_paid::int,
          paid_at = null,
          voided_at = now(),
          hosted_payment_url = null,
          updated_at = now()
      where id = v_invoice_id;
      if v_invoice_job_id is not null then
        update jobs
        set status = 'completed'
        where id = v_invoice_job_id
          and status = 'paid';
      end if;
    end if;
  end if;

  return query select true, true, v_new_refunded = v_payment_amount, v_new_refunded;
end;
$$;

revoke all on function refund_square_payment_locked(uuid, text, int, text, text) from public;
grant execute on function refund_square_payment_locked(uuid, text, int, text, text) to service_role;

-- Square's invoice.payment_made amount is cumulative. Two webhook requests can
-- arrive concurrently (or out of order), so the read-delta-insert sequence
-- must share one transaction-level lock per invoice. Doing this in application
-- code would span separate PostgREST transactions and can overstate revenue.
create or replace function record_square_invoice_cumulative_payment(
  p_invoice_id uuid,
  p_job_id uuid,
  p_cumulative_amount int,
  p_currency text,
  p_square_payment_id text,
  p_event_id text
) returns table (payment_id uuid, amount_cents int, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_square_cents bigint;
  delta_cents bigint;
  new_payment_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into prior_square_cents
  from payments p
  where p.invoice_id = p_invoice_id
    and p.source = 'square_webhook'
    and p.kind = 'balance'
    and p.status in ('completed', 'refunded');

  delta_cents := p_cumulative_amount::bigint - prior_square_cents;
  if delta_cents <= 0 then
    return query select null::uuid, 0, false;
    return;
  end if;
  if delta_cents > 2147483647 then
    raise exception 'Square payment delta exceeds integer cents range';
  end if;

  select p.id into new_payment_id
  from payments p
  where p.square_payment_id = p_square_payment_id;
  if new_payment_id is not null then
    return query select new_payment_id, 0, false;
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, external_event_id, recorded_by
  ) values (
    p_invoice_id, p_job_id, delta_cents::int, p_currency, 'card',
    'square_webhook', 'completed', 'balance', p_square_payment_id,
    p_event_id, 'square'
  ) returning id into new_payment_id;

  return query select new_payment_id, delta_cents::int, true;
end;
$$;

revoke all on function record_square_invoice_cumulative_payment(uuid, uuid, int, text, text, text) from public;
grant execute on function record_square_invoice_cumulative_payment(uuid, uuid, int, text, text, text) to service_role;

-- Current Square invoice orders expose their real tender/payment ids. Record
-- those ids directly so refunds can always target the correct ledger row;
-- invoice.payment_made and payment.updated may arrive in either order, but the
-- unique Square payment id makes the second signal a harmless duplicate.
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
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));

  select p.* into v_payment
  from payments p
  where p.square_payment_id = p_square_payment_id;
  if found then
    if v_payment.invoice_id is distinct from p_invoice_id
      or v_payment.kind is distinct from 'balance'
      or v_payment.source is distinct from 'square_webhook' then
      return query select v_payment.id, v_payment.amount_cents, false, false, false, v_payment.status;
      return;
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

  if p_amount_cents <= 0 then
    raise exception 'Square payment amount must be positive';
  end if;
  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, square_payment_id, external_event_id, recorded_by
  ) values (
    p_invoice_id, p_job_id, p_amount_cents, p_currency, 'card',
    'square_webhook', 'completed', 'balance', p_square_payment_id,
    p_event_id, 'square'
  ) returning id into v_new_id;

  return query select v_new_id, p_amount_cents, true, true, true, 'completed'::text;
end;
$$;

revoke all on function record_square_invoice_payment_locked(uuid, uuid, int, text, text, text) from public;
grant execute on function record_square_invoice_payment_locked(uuid, uuid, int, text, text, text) to service_role;

-- Recompute and settle under the SAME invoice advisory lock used by the
-- cumulative Square writer. Without this, an older recompute can read $50,
-- race a later $100 settlement, and overwrite amount_paid_cents back to $50.
create or replace function recompute_invoice_paid_locked(
  p_invoice_id uuid
) returns table (
  paid_cents int,
  total_cents int,
  fully_paid boolean,
  newly_settled boolean,
  newly_unsettled boolean,
  overpaid_cents int,
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
  v_job_id uuid;
  v_number text;
  v_customer_name text;
  v_fully_paid boolean;
  v_newly_settled boolean := false;
  v_newly_unsettled boolean := false;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));

  select i.total_cents, i.status, i.job_id, i.number, i.customer_name
  into v_total, v_status, v_job_id, v_number, v_customer_name
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
  if v_fully_paid and v_status not in ('paid', 'void') then
    update invoices
    set amount_paid_cents = v_paid::int,
        status = 'paid',
        paid_at = v_now,
        updated_at = v_now
    where id = p_invoice_id
      and status in ('draft', 'sent', 'viewed');
    v_newly_settled := found;
  elsif not v_fully_paid and v_status = 'paid' then
    update invoices
    set amount_paid_cents = v_paid::int,
        status = 'sent',
        paid_at = null,
        updated_at = v_now
    where id = p_invoice_id
      and status = 'paid';
    v_newly_unsettled := found;
  else
    update invoices
    set amount_paid_cents = v_paid::int,
        updated_at = v_now
    where id = p_invoice_id;
  end if;

  if v_newly_settled and v_job_id is not null then
    update jobs
    set status = 'paid'
    where id = v_job_id
      and status <> 'canceled';
  end if;
  if v_newly_unsettled and v_job_id is not null then
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
    v_number,
    v_customer_name;
end;
$$;

revoke all on function recompute_invoice_paid_locked(uuid) from public;
grant execute on function recompute_invoice_paid_locked(uuid) to service_role;

create or replace function attach_job_deposits_locked(
  p_job_id uuid,
  p_invoice_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attached int := 0;
  v_old_invoice_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  perform 1 from invoices i
  where i.id = p_invoice_id and i.job_id = p_job_id and i.status <> 'void'
  for update;
  if not found then raise exception 'live invoice does not belong to job'; end if;

  select array_agg(distinct p.invoice_id)
  into v_old_invoice_ids
  from payments p
  join invoices old on old.id = p.invoice_id and old.status = 'void'
  where p.job_id = p_job_id and p.kind = 'deposit';

  update payments p
  set invoice_id = p_invoice_id
  where p.job_id = p_job_id
    and p.kind = 'deposit'
    and (
      p.invoice_id is null
      or exists (
        select 1 from invoices old
        where old.id = p.invoice_id and old.status = 'void'
      )
    );
  get diagnostics v_attached = row_count;

  update invoices old
  set amount_paid_cents = coalesce((
        select sum(p.amount_cents - p.refunded_cents)::int
        from payments p where p.invoice_id = old.id
      ), 0),
      updated_at = now()
  where old.id = any(coalesce(v_old_invoice_ids, '{}'::uuid[]));

  perform recompute_invoice_paid_locked(p_invoice_id);
  return v_attached;
end;
$$;

revoke all on function attach_job_deposits_locked(uuid, uuid) from public;
grant execute on function attach_job_deposits_locked(uuid, uuid) to service_role;

create or replace function claim_invoice_billing_operation(
  p_invoice_id uuid,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_operation_id uuid;
  v_started_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  select status, billing_operation_id, billing_operation_started_at
  into v_status, v_operation_id, v_started_at
  from invoices where id = p_invoice_id for update;
  if not found or v_status in ('paid', 'void') then return false; end if;
  if v_operation_id is not null
    and v_operation_id <> p_operation_id
    and v_started_at > now() - interval '15 minutes' then
    return false;
  end if;
  update invoices
  set billing_operation_id = p_operation_id,
      billing_operation_started_at = now(),
      updated_at = now()
  where id = p_invoice_id;
  return true;
end;
$$;

create or replace function release_invoice_billing_operation(
  p_invoice_id uuid,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update invoices
  set billing_operation_id = null,
      billing_operation_started_at = null,
      updated_at = now()
  where id = p_invoice_id
    and billing_operation_id = p_operation_id;
  return found;
end;
$$;

revoke all on function claim_invoice_billing_operation(uuid, uuid) from public;
grant execute on function claim_invoice_billing_operation(uuid, uuid) to service_role;
revoke all on function release_invoice_billing_operation(uuid, uuid) from public;
grant execute on function release_invoice_billing_operation(uuid, uuid) to service_role;

-- Manual deposits share the Square deposit lock, calculate their cap from the
-- net ledger, and attach to a live draft invoice in the same transaction. A
-- publish/cash lease blocks the write before it can create a stale hosted bill.
create or replace function record_manual_job_deposit_locked(
  p_job_id uuid,
  p_amount_cents int,
  p_method text
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
declare
  v_job_status text;
  v_job_total int;
  v_invoice invoices%rowtype;
  v_prior bigint;
  v_payment_id uuid;
  v_duplicate_id uuid;
  v_deposit_operation_id uuid;
  v_deposit_operation_started_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  select status, total_cents, deposit_link_operation_id, deposit_link_operation_started_at
  into v_job_status, v_job_total, v_deposit_operation_id, v_deposit_operation_started_at
  from jobs where id = p_job_id for update;
  if not found then
    return query select 'not_found', null::uuid, null::uuid, 0, 0;
    return;
  end if;
  if v_job_status in ('canceled', 'paid') then
    return query select 'job_closed', null::uuid, null::uuid, 0, v_job_total;
    return;
  end if;
  if p_amount_cents <= 0 or p_method not in ('cash', 'card', 'other') then
    return query select 'invalid', null::uuid, null::uuid, 0, v_job_total;
    return;
  end if;
  if v_deposit_operation_id is not null
    and v_deposit_operation_started_at > now() - interval '15 minutes' then
    return query select 'deposit_busy', null::uuid, null::uuid, 0, v_job_total;
    return;
  end if;

  select i.* into v_invoice
  from invoices i
  where i.job_id = p_job_id and i.status <> 'void'
  order by i.created_at desc
  limit 1;
  if found then
    perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_invoice.id::text, 0));
    select i.* into v_invoice from invoices i where i.id = v_invoice.id for update;
    if v_invoice.billing_operation_id is not null
      and v_invoice.billing_operation_started_at > now() - interval '15 minutes' then
      return query select 'invoice_busy', null::uuid, v_invoice.id, 0, v_job_total;
      return;
    end if;
    if v_invoice.status <> 'draft' or v_invoice.square_invoice_id is not null then
      return query select 'invoice_sent', null::uuid, v_invoice.id, 0, v_job_total;
      return;
    end if;
  end if;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_prior
  from payments p
  where p.job_id = p_job_id and p.kind = 'deposit';

  select p.id into v_duplicate_id
  from payments p
  where p.job_id = p_job_id
    and p.kind = 'deposit'
    and p.source = 'manual'
    and p.method = p_method
    and p.amount_cents = p_amount_cents
    and p.refunded_cents = 0
    and p.created_at > now() - interval '20 seconds'
  order by p.created_at desc
  limit 1;
  if v_duplicate_id is not null then
    return query select 'duplicate', v_duplicate_id,
      case when v_invoice.id is null then null::uuid else v_invoice.id end,
      v_prior::int, v_job_total;
    return;
  end if;
  if v_prior + p_amount_cents > v_job_total then
    return query select 'over_cap', null::uuid,
      case when v_invoice.id is null then null::uuid else v_invoice.id end,
      v_prior::int, v_job_total;
    return;
  end if;

  insert into payments (
    invoice_id, job_id, amount_cents, currency, method, source, status,
    kind, recorded_by
  ) values (
    case when v_invoice.id is null then null else v_invoice.id end,
    p_job_id, p_amount_cents, 'USD', p_method, 'manual', 'completed',
    'deposit', 'owner'
  ) returning id into v_payment_id;

  -- Catch an invoice created concurrently with the deposit. The invoice
  -- creation path performs the inverse claim, so every interleaving converges.
  if v_invoice.id is null then
    select i.* into v_invoice
    from invoices i
    where i.job_id = p_job_id and i.status = 'draft' and i.square_invoice_id is null
    order by i.created_at desc limit 1;
    if found then
      update payments set invoice_id = v_invoice.id where id = v_payment_id;
    end if;
  end if;

  v_prior := v_prior + p_amount_cents;
  update jobs
  set deposit_collected_cents = v_prior::int,
      deposit_paid_at = coalesce(deposit_paid_at, now())
  where id = p_job_id;

  return query select 'recorded', v_payment_id,
    case when v_invoice.id is null then null::uuid else v_invoice.id end,
    v_prior::int, v_job_total;
end;
$$;

revoke all on function record_manual_job_deposit_locked(uuid, int, text) from public;
grant execute on function record_manual_job_deposit_locked(uuid, int, text) to service_role;

-- Manual cash writes use the same invoice lock and ledger-derived recompute as
-- Square. Expected cache/total values preserve the UI's double-submit CAS: a
-- stale tap records nothing and asks the caller to refresh.
create or replace function record_manual_invoice_payment_locked(
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
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));

  select i.status, i.job_id, i.total_cents, i.amount_paid_cents, i.billing_operation_id
  into v_status, v_job_id, v_total, v_cached_paid, v_operation_id
  from invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    return query select 'not_found', null::uuid, 0, 0, false, false, 0;
    return;
  end if;
  if v_status = 'paid' then
    return query select 'already_paid', null::uuid, v_cached_paid, v_total, true, false,
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

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0)
  into v_ledger_paid
  from payments p
  where p.invoice_id = p_invoice_id
    and p.status in ('completed', 'refunded');

  if v_total <> p_expected_total_cents
    or v_cached_paid <> p_expected_paid_cents
    or v_ledger_paid <> v_cached_paid then
    return query select 'conflict', null::uuid, v_ledger_paid::int, v_total,
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
  ) returning id into v_payment_id;

  select * into v_result from recompute_invoice_paid_locked(p_invoice_id);
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
