-- Urso Brain migration 0012 — isolated Minerbo-Fuchs demonstration tenant.
--
-- The corpus and scenario are synthetic demonstration data. Keeping the demo
-- in its own organization prevents scenario resets, role switching, learning
-- candidates, and chat history from mixing with Urso's internal MF notes or a
-- future production Minerbo-Fuchs organization.

begin;

insert into brain_organizations (id, name, slug, settings)
values (
  'minerbo-fuchs-demo',
  'Minerbo-Fuchs Engenharia — Demonstration',
  'minerbo-fuchs-demo',
  '{"demo":true,"locale":"pt-BR","dataClassification":"synthetic"}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  settings = excluded.settings;

insert into brain_departments (organization_id, id, name, blurb, sort) values
  ('minerbo-fuchs-demo', 'viability',      'Viabilidade',                       'Project feasibility, capacity premises, and early delivery constraints.', 0),
  ('minerbo-fuchs-demo', 'bid',            'BID',                               'Commercial scope, bid assumptions, and contractual interfaces.', 1),
  ('minerbo-fuchs-demo', 'planning',       'Planejamento e Controle',           'Schedule, progress, dependencies, and milestone recovery.', 2),
  ('minerbo-fuchs-demo', 'quality',        'Qualidade',                         'Design-gate evidence, reviews, release criteria, and nonconformities.', 3),
  ('minerbo-fuchs-demo', 'bim',            'Metodologia BIM',                   'Federation, coordination, model standards, and information requirements.', 4),
  ('minerbo-fuchs-demo', 'architecture',   'Arquitetura',                       'Industrial architecture, circulation, access, and spatial coordination.', 5),
  ('minerbo-fuchs-demo', 'infrastructure', 'Infraestrutura',                    'Site utilities, external networks, grading, and project interfaces.', 6),
  ('minerbo-fuchs-demo', 'concrete',       'Estruturas de Concreto',            'Foundations, equipment bases, and concrete structural interfaces.', 7),
  ('minerbo-fuchs-demo', 'steel',          'Estruturas Metálicas',              'Steel framing, platforms, supports, and secondary structures.', 8),
  ('minerbo-fuchs-demo', 'hydraulics',     'Hidráulica',                        'Water, sanitary drainage, floor drainage, and hydraulic interfaces.', 9),
  ('minerbo-fuchs-demo', 'hvac',           'HVAC',                              'Thermal loads, chilled water, ventilation, and environmental systems.', 10),
  ('minerbo-fuchs-demo', 'electrical',     'Elétrica',                          'Loads, feeders, distribution, grounding, and electrical diagrams.', 11),
  ('minerbo-fuchs-demo', 'mechanical',     'Mecânica e Tubulação',              'Process utilities, piping, tie-ins, supports, and equipment connections.', 12),
  ('minerbo-fuchs-demo', 'automation',     'Sistemas Especiais e Automação',    'Controls, I/O, interlocks, networks, and cause-and-effect logic.', 13),
  ('minerbo-fuchs-demo', 'fire',           'Proteção Contra Incêndio',          'Fire coverage, access, classification, and life-safety interfaces.', 14)
on conflict (organization_id, id) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  sort = excluded.sort;

insert into brain_projects (organization_id, id, name, blurb, status, sort)
values (
  'minerbo-fuchs-demo',
  'uberlandia-refrescos-f3',
  'Uberlândia Refrescos — Phase 3',
  'Synthetic executive-design coordination scenario grounded in the public MF case study.',
  'active',
  0
)
on conflict (organization_id, id) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  status = excluded.status,
  sort = excluded.sort;

insert into brain_profiles (organization_id, user_id, name, department_id, title) values
  ('minerbo-fuchs-demo', 'mf-demo:project-manager', 'Marina Costa', 'planning', 'Gerente do Projeto'),
  ('minerbo-fuchs-demo', 'mf-demo:electrical',      'Rafael Almeida', 'electrical', 'Líder de Elétrica'),
  ('minerbo-fuchs-demo', 'mf-demo:bim',             'Camila Nunes', 'bim', 'Coordenadora BIM'),
  ('minerbo-fuchs-demo', 'mf-demo:planning',        'Lucas Ferreira', 'planning', 'Engenheiro de Planejamento'),
  ('minerbo-fuchs-demo', 'mf-demo:quality',         'Beatriz Souza', 'quality', 'Líder de Qualidade')
on conflict (organization_id, user_id) do update set
  name = excluded.name,
  department_id = excluded.department_id,
  title = excluded.title,
  updated_at = now();

insert into brain_memberships (organization_id, user_id, role, department_id, active) values
  ('minerbo-fuchs-demo', 'mf-demo:project-manager', 'knowledge_steward', 'planning', true),
  ('minerbo-fuchs-demo', 'mf-demo:electrical',      'member', 'electrical', true),
  ('minerbo-fuchs-demo', 'mf-demo:bim',             'member', 'bim', true),
  ('minerbo-fuchs-demo', 'mf-demo:planning',        'member', 'planning', true),
  ('minerbo-fuchs-demo', 'mf-demo:quality',         'member', 'quality', true)
on conflict (organization_id, user_id) do update set
  role = excluded.role,
  department_id = excluded.department_id,
  active = excluded.active,
  updated_at = now();

insert into brain_project_memberships (organization_id, project_id, user_id, active)
select
  'minerbo-fuchs-demo',
  'uberlandia-refrescos-f3',
  user_id,
  true
from brain_memberships
where organization_id = 'minerbo-fuchs-demo'
on conflict (organization_id, project_id, user_id) do update set
  active = true,
  updated_at = now();

insert into brain_learning_policies (
  organization_id,
  mode,
  policy_version,
  settings,
  updated_by
) values (
  'minerbo-fuchs-demo',
  'shadow',
  'm6.1',
  '{"demo": true, "gardenerEnabled": false}'::jsonb,
  'migration-0012'
)
on conflict (organization_id) do update set
  mode = excluded.mode,
  policy_version = excluded.policy_version,
  settings = excluded.settings,
  updated_by = excluded.updated_by,
  updated_at = now();

commit;
