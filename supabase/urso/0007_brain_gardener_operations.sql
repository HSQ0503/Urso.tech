-- Urso Brain migration 0007 — M6.2 scheduled gardener operations.
-- Run after 0006_brain_controlled_learning.sql.
--
-- The gardener is a deterministic, shadow-only maintenance detector. It writes
-- run history, canonical findings, observations, and audits. It never writes
-- documents, claims, proposals, or learning candidates.

begin;

alter table brain_learning_runs
  alter column source_user_id drop not null,
  add column if not exists logical_run_key text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists result_hash text,
  add column if not exists stats jsonb not null default '{}'::jsonb;

update brain_learning_runs
set source_user_id = null
where source_type = 'gardener';

alter table brain_learning_runs
  drop constraint if exists brain_learning_runs_source_actor_check,
  add constraint brain_learning_runs_source_actor_check check (
    (source_type = 'gardener' and source_user_id is null)
    or (source_type <> 'gardener' and source_user_id is not null)
  ),
  drop constraint if exists brain_learning_runs_gardener_mode_check,
  add constraint brain_learning_runs_gardener_mode_check check (
    source_type <> 'gardener' or mode = 'shadow'
  ),
  drop constraint if exists brain_learning_runs_attempt_check,
  add constraint brain_learning_runs_attempt_check check (attempt_count > 0),
  drop constraint if exists brain_learning_runs_gardener_lease_check,
  add constraint brain_learning_runs_gardener_lease_check check (
    source_type <> 'gardener'
    or (
      logical_run_key is not null
      and length(btrim(logical_run_key)) > 0
      and (
        (
          status = 'running'
          and lease_token is not null
          and lease_expires_at is not null
          and heartbeat_at is not null
        )
        or (
          status in ('complete', 'failed')
          and lease_token is null
          and lease_expires_at is null
        )
      )
    )
  ),
  drop constraint if exists brain_learning_runs_stats_object_check,
  add constraint brain_learning_runs_stats_object_check check (
    jsonb_typeof(stats) = 'object'
  );

create unique index if not exists brain_learning_runs_gardener_logical_idx
  on brain_learning_runs (organization_id, logical_run_key)
  where source_type = 'gardener';

create table if not exists brain_gardener_findings (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        text not null references brain_organizations(id) on delete cascade,
  finding_type           text not null check (finding_type in (
                           'stale_document',
                           'superseded_reference',
                           'unresolved_conflict',
                           'weak_provenance',
                           'missing_knowledge'
                         )),
  risk                   text not null check (risk in (
                           'informational',
                           'low',
                           'material',
                           'critical'
                         )),
  department_id          text,
  project_id             text,
  subject_kind           text not null check (subject_kind in (
                           'document',
                           'claim',
                           'conflict',
                           'question'
                         )),
  subject_key            text not null check (
                           length(btrim(subject_key)) between 1 and 500
                         ),
  target_doc_id          uuid references brain_docs(id) on delete restrict,
  target_claim_id        uuid references brain_claims(id) on delete restrict,
  target_conflict_id     uuid references brain_claim_conflicts(id) on delete restrict,
  title                  text not null check (length(btrim(title)) between 1 and 240),
  message                text not null check (length(btrim(message)) between 1 and 2000),
  state                  text not null default 'open'
                         check (state in ('open', 'resolved')),
  dedupe_key             text not null check (length(btrim(dedupe_key)) > 0),
  first_detected_run_id  uuid not null,
  last_detected_run_id   uuid not null,
  occurrence_count       integer not null default 1 check (occurrence_count > 0),
  first_detected_at      timestamptz not null default now(),
  last_detected_at       timestamptz not null default now(),
  resolved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, dedupe_key),
  foreign key (organization_id, department_id)
    references brain_departments(organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id),
  foreign key (organization_id, first_detected_run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, last_detected_run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  check (
    (
      finding_type in ('stale_document', 'superseded_reference')
      and subject_kind = 'document'
      and target_doc_id is not null
      and target_claim_id is null
      and target_conflict_id is null
    )
    or (
      finding_type = 'weak_provenance'
      and subject_kind = 'claim'
      and target_doc_id is null
      and target_claim_id is not null
      and target_conflict_id is null
    )
    or (
      finding_type = 'unresolved_conflict'
      and subject_kind = 'conflict'
      and target_doc_id is null
      and target_claim_id is null
      and target_conflict_id is not null
    )
    or (
      finding_type = 'missing_knowledge'
      and subject_kind = 'question'
      and target_doc_id is null
      and target_claim_id is null
      and target_conflict_id is null
    )
  ),
  check (
    (state = 'open' and resolved_at is null)
    or (state = 'resolved' and resolved_at is not null)
  )
);

create index if not exists brain_gardener_findings_queue_idx
  on brain_gardener_findings (
    organization_id,
    state,
    risk,
    last_detected_at desc
  );
create index if not exists brain_gardener_findings_scope_idx
  on brain_gardener_findings (
    organization_id,
    project_id,
    department_id,
    state
  );

