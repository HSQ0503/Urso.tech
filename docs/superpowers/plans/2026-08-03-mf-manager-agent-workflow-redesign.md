# MF Manager and Agent Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered MF manager and workflow surfaces with an evidence-backed manager cockpit, team command center, and readable connected-system agent workflow while preserving the deterministic demo and MF visual identity.

**Architecture:** Extend the canonical MF manifest with manager-action, handoff, technology, agent/tool, gate, and output metadata. Derive manager, team, and workflow presentation models through pure runtime selectors, then render them through three focused client components composed by `demo-views.tsx`. Keep scenario transitions and role authorization server-authoritative; React owns only view and workflow selection.

**Tech Stack:** Next.js 16.2 App Router, React 19 client components, TypeScript, ESM pure runtimes, Lucide React, route-scoped global CSS, Node assertion contracts, in-app browser visual verification.

---

## File Structure

- Modify `lib/mf-demo/manifest.mjs` — canonical manager actions, handoff stages, source technology identities, and five workflow definitions.
- Modify `lib/mf-demo/manifest.d.mts` — declarations for the new canonical metadata.
- Modify `lib/mf-demo/harness-runtime.mjs` — correct task completion semantics for manager decisions.
- Modify `lib/mf-demo/harness-runtime.d.mts` — preserve snapshot and task type alignment.
- Create `lib/mf-demo/manager-runtime.mjs` — pure manager queue and team command projections.
- Create `lib/mf-demo/manager-runtime.d.mts` — manager projection declarations.
- Create `lib/mf-demo/workflow-runtime.mjs` — pure five-stage workflow presentation projection.
- Create `lib/mf-demo/workflow-runtime.d.mts` — workflow presentation declarations.
- Modify `lib/mf-demo/types.ts` — re-export the new runtime types.
- Create `components/mf/mf-manager-workspace.tsx` — approved direction A, the Project Today manager cockpit.
- Create `components/mf/mf-team-command.tsx` — approved direction B, the My Team command center.
- Create `components/mf/mf-agent-workflow.tsx` — workflow selector, technology badges, five-stage pipeline, and role delivery strip.
- Modify `components/mf/demo-views.tsx` — compose the focused components and remove duplicated local workflow data/card walls.
- Modify `components/mf/mf-demo.tsx` — remove the persistent KPI/story layer and dead hidden activity DOM.
- Modify `components/mf/mf-story-panels.tsx` — retain and simplify evidence/change/outcome/pilot panels; remove obsolete objective/status walls.
- Modify `app/mf/mf.css` — replace the manager, team, workflow, and obsolete dark story CSS sections in place.
- Modify `scripts/brain-mf-demo-contracts.mjs` — data, selector, privilege, and component contract coverage.

### Task 1: Canonical manager decisions, handoffs, and workflow metadata

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Modify: `lib/mf-demo/manifest.mjs`
- Modify: `lib/mf-demo/manifest.d.mts`
- Modify: `lib/mf-demo/harness-runtime.mjs`

- [ ] **Step 1: Write the failing canonical metadata assertions**

Add assertions after the existing workflow dependency loop:

```js
const managerActions = mfScenarioManifest.workflow.tasks
  .filter((task) => task.managerAction)
  .map((task) => task.managerAction);
assert.equal(new Set(managerActions.map((action) => action.id)).size, managerActions.length);
assert.deepEqual(managerActions.map((action) => action.id), ["DEC-042", "ACT-IMPACT", "SCN-003", "EXE-02"]);

const workflowTaskIds = new Set(mfScenarioManifest.workflow.tasks.map((task) => task.id));
for (const stage of mfScenarioManifest.workflow.handoffStages) {
  assert(stage.taskIds.every((taskId) => workflowTaskIds.has(taskId)), `unknown handoff task: ${stage.id}`);
}
assert(
  mfScenarioManifest.workflow.tasks
    .find((task) => task.id === "verify-gate")
    .dependsOn.includes("select-recovery-scenario"),
);

const validTechnologyIds = new Set(["slack", "cde", "revit", "primavera-p6", "teams", "urso-brain"]);
for (const source of mfScenarioManifest.sources) assert(validTechnologyIds.has(source.technology.id));

const workflowIds = mfScenarioManifest.workflow.catalog.map((workflow) => workflow.id);
const runCodes = mfScenarioManifest.workflow.catalog.map((workflow) => workflow.runCode);
assert.equal(new Set(workflowIds).size, workflowIds.length);
assert.equal(new Set(runCodes).size, runCodes.length);
for (const workflow of mfScenarioManifest.workflow.catalog) {
  assert(workflow.sourceIds.every((sourceId) => mfScenarioManifest.sources.some((source) => source.id === sourceId)));
  assert(workflow.agents.every((agent) => ["read", "query", "draft", "write"].includes(agent.tool.permission)));
  assert(workflow.agents.every((agent) => agent.tool.permission !== "write"), "pre-gate agents must not write");
  assert(workflow.deliveryRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId)));
}
```

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL because `managerAction`, `handoffStages`, source `technology`, and workflow `catalog` do not exist.

