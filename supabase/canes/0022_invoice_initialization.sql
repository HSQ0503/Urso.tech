-- Canes Pressure Washing — invoice initialization and mutation locks.
-- Run after 0018_push_notifications.sql. Invoice creation is one transaction,
-- and every editable money path shares the Square invoice advisory lock.

alter table invoices add column if not exists initialization_completed_at timestamptz;
alter table invoices add column if not exists delivery_generation int not null default 0;
alter table invoices add column if not exists square_publish_attempt_key text;
alter table invoices add column if not exists square_publish_fingerprint text;
alter table invoices add column if not exists square_publish_started_at timestamptz;
alter table invoices drop constraint if exists invoices_delivery_generation_check;
alter table invoices add constraint invoices_delivery_generation_check
  check (delivery_generation >= 0);

-- First-send email has its own durable task. The SMS outbox continues to use
-- invoice_send; the email consumer uses the snapshotted destination and the
-- delivery_id as its Resend idempotency key.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder',
  'job_confirmation',
  'invoice_send', 'invoice_reminder', 'invoice_customer_email',
  'confirmation_final',
  'payment_owner_receipt', 'payment_customer_receipt',
  'deposit_owner_receipt'
));

-- Existing invoices with a real line snapshot are already initialized. Empty
-- drafts remain null so a retry through initialize_invoice_from_job_locked can
-- repair them from the job snapshot.
update invoices i
set initialization_completed_at = coalesce(i.updated_at, i.created_at, now())
where i.initialization_completed_at is null
  and exists (select 1 from invoice_items ii where ii.invoice_id = i.id);

create or replace function initialize_invoice_from_job_locked(
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
      p_message_to_customer, p_terms, 0, p_public_token, null
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
    quantity, unit_price_cents, line_total_cents
  )
  select
    v_invoice.id, ji.id, row_number() over (order by ji.position, ji.id)::int - 1,
    ji.name, ji.description, ji.quantity,
    case when ji.quantity > 0 then round(ji.line_total_cents / ji.quantity)::int else ji.line_total_cents end,
    ji.line_total_cents
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
  v_tax := round((v_subtotal * v_invoice.tax_rate_bps) / 10000.0)::int;
  select coalesce(sum(r.amount_cents), 0) into v_reward
  from invoice_rewards r where r.invoice_id = v_invoice.id and r.status = 'approved';
  v_total := greatest(0, v_subtotal + v_invoice.adjustment_cents + v_tax - v_reward);
  if v_subtotal > 2147483647 or v_total > 2147483647 then
    raise exception 'invoice total exceeds integer cents range';
  end if;

  update invoices
  set subtotal_cents = v_subtotal::int,
      tax_cents = v_tax,
      total_cents = v_total::int,
      initialization_completed_at = now(),
      updated_at = now()
  where id = v_invoice.id;

  perform attach_job_deposits_locked(p_job_id, v_invoice.id);
  return query select 'ready', v_invoice.id, v_invoice.number;
end;
$$;

revoke all on function initialize_invoice_from_job_locked(uuid, text, text, text, jsonb) from public;
grant execute on function initialize_invoice_from_job_locked(uuid, text, text, text, jsonb) to service_role;