create table if not exists brain_gardener_observations (
  organization_id  text not null references brain_organizations(id) on delete cascade,
  run_id            uuid not null,
  finding_id        uuid not null,
  source_snapshot   jsonb not null check (
                      jsonb_typeof(source_snapshot) = 'object'
                      and octet_length(source_snapshot::text) <= 32768
                    ),
  observed_at       timestamptz not null default now(),
  primary key (organization_id, run_id, finding_id),
  foreign key (organization_id, run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, finding_id)
    references brain_gardener_findings(organization_id, id) on delete restrict
);

create index if not exists brain_gardener_observations_finding_idx
  on brain_gardener_observations (
    organization_id,
    finding_id,
    observed_at desc
  );

alter table brain_gardener_findings enable row level security;
alter table brain_gardener_observations enable row level security;

-- Existing shadow organizations explicitly opt into deterministic gardener
-- scans when this migration is applied. Other learning modes remain disabled.
update brain_learning_policies
set settings = settings || jsonb_build_object(
      'gardenerEnabled', true,
      'gardenerConflictAgeDays', coalesce(
        settings->'gardenerConflictAgeDays',
        '14'::jsonb
      ),
      'gardenerUnansweredThreshold', coalesce(
        settings->'gardenerUnansweredThreshold',
        '3'::jsonb
      ),
      'gardenerContextLookbackDays', coalesce(
        settings->'gardenerContextLookbackDays',
        '90'::jsonb
      )
    ),
    policy_version = 'm6.2',
    updated_at = now()
where mode = 'shadow'
  and not (settings ? 'gardenerEnabled');

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
    settings,
    updated_by
  ) values (
    new.id,
    'off',
    'm6.2',
    jsonb_build_object(
      'gardenerEnabled', false,
      'gardenerConflictAgeDays', 14,
      'gardenerUnansweredThreshold', 3,
      'gardenerContextLookbackDays', 90
    ),
    'system'
  )
  on conflict (organization_id) do nothing;
  return new;
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
  v_existing_settings jsonb := '{}'::jsonb;
  v_settings jsonb;
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
  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_settings, '{}'::jsonb)::text) > 16384 then
    raise exception 'learning policy settings must be a bounded object';
  end if;

  select settings
  into v_existing_settings
  from brain_learning_policies
  where organization_id = p_organization_id
  for update;
  v_settings := jsonb_build_object(
    'gardenerEnabled', false,
    'gardenerConflictAgeDays', 14,
    'gardenerUnansweredThreshold', 3,
    'gardenerContextLookbackDays', 90
  ) || coalesce(v_existing_settings, '{}'::jsonb)
    || coalesce(p_settings, '{}'::jsonb);

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
    'm6.2',
    v_settings,
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
      'policyVersion', v_policy.policy_version,
      'gardenerEnabled', v_policy.settings->'gardenerEnabled'
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

create or replace function brain_gardener_context_window(
  p_organization_id text,
  p_scan_date date,
  p_lookback_days integer
)
returns table (
  id uuid,
  project_id text,
  normalized_question text,
  department_name text,
  has_gap boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    context_run.id,
    context_run.project_id,
    left(
      btrim(regexp_replace(
        lower(context_run.query),
        '[^a-z0-9]+',
        ' ',
        'g'
      )),
      500
    ) as normalized_question,
    left(
      nullif(context_run.receipt->'scope'->>'department', ''),
      240
    ) as department_name,
    jsonb_array_length(context_run.receipt->'missing') > 0 as has_gap,
    context_run.created_at
  from brain_context_runs context_run
  where context_run.organization_id = p_organization_id
    and context_run.status in ('complete', 'partial')
    and context_run.created_at >=
      p_scan_date::timestamp - make_interval(
        days => greatest(7, least(coalesce(p_lookback_days, 90), 365))
      )
    and jsonb_typeof(context_run.receipt->'missing') = 'array'
    and length(btrim(regexp_replace(
      lower(context_run.query),
      '[^a-z0-9]+',
      ' ',
      'g'
    ))) > 0
  order by context_run.id
  limit 10001;
$$;

create or replace function brain_start_gardener_run(
  p_organization_id text,
  p_logical_run_key text,
  p_schedule_date date,
  p_scan_version text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy brain_learning_policies%rowtype;
  v_run brain_learning_runs%rowtype;
  v_run_id uuid;
  v_lease_token uuid := gen_random_uuid();
  v_attempt integer := 1;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 900));
  v_request_hash text;
