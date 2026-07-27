-- Urso Brain migration 0006 — M6 controlled learning foundation.
-- Run after 0005_brain_temporal_truth.sql in the dedicated Urso HQ project.
--
-- The learner is observation-only. It may persist evidence-backed candidates
-- and, after a steward review in review mode, create an existing governed
-- claim proposal. Document patches remain investigation-only in M6.1. No
-- function in this migration writes brain_claims or brain_docs.

begin;

create table if not exists brain_learning_policies (
  organization_id  text primary key references brain_organizations(id) on delete cascade,
  mode             text not null default 'off'
                   check (mode in ('off', 'shadow', 'review', 'auto_low_risk')),
  policy_version   text not null default 'm6.1',
  settings         jsonb not null default '{}'::jsonb,
  updated_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Existing organizations start in shadow mode: candidates are measurable but
-- cannot enter a governed proposal queue until a steward explicitly enables
-- review mode.
insert into brain_learning_policies (
  organization_id,
  mode,
  policy_version,
  updated_by
)
select id, 'shadow', 'm6.1', 'migration'
from brain_organizations
on conflict (organization_id) do nothing;

create or replace function brain_seed_learning_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into brain_learning_policies (
    organization_id,
    mode,
    policy_version,
    updated_by
  ) values (
    new.id,
    'off',
    'm6.1',
    'system'
  )
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists brain_organizations_seed_learning_policy on brain_organizations;
create trigger brain_organizations_seed_learning_policy
after insert on brain_organizations
for each row execute function brain_seed_learning_policy();

create table if not exists brain_learning_runs (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        text not null references brain_organizations(id) on delete cascade,
  source_type             text not null
                          check (source_type in ('context_run', 'approved_artifact', 'gardener')),
  source_context_run_id   uuid references brain_context_runs(id) on delete restrict,
  source_artifact_id      text,
  source_user_id          text not null,
  department_id           text,
  project_id              text,
  source_scope            jsonb not null,
  mode                    text not null
                          check (mode in ('shadow', 'review', 'auto_low_risk')),
  policy_version          text not null,
  prompt_version          text not null,
  provider                text,
  model                   text,
  idempotency_key         text not null check (length(btrim(idempotency_key)) > 0),
  request_hash            text not null,
  status                  text not null
                          check (status in ('running', 'complete', 'failed')),
  candidate_count         integer not null default 0 check (candidate_count >= 0),
  failure_code            text,
  failure_message         text,
  started_at              timestamptz not null,
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, department_id)
    references brain_departments(organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id),
  check (
    (source_type = 'context_run' and source_context_run_id is not null)
    or (source_type <> 'context_run' and source_context_run_id is null)
  ),
  check (
    (
      source_type = 'approved_artifact'
      and source_artifact_id is not null
      and length(btrim(source_artifact_id)) > 0
    )
    or source_type <> 'approved_artifact'
  ),
  check (
    (status = 'running' and completed_at is null)
    or (status in ('complete', 'failed') and completed_at is not null)
  ),
  check (
    (status = 'failed' and length(btrim(failure_code)) > 0)
    or (status <> 'failed' and failure_code is null and failure_message is null)
  )
);
create index if not exists brain_learning_runs_source_idx
  on brain_learning_runs (organization_id, source_context_run_id, created_at desc);
create index if not exists brain_learning_runs_status_idx
  on brain_learning_runs (organization_id, status, created_at desc);

create table if not exists brain_learning_candidates (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             text not null references brain_organizations(id) on delete cascade,
  first_detected_run_id        uuid not null,
  last_detected_run_id         uuid not null,
  candidate_type               text not null
                               check (candidate_type in (
                                 'new_claim',
                                 'update_claim',
                                 'retire_claim',
                                 'resolve_conflict',
                                 'stale_document',
                                 'missing_knowledge',
                                 'document_patch'
                               )),
  proposed_action              text not null
                               check (proposed_action in (
                                 'create',
                                 'update',
                                 'supersede',
                                 'retire',
                                 'investigate'
                               )),
  title                        text not null check (length(btrim(title)) > 0),
  summary                      text not null default '',
  department_id                text,
  project_id                   text,
  subject_entity_id            uuid,
  predicate_id                 text,
  target_claim_id              uuid,
  target_doc_id                uuid,
  target_conflict_id           uuid,
  proposed_change              jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(proposed_change) = 'object'),
  confidence                   real not null check (confidence >= 0 and confidence <= 1),
  risk                         text not null
                               check (risk in ('informational', 'low', 'material', 'critical')),
  dedupe_key                   text not null check (length(btrim(dedupe_key)) > 0),
  suggested_steward_user_id    text,
  status                       text not null default 'detected'
                               check (status in (
                                 'detected',
                                 'queued',
                                 'batched',
                                 'proposed',
                                 'dismissed',
                                 'applied',
                                 'expired'
                               )),
  occurrence_count             integer not null default 1 check (occurrence_count > 0),
  proposal_kind                text check (proposal_kind in ('claim', 'knowledge')),
  proposal_id                  uuid,
  reviewed_by                  text,
  review_note                  text not null default '',
  reviewed_at                  timestamptz,
  first_detected_at            timestamptz not null default now(),
  last_detected_at             timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, dedupe_key),
  foreign key (organization_id, first_detected_run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, last_detected_run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, department_id)
    references brain_departments(organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id),
  foreign key (organization_id, subject_entity_id)
    references brain_entities(organization_id, id),
  foreign key (organization_id, predicate_id)
    references brain_predicates(organization_id, id),
  foreign key (organization_id, target_claim_id)
    references brain_claims(organization_id, id) on delete restrict,
  foreign key (target_conflict_id)
    references brain_claim_conflicts(id) on delete restrict,
  foreign key (target_doc_id)
    references brain_docs(id) on delete restrict,
  foreign key (organization_id, suggested_steward_user_id)
    references brain_memberships(organization_id, user_id),
  check (
    (proposal_kind is null and proposal_id is null)
    or (proposal_kind is not null and proposal_id is not null)
  ),
  check (
    status not in ('proposed', 'applied')
    or (proposal_kind is not null and proposal_id is not null)
  )
);
create index if not exists brain_learning_candidates_queue_idx
  on brain_learning_candidates (organization_id, status, risk, last_detected_at desc);
create index if not exists brain_learning_candidates_scope_idx
  on brain_learning_candidates (organization_id, project_id, department_id, status);

-- A candidate has one stable dedupe identity, while this append-only join
-- records every independent observation that contributed to it.
create table if not exists brain_learning_candidate_observations (
  organization_id  text not null references brain_organizations(id) on delete cascade,
  run_id            uuid not null,
  candidate_id      uuid not null,
  client_id         text not null check (length(btrim(client_id)) > 0),
  observed_at       timestamptz not null default now(),
  primary key (organization_id, run_id, candidate_id),
  unique (organization_id, run_id, client_id),
  foreign key (organization_id, run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, candidate_id)
    references brain_learning_candidates(organization_id, id) on delete restrict
);
create index if not exists brain_learning_observations_candidate_idx
  on brain_learning_candidate_observations (
    organization_id,
    candidate_id,
    observed_at desc
  );

