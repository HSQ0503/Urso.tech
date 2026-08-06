-- Canes Pressure Washing — 0020: atomic push receipt reconciliation.
-- Run after 0018_push_notifications.sql and
-- 0019_inbound_notification_hardening.sql.

-- Expo can temporarily omit a receipt even after accepting the ticket. Keep a
-- durable retry schedule so one omitted receipt cannot remain at the front of
-- every limited query and starve newer tickets forever.
alter table push_notification_deliveries
  add column if not exists receipt_attempt_count int not null default 0;
alter table push_notification_deliveries
  add column if not exists receipt_next_check_at timestamptz;
alter table push_notification_deliveries
  drop constraint if exists push_notification_deliveries_receipt_attempt_count_check;
alter table push_notification_deliveries
  add constraint push_notification_deliveries_receipt_attempt_count_check
    check (receipt_attempt_count >= 0);

create index if not exists push_notification_deliveries_receipt_due_idx
  on push_notification_deliveries (status, receipt_next_check_at, sent_at)
  where status = 'accepted' and expo_ticket_id is not null;

-- Merge a partial preference patch while holding the account row lock. The old
-- read/merge/upsert sequence could lose one of two concurrent changes (for
-- example, toggling an event on one phone while changing quiet hours on
-- another).
create or replace function merge_push_notification_preferences(
  p_recipient_kind text,
  p_recipient_id text,
  p_enabled boolean,
  p_categories jsonb,
  p_quiet_hours_enabled boolean,
  p_quiet_start_hour int,
  p_quiet_end_hour int,
  p_timezone text
) returns push_notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row push_notification_preferences%rowtype;
begin
  if p_recipient_kind not in ('owner', 'crew') or nullif(trim(p_recipient_id), '') is null then
    raise exception 'invalid push preference identity';
  end if;
  if p_categories is not null and jsonb_typeof(p_categories) <> 'object' then
    raise exception 'push categories patch must be an object';
  end if;
  if p_quiet_start_hour is not null and p_quiet_start_hour not between 0 and 23 then
    raise exception 'invalid quiet start hour';
  end if;
  if p_quiet_end_hour is not null and p_quiet_end_hour not between 0 and 23 then
    raise exception 'invalid quiet end hour';
  end if;

  insert into push_notification_preferences (recipient_kind, recipient_id)
  values (p_recipient_kind, p_recipient_id)
  on conflict (recipient_kind, recipient_id) do nothing;

  select * into v_row
  from push_notification_preferences
  where recipient_kind = p_recipient_kind and recipient_id = p_recipient_id
  for update;

  update push_notification_preferences
  set enabled = coalesce(p_enabled, v_row.enabled),
      categories = v_row.categories || coalesce(p_categories, '{}'::jsonb),
      quiet_hours_enabled = coalesce(p_quiet_hours_enabled, v_row.quiet_hours_enabled),
      quiet_start_hour = coalesce(p_quiet_start_hour, v_row.quiet_start_hour),
      quiet_end_hour = coalesce(p_quiet_end_hour, v_row.quiet_end_hour),
      timezone = coalesce(nullif(trim(p_timezone), ''), v_row.timezone),
      updated_at = now()
  where recipient_kind = p_recipient_kind and recipient_id = p_recipient_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function merge_push_notification_preferences(
  text, text, boolean, jsonb, boolean, int, int, text
) from public;
grant execute on function merge_push_notification_preferences(
  text, text, boolean, jsonb, boolean, int, int, text
) to service_role;

