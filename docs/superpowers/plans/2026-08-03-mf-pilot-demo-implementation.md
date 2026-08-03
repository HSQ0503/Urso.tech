# MF Pilot-Decision Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/mf` into a reliable 12-minute pilot-decision story backed by one canonical project truth, server-authoritative scenario state, connected-source evidence, privilege-specific employee objectives, derived management value, and a concrete pilot close.

**Architecture:** Keep the current MF presentation shell and visual language. Introduce a pure scenario contract and Harness state engine, persist isolated presenter sessions through a repository, coordinate Brain claim transitions with Harness transitions on the server, and render all new views from one authorized snapshot. The Brain remains responsible for governed evidence and temporal truth; the MF Harness model remains responsible for objectives, work, dependencies, gates, handoffs, and workflow receipts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript/JavaScript modules, Supabase service-role server access, Node.js acceptance scripts, existing MF CSS/components, existing Brain authorization/context compiler.

---

## File map

### New files

- `lib/mf-demo/manifest.mjs` — immutable bilingual scenario, source, objective, role-work, workflow, and outcome contract.
- `lib/mf-demo/manifest.d.ts` — TypeScript declarations for the manifest module.
- `lib/mf-demo/harness-runtime.mjs` — pure state transitions, role workspaces, receipts, and Control Tower derivation.
- `lib/mf-demo/harness-runtime.d.ts` — TypeScript declarations for Harness snapshots.
- `lib/mf-demo/session-server.ts` — session token hashing, session repository, usage limits, and authorized snapshot loading.
- `components/mf/mf-story-panels.tsx` — source registry, controlled-change, objective, outcome, and pilot content using existing MF primitives.
- `scripts/brain-mf-demo-contracts.mjs` — deterministic contract and runtime acceptance checks.
- `scripts/brain-mf-preflight.mjs` — deployed data/index/provider/baseline preflight.

### Modified files

- `package.json` — contract and preflight scripts.
- `lib/mf-demo/types.ts` — snapshot and session-facing UI types.
- `lib/mf-demo/fixtures.ts` — remove duplicated project numbers and derive artifacts/roles from the manifest.
- `lib/mf-demo/scenario.ts` — derive labels, readiness, days, and risk from the Harness snapshot.
- `lib/mf-demo/scenario-server.ts` — idempotent forward/backward Brain and Harness transition coordination.
- `lib/mf-demo/brain-config.ts` — validate role identifiers against the canonical manifest.
- `app/api/mf/brain/scenario/route.ts` — create/load/transition isolated sessions with expected-state validation.
- `app/api/mf/brain/workspace/route.ts` — require an authorized session role and return role-scoped project context.
- `app/api/mf/brain/chat/route.ts` — require session authorization and enforce per-session provider ceilings.
- `app/api/mf/brain/threads/route.ts` — require session authorization.
- `app/api/mf/brain/learning/route.ts` — require session authorization and usage limits.
- `components/mf/mf-demo.tsx` — hydrate the session, await transitions, preserve refresh state, and render the story/value rail.
- `components/mf/demo-views.tsx` — consume authorized snapshots, remove inconsistent numbers, and add objective/employee/outcome content.
- `components/mf/project-brain-workspace.tsx` — send session credentials and keep role-specific Brain access server-authoritative.
- `components/mf/artifact-workspace.tsx` — derive displayed values and receipts from the manifest/snapshot.
- `app/mf/mf.css` — only small selectors required to compose new content with existing design tokens.
- `scripts/brain-mf-acceptance.mjs` — verify the new story and session contracts against the live MF tenant.

## Task 1: Canonical project and workflow contract

**Files:**
- Create: `lib/mf-demo/manifest.mjs`
- Create: `lib/mf-demo/manifest.d.ts`
- Create: `scripts/brain-mf-demo-contracts.mjs`
- Modify: `package.json`
- Modify: `lib/mf-demo/fixtures.ts`
- Modify: `lib/mf-demo/scenario.ts`

- [ ] **Step 1: Write the failing contract acceptance script**

Create assertions that require the approved values and cross-reference every source, role, task, dependency, and impacted discipline:

```js
import assert from "node:assert/strict";
import { mfScenarioManifest } from "../lib/mf-demo/manifest.mjs";

assert.deepEqual(mfScenarioManifest.revisions.B, {
  footprintM: [18.4, 4.8], electricalKw: 420, chilledWaterKw: 118, operatingLoadKn: 146,
});
assert.deepEqual(mfScenarioManifest.revisions.C, {
  footprintM: [19.6, 5.1], electricalKw: 483, chilledWaterKw: 139, operatingLoadKn: 168,
});
assert.equal(mfScenarioManifest.outcome.exposureDays, 10);
assert.equal(mfScenarioManifest.outcome.recoveredDays, 8);
assert.equal(mfScenarioManifest.disciplines.filter((item) => item.impacted).length, 10);
for (const task of mfScenarioManifest.workflow.tasks) {
  assert(mfScenarioManifest.roles.some((role) => role.id === task.ownerRoleId));
  for (const dependency of task.dependsOn) {
    assert(mfScenarioManifest.workflow.tasks.some((candidate) => candidate.id === dependency));
  }
}
console.log("✓ MF manifest values, references, and impact contract are consistent.");
```

- [ ] **Step 2: Run the contract script and verify it fails**

Run: `node scripts/brain-mf-demo-contracts.mjs`

Expected: failure because `lib/mf-demo/manifest.mjs` does not exist.

- [ ] **Step 3: Implement the immutable manifest and declarations**

Export one frozen object with `project`, `revisions`, `sources`, `roles`, `disciplines`, `decision`, `objective`, `workflow.tasks`, `story`, and `outcome`. Each user-facing field has `{ pt, en }`; each source has `mode`, `authority`, `freshness`, `authorizedRoleIds`, and `evidencePaths`.

```js
export const mfScenarioManifest = deepFreeze({
  id: "supplier-revision-c",
  project: { id: "uberlandia-refrescos-f3", milestone: "EXE-02", targetDate: "2026-08-18" },
  revisions: {
    B: { footprintM: [18.4, 4.8], electricalKw: 420, chilledWaterKw: 118, operatingLoadKn: 146 },
    C: { footprintM: [19.6, 5.1], electricalKw: 483, chilledWaterKw: 139, operatingLoadKn: 168 },
  },
  outcome: { exposureDays: 10, recoveredDays: 8, sequentialDate: "2026-08-26", coordinatedDate: "2026-08-18" },
});
```

The same object contains the complete source, role, discipline, workflow-task, story-stage, and decision arrays defined by the approved specification; the contract script validates every cross-reference before the module can be accepted.

- [ ] **Step 4: Derive fixtures and scenario helpers from the manifest**

Replace literal equipment, energy, date, impact-count, and recovery values in `fixtures.ts` and `scenario.ts` with manifest values. Keep presentation-only copy where it does not restate project truth.

- [ ] **Step 5: Add and run the package script**

Add `"brain:mf:contracts": "node scripts/brain-mf-demo-contracts.mjs"` and run `npm run brain:mf:contracts`.