create table if not exists brain_learning_evidence (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        text not null references brain_organizations(id) on delete cascade,
  candidate_id           uuid not null,
  source_context_run_id  uuid not null references brain_context_runs(id) on delete restrict,
  context_evidence_id    text not null,
  doc_id                 uuid not null references brain_docs(id) on delete restrict,
  source_version         integer not null,
  claim_id               uuid references brain_claims(id) on delete restrict,
  evidence_role          text not null
                         check (evidence_role in ('supporting', 'contradicting', 'superseding')),
  authority              text not null check (authority in ('governing', 'reference')),
  excerpt                text not null check (length(btrim(excerpt)) > 0),
  created_at             timestamptz not null default now(),
  foreign key (organization_id, candidate_id)
    references brain_learning_candidates(organization_id, id) on delete restrict,
  foreign key (source_context_run_id, context_evidence_id)
    references brain_context_evidence(context_run_id, evidence_id) on delete restrict,
  foreign key (doc_id, source_version)
    references brain_doc_versions(doc_id, version) on delete restrict,
  unique (
    organization_id,
    candidate_id,
    source_context_run_id,
    context_evidence_id,
    evidence_role
  )
);
create index if not exists brain_learning_evidence_candidate_idx
  on brain_learning_evidence (organization_id, candidate_id, created_at);
create index if not exists brain_learning_evidence_source_idx
  on brain_learning_evidence (
    organization_id,
    source_context_run_id,
    context_evidence_id
  );

create table if not exists brain_learning_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  title            text not null check (length(btrim(title)) > 0),
  summary          text not null default '',
  department_id    text,
  project_id       text,
  risk             text not null
                   check (risk in ('informational', 'low', 'material', 'critical')),
  status           text not null default 'open'
                   check (status in ('open', 'in_review', 'proposed', 'dismissed', 'applied')),
  assigned_to      text,
  created_by       text not null,
  reviewed_by      text,
  review_note      text not null default '',
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, department_id)
    references brain_departments(organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id),
  foreign key (organization_id, assigned_to)
    references brain_memberships(organization_id, user_id)
);
create index if not exists brain_learning_batches_queue_idx
  on brain_learning_batches (organization_id, status, risk, created_at desc);

create table if not exists brain_learning_batch_candidates (
  organization_id  text not null references brain_organizations(id) on delete cascade,
  batch_id          uuid not null,
  candidate_id      uuid not null,
  added_by          text not null,
  added_at          timestamptz not null default now(),
  primary key (organization_id, batch_id, candidate_id),
  foreign key (organization_id, batch_id)
    references brain_learning_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, candidate_id)
    references brain_learning_candidates(organization_id, id) on delete restrict
);
create index if not exists brain_learning_batch_candidates_candidate_idx
  on brain_learning_batch_candidates (organization_id, candidate_id, added_at desc);

alter table brain_learning_policies               enable row level security;
alter table brain_learning_runs                   enable row level security;
alter table brain_learning_candidates             enable row level security;
alter table brain_learning_candidate_observations enable row level security;
alter table brain_learning_evidence               enable row level security;
alter table brain_learning_batches                enable row level security;
alter table brain_learning_batch_candidates       enable row level security;

