-- Capture two live agent_actions columns that were originally added by the
-- demo seed script instead of a migration. They are now required by the
-- dashboard action queue and must exist in every fresh Woof Gang project.

alter table agent_actions add column if not exists store_label text;
alter table agent_actions add column if not exists plan_key text;