- [ ] **Step 3: Extend the manifest declarations**

Add these declarations to `manifest.d.mts` and reference them from `MfManifestSource`, `MfManifestTask`, and `workflow`:

```ts
export type MfTechnologyId = "slack" | "cde" | "revit" | "primavera-p6" | "teams" | "urso-brain";
export type MfToolPermission = "read" | "query" | "draft" | "write";
export type MfManifestManagerAction = Readonly<{
  id: string;
  kind: "decision" | "action" | "release";
  label: MfLocalizedText;
  due: MfLocalizedText;
  actionAt: number;
  blockedLane: "next" | "waiting_on_team";
}>;
export type MfManifestHandoffStage = Readonly<{
  id: string;
  label: MfLocalizedText;
  taskIds: readonly string[];
}>;
export type MfManifestWorkflowDefinition = Readonly<{
  id: string;
  runCode: string;
  ownerRoleId: string;
  title: MfLocalizedText;
  trigger: MfLocalizedText;
  purpose: MfLocalizedText;
  sourceIds: readonly string[];
  agents: readonly Readonly<{
    id: string;
    name: MfLocalizedText;
    objective: MfLocalizedText;
    tool: Readonly<{ id: string; name: MfLocalizedText; permission: MfToolPermission }>;
  }>[];
  gate: Readonly<{
    taskId: string;
    roleId: string;
    decision: MfLocalizedText;
    evidenceSourceIds: readonly string[];
    affectedRoleIds: readonly string[];
  }>;
  outputs: readonly Readonly<{
    id: string;
    label: MfLocalizedText;
    kind: "receipt" | "plan" | "brief" | "draft" | "checklist";
    recipientRoleIds: readonly string[];
  }>[];
  deliveryRoleIds: readonly string[];
}>;
```

Add `technology: { id: MfTechnologyId; name: string }` to `MfManifestSource`, optional `managerAction` to `MfManifestTask`, and declare `workflow` as `{ id, tasks, handoffStages, catalog }`.

- [ ] **Step 4: Add the canonical manager and technology metadata**

In `manifest.mjs`, add a technology identity to every source while retaining `mode` as the connection truth. Use Slack, CDE, Revit, Primavera P6, Teams, and Urso Brain identities matching the source system.

Add manager action metadata to `approve-controlled-truth`, `map-impact`, and `release-exe-02`. Insert the missing manager decision between Planning and Quality:

```js
{
  id: "select-recovery-scenario",
  ownerRoleId: "project-manager",
  title: text("Selecionar cenário de recuperação", "Select recovery scenario"),
  detail: text(
    "Escolher a revisão paralela controlada preparada por Planejamento.",
    "Choose the controlled parallel-review scenario prepared by Planning.",
  ),
  dependsOn: ["recover-schedule"],
  sourceIds: ["project-schedule", "rfi-decisions"],
  artifactId: "recovery-plan",
  humanGate: true,
  managerAction: {
    id: "SCN-003",
    kind: "decision",
    label: text("Selecionar cenário de recuperação", "Select recovery scenario"),
    due: text("Hoje · 16:00", "Today · 16:00"),
    actionAt: 6,
    blockedLane: "next",
  },
},
```

Make `verify-gate.dependsOn` equal `['update-electrical', 'select-recovery-scenario']`. Add five `handoffStages` for truth, BIM, technical packages, verified gate, and release. Move all five entries from the local `workflowCatalog` in `demo-views.tsx` into structured `workflow.catalog` definitions. The PM workflow must include source IDs that resolve to Slack, CDE, Revit, P6, and Teams, and the agent/tool pairs shown in the approved mockup.