create or replace function brain_persist_learning_run(
  p_run jsonb,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id text := coalesce(
    nullif(p_run->>'organizationId', ''),
    nullif(p_run->>'organization_id', '')
  );
  v_source_type text := coalesce(
    nullif(p_run->>'sourceType', ''),
    nullif(p_run->>'source_type', '')
  );
  v_source_context_run_id uuid := nullif(coalesce(
    p_run->>'sourceContextRunId',
    p_run->>'source_context_run_id'
  ), '')::uuid;
  v_source_artifact_id text := nullif(coalesce(
    p_run->>'sourceArtifactId',
    p_run->>'source_artifact_id'
  ), '');
  v_source_user_id text;
  v_source_department_id text;
  v_source_project_id text;
  v_source_scope jsonb;
  v_requested_mode text := nullif(p_run->>'mode', '');
  v_policy brain_learning_policies%rowtype;
  v_prompt_version text := coalesce(
    nullif(p_run->>'promptVersion', ''),
    nullif(p_run->>'prompt_version', '')
  );
  v_provider text := nullif(p_run->>'provider', '');
  v_model text := nullif(p_run->>'model', '');
  v_idempotency_key text := btrim(coalesce(
    nullif(p_run->>'idempotencyKey', ''),
    nullif(p_run->>'idempotency_key', '')
  ));
  -- The idempotency identity deliberately excludes timestamps and extracted
  -- candidates: retries of the same scan return its first atomic result even
  -- if model sampling or request timing differs.
  v_request_hash text := md5(concat_ws(
    '|',
    v_organization_id,
    v_source_type,
    coalesce(v_source_context_run_id::text, ''),
    coalesce(v_source_artifact_id, ''),
    coalesce(v_prompt_version, ''),
    coalesce(v_provider, ''),
    coalesce(v_model, '')
  ));
  v_status text := coalesce(nullif(p_run->>'status', ''), 'complete');
  v_started_at timestamptz := coalesce(
    nullif(coalesce(p_run->>'startedAt', p_run->>'started_at'), '')::timestamptz,
    now()
  );
  v_completed_at timestamptz := coalesce(
    nullif(coalesce(p_run->>'completedAt', p_run->>'completed_at'), '')::timestamptz,
    now()
  );
  v_failure_code text := nullif(coalesce(
    p_run->>'failureCode',
    p_run->>'failure_code'
  ), '');
  v_failure_message text := nullif(coalesce(
    p_run->>'failureMessage',
    p_run->>'failure_message'
  ), '');
  v_run_id uuid := coalesce(nullif(p_run->>'id', '')::uuid, gen_random_uuid());
  v_existing_run brain_learning_runs%rowtype;
  v_context brain_context_runs%rowtype;
  v_candidate jsonb;
  v_candidate_row brain_learning_candidates%rowtype;
  v_candidate_id uuid;
  v_candidate_ids jsonb := '[]'::jsonb;
  v_client_id text;
  v_candidate_type text;
  v_action text;
  v_title text;
  v_summary text;
  v_department_id text;
  v_project_id text;
  v_subject_entity_id uuid;
  v_predicate_id text;
  v_target_claim_id uuid;
  v_target_doc_id uuid;
  v_target_conflict_id uuid;
  v_proposed_change jsonb;
  v_confidence real;
  v_risk text;
  v_dedupe_key text;
  v_suggested_steward_user_id text;
  v_evidence jsonb;
  v_evidence_item jsonb;
  v_context_evidence brain_context_evidence%rowtype;
  v_receipt_evidence jsonb;
  v_evidence_id text;
  v_evidence_role text;
  v_authority text;
  v_excerpt text;
  v_requested_doc_id uuid;
  v_requested_version integer;
  v_requested_claim_id uuid;
  v_inserted_candidate boolean;
  v_candidate_count integer;
begin
  if v_organization_id is null then
    raise exception 'learning run organization is required';
  end if;
  if v_source_type not in ('context_run', 'approved_artifact', 'gardener') then
    raise exception 'invalid learning source type';
  end if;
  if v_prompt_version is null then
    raise exception 'learning prompt version is required';
  end if;
  if v_idempotency_key = '' then
    raise exception 'learning run idempotency key is required';
  end if;
  if v_status not in ('complete', 'failed') then
    raise exception 'persisted learning runs must be complete or failed';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'learning candidates must be an array';
  end if;
  if v_status = 'failed' and jsonb_array_length(coalesce(p_candidates, '[]'::jsonb)) > 0 then
    raise exception 'failed learning runs cannot persist candidates';
  end if;
  if v_status = 'failed' and v_failure_code is null then
    raise exception 'failed learning runs require a failure code';
  end if;

  -- Serialize identical logical scans before the select/insert idempotency
  -- sequence. Multiple tabs or workers must converge on one durable run.
  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id || ':learning-run:' || v_idempotency_key, 0)
  );

  -- Resolve idempotency before reading the current policy so a network retry
  -- remains safe even if a steward changed modes after the first commit.
  select *
  into v_existing_run
  from brain_learning_runs
  where organization_id = v_organization_id
    and idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_existing_run.request_hash <> v_request_hash then
      raise exception 'learning idempotency key was reused with a different payload';
    end if;
    select coalesce(jsonb_agg(candidate_id order by client_id), '[]'::jsonb)
    into v_candidate_ids
    from brain_learning_candidate_observations
    where organization_id = v_organization_id
      and run_id = v_existing_run.id;
    return jsonb_build_object(
      'runId', v_existing_run.id,
      'idempotent', true,
      'status', v_existing_run.status,
      'candidateIds', v_candidate_ids,
      'candidateCount', v_existing_run.candidate_count
    );
  end if;

  select *
  into v_policy
  from brain_learning_policies
  where organization_id = v_organization_id
  for share;
  if not found or v_policy.mode = 'off' then
    raise exception 'controlled learning is disabled';
  end if;
  if v_requested_mode is not null and v_requested_mode <> v_policy.mode then
    raise exception 'learning mode changed before the run was persisted';
  end if;

  if v_source_type = 'context_run' then
    if v_source_context_run_id is null then
      raise exception 'context learning requires a source Context Run';
    end if;
    select *
    into v_context
    from brain_context_runs
    where organization_id = v_organization_id
      and id = v_source_context_run_id;
    if not found then raise exception 'source Context Run not found'; end if;
    if v_context.status not in ('complete', 'partial') then
      raise exception 'only complete or partial Context Runs can be learned from';
    end if;

    v_source_user_id := v_context.user_id;
    v_source_project_id := v_context.project_id;
    v_source_scope := coalesce(v_context.receipt->'scope', '{}'::jsonb);

    if nullif(v_source_scope->'project'->>'id', '') is distinct from v_source_project_id then
      raise exception 'source Context Run project scope is inconsistent';
    end if;

    select id
    into v_source_department_id
    from brain_departments
    where organization_id = v_organization_id
      and name = v_source_scope->>'department'
    order by id
    limit 1;
    if not found then
      select department_id
      into v_source_department_id
      from brain_memberships
      where organization_id = v_organization_id
        and user_id = v_source_user_id
        and active;
    end if;
  else
    -- Approved-artifact and gardener scans are schema-ready, but M6.1 only
    -- permits them to record empty/failed run history. Their future scanners
    -- must add an equally strict source-evidence boundary before candidates.
    if jsonb_array_length(coalesce(p_candidates, '[]'::jsonb)) > 0 then
      raise exception 'M6.1 candidates require a source Context Run';
    end if;
    v_source_user_id := nullif(coalesce(
      p_run->>'sourceUserId',
      p_run->>'source_user_id'
    ), '');
    v_source_department_id := nullif(coalesce(
      p_run->>'departmentId',
      p_run->>'department_id'
    ), '');
    v_source_project_id := nullif(coalesce(
      p_run->>'projectId',
      p_run->>'project_id'
    ), '');
    v_source_scope := coalesce(
      p_run->'sourceScope',
      p_run->'source_scope',
      jsonb_build_object(
        'organization', v_organization_id,
        'departmentId', v_source_department_id,
        'projectId', v_source_project_id
      )
    );
  end if;

  if v_source_user_id is null or not exists (
    select 1
    from brain_memberships
    where organization_id = v_organization_id
      and user_id = v_source_user_id
      and active
  ) then
    raise exception 'active source-user membership required';
  end if;
  if v_source_department_id is null then
    raise exception 'learning source department scope is required';
  end if;
  if v_source_project_id is not null and not brain_user_can_access_project(
    v_organization_id,
    v_source_user_id,
    v_source_project_id
  ) then
    raise exception 'source user no longer has project access';
  end if;

  insert into brain_learning_runs (
    id,
    organization_id,
    source_type,
    source_context_run_id,
    source_artifact_id,
    source_user_id,
    department_id,
    project_id,
    source_scope,
    mode,
    policy_version,
    prompt_version,
    provider,
    model,
    idempotency_key,
    request_hash,
    status,
    candidate_count,
    failure_code,
    failure_message,
    started_at,
    completed_at
  ) values (
    v_run_id,
    v_organization_id,
    v_source_type,
    v_source_context_run_id,
    v_source_artifact_id,
    v_source_user_id,
    v_source_department_id,
    v_source_project_id,
    v_source_scope,
    v_policy.mode,
    v_policy.policy_version,
    v_prompt_version,
    v_provider,
    v_model,
    v_idempotency_key,
    v_request_hash,
    v_status,
    0,
    case when v_status = 'failed' then v_failure_code else null end,
    case when v_status = 'failed' then left(v_failure_message, 1000) else null end,
    v_started_at,
    v_completed_at
  );

  for v_candidate in
    select value
    from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
    order by coalesce(value->>'dedupeKey', value->>'dedupe_key', '')
  loop
    v_client_id := btrim(coalesce(
      nullif(v_candidate->>'clientId', ''),
      nullif(v_candidate->>'client_id', '')
    ));
    v_candidate_type := coalesce(
      nullif(v_candidate->>'type', ''),
      nullif(v_candidate->>'candidateType', ''),
      nullif(v_candidate->>'candidate_type', '')
    );
    v_action := coalesce(
      nullif(v_candidate->>'action', ''),
      nullif(v_candidate->>'proposedAction', ''),
      nullif(v_candidate->>'proposed_action', '')
    );
    v_title := left(btrim(coalesce(
      nullif(v_candidate->>'title', ''),
      initcap(replace(v_candidate_type, '_', ' '))
    )), 240);
    v_summary := left(btrim(coalesce(
      v_candidate->>'summary',
      v_candidate->>'rationale',
      ''
    )), 2000);
    v_department_id := coalesce(
      nullif(v_candidate->>'departmentId', ''),
      nullif(v_candidate->>'department_id', ''),
      v_source_department_id
    );
    v_project_id := coalesce(
      nullif(v_candidate->>'projectId', ''),
      nullif(v_candidate->>'project_id', ''),
      v_source_project_id
    );
    v_subject_entity_id := nullif(coalesce(
      v_candidate->>'subjectEntityId',
      v_candidate->>'subject_entity_id'
    ), '')::uuid;
    v_predicate_id := nullif(coalesce(
      v_candidate->>'predicateId',
      v_candidate->>'predicate_id'
    ), '');
    v_target_claim_id := nullif(coalesce(
      v_candidate->>'targetClaimId',
      v_candidate->>'target_claim_id'
    ), '')::uuid;
    v_target_doc_id := nullif(coalesce(
      v_candidate->>'targetDocId',
      v_candidate->>'target_doc_id'
    ), '')::uuid;
    v_target_conflict_id := nullif(coalesce(
      v_candidate->>'targetConflictId',
      v_candidate->>'target_conflict_id',
      v_candidate->>'conflictId',
      v_candidate->>'conflict_id'
    ), '')::uuid;
    v_proposed_change := coalesce(
      v_candidate->'proposedChange',
      v_candidate->'proposed_change',
      jsonb_strip_nulls(jsonb_build_object(
        'subject_entity_id', v_subject_entity_id,
        'predicate_id', v_predicate_id,
        'object_type', coalesce(
          v_candidate->>'objectType',
          v_candidate->>'object_type',
          v_candidate->'object'->>'type'
        ),
        'object_value', coalesce(
          v_candidate->'objectValue',
          v_candidate->'object_value',
          v_candidate->'object'->'value'
        ),
        'object_entity_id', coalesce(
          v_candidate->>'objectEntityId',
          v_candidate->>'object_entity_id',
          v_candidate->'object'->>'entityId',
          v_candidate->'object'->>'entity_id'
        ),
        'valid_from', coalesce(v_candidate->>'validFrom', v_candidate->>'valid_from'),
        'valid_until', coalesce(
          v_candidate->>'validUntil',
          v_candidate->>'valid_until',
          v_candidate->>'validTo',
          v_candidate->>'valid_to'
        ),
        'project_id', v_project_id
      ))
    );
    v_confidence := coalesce((v_candidate->>'confidence')::real, 0);
    v_risk := nullif(v_candidate->>'risk', '');
    v_dedupe_key := left(btrim(coalesce(
      nullif(v_candidate->>'dedupeKey', ''),
      nullif(v_candidate->>'dedupe_key', '')
    )), 500);
    v_suggested_steward_user_id := nullif(coalesce(
      v_candidate->>'suggestedStewardUserId',
      v_candidate->>'suggested_steward_user_id'
    ), '');
    v_evidence := coalesce(v_candidate->'evidence', '[]'::jsonb);

    if v_client_id = '' then raise exception 'learning candidate client ID is required'; end if;
    if v_candidate_type not in (
      'new_claim',
      'update_claim',
      'retire_claim',
      'resolve_conflict',
      'stale_document',
      'missing_knowledge',
      'document_patch'
    ) then
      raise exception 'invalid learning candidate type';
    end if;
    if v_action not in ('create', 'update', 'supersede', 'retire', 'investigate') then
      raise exception 'invalid learning candidate action';
    end if;
    if coalesce(nullif(v_candidate->>'status', ''), 'detected') <> 'detected' then
      raise exception 'the learner may only create detected candidates';
    end if;
    if v_title = '' then raise exception 'learning candidate title is required'; end if;
    if v_risk not in ('informational', 'low', 'material', 'critical') then
      raise exception 'invalid learning candidate risk';
    end if;
    if v_dedupe_key = '' then raise exception 'learning candidate dedupe key is required'; end if;
    -- Candidate keys are locked in sorted order above so different learning
    -- runs cannot race the dedupe select/insert or deadlock on overlapping sets.
    perform pg_advisory_xact_lock(
      hashtextextended(v_organization_id || ':learning-candidate:' || v_dedupe_key, 0)
    );
    if jsonb_typeof(v_proposed_change) <> 'object' then
      raise exception 'learning candidate proposed change must be an object';
    end if;
    if jsonb_typeof(v_evidence) <> 'array' then
      raise exception 'learning candidate evidence must be an array';
    end if;
    if v_candidate_type <> 'missing_knowledge' and jsonb_array_length(v_evidence) = 0 then
      raise exception 'learning candidates require Context Receipt evidence';
    end if;

    -- A learning candidate can never be broader than the conversation that
    -- produced it. M6.1 conservatively preserves both scopes exactly.
    if v_department_id is distinct from v_source_department_id
       or v_project_id is distinct from v_source_project_id then
      raise exception 'learning candidate scope differs from its source Context Run';
    end if;
    if v_suggested_steward_user_id is not null and not brain_is_truth_steward(
      v_organization_id,
      v_suggested_steward_user_id
    ) then
      raise exception 'suggested learning steward is not active';
    end if;
    if v_subject_entity_id is not null and not exists (
      select 1
      from brain_entities
      where organization_id = v_organization_id
        and id = v_subject_entity_id
        and project_id is not distinct from v_project_id
    ) then
      raise exception 'candidate subject is outside its organization/project scope';
    end if;
    if v_predicate_id is not null and not exists (
      select 1
      from brain_predicates
      where organization_id = v_organization_id
        and id = v_predicate_id
    ) then
      raise exception 'candidate predicate is outside its organization';
    end if;
    if v_target_claim_id is not null and (
      not brain_can_read_claim(
        v_organization_id,
        v_source_user_id,
        v_target_claim_id,
        v_project_id
      )
      or not exists (
        select 1
        from brain_claims
        where organization_id = v_organization_id
          and id = v_target_claim_id
          and project_id is not distinct from v_project_id
      )
    ) then
      raise exception 'candidate target claim is outside its authorized scope';
    end if;
    if v_target_doc_id is not null and not brain_can_read_doc(
      v_organization_id,
      v_source_user_id,
      v_target_doc_id,
      v_project_id
    ) then
      raise exception 'candidate target document is outside its authorized scope';
    end if;
    if v_target_conflict_id is not null and not exists (
      select 1
      from brain_claim_conflicts conflict
      join brain_claims left_claim
        on left_claim.organization_id = conflict.organization_id
       and left_claim.id = conflict.claim_a_id
      join brain_claims right_claim
        on right_claim.organization_id = conflict.organization_id
       and right_claim.id = conflict.claim_b_id
      where conflict.organization_id = v_organization_id
        and conflict.id = v_target_conflict_id
        and brain_can_read_claim(
          v_organization_id,
          v_source_user_id,
          left_claim.id,
          v_project_id
        )
        and brain_can_read_claim(
          v_organization_id,
          v_source_user_id,
          right_claim.id,
          v_project_id
        )
    ) then
      raise exception 'candidate target conflict is outside its authorized scope';
    end if;

    v_inserted_candidate := false;
    select *
    into v_candidate_row
    from brain_learning_candidates
    where organization_id = v_organization_id
      and dedupe_key = v_dedupe_key
    for update;

    if found then
      if v_candidate_row.candidate_type <> v_candidate_type
         or v_candidate_row.department_id is distinct from v_department_id
         or v_candidate_row.project_id is distinct from v_project_id then
        raise exception 'learning candidate dedupe key collides across type or scope';
      end if;
      v_candidate_id := v_candidate_row.id;
      update brain_learning_candidates
      set last_detected_run_id = v_run_id,
          last_detected_at = now(),
          occurrence_count = occurrence_count + 1,
          confidence = greatest(confidence, v_confidence),
          risk = case
            when v_risk = 'critical' then 'critical'
            when v_risk = 'material' and risk in ('informational', 'low') then 'material'
            when v_risk = 'low' and risk = 'informational' then 'low'
            else risk
          end,
          suggested_steward_user_id = coalesce(
            suggested_steward_user_id,
            v_suggested_steward_user_id
          ),
          updated_at = now()
      where organization_id = v_organization_id
        and id = v_candidate_id;
    else
      insert into brain_learning_candidates (
        organization_id,
        first_detected_run_id,
        last_detected_run_id,
        candidate_type,
        proposed_action,
        title,
        summary,
        department_id,
        project_id,
        subject_entity_id,
        predicate_id,
        target_claim_id,
        target_doc_id,
        target_conflict_id,
        proposed_change,
        confidence,
        risk,
        dedupe_key,
        suggested_steward_user_id,
        status
      ) values (
        v_organization_id,
        v_run_id,
        v_run_id,
        v_candidate_type,
        v_action,
        v_title,
        v_summary,
        v_department_id,
        v_project_id,
        v_subject_entity_id,
        v_predicate_id,
        v_target_claim_id,
        v_target_doc_id,
        v_target_conflict_id,
        v_proposed_change,
        v_confidence,
        v_risk,
        v_dedupe_key,
        v_suggested_steward_user_id,
        'detected'
      )
      returning id into v_candidate_id;
      v_inserted_candidate := true;
    end if;

    insert into brain_learning_candidate_observations (
      organization_id,
      run_id,
      candidate_id,
      client_id
    ) values (
      v_organization_id,
      v_run_id,
      v_candidate_id,
      v_client_id
    )
    on conflict (organization_id, run_id, candidate_id) do nothing;

    for v_evidence_item in
      select value from jsonb_array_elements(v_evidence)
    loop
      v_evidence_id := btrim(coalesce(
        nullif(v_evidence_item->>'contextEvidenceId', ''),
        nullif(v_evidence_item->>'context_evidence_id', '')
      ));
      v_evidence_role := coalesce(
        nullif(v_evidence_item->>'role', ''),
        nullif(v_evidence_item->>'evidenceRole', ''),
        nullif(v_evidence_item->>'evidence_role', '')
      );
      v_requested_doc_id := nullif(coalesce(
        v_evidence_item->>'documentId',
        v_evidence_item->>'docId',
        v_evidence_item->>'doc_id'
      ), '')::uuid;
      v_requested_version := nullif(coalesce(
        v_evidence_item->>'sourceVersion',
        v_evidence_item->>'source_version'
      ), '')::integer;
      v_requested_claim_id := nullif(coalesce(
        v_evidence_item->>'claimId',
        v_evidence_item->>'claim_id'
      ), '')::uuid;

      if v_evidence_id = '' then
        raise exception 'candidate evidence requires a Context Receipt evidence ID';
      end if;
      if v_evidence_role not in ('supporting', 'contradicting', 'superseding') then
        raise exception 'invalid learning evidence role';
      end if;

      select *
      into v_context_evidence
      from brain_context_evidence
      where context_run_id = v_source_context_run_id
        and evidence_id = v_evidence_id;
      if not found then
        raise exception 'candidate evidence is absent from its source Context Receipt';
      end if;
      if v_context_evidence.source_version is null then
        raise exception 'candidate evidence lacks an exact source version';
      end if;
      if v_requested_doc_id is not null
         and v_requested_doc_id <> v_context_evidence.doc_id then
        raise exception 'candidate evidence document does not match its Context Receipt';
      end if;
      if v_requested_version is not null
         and v_requested_version <> v_context_evidence.source_version then
        raise exception 'candidate evidence version does not match its Context Receipt';
      end if;
      if v_requested_claim_id is not null
         and v_requested_claim_id is distinct from v_context_evidence.claim_id then
        raise exception 'candidate evidence claim does not match its Context Receipt';
      end if;
      if not brain_can_read_doc(
        v_organization_id,
        v_source_user_id,
        v_context_evidence.doc_id,
        v_project_id
      ) then
        raise exception 'candidate evidence is no longer authorized';
      end if;

      select value
      into v_receipt_evidence
      from jsonb_array_elements(coalesce(v_context.receipt->'evidence', '[]'::jsonb))
      where value->>'id' = v_evidence_id
      limit 1;
      if not found then
        raise exception 'Context Receipt evidence detail is missing';
      end if;
      v_excerpt := btrim(coalesce(v_receipt_evidence->>'excerpt', ''));
      v_authority := coalesce(nullif(v_receipt_evidence->>'authority', ''), 'reference');
      if v_excerpt = '' then raise exception 'Context Receipt evidence excerpt is empty'; end if;
      if v_authority not in ('governing', 'reference') then
        raise exception 'Context Receipt evidence authority is invalid';
      end if;
      if not exists (
        select 1
        from brain_doc_versions
        where doc_id = v_context_evidence.doc_id
          and version = v_context_evidence.source_version
          and organization_id = v_organization_id
          and (
            position(v_excerpt in content) > 0
            or position(
              regexp_replace(v_excerpt, '\s+', ' ', 'g')
              in regexp_replace(content, '\s+', ' ', 'g')
            ) > 0
          )
      ) then
        raise exception 'candidate evidence is not exact source-version text';
      end if;

      insert into brain_learning_evidence (
        organization_id,
        candidate_id,
        source_context_run_id,
        context_evidence_id,
        doc_id,
        source_version,
        claim_id,
        evidence_role,
        authority,
        excerpt
      ) values (
        v_organization_id,
        v_candidate_id,
        v_source_context_run_id,
        v_evidence_id,
        v_context_evidence.doc_id,
        v_context_evidence.source_version,
        v_context_evidence.claim_id,
        v_evidence_role,
        v_authority,
        v_excerpt
      )
      on conflict (
        organization_id,
        candidate_id,
        source_context_run_id,
        context_evidence_id,
        evidence_role
      ) do nothing;
    end loop;

    if v_inserted_candidate then
      insert into brain_audit_events (
        organization_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        metadata
      ) values (
        v_organization_id,
        v_source_user_id,
        'learning.candidate.detected',
        'learning_candidate',
        v_candidate_id::text,
        jsonb_build_object(
          'runId', v_run_id,
          'candidateType', v_candidate_type,
          'risk', v_risk,
          'projectId', v_project_id,
          'mode', v_policy.mode
        )
      );
    end if;

    v_candidate_ids := v_candidate_ids || jsonb_build_array(v_candidate_id);
  end loop;

  select count(*)
  into v_candidate_count
  from brain_learning_candidate_observations
  where organization_id = v_organization_id
    and run_id = v_run_id;

  update brain_learning_runs
  set candidate_count = v_candidate_count
  where organization_id = v_organization_id
    and id = v_run_id;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_organization_id,
    v_source_user_id,
    case
      when v_status = 'failed' then 'learning.run.failed'
      else 'learning.run.completed'
    end,
    'learning_run',
    v_run_id::text,
    jsonb_build_object(
      'sourceType', v_source_type,
      'sourceContextRunId', v_source_context_run_id,
      'mode', v_policy.mode,
      'policyVersion', v_policy.policy_version,
      'promptVersion', v_prompt_version,
      'candidateCount', v_candidate_count,
      'failureCode', v_failure_code
    )
  );

  return jsonb_build_object(
    'runId', v_run_id,
    'idempotent', false,
    'status', v_status,
    'candidateIds', v_candidate_ids,
    'candidateCount', v_candidate_count
  );
