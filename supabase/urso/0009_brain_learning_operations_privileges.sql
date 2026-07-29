-- Urso Brain migration 0009 — reassert M6.3 service-role boundaries.
-- Run after 0008_brain_learning_operations.sql.
--
-- Supabase preview branches can restore default anon/authenticated grants
-- while reconstructing functions and views. Reassert the M6.3 privilege
-- boundary after a branch is created. This migration is safe to replay.

begin;

revoke all on table brain_learning_assessments
  from public, anon, authenticated, service_role;
grant select on table brain_learning_assessments to service_role;

revoke all on table brain_learning_latest_assessments
  from public, anon, authenticated, service_role;
grant select on table brain_learning_latest_assessments to service_role;

revoke all on table brain_learning_operations_metrics
  from public, anon, authenticated, service_role;
grant select on table brain_learning_operations_metrics to service_role;

revoke all on sequence brain_learning_assessments_assessment_order_seq
  from public, anon, authenticated, service_role;

revoke all on function brain_reject_learning_assessment_mutation()
  from public, anon, authenticated, service_role;
revoke all on function brain_assess_learning_candidate(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_create_learning_batch(
  text,
  text,
  text,
  text,
  uuid[],
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_transition_learning_batch(
  text,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_promote_learning_document_patch(
  text,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function brain_assess_learning_candidate(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;
grant execute on function brain_create_learning_batch(
  text,
  text,
  text,
  text,
  uuid[],
  text,
  text
) to service_role;
grant execute on function brain_transition_learning_batch(
  text,
  uuid,
  text,
  text,
  text,
  text
) to service_role;
grant execute on function brain_promote_learning_document_patch(
  text,
  uuid,
  text,
  text,
  jsonb
) to service_role;

commit;
