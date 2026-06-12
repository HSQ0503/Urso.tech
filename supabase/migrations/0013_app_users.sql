-- Migration 0013 — real auth membership. Maps Supabase Auth users to a tenant,
-- role and (for managers) a store. getSession() in lib/auth.ts reads this row;
-- no row = no dashboard access, even with a valid Supabase login. Provisioning
-- happens with the service key via scripts/provision-users.mjs — there is no
-- self-signup path.
--
-- Mirrors the vault data model ("Platform — Multi-Tenancy & Auth" §5), where
-- this table is called `users`; named app_users to avoid colliding with
-- auth.users in queries and policies.

create table if not exists app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  name       text not null,
  role       text not null check (role in ('urso_admin', 'owner', 'manager')),
  client_id  uuid references clients(id) on delete cascade,
  store_id   text references stores(id),
  created_at timestamptz not null default now(),
  -- Managers are pinned to exactly one store; everyone else has none.
  check ((role = 'manager') = (store_id is not null)),
  -- urso_admin spans all clients (client_id null); owners/managers need one.
  check ((role = 'urso_admin') = (client_id is null))
);

alter table app_users enable row level security;

-- A signed-in user can read exactly their own membership row. Writes only
-- happen through the service key (provisioning script), which bypasses RLS.
create policy "own membership read" on app_users
  for select using (user_id = (select auth.uid()));