end;
$$;

create or replace function brain_set_learning_policy(
  p_organization_id text,
  p_actor_user_id text,
  p_mode text,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy brain_learning_policies%rowtype;
begin
  if not brain_is_truth_steward(p_organization_id, p_actor_user_id) then
    raise exception 'knowledge steward access required';
  end if;
  if p_mode not in ('off', 'shadow', 'review', 'auto_low_risk') then
    raise exception 'invalid controlled-learning mode';
  end if;
  if p_mode = 'auto_low_risk' and not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and active
      and role = 'org_admin'
  ) then
    raise exception 'automatic learning mode requires an organization admin';
  end if;
  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'learning policy settings must be an object';
  end if;

  insert into brain_learning_policies (
    organization_id,
    mode,
    policy_version,
    settings,
    updated_by,
    updated_at
  ) values (
    p_organization_id,
    p_mode,
    'm6.1',
    coalesce(p_settings, '{}'::jsonb),
    p_actor_user_id,
    now()
  )
  on conflict (organization_id) do update
  set mode = excluded.mode,
      policy_version = excluded.policy_version,
      settings = excluded.settings,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into v_policy;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    'learning.policy.updated',
    'learning_policy',
    p_organization_id,
    jsonb_build_object(
      'mode', v_policy.mode,
      'policyVersion', v_policy.policy_version
    )
  );

  return jsonb_build_object(
    'organizationId', v_policy.organization_id,
    'mode', v_policy.mode,
    'policyVersion', v_policy.policy_version,
    'settings', v_policy.settings,
    'updatedAt', v_policy.updated_at
  );
