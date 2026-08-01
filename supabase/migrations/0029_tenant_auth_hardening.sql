-- Migration 0029 — replace the Woof Gang pilot's public-read phase with
-- identity-derived tenant and store policies.
--
-- Every dashboard user has exactly one app_users membership. Owners may read
-- their client's rows; managers may read their store plus client-wide rows
-- intentionally represented by a null store_id. Urso platform admins span
-- clients, but mobile support mode remains read-only at the API boundary.

create or replace function current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from app_users where user_id = auth.uid() limit 1
$$;

create or replace function current_app_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from app_users where user_id = auth.uid() limit 1
$$;

create or replace function current_app_store_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select store_id from app_users where user_id = auth.uid() limit 1
$$;

create or replace function can_read_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    current_app_role() = 'urso_admin'
    or p_client_id = current_app_client_id(),
    false
  )
$$;

create or replace function can_read_client_store(p_client_id uuid, p_store_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    current_app_role() = 'urso_admin'
    or (
      p_client_id = current_app_client_id()
      and (
        current_app_role() <> 'manager'
        or p_store_id is null
        or p_store_id = current_app_store_id()
      )
    ),
    false
  )
$$;

revoke all on function current_app_role() from public, anon;
revoke all on function current_app_client_id() from public, anon;
revoke all on function current_app_store_id() from public, anon;
revoke all on function can_read_client(uuid) from public, anon;
revoke all on function can_read_client_store(uuid, text) from public, anon;
grant execute on function current_app_role() to authenticated;
grant execute on function current_app_client_id() to authenticated;
grant execute on function current_app_store_id() to authenticated;
grant execute on function can_read_client(uuid) to authenticated;
grant execute on function can_read_client_store(uuid, text) to authenticated;

-- Tenant directory.
drop policy if exists "temp public read — replace in auth phase" on clients;
drop policy if exists "authenticated client read" on clients;
create policy "authenticated client read" on clients
  for select to authenticated
  using (current_app_role() = 'urso_admin' or id = current_app_client_id());

drop policy if exists "temp public read — replace in auth phase" on stores;
drop policy if exists "authenticated store read" on stores;
create policy "authenticated store read" on stores
  for select to authenticated
  using (can_read_client_store(client_id, id));

-- Store-grained analytics and operational rows.
drop policy if exists "temp read — replace in auth phase" on metrics_daily;
drop policy if exists "authenticated scoped read" on metrics_daily;
create policy "authenticated scoped read" on metrics_daily
  -- Managers intentionally see same-client aggregate rankings and group
  -- averages on their home screen. This table contains daily metrics only, no
  -- customer/call/review identity; the PII-bearing tables below stay pinned to
  -- the manager's store.
  for select to authenticated using (can_read_client(client_id));

drop policy if exists "temp read — replace in auth phase" on groomers;
drop policy if exists "authenticated scoped read" on groomers;
create policy "authenticated scoped read" on groomers
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on customers;
drop policy if exists "authenticated scoped read" on customers;
create policy "authenticated scoped read" on customers
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on reviews;
drop policy if exists "authenticated scoped read" on reviews;
create policy "authenticated scoped read" on reviews
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on store_listings;
drop policy if exists "authenticated scoped read" on store_listings;
create policy "authenticated scoped read" on store_listings
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on calls;
drop policy if exists "authenticated scoped read" on calls;
create policy "authenticated scoped read" on calls
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on agent_actions;
drop policy if exists "authenticated scoped read" on agent_actions;
create policy "authenticated scoped read" on agent_actions
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on product_sales_daily;
drop policy if exists "authenticated scoped read" on product_sales_daily;
create policy "authenticated scoped read" on product_sales_daily
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on groomer_sales_daily;
drop policy if exists "authenticated scoped read" on groomer_sales_daily;
create policy "authenticated scoped read" on groomer_sales_daily
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on cohort_monthly;
drop policy if exists "authenticated scoped read" on cohort_monthly;
create policy "authenticated scoped read" on cohort_monthly
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on grooming_gap_buckets;
drop policy if exists "authenticated scoped read" on grooming_gap_buckets;
create policy "authenticated scoped read" on grooming_gap_buckets
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on action_events;
drop policy if exists "authenticated scoped read" on action_events;
create policy "authenticated scoped read" on action_events
  for select to authenticated using (can_read_client_store(client_id, store_id));

drop policy if exists "temp read — replace in auth phase" on business_events;
drop policy if exists "authenticated scoped read" on business_events;
create policy "authenticated scoped read" on business_events
  for select to authenticated using (can_read_client_store(client_id, store_id));

-- Client-wide rows.
drop policy if exists "temp read — replace in auth phase" on staff;
drop policy if exists "authenticated client read" on staff;
create policy "authenticated client read" on staff
  for select to authenticated using (can_read_client(client_id));