Expected: the manifest contract passes with one success line and exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add package.json lib/mf-demo/manifest.mjs lib/mf-demo/manifest.d.ts lib/mf-demo/fixtures.ts lib/mf-demo/scenario.ts scripts/brain-mf-demo-contracts.mjs
git commit -m "feat(mf): establish canonical demo contract"
```

## Task 2: Pure Harness state engine

**Files:**
- Create: `lib/mf-demo/harness-runtime.mjs`
- Create: `lib/mf-demo/harness-runtime.d.ts`
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Modify: `lib/mf-demo/types.ts`

- [ ] **Step 1: Add failing runtime assertions**

Assert baseline, approval, work-packet, execution, review, and release snapshots; role filtering; derived blockers; and idempotency:

```js
const baseline = createMfHarnessSnapshot(0);
assert.equal(baseline.truth.currentRevision, "B");
assert.equal(baseline.decision.status, "pending");
const approved = transitionMfHarness(baseline, 3, "approve-3");
assert.equal(approved.truth.currentRevision, "C");
assert.equal(approved.decision.status, "approved");
assert.deepEqual(transitionMfHarness(approved, 3, "approve-3"), approved);
const electrical = getMfRoleWorkspace(createMfHarnessSnapshot(6), "electrical");
assert(electrical.tasks.every((task) => task.ownerRoleId === "electrical"));
assert(!electrical.sources.some((source) => !source.authorizedRoleIds.includes("electrical")));
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run brain:mf:contracts`

Expected: failure because Harness exports do not exist.

- [ ] **Step 3: Implement pure snapshot creation and transition functions**

Export `createMfHarnessSnapshot(step)`, `transitionMfHarness(snapshot, targetStep, idempotencyKey)`, `getMfRoleWorkspace(snapshot, roleId)`, and `deriveMfControlTower(snapshot)`. Receipts contain stable IDs derived from the transition key, action, actor, evidence IDs, and resulting state.

- [ ] **Step 4: Run contracts and TypeScript**

Run: `npm run brain:mf:contracts`

Run: `npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
git add lib/mf-demo/harness-runtime.mjs lib/mf-demo/harness-runtime.d.ts lib/mf-demo/types.ts scripts/brain-mf-demo-contracts.mjs
git commit -m "feat(mf): model objective-driven harness state"
```

## Task 3: Isolated server-authoritative presenter sessions

**Files:**
- Create: `lib/mf-demo/session-server.ts`
- Modify: `lib/mf-demo/scenario-server.ts`
- Modify: `app/api/mf/brain/scenario/route.ts`
- Modify: `scripts/brain-mf-demo-contracts.mjs`

- [ ] **Step 1: Add repository and token contract tests**

Test an in-memory repository adapter with `createSession`, `loadSession`, `transitionSession`, invalid-token rejection, expected-step conflicts, role validation, refresh restoration, reset, and per-operation usage ceilings.

- [ ] **Step 2: Run and verify failure**

Run: `npm run brain:mf:contracts`

Expected: missing session-server/runtime adapter assertions fail.

- [ ] **Step 3: Implement session authorization and repository**

Use `crypto.randomUUID`, a 32-byte random token, and SHA-256 token hashes. Store a bounded `demoRuntime.sessions` map under the MF organization's settings through a repository interface. A session record contains `id`, `tokenHash`, `step`, `version`, `selectedRoleId`, `snapshot`, `usage`, `createdAt`, and `updatedAt`. Keep at most 20 recent sessions.

```ts
export type MfSessionCredentials = { sessionId: string; token: string };

export async function requireMfDemoSession(
  admin: SupabaseClient,
  credentials: MfSessionCredentials,
): Promise<MfDemoSession> {
  const session = await repository.load(credentials.sessionId);
  if (!session || !timingSafeEqual(hash(credentials.token), session.tokenHash)) {
    throw new MfSessionError("invalid_session", 401);
  }
  return session;
}
```

- [ ] **Step 4: Replace the scenario route contract**

`POST` with `{ action: "create" }` creates a session. `POST` with `{ action: "transition", sessionId, token, expectedStep, targetStep, idempotencyKey, roleId }` validates and transitions. `POST` with `{ action: "load", sessionId, token }` returns the authorized snapshot.

Return 409 for stale expected state, 401 for invalid credentials, 429 for exceeded ceilings, and 503 for unavailable Brain storage.

- [ ] **Step 5: Run contracts, lint, and TypeScript**

Run: `npm run brain:mf:contracts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Expected: contracts and TypeScript pass; lint has no new warnings.

- [ ] **Step 6: Commit**

```powershell
git add lib/mf-demo/session-server.ts lib/mf-demo/scenario-server.ts app/api/mf/brain/scenario/route.ts scripts/brain-mf-demo-contracts.mjs
git commit -m "feat(mf): add isolated presenter sessions"
```

## Task 4: Correct, idempotent Brain and Harness transitions

**Files:**
- Modify: `lib/mf-demo/scenario-server.ts`
- Modify: `scripts/brain-mf-acceptance.mjs`

- [ ] **Step 1: Add failing acceptance checks for reversible transitions**

Add checks for `0 -> 3 -> 2 -> 8 -> 0`, exact claim lifecycles, DEC-042 status, relation presence, conflict status, session version, stable receipt IDs, and no duplicate audit event for a repeated idempotency key.

- [ ] **Step 2: Run the read-only subset and confirm the new assertions are unavailable**

Run: `npm run brain:mf:contracts`

Expected: pure transition expectations identify missing Brain coordination metadata.

- [ ] **Step 3: Rewrite the scenario coordinator**

For every target step, explicitly apply the expected Brain state rather than only handling step 0 and `step >= 3`. Use stable audit metadata `{ demoSessionId, idempotencyKey, scenarioStep }`; query for an existing event before insertion. Update the Harness session only after all Brain mutations succeed. On Harness persistence failure, reapply the prior Brain state before returning an error.

- [ ] **Step 4: Run contracts and MF isolation**

Run: `npm run brain:mf:contracts`