end;
$$;

create or replace function brain_create_learning_batch(
  p_organization_id text,
  p_actor_user_id text,
  p_title text,
  p_summary text,
  p_candidate_ids uuid[],
  p_assigned_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first brain_learning_candidates%rowtype;
  v_batch_id uuid;
  v_candidate_id uuid;
  v_count integer := 0;
  v_risk text := 'informational';
  v_actor_role text;
  v_actor_department_id text;
  v_assignee_role text;
  v_assignee_department_id text;
begin
  select role, department_id
  into v_actor_role, v_actor_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and active
    and role in ('org_admin', 'knowledge_steward');
  if not found then
    raise exception 'knowledge steward access required';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'learning batch title is required';
  end if;
  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'learning batch requires candidates';
  end if;
  if (
    select count(*)
    from unnest(p_candidate_ids) candidate_id
  ) <> (
    select count(distinct candidate_id)
    from unnest(p_candidate_ids) candidate_id
  ) then
    raise exception 'learning batch candidate IDs must be unique';
  end if;
  if p_assigned_to is not null then
    select role, department_id
    into v_assignee_role, v_assignee_department_id
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_assigned_to
      and active
      and role in ('org_admin', 'knowledge_steward');
    if not found then
      raise exception 'batch assignee must be an active knowledge steward';
    end if;
  end if;

  foreach v_candidate_id in array p_candidate_ids
  loop
    if v_count = 0 then
      select *
      into v_first
      from brain_learning_candidates
      where organization_id = p_organization_id
        and id = v_candidate_id
        and status in ('detected', 'queued')
      for update;
      if not found then raise exception 'batch candidate is unavailable'; end if;
      if v_actor_role = 'knowledge_steward'
         and v_first.department_id is not null
         and v_first.department_id is distinct from v_actor_department_id then
        raise exception 'knowledge stewards may batch only their department candidates';
      end if;
      if p_assigned_to is not null
         and v_assignee_role = 'knowledge_steward'
         and v_first.department_id is not null
         and v_first.department_id is distinct from v_assignee_department_id then
        raise exception 'batch assignee is outside the candidate department';
      end if;
    else
      if not exists (
        select 1
        from brain_learning_candidates
        where organization_id = p_organization_id
          and id = v_candidate_id
          and status in ('detected', 'queued')
          and department_id is not distinct from v_first.department_id
          and project_id is not distinct from v_first.project_id
        for update
      ) then
        raise exception 'batch candidates must be available and share one scope';
      end if;
    end if;

    select case
      when risk = 'critical' then 'critical'
      when risk = 'material' and v_risk <> 'critical' then 'material'
      when risk = 'low' and v_risk = 'informational' then 'low'
      else v_risk
    end
    into v_risk
    from brain_learning_candidates
    where organization_id = p_organization_id
      and id = v_candidate_id;
    v_count := v_count + 1;
  end loop;

  insert into brain_learning_batches (
    organization_id,
    title,
    summary,
    department_id,
    project_id,
    risk,
    status,
    assigned_to,
    created_by
  ) values (
    p_organization_id,
    left(btrim(p_title), 240),
    left(btrim(coalesce(p_summary, '')), 2000),
    v_first.department_id,
    v_first.project_id,
    v_risk,
    'open',
    p_assigned_to,
    p_actor_user_id
  )
  returning id into v_batch_id;

  insert into brain_learning_batch_candidates (
    organization_id,
    batch_id,
    candidate_id,
    added_by
  )
  select
    p_organization_id,
    v_batch_id,
    candidate_id,
    p_actor_user_id
  from unnest(p_candidate_ids) candidate_id;

  update brain_learning_candidates
  set status = 'batched',
      updated_at = now()
  where organization_id = p_organization_id
    and id = any(p_candidate_ids);

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    'learning.batch.created',
    'learning_batch',
    v_batch_id::text,
    jsonb_build_object(
      'candidateIds', to_jsonb(p_candidate_ids),
      'risk', v_risk,
      'assignedTo', p_assigned_to
    )
  );

  return jsonb_build_object(
    'batchId', v_batch_id,
    'candidateIds', to_jsonb(p_candidate_ids),
    'candidateCount', v_count,
    'risk', v_risk,
    'status', 'open'
  );
