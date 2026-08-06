-- Canes Pressure Washing — 0025: job mutation + notification audit atomically.
--
-- A client/network error cannot tell whether a standalone UPDATE committed.
-- Keep the schedule mutation and its immutable recovery event in one database
-- transaction so cron always has an audit to repair and failed CAS writes
-- never leave an orphan event.

create or replace function mutate_job_with_notification_locked(
  p_job_id uuid,
  p_operation text,
  p_expected_status text,
  p_expected_scheduled_at timestamptz,
  p_expected_crew_id uuid,
  p_event_type text,
  p_detail jsonb,
  p_new_status text default null,
  p_new_scheduled_at timestamptz default null,
  p_new_ends_at timestamptz default null,
  p_new_duration_minutes int default null,
  p_new_crew_id uuid default null,
  p_new_assigned_to text default null,
  p_new_confirmed_at timestamptz default null,
  p_new_canceled_reason text default null
) returns table (outcome text, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_event_id uuid;
begin
  if p_operation not in ('schedule', 'unschedule', 'assign', 'status')
    or p_event_type not in (
      'schedule_changed', 'schedule_removed',
      'crew_assignment_changed', 'status_changed'
    )
    or p_detail is null then
    return query select 'invalid', null::uuid;
    return;
  end if;

  select * into v_job from jobs where id = p_job_id for update;
  if not found then
    return query select 'not_found', null::uuid;
    return;
  end if;
  if v_job.status is distinct from p_expected_status
    or v_job.scheduled_at is distinct from p_expected_scheduled_at
    or v_job.crew_id is distinct from p_expected_crew_id then
    return query select 'conflict', null::uuid;
    return;
  end if;

  if p_operation in ('schedule', 'unschedule', 'assign')
    and v_job.status in ('completed', 'invoiced', 'paid', 'canceled') then
    return query select 'terminal', null::uuid;
    return;
  end if;
  if p_operation = 'schedule'
    and (p_new_scheduled_at is null or p_new_ends_at is null
      or p_new_duration_minutes is null or p_new_duration_minutes < 15) then
    return query select 'invalid', null::uuid;
    return;
  end if;
  if p_operation = 'status' and p_new_status is null then
    return query select 'invalid', null::uuid;
    return;
  end if;

  insert into job_activity_events (job_id, account_id, event_type, detail)
  values (p_job_id, null, p_event_type, p_detail)
  returning id into v_event_id;

  if p_operation = 'schedule' then
    update jobs set
      scheduled_at = p_new_scheduled_at,
      ends_at = p_new_ends_at,
      duration_minutes = p_new_duration_minutes,
      crew_id = p_new_crew_id,
      assigned_to = p_new_assigned_to,
      status = coalesce(p_new_status, status),
      confirmed_at = p_new_confirmed_at
    where id = p_job_id;
  elsif p_operation = 'unschedule' then
    update jobs set scheduled_at = null, ends_at = null, status = 'unscheduled'
    where id = p_job_id;
  elsif p_operation = 'assign' then
    update jobs set crew_id = p_new_crew_id, assigned_to = p_new_assigned_to
    where id = p_job_id;
  else
    update jobs set
      status = p_new_status,
      canceled_reason = case
        when p_new_status = 'canceled' then p_new_canceled_reason
        else canceled_reason
      end,
      confirmed_at = case
        when p_new_status = 'confirmed' then p_new_confirmed_at
        else confirmed_at
      end
    where id = p_job_id;
  end if;

  return query select 'updated', v_event_id;
end;
$$;

revoke all on function mutate_job_with_notification_locked(
  uuid, text, text, timestamptz, uuid, text, jsonb, text,
  timestamptz, timestamptz, int, uuid, text, timestamptz, text
) from public;
grant execute on function mutate_job_with_notification_locked(
  uuid, text, text, timestamptz, uuid, text, jsonb, text,
  timestamptz, timestamptz, int, uuid, text, timestamptz, text
) to service_role;

create or replace function claim_job_cancellation_billing_locked(
  p_job_id uuid,
  p_expected_status text,
  p_operation_id uuid
) returns table (
  outcome text,
  deposit_link_id text,
  deposit_link_url text,
  deposit_order_id text,
  deposit_collected_cents int,
  deposit_link_retired_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('square-deposit:' || p_job_id::text, 0));
  select * into v_job from jobs where id = p_job_id for update;
  if not found then
    return query select 'not_found', null::text, null::text, null::text, 0, null::timestamptz;
    return;
  end if;
  if v_job.status is distinct from p_expected_status then
    return query select 'conflict', null::text, null::text, null::text, 0, null::timestamptz;
    return;
  end if;
  -- Any deposit-link operation is an ambiguous provider request until that
  -- exact idempotency key is reconciled. Never steal it for cancellation.
  if v_job.deposit_link_operation_id is not null then
    return query select 'deposit_busy', v_job.deposit_link_id, v_job.deposit_link_url,
      v_job.deposit_order_id, v_job.deposit_collected_cents,
      v_job.deposit_link_retired_at;
    return;
  end if;
  if v_job.square_financial_operation_key is not null
    and v_job.square_financial_operation_started_at >= now() - interval '15 minutes' then
    return query select 'financial_busy', v_job.deposit_link_id, v_job.deposit_link_url,
      v_job.deposit_order_id, v_job.deposit_collected_cents,
      v_job.deposit_link_retired_at;
    return;
  end if;
  update jobs set deposit_link_operation_id = p_operation_id,
    deposit_link_operation_started_at = now()
  where id = p_job_id;
  return query select 'claimed', v_job.deposit_link_id, v_job.deposit_link_url,
    v_job.deposit_order_id, v_job.deposit_collected_cents,
    v_job.deposit_link_retired_at;
end;
$$;

revoke all on function claim_job_cancellation_billing_locked(uuid, text, uuid) from public;
grant execute on function claim_job_cancellation_billing_locked(uuid, text, uuid) to service_role;

create or replace function check_in_job_locked(
  p_job_id uuid,
  p_account_id uuid,
  p_checked_in_at timestamptz
) returns table (outcome text, open_job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_open_job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('crew-check-in:' || p_account_id::text, 0));
  select * into v_job from jobs where id = p_job_id for update;
  if not found then return query select 'not_found', null::uuid; return; end if;
  if v_job.status in ('completed', 'invoiced', 'paid', 'canceled') then
    return query select 'closed', null::uuid; return;
  end if;
  select e.job_id into v_open_job_id
  from job_time_entries e
  where e.account_id = p_account_id and e.checked_out_at is null
  order by e.checked_in_at desc limit 1 for update;
  if found then
    return query select
      case when v_open_job_id = p_job_id then 'already_here' else 'open_elsewhere' end,
      v_open_job_id;
    return;
  end if;
  insert into job_time_entries (job_id, account_id, checked_in_at)
  values (p_job_id, p_account_id, p_checked_in_at);
  update jobs set status = 'in_progress'
  where id = p_job_id and status in ('unscheduled', 'scheduled', 'confirmed');
  return query select 'checked_in', p_job_id;
end;
$$;

revoke all on function check_in_job_locked(uuid, uuid, timestamptz) from public;
grant execute on function check_in_job_locked(uuid, uuid, timestamptz) to service_role;

-- A returning website customer is a new opportunity on the existing phone
-- card. Reset closed/handled pipeline state atomically with the request event
-- so call-now and the once-at-10m fallback both target the new opportunity.
create or replace function apply_public_lead_existing_update(
  p_submission_key text,
  p_lead_id uuid,
  p_name text,
  p_email text,
  p_address text,
  p_service text,
  p_note text,
  p_event_detail text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended('public-lead-update:' || p_submission_key, 0));
  if exists (select 1 from events where source_key = p_submission_key || ':request') then
    return false;
  end if;
  update leads
  set last_activity_at = v_now,
      opportunity_started_at = case
        when status in ('won', 'lost') then v_now
        else opportunity_started_at
      end,
      status = case when status in ('won', 'lost') then 'new' else status end,
      type = case when status in ('won', 'lost') then 'cold' else type end,
      source = 'website',
      appointment_at = case when status in ('won', 'lost') then null else appointment_at end,
      confirmed_at = case when status in ('won', 'lost') then null else confirmed_at end,
      lost_reason = case when status in ('won', 'lost') then null else lost_reason end,
      snoozed_until = case when status in ('won', 'lost') then null else snoozed_until end,
      name = coalesce(name, nullif(p_name, '')),
      email = coalesce(email, nullif(p_email, '')),
      address = coalesce(address, nullif(p_address, '')),
      service = coalesce(service, nullif(p_service, '')),
      notes = case
        when nullif(notes, '') is null then p_note
        else notes || E'\n\n' || p_note
      end
  where id = p_lead_id;
  if not found then raise exception 'website lead no longer exists'; end if;
  insert into events (lead_id, kind, detail, source_key)
  values (p_lead_id, 'website_request', p_event_detail, p_submission_key || ':request');
  return true;
end;
$$;

revoke all on function apply_public_lead_existing_update(text, uuid, text, text, text, text, text, text) from public;
grant execute on function apply_public_lead_existing_update(text, uuid, text, text, text, text, text, text) to service_role;

create or replace function apply_public_lead_created_enrichment(
  p_submission_key text,
  p_lead_id uuid,
  p_name text,
  p_email text,
  p_address text,
  p_service text,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  perform pg_advisory_xact_lock(hashtextextended('public-lead-enrichment:' || p_submission_key, 0));
  insert into public_lead_effects (submission_key, effect_key, state)
  values (p_submission_key, 'created-lead-enrichment', 'claimed')
  on conflict (submission_key, effect_key) do nothing;

  select state into v_state
  from public_lead_effects
  where submission_key = p_submission_key and effect_key = 'created-lead-enrichment'
  for update;
  if v_state = 'completed' then return false; end if;

  update leads
  set source = 'website',
      name = nullif(p_name, ''),
      email = nullif(p_email, ''),
      address = nullif(p_address, ''),
      service = nullif(p_service, ''),
      notes = p_note
  where id = p_lead_id;
  if not found then raise exception 'claimed website lead no longer exists'; end if;

  update public_lead_effects
  set state = 'completed', last_error = null, updated_at = now()
  where submission_key = p_submission_key and effect_key = 'created-lead-enrichment';
  return true;
end;
$$;

revoke all on function apply_public_lead_created_enrichment(text, uuid, text, text, text, text, text) from public;
grant execute on function apply_public_lead_created_enrichment(text, uuid, text, text, text, text, text) to service_role;
