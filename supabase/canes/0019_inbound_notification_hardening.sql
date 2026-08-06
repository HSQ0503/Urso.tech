-- Durable ingress claims for Twilio SMS and the public quote-request form.
-- These tables are server-only workflow ledgers: public clients must never be
-- able to forge a completed webhook/submission or inspect hashed request data.

-- A lead row can be reopened for a genuinely new vendor opportunity. Keep a
-- lifecycle timestamp separate from created_at/last_activity_at so reminders
-- dedupe and age against the current opportunity without treating a vendor
-- resend as a new lifecycle.
alter table leads add column if not exists opportunity_started_at timestamptz;
update leads set opportunity_started_at = created_at where opportunity_started_at is null;
alter table leads alter column opportunity_started_at set default now();
alter table leads alter column opportunity_started_at set not null;

alter table messages
  add column if not exists inbound_dedupe_key text;

create unique index if not exists messages_inbound_dedupe_key_uidx
  on messages (inbound_dedupe_key)
  where inbound_dedupe_key is not null;

alter table calls
  add column if not exists inbound_dedupe_key text;

create unique index if not exists calls_inbound_dedupe_key_uidx
  on calls (inbound_dedupe_key)
  where inbound_dedupe_key is not null;

alter table events
  add column if not exists source_key text;

create unique index if not exists events_source_key_uidx
  on events (source_key)
  where source_key is not null;