end;
$$;

create or replace function brain_review_learning_candidate(
  p_organization_id text,
  p_candidate_id uuid,
  p_reviewer_user_id text,
  p_decision text,
  p_review_note text default '',
  p_edited_change jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate brain_learning_candidates%rowtype;
  v_policy brain_learning_policies%rowtype;
  v_change jsonb;
  v_proposal_id uuid;
  v_proposal_kind text;
  v_claim_operation text;
  v_evidence jsonb;
  v_authoritative_count integer;
  v_object_type text;
  v_object_entity_id uuid;
  v_valid_from date;
  v_reviewer_role text;
  v_reviewer_department_id text;
begin
  select role, department_id
  into v_reviewer_role, v_reviewer_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_reviewer_user_id
    and active
    and role in ('org_admin', 'knowledge_steward');
  if not found then
    raise exception 'knowledge steward access required';
  end if;
  if p_decision not in ('queue', 'dismiss', 'promote') then
    raise exception 'invalid learning review decision';
  end if;
  if p_edited_change is not null and jsonb_typeof(p_edited_change) <> 'object' then
    raise exception 'edited learning change must be an object';
  end if;

  select *
  into v_policy
  from brain_learning_policies
  where organization_id = p_organization_id
  for share;
  if not found or v_policy.mode = 'off' then
    raise exception 'controlled learning is disabled';
  end if;

  select *
  into v_candidate
  from brain_learning_candidates
  where organization_id = p_organization_id
    and id = p_candidate_id
  for update;
  if not found then raise exception 'learning candidate not found'; end if;

  if v_reviewer_role = 'knowledge_steward'
     and v_candidate.department_id is not null
     and v_candidate.department_id is distinct from v_reviewer_department_id then
    raise exception 'knowledge stewards may review only their department candidates';
  end if;
  if v_candidate.risk = 'critical' and v_reviewer_role <> 'org_admin' then
    raise exception 'critical learning candidates require an organization admin';
  end if;

  if p_decision = 'queue' then
    if v_candidate.status <> 'detected' then
      raise exception 'only detected candidates can be queued';
    end if;
    update brain_learning_candidates
    set status = 'queued',
        reviewed_by = p_reviewer_user_id,
        review_note = left(coalesce(p_review_note, ''), 1000),
        reviewed_at = now(),
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_candidate_id;
  elsif p_decision = 'dismiss' then
    if v_candidate.status not in ('detected', 'queued', 'batched') then
      raise exception 'learning candidate cannot be dismissed from its current status';
    end if;
    update brain_learning_candidates
    set status = 'dismissed',
        reviewed_by = p_reviewer_user_id,
        review_note = left(coalesce(p_review_note, ''), 1000),
        reviewed_at = now(),
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_candidate_id;
  else
    if v_policy.mode not in ('review', 'auto_low_risk') then
      raise exception 'shadow mode cannot create governed proposals';
    end if;
    if v_candidate.status not in ('detected', 'queued', 'batched') then
      raise exception 'learning candidate cannot be promoted from its current status';
    end if;
    if v_candidate.risk in ('material', 'critical')
       and btrim(coalesce(p_review_note, '')) = '' then
      raise exception 'material and critical promotions require a review note';
    end if;

    v_change := coalesce(p_edited_change, v_candidate.proposed_change);
    if v_candidate.candidate_type = 'new_claim' then
      raise exception 'new-claim candidates require entity and predicate investigation in M6.1';
    elsif v_candidate.candidate_type in ('update_claim', 'retire_claim') then
      if v_candidate.candidate_type = 'update_claim' then
        v_claim_operation := 'supersede';
      else
        v_claim_operation := 'retire';
      end if;
      if v_claim_operation in ('supersede', 'retire')
         and v_candidate.target_claim_id is null then
        raise exception 'claim update candidates require a target claim';
      end if;
      if v_claim_operation = 'assert'
         and (v_candidate.subject_entity_id is null or v_candidate.predicate_id is null) then
        raise exception 'new-claim promotion requires a subject and predicate';
      end if;
      if v_claim_operation in ('assert', 'supersede') then
        v_object_type := nullif(v_change->>'object_type', '');
        v_object_entity_id := nullif(v_change->>'object_entity_id', '')::uuid;
        if v_object_type not in ('text', 'number', 'boolean', 'date', 'entity') then
          raise exception 'claim promotion requires a valid object type';
        end if;
        if v_object_type = 'entity' and v_object_entity_id is null then
          raise exception 'entity-valued claim promotion requires an object entity';
        end if;
        if v_object_type <> 'entity' and (
          not (v_change ? 'object_value')
          or jsonb_typeof(v_change->'object_value') = 'null'
        ) then
          raise exception 'claim promotion requires an object value';
        end if;
        if v_claim_operation = 'assert' and not exists (
          select 1
          from brain_predicates
          where organization_id = p_organization_id
            and id = v_candidate.predicate_id
            and object_type = v_object_type
        ) then
          raise exception 'claim promotion object type does not match its predicate';
        end if;
        if v_claim_operation = 'supersede' and not exists (
          select 1
          from brain_claims target
          join brain_predicates predicate
            on predicate.organization_id = target.organization_id
           and predicate.id = target.predicate_id
          where target.organization_id = p_organization_id
            and target.id = v_candidate.target_claim_id
            and target.lifecycle = 'active'
            and predicate.object_type = v_object_type
        ) then
          raise exception 'claim update target is inactive or has a different object type';
        end if;
        if v_object_entity_id is not null and not exists (
          select 1
          from brain_entities
          where organization_id = p_organization_id
            and id = v_object_entity_id
            and project_id is not distinct from v_candidate.project_id
        ) then
          raise exception 'claim promotion object entity is outside its scope';
        end if;
      end if;
      if v_claim_operation = 'supersede' then
        v_valid_from := nullif(v_change->>'valid_from', '')::date;
        if v_valid_from is null then
          raise exception 'claim update promotion requires an effective date';
        end if;
        if exists (
          select 1
          from brain_claims
          where organization_id = p_organization_id
            and id = v_candidate.target_claim_id
            and valid_from is not null
            and v_valid_from < valid_from
        ) then
          raise exception 'claim update effective date predates its target';
        end if;
      end if;

      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'doc_id', doc_id,
              'doc_version', source_version,
              'evidence_role', case
                when authority = 'governing' then 'authoritative'
                else 'supporting'
              end,
              'excerpt', excerpt
            )
            order by created_at
          ),
          '[]'::jsonb
        ),
        count(*) filter (where authority = 'governing')
      into v_evidence, v_authoritative_count
      from brain_learning_evidence
      where organization_id = p_organization_id
        and candidate_id = p_candidate_id;

      if v_claim_operation in ('assert', 'supersede') and v_authoritative_count = 0 then
        raise exception 'formal claim proposals require governing evidence';
      end if;

      v_change := jsonb_strip_nulls(
        v_change ||
        jsonb_build_object(
          'subject_entity_id', v_candidate.subject_entity_id,
          'predicate_id', v_candidate.predicate_id,
          'project_id', v_candidate.project_id
        )
      );
      insert into brain_claim_proposals (
        organization_id,
        operation,
        target_claim_id,
        proposed_claim,
        evidence,
        rationale,
        status,
        proposed_by
      ) values (
        p_organization_id,
        v_claim_operation,
        v_candidate.target_claim_id,
        v_change,
        v_evidence,
        coalesce(nullif(v_candidate.summary, ''), v_candidate.title),
        'pending',
        p_reviewer_user_id
      )
      returning id into v_proposal_id;
      v_proposal_kind := 'claim';
    elsif v_candidate.candidate_type = 'document_patch' then
      raise exception 'document patch candidates are investigation-only in M6.1';
    else
      raise exception 'this candidate type must remain queued for investigation';
    end if;

    update brain_learning_candidates
    set status = 'proposed',
        proposed_change = v_change,
        proposal_kind = v_proposal_kind,
        proposal_id = v_proposal_id,
        reviewed_by = p_reviewer_user_id,
        review_note = left(coalesce(p_review_note, ''), 1000),
        reviewed_at = now(),
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_candidate_id;
  end if;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_reviewer_user_id,
    case p_decision
      when 'queue' then 'learning.candidate.queued'
      when 'dismiss' then 'learning.candidate.dismissed'
      else 'learning.candidate.promoted'
    end,
    'learning_candidate',
    p_candidate_id::text,
    jsonb_build_object(
      'decision', p_decision,
      'proposalKind', v_proposal_kind,
      'proposalId', v_proposal_id,
      'reviewNote', left(coalesce(p_review_note, ''), 1000)
    )
  );

  return jsonb_build_object(
    'candidateId', p_candidate_id,
    'decision', p_decision,
    'status', case p_decision
      when 'queue' then 'queued'
      when 'dismiss' then 'dismissed'
      else 'proposed'
    end,
    'proposalKind', v_proposal_kind,
    'proposalId', v_proposal_id
  );
