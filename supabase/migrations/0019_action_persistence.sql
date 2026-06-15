-- Migration 0019 — action loop persistence (AI memory, phase 1).
--
-- The approve/dismiss/advance loop on the Actions page was client-only React
-- state, so every decision was lost on reload and the weekly AI run never saw
-- what the owner actually did. This makes the loop durable and records every
-- transition so the Monday run can learn from it (don't re-suggest approved
-- work, up-rank what completed well, respect what was dismissed).
--
-- Adds: a 'dismissed' terminal status, an action_events audit trail, and a
-- set_action_status() RPC that moves an action and logs the transition in one
-- transaction. The RPC is SECURITY DEFINER so the signed-in user (authenticated
-- role) can write through it without agent_actions needing write RLS policies —
-- the server action authorizes the caller before calling it.

-- 1. 'dismissed' becomes a real terminal status (was a client-side filter-out).
alter table agent_actions drop constraint if exists agent_actions_status_check;
alter table agent_actions add constraint agent_actions_status_check
  check (status in ('suggested', 'approved', 'running', 'completed', 'dismissed'));

-- 2. Audit trail — one row per status transition.
create table if not exists action_events (
  id          uuid primary key default gen_random_uuid(),
  action_id   uuid not null references agent_actions(id) on delete cascade,
  client_id   uuid,
  store_id    text,
  from_status text,
  to_status   text not null,
  result      text,
  actor       text,                          -- who made the change (email) or 'system'
  week_start  date,                          -- NY-week the change landed in, for the weekly join
  created_at  timestamptz not null default now()
);
create index if not exists action_events_action_idx on action_events (action_id, created_at);
create index if not exists action_events_week_idx   on action_events (client_id, week_start);

-- Temp read-only policy, matching the other tables (replaced in the auth phase).
alter table action_events enable row level security;
create policy "temp read — replace in auth phase" on action_events for select using (true);

-- 3. Atomic transition + audit log. SECURITY DEFINER so it can write past RLS;
--    the server action gates WHO may call it. set search_path pins the schema.
create or replace function set_action_status(
  p_id uuid, p_status text, p_result text default null, p_actor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from   text;
  v_client uuid;
  v_store  text;
begin
  select status, client_id, store_id into v_from, v_client, v_store
  from agent_actions where id = p_id;
  if not found then
    raise exception 'agent_action % not found', p_id;
  end if;

  update agent_actions
     set status     = p_status,
         result     = coalesce(p_result, result),
         updated_at = now()
   where id = p_id;

  insert into action_events (action_id, client_id, store_id, from_status, to_status, result, actor, week_start)
  values (p_id, v_client, v_store, v_from, p_status, p_result, p_actor,
          date_trunc('week', timezone('America/New_York', now()))::date);
end;
$$;

grant execute on function set_action_status(uuid, text, text, text) to anon, authenticated;
