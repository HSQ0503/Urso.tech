# Urso Brain M4 evaluations

This suite is the permanent quality gate for the company Brain. It uses the real
authorization layer, hybrid retrieval, Context Compiler, answer model, and a
separate structured judge.

## Commands

```bash
# Fast deterministic retrieval/security run
npm run brain:eval

# Full answer + citation + judge run
npm run brain:eval:full

# Focused development runs
npm run brain:eval -- --case=woof-current-sources
npm run brain:eval:full -- --category=security --concurrency=1
npm run brain:eval:full -- --limit=3 --no-fail
```

The runner starts an isolated local Next server with its own build directory,
creates temporary memberships/documents/chunks/ACLs, runs the cases, persists
the score when migration 0003 is present, writes a JSON artifact under
`.brain-evals/`, and removes every temporary record.

## Metrics and gates

- retrieval recall against required evidence groups;
- answer correctness and groundedness;
- citation validity, coverage, and entailment;
- current-decision/freshness handling;
- restricted-evidence and prompt-injection leakage;
- case pass rate;
- p50/p95/max end-to-end latency;
- answer/judge input and output tokens;
- optional estimated USD cost.

Exact USD cost is intentionally opt-in because provider pricing changes. Pass
the current contracted prices when a cost score is needed:

```bash
npm run brain:eval:full -- \
  --answer-input-cost-per-million=0 \
  --answer-output-cost-per-million=0 \
  --judge-input-cost-per-million=0 \
  --judge-output-cost-per-million=0
```

Replace zeroes with the active per-million-token rates. Token usage is always
recorded even when no price is supplied.

## Durable history

Apply `supabase/urso/0003_brain_evaluations.sql` once to the dedicated Urso HQ
Supabase project. Runs continue locally without the migration, but historical
scores will not be written to `brain_eval_runs` and `brain_eval_results`.

## Weekly regression

`.github/workflows/brain-eval.yml` runs the full suite every Monday and can be
started manually. Configure these GitHub Actions secrets:

- `NEXT_PUBLIC_URSO_SUPABASE_URL`
- `URSO_SUPABASE_SECRET_KEY`
- `BRAIN_KEYS_SECRET`

The answer and judge provider keys remain encrypted in `brain_org_keys`; they
are never copied into GitHub secrets.

## Changing the suite

Keep 40–60 cases. Every grounded case must name at least one acceptable current
evidence path and a concrete answer contract. Security cases use generated
placeholders under `{{fixture.*}}`; never hard-code production secrets or
customer data in an evaluation.