end;
$$;

-- Close the learning lifecycle when the existing governed proposal workflow
-- reaches a terminal state. This trigger records only projection state; the
-- M4/M5 approval RPCs remain the sole writers of documents and claims.
create or replace function brain_sync_learning_candidate_proposal_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_id uuid;
  v_candidate_status text;
  v_proposal_kind text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'approved' then
    v_candidate_status := 'applied';
  elsif new.status in ('rejected', 'withdrawn') then
    v_candidate_status := 'expired';
  else
    return new;
  end if;

  v_proposal_kind := case
    when tg_table_name = 'brain_claim_proposals' then 'claim'
    else 'knowledge'
  end;

  for v_candidate_id in
    update brain_learning_candidates
    set status = v_candidate_status,
        updated_at = now()
    where organization_id = new.organization_id
      and proposal_kind = v_proposal_kind
      and proposal_id = new.id
      and status = 'proposed'
    returning id
  loop
    insert into brain_audit_events (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      new.organization_id,
      coalesce(new.reviewed_by, new.proposed_by),
      case
        when v_candidate_status = 'applied' then 'learning.candidate.applied'
        else 'learning.candidate.expired'
      end,
      'learning_candidate',
      v_candidate_id::text,
      jsonb_build_object(
        'proposalKind', v_proposal_kind,
        'proposalId', new.id,
        'proposalStatus', new.status
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists brain_claim_proposals_sync_learning_status
  on brain_claim_proposals;
create trigger brain_claim_proposals_sync_learning_status
after update of status on brain_claim_proposals
for each row execute function brain_sync_learning_candidate_proposal_status();

drop trigger if exists brain_knowledge_proposals_sync_learning_status
  on brain_knowledge_proposals;
create trigger brain_knowledge_proposals_sync_learning_status
after update of status on brain_knowledge_proposals
for each row execute function brain_sync_learning_candidate_proposal_status();

create or replace view brain_learning_metrics as
select
  organization_id,
  candidate_type,
  risk,
  status,
  count(*)::integer as candidate_count,
  sum(occurrence_count)::integer as observation_count,
  avg(confidence)::real as average_confidence,
  min(first_detected_at) as oldest_candidate_at,
  max(last_detected_at) as latest_observation_at
from brain_learning_candidates
group by organization_id, candidate_type, risk, status;

revoke all on table
  brain_learning_policies,
  brain_learning_runs,
  brain_learning_candidates,
  brain_learning_candidate_observations,
  brain_learning_evidence,
  brain_learning_batches,
  brain_learning_batch_candidates
from public, anon, authenticated, service_role;

grant select on table
  brain_learning_policies,
  brain_learning_runs,
  brain_learning_candidates,
  brain_learning_candidate_observations,
  brain_learning_evidence,
  brain_learning_batches,
  brain_learning_batch_candidates
to service_role;

revoke all on brain_learning_metrics from public, anon, authenticated, service_role;
grant select on brain_learning_metrics to service_role;

revoke all on function brain_persist_learning_run(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function brain_seed_learning_policy()
  from public, anon, authenticated;
revoke all on function brain_sync_learning_candidate_proposal_status()
  from public, anon, authenticated;
revoke all on function brain_set_learning_policy(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function brain_create_learning_batch(text, text, text, text, uuid[], text)
  from public, anon, authenticated;
revoke all on function brain_review_learning_candidate(text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function brain_persist_learning_run(jsonb, jsonb) to service_role;
grant execute on function brain_set_learning_policy(text, text, text, jsonb) to service_role;
grant execute on function brain_create_learning_batch(text, text, text, text, uuid[], text)
  to service_role;
grant execute on function brain_review_learning_candidate(text, uuid, text, text, text, jsonb)
  to service_role;

commit;
