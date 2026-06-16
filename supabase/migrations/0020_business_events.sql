-- Migration 0020 — business events (the "why" layer).
--
-- Real-world context the AI cites to explain WHY a metric moved — staffing
-- changes, promos, price changes, closures, marketing, weather. Today the AI
-- nails WHERE a number moved (attribution) but can only label a cause a
-- "hypothesis", and metric-verified learning confirms a metric MOVED but not
-- that an action CAUSED it. Logged events let chat + the weekly brief explain
-- causes, and let the learning loop flag a confounded window (a move that
-- overlaps an unrelated event).
--
-- Read by: data.server.ts (chat events_in_range tool + the Events page) and
-- lib/ai/events.ts (weekly run + outcomes, via the admin client). Written
-- through SECURITY DEFINER RPCs gated by the server actions in
-- app/dashboard/events/actions.ts — same pattern as 0019's set_action_status:
-- the table needs no write RLS; the server action authorizes the caller's store
-- scope before the RPC writes.

create table if not exists business_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  store_id    text,                              -- null = all stores (same convention as agent_actions)
  type        text not null,
  title       text not null,
  detail      text,
  start_date  date not null,
  end_date    date,                              -- null = ongoing / point-in-time
  created_by  text,                              -- actor email
  created_at  timestamptz not null default now(),
  constraint business_events_type_check
    check (type in ('staffing', 'promo', 'price_change', 'closure', 'marketing', 'weather', 'other')),
  constraint business_events_dates_check
    check (end_date is null or end_date >= start_date)
);
create index if not exists business_events_scope_idx on business_events (client_id, store_id, start_date);
create index if not exists business_events_range_idx on business_events (client_id, start_date, end_date);

-- Temp read-only policy, matching the other tables (replace in the auth phase).
alter table business_events enable row level security;
drop policy if exists "temp read — replace in auth phase" on business_events;
create policy "temp read — replace in auth phase" on business_events for select using (true);

-- Create: derives the tenant from the caller's app_users membership (auth.uid());
-- the server action has already authorized the store scope. SECURITY DEFINER so
-- the authenticated role can write without business_events needing write RLS.
create or replace function create_business_event(
  p_store text, p_type text, p_title text, p_detail text default null,
  p_start date default current_date, p_end date default null, p_actor text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_id uuid;
begin
  select client_id into v_client from app_users where user_id = auth.uid();
  if v_client is null then
    raise exception 'no client membership for caller';
  end if;
  insert into business_events (client_id, store_id, type, title, detail, start_date, end_date, created_by)
  values (v_client, p_store, p_type, p_title, p_detail, p_start, p_end, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function delete_business_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from business_events where id = p_id;
end;
$$;

-- Granted to authenticated only (tighter than 0019's anon grant — events are
-- always written from a signed-in session via the server actions).
grant execute on function create_business_event(text, text, text, text, date, date, text) to authenticated;
grant execute on function delete_business_event(uuid) to authenticated;
