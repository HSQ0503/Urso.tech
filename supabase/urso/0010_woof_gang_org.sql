-- Urso Brain migration 0010 — the woof-gang organization.
-- Run after 0009_brain_learning_operations_privileges.sql in the dedicated
-- Urso HQ project. This is the CLIENT's own brain boundary: Woof Gang's
-- operational corpus lives under this org, fully separate from org 'urso' —
-- brain_can_read_doc scopes every read by organization_id, so nothing here is
-- reachable from an Urso-side session and vice versa.
--
-- Deliberately NO brain_projects rows: org-urso already has a 'woof-gang'
-- CONSULTING project (0001), and the client-facing corpus must not blur into
-- Urso's internal notes about the client. Woof Gang's own projects arrive when
-- Woof Gang has projects.
--
-- Learning policy + gardener: NOT seeded here on purpose. The after-insert
-- trigger brain_organizations_seed_learning_policy (0006, redefined 0007)
-- seeds a new org with mode 'off' and gardenerEnabled false — exactly the
-- posture a fresh client org should start in. If the org row already exists,
-- the trigger fired at its original insert; on conflict do nothing never
-- leaves an unseeded org.

insert into brain_organizations (id, name, slug)
values ('woof-gang', 'Woof Gang Bakery & Grooming', 'woof-gang')
on conflict (id) do nothing;

-- brain_departments PK is (organization_id, id) since 0002, so a bare 'ops'
-- slug cannot collide with org-urso's departments.
insert into brain_departments (organization_id, id, name, blurb, sort)
values (
  'woof-gang',
  'ops',
  'Operations',
  'Woof Gang store operations — the client-facing knowledge corpus.',
  0
)
on conflict (organization_id, id) do nothing;