create or replace function initialize_manual_invoice_locked(
  p_contact_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_job_address text,
  p_job_name text,
  p_total_cents int,
  p_message_to_customer text,
  p_terms text,
  p_public_token text,
  p_reward_offers jsonb default '[]'::jsonb
) returns table (outcome text, invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number bigint;
  v_number text;
  v_invoice_id uuid;
begin
  if nullif(btrim(p_customer_name), '') is null
    or nullif(btrim(p_job_name), '') is null
    or p_total_cents <= 0 then
    return query select 'invalid', null::uuid, null::text;
    return;
  end if;
  select next_value into v_next_number
  from estimate_counters where id = 'invoice' for update;
  if v_next_number is null then raise exception 'invoice counter missing'; end if;
  update estimate_counters set next_value = v_next_number + 1 where id = 'invoice';
  v_number := 'INV-' || lpad(v_next_number::text, 6, '0');

  insert into invoices (
    contact_id, number, status, customer_name, customer_phone, customer_email,
    job_address, job_name, subtotal_cents, adjustment_cents, tax_cents,
    tax_rate_bps, total_cents, message_to_customer, terms, public_token,
    initialization_completed_at
  ) values (
    p_contact_id, v_number, 'draft', btrim(p_customer_name), p_customer_phone,
    p_customer_email, nullif(btrim(p_job_address), ''), btrim(p_job_name),
    p_total_cents, 0, 0, 0, p_total_cents, p_message_to_customer, p_terms,
    p_public_token, now()
  ) returning id into v_invoice_id;

  insert into invoice_items (
    invoice_id, position, name, quantity, unit_price_cents, line_total_cents
  ) values (v_invoice_id, 0, btrim(p_job_name), 1, p_total_cents, p_total_cents);

  insert into invoice_rewards (invoice_id, kind, label, amount_cents, status)
  select v_invoice_id, offer.kind, offer.label, offer.amount_cents, 'offered'
  from jsonb_to_recordset(coalesce(p_reward_offers, '[]'::jsonb))
    as offer(kind text, label text, amount_cents int)
  where offer.kind in ('google_review', 'facebook_review', 'social_follow')
    and offer.amount_cents > 0
    and nullif(btrim(offer.label), '') is not null
  on conflict on constraint invoice_rewards_invoice_id_kind_key do nothing;

  return query select 'ready', v_invoice_id, v_number;
end;
$$;

revoke all on function initialize_manual_invoice_locked(
  uuid, text, text, text, text, text, int, text, text, text, jsonb
) from public;
grant execute on function initialize_manual_invoice_locked(
  uuid, text, text, text, text, text, int, text, text, text, jsonb
) to service_role;

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
    invoice_id, position, name, description, quantity, unit_price_cents, line_total_cents
  )
  select
    p_invoice_id,
    (entry.ordinality - 1)::int,
    coalesce(nullif(btrim(entry.item->>'name'), ''), 'Service'),
    nullif(btrim(entry.item->>'description'), ''),
    (entry.item->>'quantity')::numeric,
    (entry.item->>'unit_price_cents')::int,
    round((entry.item->>'quantity')::numeric * (entry.item->>'unit_price_cents')::int)::int
  from jsonb_array_elements(p_items) with ordinality as entry(item, ordinality);

  select coalesce(sum(ii.line_total_cents), 0) into v_subtotal
  from invoice_items ii where ii.invoice_id = p_invoice_id;
  v_tax := round((v_subtotal * v_invoice.tax_rate_bps) / 10000.0)::int;
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

revoke all on function replace_invoice_items_locked(uuid, jsonb, text, int, int, text, uuid) from public;
grant execute on function replace_invoice_items_locked(uuid, jsonb, text, int, int, text, uuid) to service_role;

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
  v_tax := round((v_subtotal * v_invoice.tax_rate_bps) / 10000.0)::int;
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

revoke all on function patch_invoice_locked(uuid, jsonb, boolean, text, int, int, text, uuid) from public;
grant execute on function patch_invoice_locked(uuid, jsonb, boolean, text, int, int, text, uuid) to service_role;