- [ ] **Step 5: Correct the deterministic completion steps**

Update `completionStepByTask` in `harness-runtime.mjs`:

```js
const completionStepByTask = Object.freeze({
  "approve-controlled-truth": 3,
  "map-impact": 4,
  "coordinate-bim": 6,
  "update-electrical": 7,
  "recover-schedule": 6,
  "select-recovery-scenario": 7,
  "verify-gate": 7,
  "release-exe-02": 8,
});
```

Use `managerAction.actionAt` as the earliest actionable step when building manager-owned work so DEC-042 is not presented as ready during the baseline.

- [ ] **Step 6: Run the contract and type checker**

Run: `npm run brain:mf:contracts && npx tsc --noEmit`  
Expected: PASS with the workflow count updated from seven to eight where derived from the manifest.

- [ ] **Step 7: Commit the canonical model**

```bash
git add scripts/brain-mf-demo-contracts.mjs lib/mf-demo/manifest.mjs lib/mf-demo/manifest.d.mts lib/mf-demo/harness-runtime.mjs
git commit -m "feat(mf): model manager decisions and agent workflows"
```

### Task 2: Pure manager queue and team command projections

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Create: `lib/mf-demo/manager-runtime.mjs`
- Create: `lib/mf-demo/manager-runtime.d.mts`
- Modify: `lib/mf-demo/types.ts`

- [ ] **Step 1: Write the failing selector assertions**

Import `deriveMfManagerQueue`, `deriveMfManagerWorkspace`, and `deriveMfTeamCommand` from the new module, then add:

```js
const managerStep2 = deriveMfManagerWorkspace(createMfHarnessSnapshot(2));
assert.deepEqual(managerStep2.queue.now.map((item) => item.taskId), ["approve-controlled-truth"]);
assert.deepEqual(managerStep2.queue.next.map((item) => item.taskId), ["map-impact", "select-recovery-scenario"]);
assert.deepEqual(managerStep2.queue.waitingOnTeam.map((item) => item.taskId), ["release-exe-02"]);
assert.deepEqual(managerStep2.queue.decisionsRequiringAction.map((item) => item.actionId), ["DEC-042"]);

const managerStep5 = deriveMfTeamCommand(createMfHarnessSnapshot(5));
assert.equal(managerStep5.teams.find((team) => team.roleId === "bim").state, "in_progress");
assert.equal(managerStep5.teams.find((team) => team.roleId === "planning").state, "in_progress");
assert.equal(managerStep5.teams.find((team) => team.roleId === "electrical").atRisk, true);
assert.equal(managerStep5.teams.find((team) => team.roleId === "quality").atRisk, true);

const managerStep6 = deriveMfManagerQueue(createMfHarnessSnapshot(6));
assert.deepEqual(managerStep6.decisionsRequiringAction.map((item) => item.actionId), ["SCN-003"]);

const managerStep7 = deriveMfManagerQueue(createMfHarnessSnapshot(7));
assert.deepEqual(managerStep7.decisionsRequiringAction.map((item) => item.actionId), ["EXE-02"]);

const managerStep8 = deriveMfManagerWorkspace(createMfHarnessSnapshot(8));
assert.equal(managerStep8.queue.actionRequiredCount, 0);
assert.equal(managerStep8.queue.done.length, 4);
assert(managerStep8.team.handoffStages.every((stage) => stage.state === "complete"));
```

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `manager-runtime.mjs`.

- [ ] **Step 3: Implement `manager-runtime.mjs`**

Export the three pure selectors with these declarations:

```ts
export function deriveMfManagerQueue(snapshot: MfHarnessSnapshot): MfManagerQueue;
export function deriveMfTeamCommand(snapshot: MfHarnessSnapshot): MfTeamCommand;
export function deriveMfManagerWorkspace(snapshot: MfHarnessSnapshot): MfManagerWorkspace;
```

For each manager action, recursively collect incomplete dependency ancestors. Include task state, localized label and due date, evidence source IDs/count, direct blockers, transitive blockers, blocking non-manager role count, receipt ID, and lane. Classify ready/in-progress actions at or after `actionAt` as `now`, future manager actions with `blockedLane: next` as `next`, release work blocked by discipline ancestors as `waitingOnTeam`, and complete actions as `done`.