create table if not exists inbound_sms_claims (
  message_sid text primary key,
  payload_hash text not null,
  route text check (route in ('opt_out', 'vendor', 'known_lead', 'organic')),
  route_context jsonb not null default '{}'::jsonb,
  lead_id uuid references leads (id) on delete set null,
  state text not null default 'processing'
    check (state in ('processing', 'completed', 'failed')),
  lease_expires_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  outcome jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inbound_sms_effects (
  message_sid text not null references inbound_sms_claims (message_sid) on delete cascade,
  effect_key text not null,
  state text not null default 'claimed' check (state in ('claimed', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_sid, effect_key)
);

create table if not exists inbound_call_claims (
  event_key text primary key,
  payload_hash text not null,
  state text not null default 'processing'
    check (state in ('processing', 'completed', 'failed')),
  lease_expires_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  outcome jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inbound_call_effects (
  event_key text not null references inbound_call_claims (event_key) on delete cascade,
  effect_key text not null,
  state text not null default 'claimed' check (state in ('claimed', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_key, effect_key)
);

create table if not exists public_lead_submissions (
  submission_key text primary key,
  payload_hash text not null,
  ip_hash text not null,
  state text not null default 'processing'
    check (state in ('processing', 'completed', 'failed')),
  lead_id uuid references leads (id) on delete set null,
  created_lead boolean,
  lease_expires_at timestamptz not null default (now() + interval '10 minutes'),
  attempts integer not null default 1 check (attempts > 0),
  response jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public_lead_effects (
  submission_key text not null references public_lead_submissions (submission_key) on delete cascade,
  effect_key text not null,
  state text not null default 'claimed' check (state in ('claimed', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (submission_key, effect_key)
);

create table if not exists public_lead_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (ip_hash, window_start)
);

-- Keep this migration replay-safe for environments that created the ledgers
-- from an earlier draft before attempts were recorded.
alter table inbound_sms_effects add column if not exists attempts integer not null default 1;
alter table inbound_call_effects add column if not exists attempts integer not null default 1;
alter table public_lead_effects add column if not exists attempts integer not null default 1;

create index if not exists public_lead_rate_limits_updated_idx
  on public_lead_rate_limits (updated_at);

alter table inbound_sms_claims enable row level security;
alter table inbound_sms_effects enable row level security;
alter table inbound_call_claims enable row level security;
alter table inbound_call_effects enable row level security;
alter table public_lead_submissions enable row level security;
alter table public_lead_effects enable row level security;
alter table public_lead_rate_limits enable row level security;

-- Claim exactly one worker for a Twilio MessageSid. The route is persisted
-- separately below, before handler side effects begin, so a retry can never
-- reclassify an SMS after the first attempt created or changed a lead.
create or replace function claim_inbound_sms(
  p_message_sid text,
  p_payload_hash text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row inbound_sms_claims%rowtype;
  v_inserted integer := 0;
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
begin
  if p_message_sid is null or length(p_message_sid) < 8 or length(p_message_sid) > 80 then
    raise exception 'invalid inbound message sid';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'invalid inbound payload hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inbound-sms:' || p_message_sid, 0));

  insert into inbound_sms_claims (
    message_sid,
    payload_hash,
    lease_expires_at
  ) values (
    p_message_sid,
    p_payload_hash,
    now() + make_interval(secs => v_lease_seconds)
  )
  on conflict (message_sid) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_row
  from inbound_sms_claims
  where message_sid = p_message_sid
  for update;

  if v_row.payload_hash <> p_payload_hash then
    return jsonb_build_object('state', 'conflict');
  end if;

  if v_row.state = 'completed' then
    return jsonb_build_object(
      'state', 'completed',
      'route', v_row.route,
      'route_context', v_row.route_context,
      'lead_id', v_row.lead_id,
      'outcome', v_row.outcome
    );
  end if;

  if v_inserted = 0 and v_row.state = 'processing' and v_row.lease_expires_at > now() then
    return jsonb_build_object(
      'state', 'in_progress',
      'route', v_row.route,
      'route_context', v_row.route_context,
      'lead_id', v_row.lead_id
    );
  end if;

  update inbound_sms_claims
  set state = 'processing',
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempts = case when v_inserted > 0 then attempts else attempts + 1 end,
      last_error = null,
      updated_at = now()
  where message_sid = p_message_sid
  returning * into v_row;

  return jsonb_build_object(
    'state', 'acquired',
    'route', v_row.route,
    'route_context', v_row.route_context,
    'lead_id', v_row.lead_id
  );
end;
$$;

create or replace function set_inbound_sms_route(
  p_message_sid text,
  p_payload_hash text,
  p_route text,
  p_lead_id uuid default null,
  p_route_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row inbound_sms_claims%rowtype;
begin
  if p_route not in ('opt_out', 'vendor', 'known_lead', 'organic') then
    raise exception 'invalid inbound route';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inbound-sms:' || p_message_sid, 0));
  select * into v_row
  from inbound_sms_claims
  where message_sid = p_message_sid
  for update;

  if not found or v_row.payload_hash <> p_payload_hash then
    raise exception 'inbound claim not found';
  end if;

  if v_row.route is null then
    update inbound_sms_claims
    set route = p_route,
        lead_id = p_lead_id,
        route_context = coalesce(p_route_context, '{}'::jsonb),
        updated_at = now()
    where message_sid = p_message_sid
    returning * into v_row;
  elsif v_row.route <> p_route
     or v_row.lead_id is distinct from p_lead_id
     or v_row.route_context is distinct from coalesce(p_route_context, '{}'::jsonb) then
    raise exception 'inbound route is already pinned';
  end if;

  return jsonb_build_object(
    'route', v_row.route,
    'lead_id', v_row.lead_id,
    'route_context', v_row.route_context
  );
end;
$$;

create or replace function finish_inbound_sms(
  p_message_sid text,
  p_payload_hash text,
  p_outcome jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update inbound_sms_claims
  set state = case when p_error is null then 'completed' else 'failed' end,
      outcome = case when p_error is null then coalesce(p_outcome, '{}'::jsonb) else outcome end,
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      lease_expires_at = now(),
      updated_at = now()
  where message_sid = p_message_sid
    and payload_hash = p_payload_hash;
end;
$$;

create or replace function bind_inbound_sms_lead(
  p_message_sid text,
  p_payload_hash text,
  p_lead_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update inbound_sms_claims
  set lead_id = p_lead_id,
      updated_at = now()
  where message_sid = p_message_sid
    and payload_hash = p_payload_hash
    and route = 'organic'
    and (lead_id is null or lead_id = p_lead_id);

  if not found then
    raise exception 'organic inbound claim could not bind lead';
  end if;
end;
$$;

-- Confirmation mutations and their idempotency marker commit together. A
-- retry after the database commit but before the webhook outcome was saved
-- returns "already" and can safely resume the one-time acknowledgment effect.
create or replace function confirm_inbound_appointment(
  p_message_sid text,
  p_lead_id uuid,
  p_expected_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_key text := 'sms:' || p_message_sid || ':appointment-confirmed';
  v_current leads%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_source_key, 0));
  if exists (select 1 from events where source_key = v_source_key) then
    select * into v_current from leads where id = p_lead_id;
    if found and v_current.status = 'confirmed' and v_current.appointment_at = p_expected_at then
      return 'already';
    end if;
    return 'stale';
  end if;

  update leads
  set status = 'confirmed',
      confirmed_at = now(),
      last_activity_at = now()
  where id = p_lead_id
    and status = 'appointment_set'
    and appointment_at = p_expected_at;
  if not found then return 'stale'; end if;

  update tasks
  set status = 'canceled'
  where lead_id = p_lead_id
    and kind = 'no_reply_escalation'
    and status = 'pending';

  insert into events (lead_id, kind, detail, source_key)
  values (p_lead_id, 'confirmed', 'Customer replied YES', v_source_key);
  return 'applied';
end;
$$;

create or replace function confirm_inbound_job(
  p_message_sid text,
  p_lead_id uuid,
  p_job_id uuid,
  p_expected_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_key text := 'sms:' || p_message_sid || ':job-confirmed:' || p_job_id::text;
  v_current jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_source_key, 0));
  if exists (select 1 from events where source_key = v_source_key) then
    select * into v_current from jobs where id = p_job_id and lead_id = p_lead_id;
    if found and v_current.status = 'confirmed' and v_current.scheduled_at = p_expected_at then
      return 'already';
    end if;
    return 'stale';
  end if;

  update jobs
  set status = 'confirmed',
      confirmed_at = now()
  where id = p_job_id
    and lead_id = p_lead_id
    and status = 'scheduled'
    and scheduled_at = p_expected_at;
  if not found then return 'stale'; end if;

  update leads set last_activity_at = now() where id = p_lead_id;
  insert into events (lead_id, kind, detail, source_key)
  values (p_lead_id, 'confirmed', 'Customer confirmed the scheduled job', v_source_key);
  return 'applied';
end;
$$;

-- External providers cannot participate in the database transaction. A
-- definitively failed call is reclaimable on the provider's ingress retry,
-- while a still-claimed call remains at-most-once because its outcome can be
-- ambiguous (for example, our connection timed out after the provider sent).
create or replace function claim_inbound_sms_effect(
  p_message_sid text,
  p_effect_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect_key text := left(coalesce(p_effect_key, ''), 160);
  v_inserted integer := 0;
  v_state text;
begin
  if v_effect_key = '' then
    raise exception 'invalid inbound sms effect key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('inbound-sms-effect:' || p_message_sid || ':' || v_effect_key, 0)
  );

  insert into inbound_sms_effects (message_sid, effect_key)
  values (p_message_sid, v_effect_key)
  on conflict (message_sid, effect_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return true; end if;

  select state into v_state
  from inbound_sms_effects
  where message_sid = p_message_sid
    and effect_key = v_effect_key
  for update;

  if v_state <> 'failed' then return false; end if;

  update inbound_sms_effects
  set state = 'claimed',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where message_sid = p_message_sid
    and effect_key = v_effect_key;
  return true;
end;
$$;

create or replace function finish_inbound_sms_effect(
  p_message_sid text,
  p_effect_key text,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update inbound_sms_effects
  set state = case when p_error is null then 'completed' else 'failed' end,
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      updated_at = now()
  where message_sid = p_message_sid
    and effect_key = left(p_effect_key, 160);
$$;

-- Voice webhooks have multiple phases for the same CallSid. Callers provide a
-- phase-qualified event_key (for example "<CallSid>:incoming" or
-- "<CallSid>:after-dial") and use the same acquired/in_progress/completed
-- contract as SMS. Effect claims protect missed-call texts and owner alerts.
create or replace function claim_inbound_call(
  p_event_key text,
  p_payload_hash text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row inbound_call_claims%rowtype;
  v_inserted integer := 0;
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
begin
  if p_event_key is null or length(p_event_key) < 8 or length(p_event_key) > 160 then
    raise exception 'invalid inbound call event key';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'invalid inbound call payload hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inbound-call:' || p_event_key, 0));
  insert into inbound_call_claims (event_key, payload_hash, lease_expires_at)
  values (p_event_key, p_payload_hash, now() + make_interval(secs => v_lease_seconds))
  on conflict (event_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_row
  from inbound_call_claims
  where event_key = p_event_key
  for update;

  if v_row.payload_hash <> p_payload_hash then
    return jsonb_build_object('state', 'conflict');
  end if;
  if v_row.state = 'completed' then
    return jsonb_build_object('state', 'completed', 'outcome', v_row.outcome);
  end if;
  if v_inserted = 0 and v_row.state = 'processing' and v_row.lease_expires_at > now() then
    return jsonb_build_object('state', 'in_progress');
  end if;

  update inbound_call_claims
  set state = 'processing',
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempts = case when v_inserted > 0 then attempts else attempts + 1 end,
      last_error = null,
      updated_at = now()
  where event_key = p_event_key;

  return jsonb_build_object('state', 'acquired');
end;
$$;

create or replace function finish_inbound_call(
  p_event_key text,
  p_payload_hash text,
  p_outcome jsonb,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update inbound_call_claims
  set state = case when p_error is null then 'completed' else 'failed' end,
      outcome = case when p_error is null then coalesce(p_outcome, '{}'::jsonb) else outcome end,
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      lease_expires_at = now(),
      updated_at = now()
  where event_key = p_event_key
    and payload_hash = p_payload_hash;
$$;

create or replace function claim_inbound_call_effect(
  p_event_key text,
  p_effect_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect_key text := left(coalesce(p_effect_key, ''), 160);
  v_inserted integer := 0;
  v_state text;
begin
  if v_effect_key = '' then
    raise exception 'invalid inbound call effect key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('inbound-call-effect:' || p_event_key || ':' || v_effect_key, 0)
  );

  insert into inbound_call_effects (event_key, effect_key)
  values (p_event_key, v_effect_key)
  on conflict (event_key, effect_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return true; end if;

  select state into v_state
  from inbound_call_effects
  where event_key = p_event_key
    and effect_key = v_effect_key
  for update;

  if v_state <> 'failed' then return false; end if;

  update inbound_call_effects
  set state = 'claimed',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where event_key = p_event_key
    and effect_key = v_effect_key;
  return true;
end;
$$;

create or replace function finish_inbound_call_effect(
  p_event_key text,
  p_effect_key text,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update inbound_call_effects
  set state = case when p_error is null then 'completed' else 'failed' end,
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      updated_at = now()
  where event_key = p_event_key
    and effect_key = left(p_effect_key, 160);
$$;

-- A submission claim and its IP rate-counter increment happen in one database
-- transaction. Existing claims are returned before counting, so legitimate
-- browser/edge retries never consume the rate limit or re-run side effects.
create or replace function claim_public_lead_submission(
  p_submission_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_max_requests integer default 8,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public_lead_submissions%rowtype;
  v_window_seconds integer := greatest(60, least(coalesce(p_window_seconds, 900), 86400));
  v_max_requests integer := greatest(1, least(coalesce(p_max_requests, 8), 100));
  v_window_start timestamptz;
  v_count integer;
begin
  if p_submission_key is null or length(p_submission_key) < 16 or length(p_submission_key) > 120 then
    raise exception 'invalid submission key';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'invalid submission payload hash';
  end if;
  if p_ip_hash is null or length(p_ip_hash) <> 64 then
    raise exception 'invalid submission ip hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public-lead:' || p_submission_key, 0));

  select * into v_existing
  from public_lead_submissions
  where submission_key = p_submission_key;

  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('state', 'conflict');
    end if;
    if v_existing.state = 'completed' then
      return jsonb_build_object(
        'state', 'completed',
        'lead_id', v_existing.lead_id,
        'created_lead', v_existing.created_lead,
        'response', v_existing.response
      );
    end if;
    if v_existing.state = 'processing' and v_existing.lease_expires_at > now() then
      return jsonb_build_object(
        'state', 'in_progress',
        'lead_id', v_existing.lead_id,
        'created_lead', v_existing.created_lead
      );
    end if;

    update public_lead_submissions
    set state = 'processing',
        lease_expires_at = now() + interval '10 minutes',
        attempts = attempts + 1,
        last_error = null,
        updated_at = now()
    where submission_key = p_submission_key
    returning * into v_existing;

    return jsonb_build_object(
      'state', 'acquired',
      'lead_id', v_existing.lead_id,
      'created_lead', v_existing.created_lead
    );
  end if;

  delete from public_lead_rate_limits
  where updated_at < now() - interval '2 days';

  perform pg_advisory_xact_lock(hashtextextended('public-lead-rate:' || p_ip_hash, 0));
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds
  );

  insert into public_lead_rate_limits (ip_hash, window_start, request_count)
  values (p_ip_hash, v_window_start, 1)
  on conflict (ip_hash, window_start) do update
  set request_count = public_lead_rate_limits.request_count + 1,
      updated_at = now()
  returning request_count into v_count;

  if v_count > v_max_requests then
    return jsonb_build_object(
      'state', 'rate_limited',
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - now())))::integer
      )
    );
  end if;

  insert into public_lead_submissions (
    submission_key,
    payload_hash,
    ip_hash,
    lease_expires_at
  ) values (
    p_submission_key,
    p_payload_hash,
    p_ip_hash,
    now() + interval '10 minutes'
  );

  return jsonb_build_object('state', 'acquired');
end;
$$;

create or replace function finish_public_lead_submission(
  p_submission_key text,
  p_payload_hash text,
  p_lead_id uuid,
  p_response jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public_lead_submissions
  set state = case when p_error is null then 'completed' else 'failed' end,
      lead_id = coalesce(p_lead_id, lead_id),
      response = coalesce(p_response, response),
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      lease_expires_at = now(),
      updated_at = now()
  where submission_key = p_submission_key
    and payload_hash = p_payload_hash;
end;
$$;

create or replace function bind_public_lead_submission(
  p_submission_key text,
  p_payload_hash text,
  p_lead_id uuid,
  p_created_lead boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public_lead_submissions
  set lead_id = p_lead_id,
      created_lead = coalesce(created_lead, p_created_lead),
      updated_at = now()
  where submission_key = p_submission_key
    and payload_hash = p_payload_hash
    and (lead_id is null or lead_id = p_lead_id)
    and (created_lead is null or created_lead = p_created_lead);

  if not found then
    raise exception 'public lead claim could not bind lead';
  end if;
end;
$$;

-- Append the website request note and timeline marker in one transaction.
-- The source_key check makes the only non-idempotent part (note append) safe
-- to retry after a transient function/HTTP failure.
create or replace function apply_public_lead_existing_update(
  p_submission_key text,
  p_lead_id uuid,
  p_name text,
  p_email text,
  p_address text,
  p_service text,
  p_note text,
  p_event_detail text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('public-lead-update:' || p_submission_key, 0));

  if exists (select 1 from events where source_key = p_submission_key || ':request') then
    return false;
  end if;

  update leads
  set last_activity_at = now(),
      name = coalesce(name, nullif(p_name, '')),
      email = coalesce(email, nullif(p_email, '')),
      address = coalesce(address, nullif(p_address, '')),
      service = coalesce(service, nullif(p_service, '')),
      notes = case
        when nullif(notes, '') is null then p_note
        else notes || E'\n\n' || p_note
      end
  where id = p_lead_id;

  if not found then
    raise exception 'website lead no longer exists';
  end if;

  insert into events (lead_id, kind, detail, source_key)
  values (p_lead_id, 'website_request', p_event_detail, p_submission_key || ':request');
  return true;
end;
$$;

create or replace function claim_public_lead_effect(
  p_submission_key text,
  p_effect_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect_key text := left(coalesce(p_effect_key, ''), 160);
  v_inserted integer := 0;
  v_state text;
begin
  if v_effect_key = '' then
    raise exception 'invalid public lead effect key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-lead-effect:' || p_submission_key || ':' || v_effect_key, 0)
  );

  insert into public_lead_effects (submission_key, effect_key)
  values (p_submission_key, v_effect_key)
  on conflict (submission_key, effect_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return true; end if;

  select state into v_state
  from public_lead_effects
  where submission_key = p_submission_key
    and effect_key = v_effect_key
  for update;

  if v_state <> 'failed' then return false; end if;

  update public_lead_effects
  set state = 'claimed',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where submission_key = p_submission_key
    and effect_key = v_effect_key;
  return true;
end;
$$;

create or replace function finish_public_lead_effect(
  p_submission_key text,
  p_effect_key text,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public_lead_effects
  set state = case when p_error is null then 'completed' else 'failed' end,
      last_error = case when p_error is null then null else left(p_error, 1000) end,
      updated_at = now()
  where submission_key = p_submission_key
    and effect_key = left(p_effect_key, 160);
$$;

revoke all on function claim_inbound_sms(text, text, integer) from public;
revoke all on function set_inbound_sms_route(text, text, text, uuid, jsonb) from public;
revoke all on function finish_inbound_sms(text, text, jsonb, text) from public;
revoke all on function bind_inbound_sms_lead(text, text, uuid) from public;
revoke all on function confirm_inbound_appointment(text, uuid, timestamptz) from public;
revoke all on function confirm_inbound_job(text, uuid, uuid, timestamptz) from public;
revoke all on function claim_inbound_sms_effect(text, text) from public;
revoke all on function finish_inbound_sms_effect(text, text, text) from public;
revoke all on function claim_inbound_call(text, text, integer) from public;
revoke all on function finish_inbound_call(text, text, jsonb, text) from public;
revoke all on function claim_inbound_call_effect(text, text) from public;
revoke all on function finish_inbound_call_effect(text, text, text) from public;
revoke all on function claim_public_lead_submission(text, text, text, integer, integer) from public;
revoke all on function finish_public_lead_submission(text, text, uuid, jsonb, text) from public;
revoke all on function bind_public_lead_submission(text, text, uuid, boolean) from public;
revoke all on function apply_public_lead_existing_update(text, uuid, text, text, text, text, text, text) from public;
revoke all on function claim_public_lead_effect(text, text) from public;
revoke all on function finish_public_lead_effect(text, text, text) from public;

grant execute on function claim_inbound_sms(text, text, integer) to service_role;
grant execute on function set_inbound_sms_route(text, text, text, uuid, jsonb) to service_role;
grant execute on function finish_inbound_sms(text, text, jsonb, text) to service_role;
grant execute on function bind_inbound_sms_lead(text, text, uuid) to service_role;
grant execute on function confirm_inbound_appointment(text, uuid, timestamptz) to service_role;
grant execute on function confirm_inbound_job(text, uuid, uuid, timestamptz) to service_role;
grant execute on function claim_inbound_sms_effect(text, text) to service_role;
grant execute on function finish_inbound_sms_effect(text, text, text) to service_role;
grant execute on function claim_inbound_call(text, text, integer) to service_role;
grant execute on function finish_inbound_call(text, text, jsonb, text) to service_role;
grant execute on function claim_inbound_call_effect(text, text) to service_role;
grant execute on function finish_inbound_call_effect(text, text, text) to service_role;
grant execute on function claim_public_lead_submission(text, text, text, integer, integer) to service_role;
grant execute on function finish_public_lead_submission(text, text, uuid, jsonb, text) to service_role;
grant execute on function bind_public_lead_submission(text, text, uuid, boolean) to service_role;
grant execute on function apply_public_lead_existing_update(text, uuid, text, text, text, text, text, text) to service_role;
grant execute on function claim_public_lead_effect(text, text) to service_role;
grant execute on function finish_public_lead_effect(text, text, text) to service_role;