Run: `npm run brain:mf:isolation`

Expected: contract and five isolation gates pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/mf-demo/scenario-server.ts scripts/brain-mf-acceptance.mjs
git commit -m "fix(mf): synchronize reversible governed transitions"
```

## Task 5: Session-authorized Brain surfaces

**Files:**
- Modify: `lib/mf-demo/brain-config.ts`
- Modify: `app/api/mf/brain/workspace/route.ts`
- Modify: `app/api/mf/brain/chat/route.ts`
- Modify: `app/api/mf/brain/threads/route.ts`
- Modify: `app/api/mf/brain/learning/route.ts`
- Modify: `components/mf/project-brain-workspace.tsx`

- [ ] **Step 1: Add invalid-role, invalid-session, and usage-limit route assertions**

Extend the acceptance script to require role IDs from the manifest, reject missing/invalid session headers on mutation/provider routes, and reject the eleventh live chat operation within one session.

- [ ] **Step 2: Run and verify the route assertions fail**

Run: `npm run brain:mf:contracts`

Expected: the route-policy source checks fail because routes accept role identity directly.

- [ ] **Step 3: Centralize role validation and session credentials**

Add `isMfDemoRoleId` and make `getMfDemoPersona` reject unknown roles instead of falling back silently. Read session credentials from `x-mf-demo-session-id` and `x-mf-demo-session-token`. Resolve the selected role only after session validation.

- [ ] **Step 4: Protect provider-consuming and mutable routes**

Workspace reads receive a role-scoped session. Chat, thread creation, and learning review increment named usage counters before work. Limits return 429 with a deterministic fallback-safe message.

- [ ] **Step 5: Pass credentials from the Project Brain**

Add `sessionId` and `sessionToken` props to `ProjectBrainWorkspace`; include them on workspace, thread, chat, and learning requests. Keep the top quick assistant explicitly deterministic.

- [ ] **Step 6: Run checks and commit**

Run: `npm run brain:mf:contracts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

```powershell
git add lib/mf-demo/brain-config.ts app/api/mf/brain components/mf/project-brain-workspace.tsx
git commit -m "feat(mf): authorize role-specific Brain access"
```

## Task 6: Client hydration, awaited navigation, and demo recovery

**Files:**
- Modify: `components/mf/mf-demo.tsx`
- Modify: `components/mf/demo-views.tsx`
- Modify: `components/mf/artifact-workspace.tsx`

- [ ] **Step 1: Add source-level acceptance checks**

Require that `mf-demo.tsx` no longer fire-and-forgets scenario requests, renders a transition error/retry state, and stores only session credentials in `sessionStorage`.

- [ ] **Step 2: Run and verify failure**

Run: `npm run brain:mf:contracts`

Expected: client synchronization checks fail against the current `void fetch` implementation.

- [ ] **Step 3: Hydrate or create a session**

On mount, load credentials from `sessionStorage`, request the authoritative snapshot, or create a new isolated session. Render the lobby immediately but disable scenario advancement until hydration completes.

- [ ] **Step 4: Await every transition**

Advance, rewind, jump, reset, role switch, and artifact review call one transition helper. The helper sends `expectedStep` and a fresh idempotency key, waits for the resulting snapshot, and then updates the view. A failure leaves the previous snapshot visible and offers Retry.

- [ ] **Step 5: Render from the authorized snapshot**

Replace local artifact-review state, copied impact counts, and copied readiness values with snapshot values. Pass session credentials to Project Brain.

- [ ] **Step 6: Run checks and commit**

Run: `npm run brain:mf:contracts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

```powershell
git add components/mf/mf-demo.tsx components/mf/demo-views.tsx components/mf/artifact-workspace.tsx
git commit -m "feat(mf): make the guided story server-authoritative"
```

## Task 7: Connected sources, controlled change, and employee objectives

**Files:**
- Create: `components/mf/mf-story-panels.tsx`
- Modify: `components/mf/demo-views.tsx`
- Modify: `components/mf/mf-demo.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Add semantic rendering checks**

Require bilingual labels for connection mode, authority, freshness, evidence, truth transition, objective, employee next action, dependency, deliverable, human gate, and definition of done.

- [ ] **Step 2: Run and verify failure**

Run: `npm run brain:mf:contracts`

Expected: missing story-panel content assertions fail.

- [ ] **Step 3: Implement focused story panels**