-- Apply every receipt transition and the resulting parent-event status in one
-- transaction. The advisory lock also serializes overlapping cron runs, so a
-- late DeviceNotRegistered result cannot race a successful sibling receipt and
-- overwrite the event with a stale aggregate.
create or replace function reconcile_push_delivery_receipts(
  p_updates jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update record;
  v_event_id uuid;
  v_device_id uuid;
  v_event_ids uuid[] := '{}'::uuid[];
  v_reconciled int := 0;
  v_event_status text;
  v_accepted int;
  v_delivered int;
  v_retryable int;
  v_terminal int;
  v_expired int;
  v_invalid int;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'push receipt updates must be an array';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-receipt-reconciliation', 0));

  for v_update in
    select *
    from jsonb_to_recordset(p_updates) as x(
      delivery_id uuid,
      delivery_status text,
      error_code text,
      error_message text,
      checked_at timestamptz,
      disable_device boolean
    )
  loop
    if v_update.delivery_status not in ('delivered', 'failed', 'invalid_device') then
      raise exception 'invalid push delivery receipt status';
    end if;

    select d.event_id, d.device_id into v_event_id, v_device_id
    from push_notification_deliveries d
    where d.id = v_update.delivery_id and d.status = 'accepted'
    for update;
    if not found then
      continue;
    end if;

    -- Lock the parent before changing the child aggregate. The global advisory
    -- lock gives every batch the same lock order across overlapping crons.
    perform 1 from push_notification_events e where e.id = v_event_id for update;

    update push_notification_deliveries
    set status = v_update.delivery_status,
        error_code = nullif(v_update.error_code, ''),
        error_message = nullif(v_update.error_message, ''),
        receipt_checked_at = coalesce(v_update.checked_at, now()),
        receipt_next_check_at = null,
        updated_at = coalesce(v_update.checked_at, now())
    where id = v_update.delivery_id and status = 'accepted';
    if not found then
      continue;
    end if;

    if coalesce(v_update.disable_device, false) then
      update push_devices
      set enabled = false,
          disabled_at = coalesce(disabled_at, coalesce(v_update.checked_at, now())),
          updated_at = coalesce(v_update.checked_at, now())
      where id = v_device_id;
    end if;

    if not v_event_id = any(v_event_ids) then
      v_event_ids := array_append(v_event_ids, v_event_id);
    end if;
    v_reconciled := v_reconciled + 1;
  end loop;

  foreach v_event_id in array v_event_ids
  loop
    select
      count(*) filter (where d.status = 'accepted'),
      count(*) filter (where d.status = 'delivered'),
      count(*) filter (
        where d.status = 'pending'
          or (d.status = 'failed' and coalesce(d.error_code, '') not in (
            'ReceiptExpired', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials'
          ))
      ),
      count(*) filter (
        where d.status = 'invalid_device'
          or (d.status = 'failed' and coalesce(d.error_code, '') in (
            'ReceiptExpired', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials'
          ))
      ),
      count(*) filter (where d.error_code = 'ReceiptExpired'),
      count(*) filter (where d.status = 'invalid_device')
    into v_accepted, v_delivered, v_retryable, v_terminal, v_expired, v_invalid
    from push_notification_deliveries d
    where d.event_id = v_event_id;

    if v_retryable > 0 then
      v_event_status := case when v_delivered + v_accepted > 0 then 'partial' else 'failed' end;
      update push_notification_events
      set status = v_event_status,
          error = 'Expo reported a retryable device delivery failure.',
          next_retry_at = now() + interval '5 minutes',
          updated_at = now()
      where id = v_event_id;
    elsif v_delivered + v_accepted > 0 then
      update push_notification_events
      set status = 'sent',
          error = case
            when v_invalid > 0 then 'One or more inactive device registrations were disabled.'
            when v_expired > 0 then 'A sibling device receipt expired after another device delivered.'
            when v_terminal > 0 then 'A sibling device rejected the notification permanently.'
            else null
          end,
          next_retry_at = null,
          updated_at = now()
      where id = v_event_id;
    else
      update push_notification_events
      set status = 'failed',
          attempt_count = greatest(attempt_count, 5),
          error = case
            when v_expired > 0 then 'Expo did not return a receipt within 24 hours.'
            when v_invalid > 0 then 'Expo reported that every target device is no longer registered.'
            else 'Expo permanently rejected every target device delivery.'
          end,
          next_retry_at = null,
          updated_at = now()
      where id = v_event_id;
    end if;
  end loop;

  return v_reconciled;
end;
$$;

revoke all on function reconcile_push_delivery_receipts(jsonb) from public;
grant execute on function reconcile_push_delivery_receipts(jsonb) to service_role;

-- An absent receipt is not a failure. Record the attempt and exponentially
-- defer that ticket (2, 4, 8, 16, then 30 minutes) so limited receipt batches
-- rotate fairly through the full accepted-ticket backlog.
create or replace function defer_omitted_push_receipts(
  p_delivery_ids uuid[],
  p_checked_at timestamptz
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update push_notification_deliveries
  set receipt_attempt_count = receipt_attempt_count + 1,
      receipt_checked_at = coalesce(p_checked_at, now()),
      receipt_next_check_at = coalesce(p_checked_at, now()) + make_interval(
        secs => least(
          1800,
          (120 * power(2::numeric, least(receipt_attempt_count, 4)))::int
        )
      ),
      updated_at = coalesce(p_checked_at, now())
  where id = any(p_delivery_ids) and status = 'accepted';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function defer_omitted_push_receipts(uuid[], timestamptz) from public;
grant execute on function defer_omitted_push_receipts(uuid[], timestamptz) to service_role;