begin
  if p_organization_id is null or length(btrim(p_organization_id)) = 0 then
    raise exception 'gardener organization is required';
  end if;
  if p_logical_run_key is null
     or length(btrim(p_logical_run_key)) not between 8 and 500 then
    raise exception 'invalid gardener logical run key';
  end if;
  if p_scan_version is null
     or length(btrim(p_scan_version)) not between 3 and 100 then
    raise exception 'invalid gardener scan version';
  end if;
  v_request_hash := md5(concat_ws(
    '|',
    p_organization_id,
    btrim(p_logical_run_key),
    p_schedule_date::text,
    btrim(p_scan_version)
  ));

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id || ':gardener-run:' || btrim(p_logical_run_key),
      0
    )
  );

  select *
  into v_policy
  from brain_learning_policies
  where organization_id = p_organization_id
  for update;
  if not found
     or v_policy.mode <> 'shadow'
     or v_policy.settings->'gardenerEnabled' is distinct from 'true'::jsonb then
    raise exception 'shadow gardener is not enabled';
  end if;

  select *
  into v_run
  from brain_learning_runs
  where organization_id = p_organization_id
    and source_type = 'gardener'
    and logical_run_key = btrim(p_logical_run_key)
  for update;

  if found and (
    v_run.source_artifact_id is distinct from p_schedule_date::text
    or v_run.prompt_version is distinct from btrim(p_scan_version)
    or v_run.request_hash is distinct from v_request_hash
  ) then
    raise exception 'gardener logical run key was reused with different inputs';
  end if;

  if found and v_run.status = 'complete' then
    return jsonb_build_object(
      'state', 'complete',
      'runId', v_run.id,
      'attempt', v_run.attempt_count
    );
  end if;

  if found
     and v_run.status = 'running'
     and v_run.lease_expires_at > v_now then
    return jsonb_build_object(
      'state', 'running',
      'runId', v_run.id,
      'attempt', v_run.attempt_count,
      'leaseExpiresAt', v_run.lease_expires_at
    );
  end if;

  if found and v_run.status = 'running' then
    update brain_learning_runs
    set status = 'failed',
        failure_code = 'lease_expired',
        failure_message = 'The prior gardener worker did not finish before its lease expired.',
        completed_at = v_now,
        lease_token = null,
        lease_expires_at = null,
        heartbeat_at = v_now,
        stats = stats || jsonb_build_object('leaseExpiredAt', v_now)
    where id = v_run.id;

    insert into brain_audit_events (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      p_organization_id,
      'system:brain-gardener',
      'learning.gardener.failed',
      'learning_run',
      v_run.id::text,
      jsonb_build_object(
        'failureCode', 'lease_expired',
        'logicalRunKey', p_logical_run_key,
        'attempt', v_run.attempt_count
      )
    );
  end if;

  if found then
    v_attempt := v_run.attempt_count + 1;
    update brain_learning_runs
    set status = 'running',
        source_artifact_id = p_schedule_date::text,
        source_scope = jsonb_build_object(
          'organization', p_organization_id,
          'scheduleDate', p_schedule_date,
          'logicalRunKey', btrim(p_logical_run_key)
        ),
        mode = 'shadow',
        policy_version = v_policy.policy_version,
        prompt_version = btrim(p_scan_version),
        attempt_count = v_attempt,
        lease_token = v_lease_token,
        lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
        heartbeat_at = v_now,
        result_hash = null,
        stats = '{}'::jsonb,
        failure_code = null,
        failure_message = null,
        started_at = v_now,
        completed_at = null
    where id = v_run.id
    returning id into v_run_id;
  else
    v_run_id := gen_random_uuid();
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
      started_at,
      completed_at,
      logical_run_key,
      attempt_count,
      lease_token,
      lease_expires_at,
      heartbeat_at,
      stats
    ) values (
      v_run_id,
      p_organization_id,
      'gardener',
      null,
      p_schedule_date::text,
      null,
      null,
      null,
      jsonb_build_object(
        'organization', p_organization_id,
        'scheduleDate', p_schedule_date,
        'logicalRunKey', btrim(p_logical_run_key)
      ),
      'shadow',
      v_policy.policy_version,
      btrim(p_scan_version),
      null,
      null,
      btrim(p_logical_run_key),
      v_request_hash,
      'running',
      0,
      v_now,
      null,
      btrim(p_logical_run_key),
      1,
      v_lease_token,
      v_now + make_interval(secs => v_lease_seconds),
      v_now,
      '{}'::jsonb
    );
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
    'system:brain-gardener',
    'learning.gardener.started',
    'learning_run',
    v_run_id::text,
    jsonb_build_object(
      'logicalRunKey', btrim(p_logical_run_key),
      'attempt', v_attempt,
      'scheduleDate', p_schedule_date,
      'scanVersion', btrim(p_scan_version)
    )
  );

  return jsonb_build_object(
    'state', 'started',
    'runId', v_run_id,
    'attempt', v_attempt,
    'leaseToken', v_lease_token,
    'leaseExpiresAt', v_now + make_interval(secs => v_lease_seconds)
  );
end;
$$;

