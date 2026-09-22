begin;

-- Instant Form ingest: one CRM card per Meta leadgen id, fill-blanks on a
-- known phone, and a receipt so retries do not mint a second card or re-alert.

alter table leads add column if not exists meta_leadgen_id text;
create unique index if not exists leads_meta_leadgen_uidx
  on leads (meta_leadgen_id) where meta_leadgen_id is not null;

create table if not exists meta_leadgen_receipts (
  leadgen_id text primary key,
  state text not null default 'claimed' check (state in ('claimed', 'completed')),
  outcome text,
  lead_id uuid references leads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table meta_leadgen_receipts enable row level security;
revoke all on meta_leadgen_receipts from public, anon, authenticated;
grant all on meta_leadgen_receipts to service_role;

create table if not exists meta_leadgen_effects (
  leadgen_id text not null references meta_leadgen_receipts (leadgen_id) on delete cascade,
  effect_key text not null,
  state text not null default 'claimed' check (state in ('claimed', 'completed', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (leadgen_id, effect_key)
);
alter table meta_leadgen_effects enable row level security;
revoke all on meta_leadgen_effects from public, anon, authenticated;
grant all on meta_leadgen_effects to service_role;

create or replace function claim_meta_leadgen(p_leadgen_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_state text;
  v_updated timestamptz;
begin
  if coalesce(p_leadgen_id, '') = '' then
    raise exception 'meta leadgen id is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('meta-leadgen:' || p_leadgen_id, 0));
  insert into meta_leadgen_receipts (leadgen_id, state)
  values (p_leadgen_id, 'claimed')
  on conflict (leadgen_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return 'acquired'; end if;

  select state, updated_at into v_state, v_updated
  from meta_leadgen_receipts
  where leadgen_id = p_leadgen_id
  for update;

  if v_state = 'completed' then return 'completed'; end if;
  if v_state = 'claimed' and v_updated > now() - interval '2 minutes' then return 'busy'; end if;
  update meta_leadgen_receipts
    set state = 'claimed', updated_at = now()
    where leadgen_id = p_leadgen_id;
  return 'acquired';
end;
$$;
revoke all on function claim_meta_leadgen(text) from public, anon, authenticated;
grant execute on function claim_meta_leadgen(text) to service_role;

create or replace function finish_meta_leadgen(
  p_leadgen_id text,
  p_outcome text,
  p_lead_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_leadgen_receipts
    set state = 'completed',
        outcome = p_outcome,
        lead_id = p_lead_id,
        updated_at = now()
    where leadgen_id = p_leadgen_id;
end;
$$;
revoke all on function finish_meta_leadgen(text, text, uuid) from public, anon, authenticated;
grant execute on function finish_meta_leadgen(text, text, uuid) to service_role;

create or replace function claim_meta_leadgen_effect(p_leadgen_id text, p_effect_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := left(coalesce(p_effect_key, ''), 160);
  v_inserted integer := 0;
  v_state text;
begin
  if coalesce(p_leadgen_id, '') = '' or v_key = '' then
    raise exception 'meta leadgen effect key is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('meta-leadgen-effect:' || p_leadgen_id || ':' || v_key, 0));
  insert into meta_leadgen_effects (leadgen_id, effect_key)
  values (p_leadgen_id, v_key)
  on conflict (leadgen_id, effect_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return true; end if;

  select state into v_state
  from meta_leadgen_effects
  where leadgen_id = p_leadgen_id and effect_key = v_key
  for update;
  if v_state <> 'failed' then return false; end if;
  update meta_leadgen_effects
    set state = 'claimed', last_error = null, updated_at = now()
    where leadgen_id = p_leadgen_id and effect_key = v_key;
  return true;
end;
$$;
revoke all on function claim_meta_leadgen_effect(text, text) from public, anon, authenticated;
grant execute on function claim_meta_leadgen_effect(text, text) to service_role;

create or replace function finish_meta_leadgen_effect(
  p_leadgen_id text,
  p_effect_key text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_leadgen_effects
    set state = case when p_error is null then 'completed' else 'failed' end,
        last_error = p_error,
        updated_at = now()
    where leadgen_id = p_leadgen_id and effect_key = p_effect_key;
end;
$$;
revoke all on function finish_meta_leadgen_effect(text, text, text) from public, anon, authenticated;
grant execute on function finish_meta_leadgen_effect(text, text, text) to service_role;

-- Known phone: fill blanks only. Never overwrite website / lead_vendor /
-- referral. Set meta_ads only when the existing source is other.
create or replace function apply_meta_lead_existing_update(
  p_leadgen_id text,
  p_lead_id uuid,
  p_name text,
  p_email text,
  p_address text,
  p_service text,
  p_note text,
  p_set_source boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('meta-lead-update:' || p_leadgen_id, 0));
  if exists (select 1 from events where source_key = 'meta:' || p_leadgen_id || ':request') then
    return false;
  end if;
  update leads
    set last_activity_at = now(),
        name = coalesce(name, nullif(p_name, '')),
        email = coalesce(email, nullif(p_email, '')),
        address = coalesce(address, nullif(p_address, '')),
        service = coalesce(service, nullif(p_service, '')),
        source = case when p_set_source then 'meta_ads' else source end,
        meta_leadgen_id = coalesce(meta_leadgen_id, p_leadgen_id),
        notes = case
          when nullif(p_note, '') is null then notes
          when nullif(notes, '') is null then p_note
          else notes || E'\n\n' || p_note
        end
    where id = p_lead_id;
  if not found then raise exception 'meta lead no longer exists'; end if;
  insert into events (lead_id, kind, detail, source_key)
  values (
    p_lead_id,
    'meta_request',
    'New Meta Instant Form. Missing details filled in.',
    'meta:' || p_leadgen_id || ':request'
  );
  return true;
end;
$$;
revoke all on function apply_meta_lead_existing_update(text, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function apply_meta_lead_existing_update(text, uuid, text, text, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
commit;
