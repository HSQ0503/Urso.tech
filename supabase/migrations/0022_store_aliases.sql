-- Store aliases — alternate names the owner uses for a store.
--
-- The Windermere (wm) store is also called "Summerport" (after its location), so
-- a question about "Summerport" must resolve to the same store. The app reads
-- store names/labels from the `stores` constant in components/dashboard/data.ts
-- and the analyst prompts, so this column is the canonical DB record of the
-- aliases; keep it in sync with that constant.

alter table stores add column if not exists aliases text[] not null default '{}';

update stores set aliases = '{Summerport}' where id = 'wm';