For each team, choose work in priority order `in_progress → ready → blocked → latest complete`. Set `atRisk` when a non-manager team remains blocked at step 5 or later. Derive handoff state from the tasks named by each canonical stage.

- [ ] **Step 4: Declare and re-export the selector types**

Define `MfManagerActionItem`, `MfManagerQueue`, `MfTeamStatus`, `MfTeamCommand`, `MfHandoffStageStatus`, and `MfManagerWorkspace` in `manager-runtime.d.mts`. Re-export them from `types.ts`:

```ts
export type {
  MfHandoffStageStatus,
  MfManagerActionItem,
  MfManagerQueue,
  MfManagerWorkspace,
  MfTeamCommand,
  MfTeamStatus,
} from "./manager-runtime.mjs";
```

- [ ] **Step 5: Run contracts and type checking**

Run: `npm run brain:mf:contracts && npx tsc --noEmit`  
Expected: PASS, including rewind checks that derive fresh step-2 output after a step-7 snapshot is rewound.

- [ ] **Step 6: Commit the manager runtime**

```bash
git add scripts/brain-mf-demo-contracts.mjs lib/mf-demo/manager-runtime.mjs lib/mf-demo/manager-runtime.d.mts lib/mf-demo/types.ts
git commit -m "feat(mf): derive manager queue and team command state"
```

### Task 3: Pure workflow presentation projection

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Create: `lib/mf-demo/workflow-runtime.mjs`
- Create: `lib/mf-demo/workflow-runtime.d.mts`
- Modify: `lib/mf-demo/types.ts`

- [ ] **Step 1: Write the failing workflow presentation assertions**

Add:

```js
const workflowStep2 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(2), "coordinate-project-change");
assert.equal(workflowStep2.truth.currentRevision, "B");
assert.equal(workflowStep2.gate.state, "in_progress");
assert.equal(workflowStep2.outputsReady, false);
assert.deepEqual(
  workflowStep2.sources.map((source) => source.technology.id),
  ["slack", "cde", "revit", "primavera-p6", "teams"],
);

const workflowStep5 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(5), "coordinate-project-change");
for (const delivery of workflowStep5.roleDeliveries) {
  assert(delivery.sources.every((source) => source.authorizedRoleIds.includes(delivery.role.id)));
}
assert(!workflowStep5.roleDeliveries.find((delivery) => delivery.role.id === "electrical").sources.some((source) => source.id === "project-schedule"));

const workflowStep8 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(8), "coordinate-project-change");
assert.equal(workflowStep8.outputsReady, true);
assert.equal(workflowStep8.gate.state, "complete");
```

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `workflow-runtime.mjs`.

- [ ] **Step 3: Implement the workflow selector**

`deriveMfWorkflowPresentation(snapshot, workflowId)` must resolve only manifest-defined references, filter sources through the owner role’s `authorizedRoleIds`, derive the gate from its referenced `MfWorkItem`, and return:

```js
{
  definition,
  stages: ["connected_context", "brain_boundary", "agents_tools", "human_gate", "controlled_outputs"],
  sources,
  truth: snapshot.truth,
  agents: definition.agents,
  gate: { ...gateTask, role, evidenceCount, affectedRoleCount },
  outputs: definition.outputs,
  outputsReady: gateTask.state === "complete",
  roleDeliveries: definition.deliveryRoleIds.map((roleId) => {
    const workspace = getMfRoleWorkspace(snapshot, roleId);
    return {
      role: workspace.role,
      objective: workspace.role.objective,
      nextAction: workspace.nextTask,
      sources: workspace.sources,
      deliverable: workspace.role.deliverable,
      openActionCount: workspace.tasks.filter((task) => task.state !== "complete").length,
      sourceCount: workspace.sources.length,
    };
  }),
}
```

Throw `unknown MF workflow: ${workflowId}` for an invalid ID and do not mutate the frozen manifest or snapshot.

- [ ] **Step 4: Declare and re-export workflow presentation types**

Declare `MfWorkflowPresentation` and its stage, gate, and role-delivery members in `workflow-runtime.d.mts`; re-export from `types.ts`.

