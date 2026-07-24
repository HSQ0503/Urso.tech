-- Canes Pressure Washing — 0015: ops-manager permissions, review attribution,
-- job recurrence. Run in the Canes Supabase project after 0014_estimate_expenses.sql.
--
-- RLS stays deny-all everywhere; the Next.js server enforces permissions after
-- verifying the session (owner admin or crew account), exactly like 0009.

-- ── A. Per-account role + permission flags ───────────────────────────────────
-- An account is either a technician (crew portal only) or an ops manager (DJ:
-- runs operations from the owner console, scoped by permission flags). The
-- permissions jsonb stores boolean overrides; unset keys fall back to the
-- role's defaults in code (technician: everything off; ops manager: on).
alter table crew_accounts drop constraint if exists crew_accounts_account_role_check;
alter table crew_accounts add constraint crew_accounts_account_role_check
  check (account_role in ('technician', 'ops_manager'));
alter table crew_accounts add column if not exists permissions jsonb not null default '{}'::jsonb;

-- ── B. Review-reward attribution (who earned the 5-star) ─────────────────────
-- Snapshot the team member credited with getting the customer to leave the
-- review. Set at approval time; survives roster edits via set null.
alter table invoice_rewards add column if not exists attributed_member_id
  uuid references team_members (id) on delete set null;
create index if not exists invoice_rewards_attributed_idx
  on invoice_rewards (attributed_member_id);

-- ── C. Job recurrence ────────────────────────────────────────────────────────
-- A job can repeat on a cadence (Markate-style maintenance plans). v1 derives
-- "next due" and recurring-revenue insights from this flag; it never
-- auto-creates jobs.
alter table jobs add column if not exists recurrence text not null default 'none';
alter table jobs drop constraint if exists jobs_recurrence_check;
alter table jobs add constraint jobs_recurrence_check
  check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly'));
create index if not exists jobs_recurrence_idx on jobs (recurrence) where recurrence <> 'none';
