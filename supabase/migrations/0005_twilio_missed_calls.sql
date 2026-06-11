-- Migration 0005 — Twilio missed-call text-back (the pilot's #1 leak).
--
-- 0002 already shaped the *destination* of this feed: the `calls` table (one row
-- per call, with texted_back / recovered_booking) and metrics_daily.calls_total /
-- calls_missed, which the Home, Performance, and Stores pages already render.
-- What was missing is the *source* config + the write path. This adds both:
--
--   1. twilio_numbers — per-store config the voice webhook reads: which backend
--      Twilio number maps to which store, the store line to bridge the call to,
--      the booking link + message to text back, and the local hours that mark a
--      call "after hours". Tokens-adjacent, so RLS is ON with NO policies — only
--      the service-role key (the webhook) reaches it; the dashboard never does.
--
--   2. record_call() — one atomic write per finished call: append the raw row to
--      `calls` AND bump metrics_daily.calls_total / calls_missed for that store
--      and day. The FranPOS sync writes *different* columns of the same daily
--      row, so this only ever touches the two call counters (never clobbers
--      revenue/bookings/etc.).

-- ── 1. Per-store webhook config ──────────────────────────────────────────────
create table if not exists twilio_numbers (
  store_id      text primary key references stores(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  twilio_number text not null unique,          -- E.164 backend number calls forward to
  forward_to    text not null,                 -- E.164 store line Twilio bridges to
  booking_url   text not null,                 -- link included in the text-back
  text_template text,                          -- null → built-in default; supports {store} {link}
  ring_timeout  integer not null default 20,   -- seconds to ring before a call counts as missed
  open_time     time,                          -- local open; null → treat all hours as open
  close_time    time,                          -- local close
  timezone      text not null default 'America/New_York',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table twilio_numbers enable row level security;
-- No policies on purpose: webhook-only, read with the service-role key.

-- ── 2. Atomic per-call write ─────────────────────────────────────────────────
-- security definer so it writes through RLS; the webhook calls it with the
-- service-role key (which already bypasses RLS), but definer keeps it correct if
-- that changes. client_id is resolved from the store, never trusted from input.
create or replace function record_call(
  p_store_id    text,
  p_occurred_at timestamptz,
  p_timezone    text,
  p_answered    boolean,
  p_after_hours boolean,
  p_duration_s  integer,
  p_texted_back boolean,
  p_recovered   boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_date      date;
begin
  select client_id into v_client_id from stores where id = p_store_id;
  if v_client_id is null then
    raise exception 'record_call: unknown store %', p_store_id;
  end if;

  v_date := (p_occurred_at at time zone p_timezone)::date;

  insert into calls (client_id, store_id, occurred_at, answered, after_hours, duration_s, texted_back, recovered_booking)
  values (v_client_id, p_store_id, p_occurred_at, p_answered, p_after_hours, p_duration_s, p_texted_back, p_recovered);

  insert into metrics_daily (client_id, store_id, date, calls_total, calls_missed)
  values (v_client_id, p_store_id, v_date, 1, case when p_answered then 0 else 1 end)
  on conflict (store_id, date) do update
    set calls_total  = metrics_daily.calls_total  + 1,
        calls_missed = metrics_daily.calls_missed + case when p_answered then 0 else 1 end,
        synced_at    = now();
end;
$$;

grant execute on function record_call(text, timestamptz, text, boolean, boolean, integer, boolean, boolean) to service_role;

-- ── Seeding (run once per store, after numbers are bought + forwarding is set) ─
-- Real numbers don't exist yet, so this is a commented template, not data:
--
-- insert into twilio_numbers (store_id, client_id, twilio_number, forward_to, booking_url, open_time, close_time, timezone)
-- select 'wm', c.id, '+1XXXXXXXXXX', '+1YYYYYYYYYY', 'https://woofgang.example/windermere/book', '09:00', '18:00', 'America/New_York'
-- from clients c where c.slug = 'woof-gang'
-- on conflict (store_id) do update set
--   twilio_number = excluded.twilio_number, forward_to = excluded.forward_to,
--   booking_url = excluded.booking_url, open_time = excluded.open_time,
--   close_time = excluded.close_time, timezone = excluded.timezone, active = true;
