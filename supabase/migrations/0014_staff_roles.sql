-- Migration 0014 — staff classification. FranPOS `SalesPerson` is free text
-- with no role attached, so groomer_sales_daily mixes real groomers with
-- front-desk staff ringing nail trims (~$10/appt), mobile vendors ("Smiling
-- Pet Stop"), and system accounts ("Dental Cleaner", "Wgb Support"). This
-- table is our own role layer; groomer_revenue() now filters to groomers.
--
-- Names unseen by this table default to 'groomer' (new hires appear without a
-- deploy); classification only ever demotes. Reclassify with a plain UPDATE.

-- Whitespace-collapsed lowercase key, so "Alyssa  Mcghee" and "Alyssa Mcghee"
-- are one person.
create or replace function staff_name_key(p_name text)
returns text language sql immutable as $$
  select lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')))
$$;

create table if not exists staff (
  client_id    uuid not null references clients(id) on delete cascade,
  name_key     text not null,
  display_name text not null,
  role         text not null check (role in ('groomer', 'front_desk', 'vendor', 'system')),
  classified_by text not null default 'heuristic' check (classified_by in ('heuristic', 'manual')),
  created_at   timestamptz not null default now(),
  primary key (client_id, name_key)
);

alter table staff enable row level security;
drop policy if exists "temp read — replace in auth phase" on staff;
create policy "temp read — replace in auth phase" on staff for select using (true);

-- Seed from observed history. Under $20/appt a name cannot be grooming
-- (a groom rings $60–90); those are front-desk add-on lines.
insert into staff (client_id, name_key, display_name, role)
select client_id,
       staff_name_key(name),
       regexp_replace(max(trim(name)), '\s+', ' ', 'g'),
       case
         -- "Smiling Pet Stop" / "Vivian Smiley Pet Stop" / "Vivanne Smiley
         -- Dental" — one mobile dental vendor under several spellings.
         when staff_name_key(name) ~ 'pet stop|smil(ey|ing)|dental' then 'vendor'
         when staff_name_key(name) ~ 'admin view|^wgb '             then 'system'
         when sum(revenue) / nullif(sum(appts), 0) < 20             then 'front_desk'
         else 'groomer'
       end
from groomer_sales_daily
group by client_id, staff_name_key(name)
on conflict (client_id, name_key) do nothing;

-- Known spelling variant: same person, two FranPOS entries.
update staff set display_name = 'Cristina Cortes', classified_by = 'manual'
where name_key = 'cristina cortez';

-- groomer_revenue v2: groomers only, display names unified via staff.
create or replace function groomer_revenue(
  p_store_ids text[], p_start date default null, p_end date default null
)
returns table (store_id text, name text, revenue numeric, appts bigint)
language sql stable security invoker set search_path = public as $$
  select g.store_id,
         coalesce(s.display_name, min(g.name)) as name,
         sum(g.revenue), sum(g.appts)
  from groomer_sales_daily g
  left join staff s on s.client_id = g.client_id
                   and s.name_key = staff_name_key(g.name)
  where g.store_id = any(p_store_ids)
    and (p_start is null or g.date >= p_start)
    and (p_end   is null or g.date <  p_end)
    and coalesce(s.role, 'groomer') = 'groomer'
  group by g.store_id, staff_name_key(g.name), s.display_name
$$;
grant execute on function groomer_revenue(text[], date, date) to anon, authenticated;