create or replace function publish_invoice_locked(
  p_invoice_id uuid,
  p_expected_status text,
  p_expected_total_cents int,
  p_expected_paid_cents int,
  p_expected_square_invoice_id text,
  p_operation_id uuid,
  p_queue_text boolean,
  p_queue_email boolean
) returns table (
  outcome text,
  delivery_generation int,
  sent_at timestamptz,
  text_dedupe_key text,
  email_dedupe_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_generation int;
  v_sent_at timestamptz;
  v_text_key text;
  v_email_key text;
  v_delivery_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then
    return query select 'not_found', 0, null::timestamptz, null::text, null::text;
    return;
  end if;
  if v_invoice.billing_operation_id is distinct from p_operation_id then
    return query select 'lease_lost', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if v_invoice.status is distinct from p_expected_status
    or v_invoice.total_cents <> p_expected_total_cents
    or v_invoice.amount_paid_cents <> p_expected_paid_cents
    or v_invoice.square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if v_invoice.initialization_completed_at is null then
    return query select 'initializing', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if v_invoice.square_publish_attempt_key is not null
    or (v_invoice.hosted_payment_url is not null and v_invoice.square_invoice_id is null) then
    return query select 'square_pending', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if v_invoice.status not in ('draft', 'sent', 'viewed')
    or v_invoice.total_cents <= 0
    or v_invoice.amount_paid_cents >= v_invoice.total_cents then
    return query select 'closed', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if not p_queue_text and not p_queue_email then
    return query select 'no_destination', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if p_queue_text and v_invoice.customer_phone is null then
    return query select 'no_destination', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;
  if p_queue_email and v_invoice.customer_email is null then
    return query select 'no_destination', v_invoice.delivery_generation, v_invoice.sent_at, null::text, null::text;
    return;
  end if;

  v_generation := v_invoice.delivery_generation + 1;
  v_sent_at := coalesce(v_invoice.sent_at, now());
  v_delivery_id := 'send-g' || v_generation::text;
  if p_queue_text then v_text_key := 'invoice_send:' || p_invoice_id::text || ':g' || v_generation::text; end if;
  if p_queue_email then v_email_key := 'invoice_email_send:' || p_invoice_id::text || ':g' || v_generation::text; end if;

  update invoices
  set status = 'sent', sent_at = v_sent_at,
      delivery_generation = v_generation, updated_at = now()
  where id = p_invoice_id;

  if p_queue_text then
    insert into tasks (lead_id, kind, dedupe_key, scheduled_for, status, payload)
    values (
      v_invoice.lead_id, 'invoice_send', v_text_key, now(), 'pending',
      jsonb_build_object(
        'invoice_id', p_invoice_id::text,
        'token', v_invoice.public_token,
        'to_phone', v_invoice.customer_phone,
        'delivery_id', v_delivery_id
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  if p_queue_email then
    insert into tasks (lead_id, kind, dedupe_key, scheduled_for, status, payload)
    values (
      v_invoice.lead_id, 'invoice_customer_email', v_email_key, now(), 'pending',
      jsonb_build_object(
        'invoice_id', p_invoice_id::text,
        'to_email', v_invoice.customer_email,
        'delivery_id', v_delivery_id,
        'attempts', 0
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return query select 'published', v_generation, v_sent_at, v_text_key, v_email_key;
end;
$$;

revoke all on function publish_invoice_locked(uuid, text, int, int, text, uuid, boolean, boolean) from public;
grant execute on function publish_invoice_locked(uuid, text, int, int, text, uuid, boolean, boolean) to service_role;

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
  v_tax := round((v_subtotal * v_invoice.tax_rate_bps) / 10000.0)::int;
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

revoke all on function resolve_invoice_reward_locked(uuid, boolean, uuid, text, int, int, text, boolean, uuid) from public;
grant execute on function resolve_invoice_reward_locked(uuid, boolean, uuid, text, int, int, text, boolean, uuid) to service_role;

create or replace function void_invoice_locked(
  p_invoice_id uuid,
  p_expected_status text,
  p_expected_total_cents int,
  p_expected_paid_cents int,
  p_expected_square_invoice_id text,
  p_square_canceled boolean,
  p_operation_id uuid
) returns table (outcome text, job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || p_invoice_id::text, 0));
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then return query select 'not_found', null::uuid; return; end if;
  if v_invoice.billing_operation_id is distinct from p_operation_id then
    return query select 'lease_lost', v_invoice.job_id; return;
  end if;
  if v_invoice.status = 'paid' then return query select 'paid', v_invoice.job_id; return; end if;
  if v_invoice.status = 'void' then return query select 'already_void', v_invoice.job_id; return; end if;
  if v_invoice.square_publish_attempt_key is not null then
    return query select 'square_pending', v_invoice.job_id; return;
  end if;
  if v_invoice.hosted_payment_url is not null and v_invoice.square_invoice_id is null then
    return query select 'square_pending', v_invoice.job_id; return;
  end if;
  if v_invoice.status is distinct from p_expected_status
    or v_invoice.total_cents <> p_expected_total_cents
    or v_invoice.amount_paid_cents <> p_expected_paid_cents
    or v_invoice.square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', v_invoice.job_id; return;
  end if;
  if v_invoice.square_invoice_id is not null and not p_square_canceled then
    return query select 'square_live', v_invoice.job_id; return;
  end if;
  update invoices
  set status = 'void', voided_at = now(), hosted_payment_url = null, updated_at = now()
  where id = p_invoice_id;
  return query select 'voided', v_invoice.job_id;
end;
$$;

revoke all on function void_invoice_locked(uuid, text, int, int, text, boolean, uuid) from public;
grant execute on function void_invoice_locked(uuid, text, int, int, text, boolean, uuid) to service_role;

-- Payment side effects are part of the same transaction as the ledger write.
-- Provider delivery is still asynchronous, but a server crash after COMMIT can
-- no longer lose the push/email intent. Both outboxes are idempotent by the
-- immutable payment id.
create or replace function ensure_manual_job_deposit_effects_locked(
  p_payment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_estimate_id uuid;
  v_customer_name text;
  v_amount_cents int;
  v_deposit_paid_at timestamptz;
  v_collected_cents int;
  v_square_payment_id text;
  v_event_id text;
  v_display_name text;
  v_amount text;
begin
  select p.job_id, j.estimate_id, j.customer_name, p.amount_cents,
         j.deposit_paid_at, j.deposit_collected_cents, j.deposit_square_payment_id
  into v_job_id, v_estimate_id, v_customer_name, v_amount_cents,
       v_deposit_paid_at, v_collected_cents, v_square_payment_id
  from payments p
  join jobs j on j.id = p.job_id
  where p.id = p_payment_id
    and p.source = 'manual'
    and p.kind = 'deposit'
    and p.status = 'completed'
    and p.amount_cents > p.refunded_cents;
  if not found then return false; end if;

  v_event_id := 'manual:' || p_payment_id::text;
  v_display_name := coalesce(nullif(btrim(v_customer_name), ''), 'A customer');
  v_amount := '$' || to_char(v_amount_cents::numeric / 100, 'FM999999999990.00');

  insert into push_notification_events (
    dedupe_key, audience_key, category, urgency, title, body, data,
    status, attempt_count, next_retry_at, updated_at
  ) values (
    'deposit_received:' || v_event_id,
    'owner:workspace',
    'deposit_received',
    'active',
    'Deposit received',
    v_amount || ' received from ' || v_display_name || '.',
    jsonb_build_object(
      'workspace', 'owner',
      'href', '/(owner)/job/' || v_job_id::text,
      'eventType', 'deposit_received',
      'entityId', v_job_id::text,
      'expectedState', jsonb_build_object(
        'jobId', v_job_id::text,
        'depositState', jsonb_build_object(
          'paidAt', v_deposit_paid_at,
          'collectedCents', v_collected_cents,
          'squarePaymentId', v_square_payment_id
        )
      )
    ),
    'queued', 0, now(), now()
  ) on conflict (dedupe_key, audience_key) do nothing;

  if v_estimate_id is not null then
    insert into tasks (lead_id, kind, dedupe_key, scheduled_for, status, payload)
    values (
      null,
      'deposit_owner_receipt',
      'payment-email:deposit:' || v_event_id,
      now(),
      'pending',
      jsonb_build_object(
        'event_id', v_event_id,
        'estimate_id', v_estimate_id::text,
        'amount_cents', v_amount_cents,
        'attempts', 0
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function ensure_manual_job_deposit_effects_locked(uuid) from public;
grant execute on function ensure_manual_job_deposit_effects_locked(uuid) to service_role;

create or replace function ensure_manual_invoice_payment_effects_locked(
  p_payment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_customer_name text;
  v_amount_cents int;
  v_method text;
  v_paid_cents int;
  v_settlement_generation int;
  v_event_id text;
  v_display_name text;
  v_amount text;
begin
  select p.invoice_id, i.number, i.customer_name, p.amount_cents, p.method,
         i.amount_paid_cents, i.settlement_generation
  into v_invoice_id, v_invoice_number, v_customer_name, v_amount_cents, v_method,
       v_paid_cents, v_settlement_generation
  from payments p
  join invoices i on i.id = p.invoice_id
  where p.id = p_payment_id
    and p.source = 'manual'
    and p.kind in ('balance', 'deposit')
    and p.status = 'completed'
    and p.amount_cents > p.refunded_cents
    and i.status = 'paid'
    and i.total_cents > 0
    and i.amount_paid_cents >= i.total_cents;
  if not found then return false; end if;

  v_event_id := 'manual:' || p_payment_id::text;
  v_display_name := coalesce(nullif(btrim(v_customer_name), ''), 'A customer');
  v_amount := '$' || to_char(v_amount_cents::numeric / 100, 'FM999999999990.00');

  insert into push_notification_events (
    dedupe_key, audience_key, category, urgency, title, body, data,
    status, attempt_count, next_retry_at, updated_at
  ) values (
    'invoice_paid:' || v_event_id,
    'owner:workspace',
    'invoice_paid',
    'active',
    'Invoice paid',
    v_display_name || ' paid ' || v_amount || ' on ' || v_invoice_number || '.',
    jsonb_build_object(
      'workspace', 'owner',
      'href', '/(owner)/invoice/' || v_invoice_id::text,
      'eventType', 'invoice_paid',
      'entityId', v_invoice_id::text,
      'expectedState', jsonb_build_object(
        'invoiceState', jsonb_build_object(
          'status', 'paid',
          'amountPaidCents', v_paid_cents,
          'settlementGeneration', v_settlement_generation
        )
      )
    ),
    'queued', 0, now(), now()
  ) on conflict (dedupe_key, audience_key) do nothing;

  insert into tasks (lead_id, kind, dedupe_key, scheduled_for, status, payload)
  values
    (
      null,
      'payment_owner_receipt',
      'payment-email:owner:' || v_event_id,
      now(),
      'pending',
      jsonb_build_object(
        'event_id', v_event_id,
        'invoice_id', v_invoice_id::text,
        'method', v_method,
        'attempts', 0
      )
    ),
    (
      null,
      'payment_customer_receipt',
      'payment-email:customer:' || v_event_id,
      now(),
      'pending',
      jsonb_build_object(
        'event_id', v_event_id,
        'invoice_id', v_invoice_id::text,
        'method', v_method,
        'attempts', 0
      )
  )
  on conflict (dedupe_key) do nothing;
  update tasks
  set status = 'canceled'
  where kind in ('invoice_send', 'invoice_customer_email', 'invoice_reminder')
    and status = 'pending'
    and payload @> jsonb_build_object('invoice_id', v_invoice_id::text);
  return true;
end;
$$;

revoke all on function ensure_manual_invoice_payment_effects_locked(uuid) from public;
grant execute on function ensure_manual_invoice_payment_effects_locked(uuid) to service_role;

drop function if exists record_manual_job_deposit_locked(uuid, int, text);
drop function if exists record_manual_job_deposit_locked(uuid, int, text, int, text, text);
drop function if exists record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text);
alter table payments add column if not exists manual_idempotency_key text;
create unique index if not exists payments_manual_idempotency_key_uidx
  on payments (manual_idempotency_key)
  where manual_idempotency_key is not null;
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
declare
  v_job_status text;
  v_job_total int;
  v_collected int;
  v_square_payment_id text;
  v_link_id text;
  v_link_url text;
  v_order_id text;
  v_invoice_id uuid;
  v_invoice invoices%rowtype;
  v_prior bigint;
  v_payment_id uuid;
  v_duplicate payments%rowtype;
  v_deposit_operation_id uuid;
  v_deposit_operation_started_at timestamptz;
  v_invoice_result record;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  -- Read only to discover the invoice lock. Do not lock the job row until the
  -- invoice advisory lock is owned: recompute locks invoice then job.
  select status, total_cents, deposit_collected_cents, deposit_square_payment_id,
         deposit_link_id, deposit_link_url, deposit_order_id,
         deposit_link_operation_id, deposit_link_operation_started_at
  into v_job_status, v_job_total, v_collected, v_square_payment_id,
       v_link_id, v_link_url, v_order_id,
       v_deposit_operation_id, v_deposit_operation_started_at
  from jobs where id = p_job_id;
  if not found then return query select 'not_found', null::uuid, null::uuid, 0, 0; return; end if;

  select i.id into v_invoice_id
  from invoices i
  where i.job_id = p_job_id and i.status <> 'void'
  order by i.created_at desc limit 1;
  if v_invoice_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('square-invoice:' || v_invoice_id::text, 0));
  end if;

  select status, total_cents, deposit_collected_cents, deposit_square_payment_id,
         deposit_link_id, deposit_link_url, deposit_order_id,
         deposit_link_operation_id, deposit_link_operation_started_at
  into v_job_status, v_job_total, v_collected, v_square_payment_id,
       v_link_id, v_link_url, v_order_id,
       v_deposit_operation_id, v_deposit_operation_started_at
  from jobs where id = p_job_id for update;
  if not found then return query select 'not_found', null::uuid, null::uuid, 0, 0; return; end if;
  if v_collected <> p_expected_collected_cents
    or v_square_payment_id is distinct from p_expected_square_payment_id
    or v_link_id is distinct from p_expected_link_id
    or v_link_url is distinct from p_expected_link_url
    or v_order_id is distinct from p_expected_order_id then
    return query select 'payment_conflict', null::uuid, null::uuid, v_collected, v_job_total; return;
  end if;
  if v_job_status in ('canceled', 'paid') then
    return query select 'job_closed', null::uuid, null::uuid, v_collected, v_job_total; return;
  end if;
  if p_amount_cents <= 0 or p_method not in ('cash', 'card', 'other') then
    return query select 'invalid', null::uuid, null::uuid, v_collected, v_job_total; return;
  end if;
  if nullif(btrim(p_idempotency_key), '') is null or length(p_idempotency_key) > 200 then
    return query select 'invalid', null::uuid, null::uuid, v_collected, v_job_total; return;
  end if;
  if v_deposit_operation_id is not null
    and v_deposit_operation_started_at > now() - interval '15 minutes' then
    return query select 'deposit_busy', null::uuid, null::uuid, v_collected, v_job_total; return;
  end if;

  if v_invoice_id is not null then
    select i.* into v_invoice
    from invoices i
    where i.id = v_invoice_id and i.job_id = p_job_id and i.status <> 'void'
    for update;
    if not found then
      return query select 'payment_conflict', null::uuid, null::uuid, v_collected, v_job_total;
      return;
    end if;
    if v_invoice.billing_operation_id is not null
      and v_invoice.billing_operation_started_at > now() - interval '15 minutes' then
      return query select 'invoice_busy', null::uuid, v_invoice.id, v_collected, v_job_total; return;
    end if;
    if v_invoice.square_publish_attempt_key is not null then
      return query select 'square_pending', null::uuid, v_invoice.id, v_collected, v_job_total; return;
    end if;
    if v_invoice.status <> 'draft' or v_invoice.square_invoice_id is not null then
      return query select 'invoice_sent', null::uuid, v_invoice.id, v_collected, v_job_total; return;
    end if;
  end if;

  select coalesce(sum(p.amount_cents - p.refunded_cents), 0) into v_prior
  from payments p where p.job_id = p_job_id and p.kind = 'deposit';
  if v_prior <> p_expected_collected_cents then
    return query select 'payment_conflict', null::uuid,
      case when v_invoice.id is null then null::uuid else v_invoice.id end,
      v_prior::int, v_job_total;
    return;
  end if;
  select p.* into v_duplicate
  from payments p
  where p.manual_idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_duplicate.job_id is distinct from p_job_id
      or v_duplicate.kind is distinct from 'deposit'
      or v_duplicate.source is distinct from 'manual'
      or v_duplicate.method is distinct from p_method
      or v_duplicate.amount_cents is distinct from p_amount_cents then
      return query select 'payment_conflict', null::uuid,
        case when v_invoice.id is null then null::uuid else v_invoice.id end,
        v_prior::int, v_job_total;
      return;
    end if;
    if not ensure_manual_job_deposit_effects_locked(v_duplicate.id) then
      raise exception 'manual deposit effect backfill failed for %', v_duplicate.id;
    end if;
    return query select 'duplicate', v_duplicate.id,
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
    invoice_id, job_id, amount_cents, currency, method, source, status, kind,
    recorded_by, manual_idempotency_key
  ) values (
    case when v_invoice.id is null then null else v_invoice.id end,
    p_job_id, p_amount_cents, 'USD', p_method, 'manual', 'completed', 'deposit',
    'owner', p_idempotency_key
  ) returning id into v_payment_id;
  v_prior := v_prior + p_amount_cents;
  update jobs
  set deposit_collected_cents = v_prior::int,
      deposit_paid_at = coalesce(deposit_paid_at, now())
  where id = p_job_id;
  if v_invoice.id is not null then
    select * into v_invoice_result from recompute_invoice_paid_locked(v_invoice.id);
    if v_invoice_result.newly_settled then
      if not ensure_manual_invoice_payment_effects_locked(v_payment_id) then
        raise exception 'manual deposit invoice effect enqueue failed for %', v_payment_id;
      end if;
    end if;
  end if;
  if not ensure_manual_job_deposit_effects_locked(v_payment_id) then
    raise exception 'manual deposit effect enqueue failed for %', v_payment_id;
  end if;
  return query select 'recorded', v_payment_id,
    case when v_invoice.id is null then null::uuid else v_invoice.id end,
    v_prior::int, v_job_total;
end;
$$;

revoke all on function record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text, text) from public;
grant execute on function record_manual_job_deposit_locked(uuid, int, text, int, text, text, text, text, text) to service_role;

drop function if exists record_manual_invoice_payment_locked(uuid, int, text, int, int, uuid);
create or replace function record_manual_invoice_payment_locked(
  p_invoice_id uuid,
  p_amount_cents int,
  p_method text,
  p_expected_paid_cents int,
  p_expected_total_cents int,
  p_expected_square_invoice_id text,
  p_square_canceled boolean,
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
  v_publish_attempt_key text;
  v_square_invoice_id text;
  v_hosted_payment_url text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('square-invoice:' || p_invoice_id::text, 0)
  );

  select
    i.status,
    i.job_id,
    i.total_cents,
    i.amount_paid_cents,
    i.billing_operation_id,
    i.square_publish_attempt_key,
    i.square_invoice_id,
    i.hosted_payment_url
  into v_status, v_job_id, v_total, v_cached_paid, v_operation_id,
       v_publish_attempt_key, v_square_invoice_id, v_hosted_payment_url
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
  if v_publish_attempt_key is not null then
    return query select 'square_pending', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if v_operation_id is distinct from p_operation_id then
    return query select 'conflict', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if v_square_invoice_id is distinct from p_expected_square_invoice_id then
    return query select 'conflict', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if v_hosted_payment_url is not null and v_square_invoice_id is null then
    return query select 'square_pending', null::uuid, v_cached_paid, v_total, false, false, 0;
    return;
  end if;
  if v_square_invoice_id is not null and not p_square_canceled then
    return query select 'square_live', null::uuid, v_cached_paid, v_total, false, false, 0;
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

  select * into v_result from recompute_invoice_paid_locked(p_invoice_id);
  if v_result.newly_settled then
    if not ensure_manual_invoice_payment_effects_locked(v_payment_id) then
      raise exception 'manual invoice payment effect enqueue failed for %', v_payment_id;
    end if;
  end if;
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

revoke all on function record_manual_invoice_payment_locked(uuid, int, text, int, int, text, boolean, uuid) from public;
grant execute on function record_manual_invoice_payment_locked(uuid, int, text, int, int, text, boolean, uuid) to service_role;