-- A manager must not see the all-store brief: unlike an event/action, it
-- contains aggregate performance for every location.
drop policy if exists "temp read — replace in auth phase" on ai_briefs;
drop policy if exists "authenticated brief read" on ai_briefs;
create policy "authenticated brief read" on ai_briefs
  for select to authenticated
  using (
    can_read_client(client_id)
    and (current_app_role() <> 'manager' or scope = current_app_store_id())
  );

-- Data RPCs run as the caller and therefore inherit the policies above. Remove
-- the pilot's anonymous entry points as a second boundary.
revoke execute on function metrics_by_store(date, date) from public, anon;
revoke execute on function metrics_series(text[], date, date, boolean) from public, anon;
revoke execute on function metrics_monthly(date, date) from public, anon;
revoke execute on function product_revenue_by_name(text[], date, date) from public, anon;
revoke execute on function product_catalog(text[], date, date, text, text, text, integer, integer) from public, anon;
revoke execute on function groomer_revenue(text[], date, date) from public, anon;
revoke execute on function customer_segment_counts(text[]) from public, anon;
revoke execute on function retention_summary(text[]) from public, anon;
revoke execute on function store_day_lineitems(text[], date, date, boolean) from public, anon, authenticated;

grant execute on function metrics_by_store(date, date) to authenticated, service_role;
grant execute on function metrics_series(text[], date, date, boolean) to authenticated, service_role;
grant execute on function metrics_monthly(date, date) to authenticated, service_role;
grant execute on function product_revenue_by_name(text[], date, date) to authenticated, service_role;
grant execute on function product_catalog(text[], date, date, text, text, text, integer, integer) to authenticated, service_role;
grant execute on function groomer_revenue(text[], date, date) to authenticated, service_role;
grant execute on function customer_segment_counts(text[]) to authenticated, service_role;
grant execute on function retention_summary(text[]) to authenticated, service_role;
grant execute on function store_day_lineitems(text[], date, date, boolean) to service_role;

-- The original action function trusted the server action to authorize first.
-- Enforce the same tenant/store rule inside the SECURITY DEFINER boundary so a
-- signed-in caller cannot invoke the RPC directly against another store.
create or replace function set_action_status(
  p_id uuid, p_status text, p_result text default null, p_actor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_client uuid;
  v_store text;
  v_member app_users%rowtype;
begin
  if p_status not in ('approved', 'running', 'completed', 'dismissed') then
    raise exception 'invalid action status';
  end if;

  select * into v_member from app_users where user_id = auth.uid();
  if not found or v_member.role = 'urso_admin' then
    raise exception 'action access denied';
  end if;

  select status, client_id, store_id into v_from, v_client, v_store
  from agent_actions where id = p_id;
  if not found
     or v_client <> v_member.client_id
     or (v_member.role = 'manager' and (v_store is null or v_store <> v_member.store_id)) then
    raise exception 'action access denied';
  end if;

  update agent_actions
     set status = p_status,
         result = coalesce(p_result, result),
         updated_at = now()
   where id = p_id;

  insert into action_events (
    action_id, client_id, store_id, from_status, to_status,
    result, actor, week_start
  )
  values (
    p_id, v_client, v_store, v_from, p_status, p_result, v_member.email,
    date_trunc('week', timezone('America/New_York', now()))::date
  );
end;
$$;

revoke all on function set_action_status(uuid, text, text, text) from public, anon;
grant execute on function set_action_status(uuid, text, text, text) to authenticated;

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
  v_member app_users%rowtype;
  v_id uuid;
begin
  select * into v_member from app_users where user_id = auth.uid();
  if not found or v_member.role = 'urso_admin' then
    raise exception 'event access denied';
  end if;
  if v_member.role = 'manager' and p_store is distinct from v_member.store_id then
    raise exception 'event access denied';
  end if;
  if p_store is not null and not exists (
    select 1 from stores where id = p_store and client_id = v_member.client_id
  ) then
    raise exception 'event access denied';
  end if;

  insert into business_events (
    client_id, store_id, type, title, detail, start_date, end_date, created_by
  )
  values (
    v_member.client_id, p_store, p_type, p_title, p_detail,
    p_start, p_end, v_member.email
  )
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
declare
  v_member app_users%rowtype;
  v_client uuid;
  v_store text;
begin
  select * into v_member from app_users where user_id = auth.uid();
  if not found or v_member.role = 'urso_admin' then
    raise exception 'event access denied';
  end if;

  select client_id, store_id into v_client, v_store
  from business_events where id = p_id;
  if not found
     or v_client <> v_member.client_id
     or (v_member.role = 'manager' and (v_store is null or v_store <> v_member.store_id)) then
    raise exception 'event access denied';
  end if;

  delete from business_events where id = p_id;
end;
$$;

revoke all on function create_business_event(text, text, text, text, date, date, text) from public, anon;
revoke all on function delete_business_event(uuid) from public, anon;
grant execute on function create_business_event(text, text, text, text, date, date, text) to authenticated;
grant execute on function delete_business_event(uuid) to authenticated;

insert into schema_migrations (filename, checksum, applied_by)
values ('0029_tenant_auth_hardening.sql', null, 'self')
on conflict (filename) do nothing;
