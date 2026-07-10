-- Canes Pressure Washing — 0007: ops feedback round (Sebastian, 2026-07). Run in
-- the CANES project (jeznnlveaymtrhisqckq). Three additive features:
--   (A) a final "confirm or we release your slot" customer text before an
--       unconfirmed appointment, with an opt-in auto-release;
--   (B) per-job expenses so the dashboard shows true profit per job and crew;
--   (C) inbound-call greeting + whisper settings (new-vs-existing announced to
--       the owner before the call bridges).
-- All additive; RLS deny-all like every prior migration. Money in integer cents.

-- ── (B) job_expenses: materials / gas / dump fee / subs logged against a job.
--    Crew is snapshotted so per-crew margin survives a later reassignment.
create table if not exists job_expenses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  job_id       uuid not null references jobs (id) on delete cascade,
  amount_cents int  not null check (amount_cents >= 0),
  category     text not null default 'Materials',
  note         text,
  crew_id      uuid references crews (id) on delete set null,  -- whose cost, snapshot
  created_by   text
);
create index if not exists job_expenses_job_idx  on job_expenses (job_id);
create index if not exists job_expenses_crew_idx on job_expenses (crew_id);
alter table job_expenses enable row level security;  -- deny-all; server key only

-- ── (A) add the final-confirmation task kind to the outbox. Full list restated
--    (0004 + 0005 kinds) so the constraint is self-contained.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder',
  'job_confirmation',
  'invoice_send', 'invoice_reminder',
  'confirmation_final'  -- NEW: last-chance customer text before an unconfirmed appt
));

-- ── (A + C) settings: final-confirmation copy/timing + call greeting/whisper.
--    on conflict do nothing keeps re-runs and existing edits safe.
insert into settings (key, value) values
  ('confirmation_final_offset_hours', '2'),
  ('confirmation_final_template', '"Hi{name}, we still need a YES to confirm your Canes Pressure Washing appointment {when} at {address}. If we do not hear back we will have to release the slot. Just reply with a day and time that works (tomorrow or the day after is perfect) and we will lock it in. Reply STOP to opt out."'),
  ('confirmation_auto_release', 'false'),
  ('call_greeting_enabled', 'true'),
  ('call_greeting_text', '"Thank you for calling Canes Pressure Washing. Please hold while we connect you."'),
  ('call_whisper_enabled', 'true'),
  ('call_ivr_enabled', 'false'),
  ('expense_categories', '["Materials", "Gas / travel", "Dump fee", "Subcontractor", "Equipment", "Other"]')
on conflict (key) do nothing;