Create `ExecutiveValueBar`, `StoryRail`, `ConnectedSourcesPanel`, `ControlledChangePanel`, `ObjectiveWorkflowPanel`, `EmployeeObjectivePanel`, `OutcomeComparisonPanel`, and `PilotProposalPanel`. Components accept a snapshot and language; they do not own scenario state.

- [ ] **Step 4: Weave panels into the existing eight-scene route**

Use existing views instead of adding a second navigation system: sources and controlled truth enter Changes/Brain; employee objectives enter Disciplines/Workflows; the comparison and pilot close enter release-ready Control Tower/Audit. Each major scene includes What happened, What Urso did, and Value created.

- [ ] **Step 5: Add minimal style composition**

Use existing CSS custom properties, borders, type scales, status colors, grid rules, and reduced-motion media query. Do not change existing selectors except where snapshot props replace hard-coded state.

- [ ] **Step 6: Run checks and commit**

Run: `npm run brain:mf:contracts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

```powershell
git add components/mf/mf-story-panels.tsx components/mf/demo-views.tsx components/mf/mf-demo.tsx app/mf/mf.css
git commit -m "feat(mf): surface connected context and employee objectives"
```

## Task 8: Preflight and complete acceptance

**Files:**
- Create: `scripts/brain-mf-preflight.mjs`
- Modify: `scripts/brain-mf-acceptance.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing preflight checks**

Check required environment, MF tenant/project/personas, 39-document corpus coverage, embeddings, exact claim values, source paths, baseline truth, session create/load/reset, provider availability without calling a model, and story-contract consistency.

- [ ] **Step 2: Run and verify the preflight is unavailable**

Run: `npm run brain:mf:preflight`

Expected: package script is missing.

- [ ] **Step 3: Implement the read-only-by-default preflight**

The script prints PASS/WARN/FAIL per gate and exits nonzero only for presentation-breaking failures. `--reset` is an explicit mutating option that creates its own session and restores baseline.

- [ ] **Step 4: Run the complete automated suite**

Run: `npm run brain:mf:contracts`

Run: `npm run brain:mf:isolation`

Run: `npm run brain:mf:preflight`

Run: `npm run brain:acceptance -- --json`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all MF gates pass; Brain acceptance has zero failures; TypeScript, lint, and build introduce no new errors or warnings.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/brain-mf-preflight.mjs scripts/brain-mf-acceptance.mjs
git commit -m "test(mf): add presentation preflight and acceptance"
```

## Task 9: Browser walkthrough and timed story verification

**Files:**
- Modify only files implicated by observed defects.

- [ ] **Step 1: Start the production-equivalent local app**

Run: `npm run dev -- --port 3010`

Expected: `/mf` loads without compilation errors.

- [ ] **Step 2: Verify the full Portuguese guided path**

Create a clean session; advance all eight transitions; open one source proof, the Controlled Change Record, the electrical employee objective, the workflow graph, a receipt, outcome comparison, and Pilot Proposal. Confirm refresh at steps 2, 3, and 8 restores exact state.

- [ ] **Step 3: Verify privilege behavior**

Switch among project manager, electrical, BIM, planning, and quality. Confirm each role receives different evidence/actions and that browser network responses contain no disallowed source records.

- [ ] **Step 4: Verify failure recovery**

Submit a stale expected step and an invalid token through the browser request context. Confirm 409/401 responses, no UI advancement, and a working retry/reset path.

- [ ] **Step 5: Verify English, responsive layout, and visual stability**

Repeat the critical path in English and inspect desktop plus mobile widths. Compare against the current MF visual language; resolve only concrete overflow, hierarchy, or state-legibility regressions.

- [ ] **Step 6: Time the guided path**

Run the presentation without proof drawers. Expected duration: at most 12 minutes, ending on the explicit action “Select the project and nominate the pilot team.”

- [ ] **Step 7: Final verification commit**

```powershell
git add app components lib scripts package.json
git commit -m "fix(mf): harden the pilot-decision walkthrough"
```

## Completion gate

Before declaring completion, verify:

- the specification sections map to Tasks 1–9;
- `rg -n "640|736|496|7 days|7 dias" components/mf lib/mf-demo` returns no contradictory scenario truth;
- `git diff main...HEAD --check` returns no whitespace errors;
- the worktree contains no secrets or copied environment files;
- all automated and browser checks pass; and
- the established MF visual identity remains recognizable and unchanged.