- [ ] **Step 5: Run contracts and type checking**

Run: `npm run brain:mf:contracts && npx tsc --noEmit`  
Expected: PASS.

- [ ] **Step 6: Commit the workflow runtime**

```bash
git add scripts/brain-mf-demo-contracts.mjs lib/mf-demo/workflow-runtime.mjs lib/mf-demo/workflow-runtime.d.mts lib/mf-demo/types.ts
git commit -m "feat(mf): derive privilege-aware workflow presentation"
```

### Task 4: Build the decision-first manager cockpit

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Create: `components/mf/mf-manager-workspace.tsx`
- Modify: `components/mf/demo-views.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Write the failing component contract**

Read `mf-manager-workspace.tsx` in the contract script and assert it exports `MfManagerWorkspace`, imports `deriveMfManagerWorkspace`, contains the semantic strings `Manager briefing`, `Decisions requiring you`, `My queue`, `Waiting on team`, and renders buttons for evidence review and scenario advancement.

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL because `components/mf/mf-manager-workspace.tsx` does not exist.

- [ ] **Step 3: Create the manager component**

Create a client component with this public prop contract:

```tsx
export type MfManagerWorkspaceProps = {
  snapshot: MfHarnessSnapshot;
  onAdvance: () => void;
  onNavigate: (view: DemoView) => void;
};

export function MfManagerWorkspace(props: MfManagerWorkspaceProps): React.JSX.Element;
```

Use the selector output as the only queue source. At steps 0–1, show monitored baseline/incoming signal without an enabled material-decision action. At step 2 show DEC-042, at steps 3–5 show impact-plan coordination, at step 6 show SCN-003, at step 7 show EXE-02 release, and at step 8 show the protected outcome. Every decision must show evidence count, affected teams, due state, consequence, and the human owner.

- [ ] **Step 4: Replace the old `ControlTowerView` card wall**

Reduce `ControlTowerView` in `demo-views.tsx` to the new component plus the existing final `OutcomeComparisonPanel` and `PilotProposalPanel` at step 8. Remove the duplicate truth path, generic selected-role focus card, milestone comparison card, and three-item Urso explainer.

- [ ] **Step 5: Replace the old Project Today CSS in place**

Replace `.mf-truth-path` through `.mf-what-urso-does` with `.mf-manager-briefing`, `.mf-manager-pulse`, `.mf-manager-layout`, `.mf-primary-decision`, `.mf-manager-queue`, and `.mf-decision-unlocks`. Desktop uses a decision/queue split; below the existing tablet breakpoint it stacks in briefing → pulse → decision → queue → unlock order. Use normal readable copy and preserve 44px actions and visible focus.

- [ ] **Step 6: Verify component contracts, types, and lint**

Run: `npm run brain:mf:contracts && npx tsc --noEmit && npx eslint components/mf/mf-manager-workspace.tsx components/mf/demo-views.tsx`  
Expected: PASS with no new warnings.

- [ ] **Step 7: Commit the manager cockpit**

```bash
git add scripts/brain-mf-demo-contracts.mjs components/mf/mf-manager-workspace.tsx components/mf/demo-views.tsx app/mf/mf.css
git commit -m "feat(mf): add decision-first manager cockpit"
```

### Task 5: Build the team command center

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Create: `components/mf/mf-team-command.tsx`
- Modify: `components/mf/demo-views.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Write the failing component contract**

Assert the new source exports `MfTeamCommand`, imports `deriveMfTeamCommand`, and contains `Work by discipline`, `Manager attention`, `Critical handoff chain`, and a native `<details>` for the supporting 15-discipline map.

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL because `components/mf/mf-team-command.tsx` does not exist.

- [ ] **Step 3: Create the team command component**

Use this public prop contract:

```tsx
export type MfTeamCommandProps = {
  snapshot: MfHarnessSnapshot;
  selectedRoleId: string;
  onNavigate: (view: DemoView) => void;
};

export function MfTeamCommand(props: MfTeamCommandProps): React.JSX.Element;
```

Show only impacted/active roles in the main command list, with role objective, current task, owner label, and explicit ready/in-progress/waiting/at-risk/complete text. Keep manager decisions visually separate in the rail. Render the canonical handoff stages in order. Put the existing 15-discipline group map inside a collapsed `<details>` and highlight the selected role.