create or replace function brain_complete_gardener_run(
  p_organization_id text,
  p_run_id uuid,
  p_lease_token uuid,
  p_findings jsonb,
  p_stats jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run brain_learning_runs%rowtype;
  v_policy brain_learning_policies%rowtype;
  v_now timestamptz := now();
  v_scan_date date;
  v_result_hash text;
  v_finding jsonb;
  v_type text;
  v_subject_kind text;
  v_subject_key text;
  v_department_id text;
  v_project_id text;
  v_target_doc_id uuid;
  v_target_claim_id uuid;
  v_target_conflict_id uuid;
  v_title text;
  v_message text;
  v_risk text;
  v_dedupe_key text;
  v_snapshot jsonb;
  v_existing brain_gardener_findings%rowtype;
  v_finding_id uuid;
  v_count integer := 0;
  v_new_count integer := 0;
  v_repeat_count integer := 0;
  v_resolved_count integer := 0;
  v_doc brain_docs%rowtype;
  v_claim brain_claims%rowtype;
  v_conflict brain_claim_conflicts%rowtype;
  v_source jsonb;
  v_context_id_text text;
  v_context_ids text[];
  v_context_ids_json jsonb;
  v_context brain_context_runs%rowtype;
  v_normalized_question text;
  v_current_normalized_question text;
  v_receipt_department text;
  v_gap_count integer;
  v_conflict_age_days integer;
  v_unanswered_threshold integer;
  v_context_lookback_days integer;
begin
  if jsonb_typeof(coalesce(p_findings, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_findings, '[]'::jsonb)) > 500 then
    raise exception 'gardener findings must be a bounded array';
  end if;
  if jsonb_typeof(coalesce(p_stats, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_stats, '{}'::jsonb)::text) > 16384 then
    raise exception 'gardener stats must be a bounded object';
  end if;

  select *
  into v_run
  from brain_learning_runs
  where organization_id = p_organization_id
    and id = p_run_id
    and source_type = 'gardener'
  for update;
  if not found then raise exception 'gardener run not found'; end if;
  v_scan_date := nullif(v_run.source_artifact_id, '')::date;
  if v_scan_date is null then raise exception 'gardener run lacks its UTC scan date'; end if;

  v_result_hash := md5(
    coalesce(p_findings, '[]'::jsonb)::text
    || '|'
    || coalesce(p_stats, '{}'::jsonb)::text
  );
  if v_run.status = 'complete' then
    if v_run.result_hash <> v_result_hash then
      raise exception 'completed gardener run result changed';
    end if;
    return jsonb_build_object(
      'state', 'complete',
      'runId', v_run.id,
      'findingCount', v_run.candidate_count,
      'idempotent', true,
      'stats', v_run.stats
    );
  end if;
  if v_run.status <> 'running'
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at <= v_now then
    raise exception 'gardener lease is invalid or expired';
  end if;

  select *
  into v_policy
  from brain_learning_policies
  where organization_id = p_organization_id
  for update;
  if not found
     or v_policy.mode <> 'shadow'
     or v_policy.settings->'gardenerEnabled' is distinct from 'true'::jsonb then
    raise exception 'shadow gardener was disabled before completion';
  end if;
  v_conflict_age_days := case
    when jsonb_typeof(v_policy.settings->'gardenerConflictAgeDays') = 'number'
      then least(
        greatest(
          floor((v_policy.settings->>'gardenerConflictAgeDays')::numeric),
          1
        ),
        365
      )::integer
    else 14
  end;
  v_unanswered_threshold := case
    when jsonb_typeof(v_policy.settings->'gardenerUnansweredThreshold') = 'number'
      then least(
        greatest(
          floor((v_policy.settings->>'gardenerUnansweredThreshold')::numeric),
          2
        ),
        100
      )::integer
    else 3
  end;
  v_context_lookback_days := case
    when jsonb_typeof(v_policy.settings->'gardenerContextLookbackDays') = 'number'
      then least(
        greatest(
          floor((v_policy.settings->>'gardenerContextLookbackDays')::numeric),
          7
        ),
        365
      )::integer
    else 90
  end;

  for v_finding in
    select value
    from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
    order by
      value->>'type',
      coalesce(value->>'departmentId', ''),
      coalesce(value->>'projectId', ''),
      value->>'subjectId'
  loop
    v_type := nullif(v_finding->>'type', '');
    v_subject_kind := nullif(v_finding->>'subjectKind', '');
    v_subject_key := left(btrim(coalesce(v_finding->>'subjectId', '')), 500);
    v_department_id := nullif(v_finding->>'departmentId', '');
    v_project_id := nullif(v_finding->>'projectId', '');
    v_title := left(btrim(coalesce(v_finding->>'title', '')), 240);
    v_message := left(btrim(coalesce(v_finding->>'message', '')), 2000);
    v_snapshot := null;

    if v_type not in (
      'stale_document',
      'unresolved_conflict',
      'weak_provenance',
      'missing_knowledge'
    ) then
      raise exception 'unsupported gardener finding type';
    end if;
    if v_subject_key = '' or v_title = '' or v_message = '' then
      raise exception 'gardener finding identity and description are required';
    end if;
    if coalesce(jsonb_typeof(v_finding->'sources'), '') <> 'array'
       or jsonb_array_length(v_finding->'sources') <> 1 then
      raise exception 'gardener finding requires exactly one canonical source';
    end if;
    select value
    into v_source
    from jsonb_array_elements(v_finding->'sources') source(value)
    limit 1;
    if jsonb_typeof(v_source) <> 'object' then
      raise exception 'gardener source must be an object';
    end if;

    v_target_doc_id := null;
    v_target_claim_id := null;
    v_target_conflict_id := null;

    if v_type = 'stale_document' then
      if v_subject_kind <> 'document' then
        raise exception 'stale-document finding requires a document subject';
      end if;
      v_target_doc_id := v_subject_key::uuid;
      select *
      into v_doc
      from brain_docs
      where organization_id = p_organization_id
        and id = v_target_doc_id
        and deleted_at is null;
      if not found
         or v_doc.department_id is distinct from v_department_id
         or v_doc.project_id is distinct from v_project_id
         or v_doc.review_due_at is null
         or v_doc.review_due_at::date >= v_scan_date
         or (
           v_doc.project_id is not null
           and not exists (
             select 1
             from brain_projects
             where organization_id = p_organization_id
               and id = v_doc.project_id
               and status = 'active'
           )
         ) then
        raise exception 'stale-document finding no longer matches canonical state';
      end if;
      if v_source->>'kind' <> 'document_version'
         or v_source->>'sourceId' <> v_target_doc_id::text
         or coalesce(v_source->>'sourceVersion', '') !~ '^[0-9]+$'
         or (v_source->>'sourceVersion')::integer <> v_doc.current_version
         or (
           v_source - array['kind', 'sourceId', 'sourceVersion', 'snapshot']
         ) <> '{}'::jsonb then
        raise exception 'stale-document finding lacks its exact current version';
      end if;
      v_title := left('Review overdue document: ' || v_doc.title, 240);
      v_message := left(
        v_doc.title
        || ' is past its review date at version '
        || v_doc.current_version::text
        || '.',
        2000
      );
      v_snapshot := jsonb_build_object(
        'sources',
        jsonb_build_array(jsonb_build_object(
          'kind', 'document_version',
          'sourceId', v_target_doc_id,
          'sourceVersion', v_doc.current_version,
          'snapshot', jsonb_build_object(
            'currentVersion', v_doc.current_version,
            'reviewDueAt', v_doc.review_due_at
          )
        ))
      );
      v_risk := 'informational';
    elsif v_type = 'weak_provenance' then
      if v_subject_kind <> 'claim' then
        raise exception 'weak-provenance finding requires a claim subject';
      end if;
      v_target_claim_id := v_subject_key::uuid;
      select *
      into v_claim
      from brain_claims
      where organization_id = p_organization_id
        and id = v_target_claim_id;
      if not found
         or v_claim.project_id is distinct from v_project_id
         or v_claim.resolution <> 'accepted'
         or (
           v_claim.project_id is not null
           and not exists (
             select 1
             from brain_projects
             where organization_id = p_organization_id
               and id = v_claim.project_id
               and status = 'active'
           )
         )
         or exists (
           select 1
           from brain_claim_evidence
           where organization_id = p_organization_id
             and claim_id = v_target_claim_id
         ) then
        raise exception 'weak-provenance finding no longer matches canonical state';
      end if;
      if v_department_id is not null then
        raise exception 'claim-only weak-provenance findings must be organization scoped';
      end if;
      if v_source->>'kind' <> 'claim'
         or v_source->>'sourceId' <> v_target_claim_id::text
         or (
           v_source - array['kind', 'sourceId', 'snapshot']
         ) <> '{}'::jsonb then
        raise exception 'weak-provenance finding lacks its exact claim source';
      end if;
      v_title := 'Accepted claim lacks exact provenance';
      v_message := 'An accepted claim has no exact document provenance.';
      v_snapshot := jsonb_build_object(
        'sources',
        jsonb_build_array(jsonb_build_object(
          'kind', 'claim',
          'sourceId', v_target_claim_id,
          'snapshot', jsonb_build_object(
            'lifecycle', v_claim.lifecycle,
            'resolution', v_claim.resolution,
            'evidenceDocumentCount', 0,
            'updatedAt', v_claim.updated_at
          )
        ))
      );
      v_risk := 'material';
    elsif v_type = 'unresolved_conflict' then
      if v_subject_kind <> 'conflict' then
        raise exception 'unresolved-conflict finding requires a conflict subject';
      end if;
      v_target_conflict_id := v_subject_key::uuid;
      select *
      into v_conflict
      from brain_claim_conflicts
      where organization_id = p_organization_id
        and id = v_target_conflict_id;
      if not found or v_conflict.status <> 'open' then
        raise exception 'conflict finding no longer matches canonical state';
      end if;
      if v_conflict.created_at >
         v_scan_date::timestamp - make_interval(days => v_conflict_age_days) then
        raise exception 'conflict has not reached the configured age threshold';
      end if;
      if (
        select count(*)
        from brain_claims
        where organization_id = p_organization_id
          and id in (v_conflict.claim_a_id, v_conflict.claim_b_id)
          and project_id is not distinct from v_project_id
      ) <> 2 then
        raise exception 'conflict project scope does not match its claims';
      end if;
      if v_project_id is not null and not exists (
        select 1
        from brain_projects
        where organization_id = p_organization_id
          and id = v_project_id
          and status = 'active'
      ) then
        raise exception 'conflict project is not active';
      end if;
      if v_department_id is not null then
        raise exception 'claim conflict findings must be organization scoped';
      end if;
      if v_source->>'kind' <> 'claim_conflict'
         or v_source->>'sourceId' <> v_target_conflict_id::text
         or (
           v_source - array['kind', 'sourceId', 'snapshot']
         ) <> '{}'::jsonb then
        raise exception 'conflict finding lacks its exact conflict source';
      end if;
      v_title := 'Claim conflict needs steward review';
      v_message := left(
        'An open claim conflict has remained unresolved for at least '
        || v_conflict_age_days::text
        || ' days.',
        2000
      );
      v_snapshot := jsonb_build_object(
        'sources',
        jsonb_build_array(jsonb_build_object(
          'kind', 'claim_conflict',
          'sourceId', v_target_conflict_id,
          'snapshot', jsonb_build_object(
            'status', v_conflict.status,
            'openedAt', v_conflict.created_at,
            'claimIds', jsonb_build_array(
              v_conflict.claim_a_id,
              v_conflict.claim_b_id
            )
          )
        ))
      );
      v_risk := 'material';
    else
      if v_subject_kind <> 'question'
         or length(v_subject_key) <> 64
         or v_subject_key !~ '^[0-9a-f]+$' then
        raise exception 'missing-knowledge finding requires a SHA-256 question fingerprint';
      end if;
      if v_source->>'kind' <> 'context_gap_aggregate'
         or v_source->>'sourceId' <> v_subject_key
         or (
           v_source - array['kind', 'sourceId', 'snapshot']
         ) <> '{}'::jsonb
         or jsonb_typeof(v_source->'snapshot') <> 'object'
         or jsonb_typeof(v_source->'snapshot'->'contextRunIds') <> 'array'
         or jsonb_array_length(v_source->'snapshot'->'contextRunIds') <
            v_unanswered_threshold
         or jsonb_array_length(v_source->'snapshot'->'contextRunIds') > 100 then
        raise exception 'missing-knowledge finding lacks a bounded gap aggregate';
      end if;
      v_gap_count := 0;
      v_context_ids := array[]::text[];
      v_normalized_question := null;
      for v_context_id_text in
        select value
        from jsonb_array_elements_text(
          v_source->'snapshot'->'contextRunIds'
        )
      loop
        if v_context_id_text !~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
          raise exception 'gap aggregate contains an invalid Context Run ID';
        end if;
        if v_context_id_text = any(v_context_ids) then
          raise exception 'gap aggregate contains a duplicate Context Run ID';
        end if;
        v_context_ids := array_append(v_context_ids, v_context_id_text);
        select *
        into v_context
        from brain_context_runs
        where organization_id = p_organization_id
          and id = v_context_id_text::uuid;
        if not found
           or v_context.project_id is distinct from v_project_id
           or v_context.status not in ('complete', 'partial')
           or v_context.created_at <
              v_scan_date::timestamp - make_interval(
                days => v_context_lookback_days
              )
           or jsonb_typeof(v_context.receipt->'missing') <> 'array'
           or jsonb_array_length(v_context.receipt->'missing') = 0
           or (
             v_context.project_id is not null
             and not exists (
               select 1
               from brain_projects
               where organization_id = p_organization_id
                 and id = v_context.project_id
                 and status = 'active'
             )
           ) then
          raise exception 'gap aggregate contains an ineligible Context Run';
        end if;
        v_receipt_department := nullif(
          v_context.receipt->'scope'->>'department',
          ''
        );
        if v_department_id is null and v_receipt_department is not null then
          raise exception 'gap aggregate department scope changed';
        end if;
        if v_department_id is not null and not exists (
          select 1
          from brain_departments
          where organization_id = p_organization_id
            and id = v_department_id
            and name = v_receipt_department
        ) then
          raise exception 'gap aggregate department scope changed';
        end if;
        v_current_normalized_question := left(
          btrim(regexp_replace(
            lower(v_context.query),
            '[^a-z0-9]+',
            ' ',
            'g'
          )),
          500
        );
        if v_current_normalized_question = '' then
          raise exception 'gap aggregate contains an empty normalized question';
        end if;
        if v_normalized_question is null then
          v_normalized_question := v_current_normalized_question;
        elsif v_normalized_question <> v_current_normalized_question then
          raise exception 'gap aggregate contains multiple normalized questions';
        end if;
        v_gap_count := v_gap_count + 1;
      end loop;
      if v_gap_count < v_unanswered_threshold then
        raise exception 'gap aggregate is below the configured threshold';
      end if;
      if encode(
        sha256(convert_to(v_normalized_question, 'UTF8')),
        'hex'
      ) <> v_subject_key then
        raise exception 'gap aggregate question fingerprint changed';
      end if;
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      into v_context_ids_json
      from unnest(v_context_ids) context_id(value);
      v_title := 'Repeated authorized knowledge gap';
      v_message := left(
        'The Brain could not answer this question in '
        || v_gap_count::text
        || ' authorized context runs.',
        2000
      );
      v_snapshot := jsonb_build_object(
        'sources',
        jsonb_build_array(jsonb_build_object(
          'kind', 'context_gap_aggregate',
          'sourceId', v_subject_key,
          'snapshot', jsonb_build_object(
            'occurrenceCount', v_gap_count,
            'contextRunIds', v_context_ids_json
          )
        ))
      );
      v_risk := 'informational';
    end if;

    if v_snapshot is null or octet_length(v_snapshot::text) > 32768 then
      raise exception 'canonical gardener source snapshot is invalid or unbounded';
    end if;

    v_dedupe_key := md5(concat_ws(
      '|',
      p_organization_id,
      v_type,
      coalesce(v_department_id, ''),
      coalesce(v_project_id, ''),
      v_subject_kind,
      v_subject_key
    ));
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id || ':gardener-finding:' || v_dedupe_key,
        0
      )
    );

    select *
    into v_existing
    from brain_gardener_findings
    where organization_id = p_organization_id
      and dedupe_key = v_dedupe_key
    for update;

    if found then
      v_finding_id := v_existing.id;
      update brain_gardener_findings
      set risk = case
            when v_existing.risk = 'critical' then 'critical'
            when v_existing.risk = 'material' then 'material'
            when v_existing.risk = 'low' and v_risk = 'informational' then 'low'
            else v_risk
          end,
          title = v_title,
          message = v_message,
          state = 'open',
          last_detected_run_id = p_run_id,
          occurrence_count = occurrence_count + 1,
          last_detected_at = v_now,
          resolved_at = null,
          updated_at = v_now
      where organization_id = p_organization_id
        and id = v_finding_id;
      v_repeat_count := v_repeat_count + 1;
    else
      v_finding_id := gen_random_uuid();
      insert into brain_gardener_findings (
        id,
        organization_id,
        finding_type,
        risk,
        department_id,
        project_id,
        subject_kind,
        subject_key,
        target_doc_id,
        target_claim_id,
        target_conflict_id,
        title,
        message,
        state,
        dedupe_key,
        first_detected_run_id,
        last_detected_run_id,
        occurrence_count,
        first_detected_at,
        last_detected_at
      ) values (
        v_finding_id,
        p_organization_id,
        v_type,
        v_risk,
        v_department_id,
        v_project_id,
        v_subject_kind,
        v_subject_key,
        v_target_doc_id,
        v_target_claim_id,
        v_target_conflict_id,
        v_title,
        v_message,
        'open',
        v_dedupe_key,
        p_run_id,
        p_run_id,
        1,
        v_now,
        v_now
      );
      v_new_count := v_new_count + 1;

      insert into brain_audit_events (
        organization_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        metadata
      ) values (
        p_organization_id,
        'system:brain-gardener',
        'learning.gardener.finding_detected',
        'gardener_finding',
        v_finding_id::text,
        jsonb_build_object(
          'findingType', v_type,
          'risk', v_risk,
          'departmentId', v_department_id,
          'projectId', v_project_id,
          'runId', p_run_id
        )
      );
    end if;

    insert into brain_gardener_observations (
      organization_id,
      run_id,
      finding_id,
      source_snapshot,
      observed_at
    ) values (
      p_organization_id,
      p_run_id,
      v_finding_id,
      v_snapshot,
      v_now
    );
    v_count := v_count + 1;
  end loop;

  with resolved as (
    update brain_gardener_findings finding
    set state = 'resolved',
        resolved_at = v_now,
        updated_at = v_now
    where finding.organization_id = p_organization_id
      and finding.state = 'open'
      and (
        (
          finding.finding_type = 'stale_document'
          and not exists (
            select 1
            from brain_docs document
            where document.organization_id = finding.organization_id
              and document.id = finding.target_doc_id
              and document.deleted_at is null
              and document.review_due_at is not null
              and document.review_due_at::date < v_scan_date
              and (
                document.project_id is null
                or exists (
                  select 1
                  from brain_projects project
                  where project.organization_id = document.organization_id
                    and project.id = document.project_id
                    and project.status = 'active'
                )
              )
          )
        )
        or (
          finding.finding_type = 'weak_provenance'
          and not exists (
            select 1
            from brain_claims claim
            where claim.organization_id = finding.organization_id
              and claim.id = finding.target_claim_id
              and claim.resolution = 'accepted'
              and (
                claim.project_id is null
                or exists (
                  select 1
                  from brain_projects project
                  where project.organization_id = claim.organization_id
                    and project.id = claim.project_id
                    and project.status = 'active'
                )
              )
              and not exists (
                select 1
                from brain_claim_evidence evidence
                where evidence.organization_id = claim.organization_id
                  and evidence.claim_id = claim.id
              )
          )
        )
        or (
          finding.finding_type = 'unresolved_conflict'
          and not exists (
            select 1
            from brain_claim_conflicts conflict
            where conflict.organization_id = finding.organization_id
              and conflict.id = finding.target_conflict_id
              and conflict.status = 'open'
              and conflict.created_at <=
                v_scan_date::timestamp - make_interval(
                  days => v_conflict_age_days
                )
              and (
                finding.project_id is null
                or exists (
                  select 1
                  from brain_projects project
                  where project.organization_id = finding.organization_id
                    and project.id = finding.project_id
                    and project.status = 'active'
                )
              )
          )
        )
        or (
          finding.finding_type = 'missing_knowledge'
          and (
            exists (
              select 1
              from brain_context_runs context_run
              where context_run.organization_id = finding.organization_id
                and context_run.project_id is not distinct from finding.project_id
                and context_run.status in ('complete', 'partial')
                and context_run.created_at > finding.last_detected_at
                and context_run.created_at >=
                  v_scan_date::timestamp - make_interval(
                    days => v_context_lookback_days
                  )
                and jsonb_typeof(context_run.receipt->'missing') = 'array'
                and jsonb_array_length(context_run.receipt->'missing') = 0
                and encode(
                  sha256(convert_to(
                    left(
                      btrim(regexp_replace(
                        lower(context_run.query),
                        '[^a-z0-9]+',
                        ' ',
                        'g'
                      )),
                      500
                    ),
                    'UTF8'
                  )),
                  'hex'
                ) = finding.subject_key
                and (
                  (
                    finding.department_id is null
                    and nullif(
                      context_run.receipt->'scope'->>'department',
                      ''
                    ) is null
                  )
                  or exists (
                    select 1
                    from brain_departments department
                    where department.organization_id = finding.organization_id
                      and department.id = finding.department_id
                      and department.name =
                        context_run.receipt->'scope'->>'department'
                  )
                )
            )
            or (
              select count(*)
              from brain_context_runs context_run
              where context_run.organization_id = finding.organization_id
                and context_run.project_id is not distinct from finding.project_id
                and context_run.status in ('complete', 'partial')
                and context_run.created_at >=
                  v_scan_date::timestamp - make_interval(
                    days => v_context_lookback_days
                  )
                and jsonb_typeof(context_run.receipt->'missing') = 'array'
                and jsonb_array_length(context_run.receipt->'missing') > 0
                and encode(
                  sha256(convert_to(
                    left(
                      btrim(regexp_replace(
                        lower(context_run.query),
                        '[^a-z0-9]+',
                        ' ',
                        'g'
                      )),
                      500
                    ),
                    'UTF8'
                  )),
                  'hex'
                ) = finding.subject_key
                and (
                  (
                    finding.department_id is null
                    and nullif(
                      context_run.receipt->'scope'->>'department',
                      ''
                    ) is null
                  )
                  or exists (
                    select 1
                    from brain_departments department
                    where department.organization_id = finding.organization_id
                      and department.id = finding.department_id
                      and department.name =
                        context_run.receipt->'scope'->>'department'
                  )
                )
            ) < v_unanswered_threshold
          )
        )
      )
    returning id
  )
  select count(*) into v_resolved_count from resolved;

  update brain_learning_runs
  set status = 'complete',
      candidate_count = v_count,
      failure_code = null,
      failure_message = null,
      completed_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = v_now,
      result_hash = v_result_hash,
      stats = coalesce(p_stats, '{}'::jsonb) || jsonb_build_object(
        'findingCount', v_count,
        'newFindingCount', v_new_count,
        'repeatFindingCount', v_repeat_count,
        'resolvedFindingCount', v_resolved_count
      )
  where organization_id = p_organization_id
    and id = p_run_id;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    'system:brain-gardener',
    'learning.gardener.completed',
    'learning_run',
    p_run_id::text,
    jsonb_build_object(
      'findingCount', v_count,
      'newFindingCount', v_new_count,
      'repeatFindingCount', v_repeat_count,
      'resolvedFindingCount', v_resolved_count,
      'attempt', v_run.attempt_count
    )
  );

  return jsonb_build_object(
    'state', 'complete',
    'runId', p_run_id,
    'findingCount', v_count,
    'newFindingCount', v_new_count,
    'repeatFindingCount', v_repeat_count,
    'resolvedFindingCount', v_resolved_count,
    'idempotent', false
  );
end;
$$;

create or replace function brain_fail_gardener_run(
  p_organization_id text,
  p_run_id uuid,
  p_lease_token uuid,
  p_failure_code text,
  p_failure_message text,
  p_stats jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run brain_learning_runs%rowtype;
  v_now timestamptz := now();
  v_code text := left(btrim(coalesce(p_failure_code, 'gardener_failed')), 100);
  v_message text := left(btrim(coalesce(p_failure_message, 'Gardener scan failed.')), 1000);
begin
  if v_code = '' or v_code !~ '^[a-z0-9_]+$' then
    raise exception 'invalid gardener failure code';
  end if;
  if jsonb_typeof(coalesce(p_stats, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_stats, '{}'::jsonb)::text) > 16384 then
    raise exception 'gardener failure stats must be a bounded object';
  end if;

  select *
  into v_run
  from brain_learning_runs
  where organization_id = p_organization_id
    and id = p_run_id
    and source_type = 'gardener'
  for update;
  if not found then raise exception 'gardener run not found'; end if;
  if v_run.status = 'failed' then
    return jsonb_build_object(
      'state', 'failed',
      'runId', v_run.id,
      'idempotent', true
    );
  end if;
  if v_run.status <> 'running'
     or v_run.lease_token is distinct from p_lease_token then
    raise exception 'gardener failure lease is invalid';
  end if;

  update brain_learning_runs
  set status = 'failed',
      failure_code = v_code,
      failure_message = v_message,
      completed_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = v_now,
      stats = coalesce(p_stats, '{}'::jsonb)
  where organization_id = p_organization_id
    and id = p_run_id;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    'system:brain-gardener',
    'learning.gardener.failed',
    'learning_run',
    p_run_id::text,
    jsonb_build_object(
      'failureCode', v_code,
      'attempt', v_run.attempt_count
    )
  );

  return jsonb_build_object(
    'state', 'failed',
    'runId', p_run_id,
    'idempotent', false
  );
end;
$$;

revoke all on table
  brain_gardener_findings,
  brain_gardener_observations
from public, anon, authenticated, service_role;

grant select on table
  brain_gardener_findings,
  brain_gardener_observations
to service_role;

revoke all on function brain_start_gardener_run(text, text, date, text, integer)
  from public, anon, authenticated;
revoke all on function brain_gardener_context_window(text, date, integer)
  from public, anon, authenticated;
revoke all on function brain_complete_gardener_run(text, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function brain_fail_gardener_run(text, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function brain_start_gardener_run(text, text, date, text, integer)
  to service_role;
grant execute on function brain_gardener_context_window(text, date, integer)
  to service_role;
grant execute on function brain_complete_gardener_run(text, uuid, uuid, jsonb, jsonb)
  to service_role;
grant execute on function brain_fail_gardener_run(text, uuid, uuid, text, text, jsonb)
  to service_role;

commit;