- [ ] **Step 4: Compose it in `DisciplinesView`**

For the Project Manager, render the command center first. For other roles, keep a compact role-specific brief sourced through `getMfRoleWorkspace`, then show the same handoff context without exposing unauthorized sources. Remove the duplicated `EmployeeObjectivePanel` and always-visible team map.

- [ ] **Step 5: Replace the old team CSS in place**

Replace the `.mf-role-brief` through `.mf-team-map` card-wall selectors with `.mf-team-command`, `.mf-team-row`, `.mf-manager-decision-rail`, `.mf-handoff-chain`, and `.mf-discipline-evidence`. Stack the decision rail below team rows at tablet width; keep state labels readable without relying on color.

- [ ] **Step 6: Verify component contracts, types, and lint**

Run: `npm run brain:mf:contracts && npx tsc --noEmit && npx eslint components/mf/mf-team-command.tsx components/mf/demo-views.tsx`  
Expected: PASS.

- [ ] **Step 7: Commit the team command center**

```bash
git add scripts/brain-mf-demo-contracts.mjs components/mf/mf-team-command.tsx components/mf/demo-views.tsx app/mf/mf.css
git commit -m "feat(mf): add team command center"
```

### Task 6: Build the connected-system agent workflow

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Create: `components/mf/mf-agent-workflow.tsx`
- Modify: `components/mf/demo-views.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Write the failing workflow component contract**

Assert the new source exports `MfAgentWorkflow`, imports `deriveMfWorkflowPresentation`, and contains semantic labels for `Connected context`, `Brain boundary`, `Agents + tools`, `Human gate`, `Controlled outputs`, `Everything returns to the Brain`, and `What each employee receives`.

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL because `components/mf/mf-agent-workflow.tsx` does not exist.

- [ ] **Step 3: Create the workflow component**

Use this public prop contract:

```tsx
export type MfAgentWorkflowProps = {
  snapshot: MfHarnessSnapshot;
  selectedWorkflowId: string;
  onSelectWorkflow: (workflowId: string) => void;
  onAdvance: () => void;
  onOpenOutputs: () => void;
};

export function MfAgentWorkflow(props: MfAgentWorkflowProps): React.JSX.Element;
```

Implement local typographic/inline-vector technology badges for Slack, CDE, Revit, P6, Teams, and Urso Brain; do not add a dependency or fetch remote images. Show live/demo/pilot labels, pair every agent directly with its tool and permission, make the Brain policy boundary explicit, keep the human gate prominent, and show every configured output plus the role-delivery strip.

- [ ] **Step 4: Simplify `WorkflowsView`**

Delete the local `workflowCatalog`, agent/tool tuple selection, snake stage math, and inline workflow JSX from `demo-views.tsx`. Keep only selected workflow state reset by role context, deterministic `onAdvance`, and navigation to artifacts. Remove `ObjectiveWorkflowPanel` from this view.

- [ ] **Step 5: Replace the workflow CSS block in place**

Replace the block beginning `/* Agentic workflow deployment studio */`. Use compact horizontal workflow tabs above a straight five-stage pipeline. Remove all `nth-child` snake placement and rotated connectors. No meaningful label may be below 10px; stage headings target 14–16px and body copy 11–13px. At tablet width allow stage overflow inside the canvas only; at `max-width: 760px`, render the same stages vertically with downward decorative connectors. Use `aria-current="step"` and `aria-pressed` on workflow selection.

- [ ] **Step 6: Verify component contracts, types, and lint**

Run: `npm run brain:mf:contracts && npx tsc --noEmit && npx eslint components/mf/mf-agent-workflow.tsx components/mf/demo-views.tsx`  
Expected: PASS.

- [ ] **Step 7: Commit the workflow canvas**

```bash
git add scripts/brain-mf-demo-contracts.mjs components/mf/mf-agent-workflow.tsx components/mf/demo-views.tsx app/mf/mf.css
git commit -m "feat(mf): rebuild the agent workflow pipeline"
```

### Task 7: Remove duplicate shell layers and harmonize retained panels

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Modify: `components/mf/mf-demo.tsx`
- Modify: `components/mf/mf-story-panels.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Write the failing shell contract**

Replace the old story-component export assertions with source assertions that `mf-demo.tsx` does not render `mf-main-story`, `ExecutiveValueBar`, `StoryRail`, or the hidden `mf-activity-rail`. Assert `mf-story-panels.tsx` still exports `ConnectedSourcesPanel`, `ControlledChangePanel`, `OutcomeComparisonPanel`, and `PilotProposalPanel`.

- [ ] **Step 2: Run the contract to verify it fails**

Run: `npm run brain:mf:contracts`  
Expected: FAIL because the persistent story layer still renders.

- [ ] **Step 3: Remove the duplicate and dead shell DOM**

Delete the `ExecutiveValueBar`/`StoryRail` import and `.mf-main-story` render from `mf-demo.tsx`. Remove the CSS-hidden activity/run rail and ribbon/risk markup together with now-unused imports and derived variables. Preserve project identity, navigation, role selector, language switch, deterministic demo controls, presenter lobby, and guided presenter overlay.

- [ ] **Step 4: Simplify the retained story panels**

Remove obsolete `ExecutiveValueBar`, `StoryRail`, `ObjectiveWorkflowPanel`, and `EmployeeObjectivePanel` exports. Keep connected sources, controlled change, outcome comparison, and pilot proposal. Convert the source registry from a full card grid to compact system rows with product badge, authority, freshness, and a disclosure for evidence details.

- [ ] **Step 5: Harmonize the CSS instead of appending another override layer**

Delete obsolete story, objective, employee-grid, activity-rail, and snake styles. Restyle retained `.mf-story-panel`, source registry, controlled truth, proof drawer, outcome, and pilot blocks with the existing light canvas tokens. Preserve the canonical shell override at the end of `mf.css` and update its existing breakpoints rather than adding a third cascade layer.

- [ ] **Step 6: Run contracts, type checking, and lint**

Run: `npm run brain:mf:contracts && npx tsc --noEmit && npm run lint`  
Expected: PASS with only previously known warnings, if any.

- [ ] **Step 7: Commit the shell cleanup**

```bash
git add scripts/brain-mf-demo-contracts.mjs components/mf/mf-demo.tsx components/mf/mf-story-panels.tsx app/mf/mf.css
git commit -m "refactor(mf): simplify the demo information hierarchy"
```

### Task 8: Full functional and visual verification

**Files:**
- Modify only if verification identifies a concrete defect in the files above.

- [ ] **Step 1: Run deterministic and authorization contracts**

Run:

```bash
npm run brain:mf:contracts
npm run brain:mf:preflight
npm run brain:mf:isolation
npm run brain:mf:acceptance
```

Expected: all MF contract, presenter readiness, role isolation, and end-to-end acceptance checks pass.

- [ ] **Step 2: Run static and production verification**

Run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: TypeScript and build PASS; lint has zero errors and no new warnings.

- [ ] **Step 3: Verify desktop presentation states**

Run the production app and inspect `/mf` at 1440×900 and 1180×820 for steps 0, 2, 3, 5, 6, 7, and 8. Check Project Today, My Team, Work with Urso, Change & Approval, and the presenter lobby. Confirm no duplicated dominant status layer, overlapping controls, clipped action, page-level horizontal overflow, or text below the approved readable scale.

- [ ] **Step 4: Verify tablet and mobile behavior**

Inspect at 980×1000, 760×1000, and 390×844. Confirm manager order remains briefing → pulse → decision → queue → unlocks; team rows and decision rail stack; workflow stages become a numbered vertical sequence; source details remain operable; focus targets and status labels remain visible.

- [ ] **Step 5: Verify role scoping and workflow switching**

Switch through Project Manager, Electrical, BIM, Planning, and Quality. Confirm each role-delivery strip contains only authorized sources and next actions, Electrical never receives the project schedule, workflow selection resets safely when role context changes, and no official-output copy implies automatic issuance.

- [ ] **Step 6: Inspect browser logs and reduced motion**

Confirm no console errors or hydration warnings. Enable reduced motion and verify the manager/workflow states remain legible without animation. Check buttons and selectors through keyboard focus and confirm state is never communicated by color alone.

- [ ] **Step 7: Commit final verification fixes**

```bash
git add components/mf lib/mf-demo app/mf/mf.css scripts/brain-mf-demo-contracts.mjs
git commit -m "fix(mf): polish responsive manager and workflow states"
```
