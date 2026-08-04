import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mfScenarioManifest } from "../lib/mf-demo/manifest.mjs";
import {
  createMfHarnessSnapshot,
  deriveMfControlTower,
  getMfRoleWorkspace,
  transitionMfHarness,
} from "../lib/mf-demo/harness-runtime.mjs";
import {
  deriveMfManagerQueue,
  deriveMfManagerWorkspace,
  deriveMfTeamCommand,
} from "../lib/mf-demo/manager-runtime.mjs";
import {
  consumeMfSessionUsage,
  createMfSessionRecord,
  hashMfSessionToken,
  selectMfSessionRole,
  transitionMfSessionRecord,
  verifyMfSessionToken,
} from "../lib/mf-demo/session-runtime.mjs";

assert.deepEqual(mfScenarioManifest.revisions.B, {
  footprintM: [18.4, 4.8],
  electricalKw: 420,
  chilledWaterKw: 118,
  operatingLoadKn: 146,
});
assert.deepEqual(mfScenarioManifest.revisions.C, {
  footprintM: [19.6, 5.1],
  electricalKw: 483,
  chilledWaterKw: 139,
  operatingLoadKn: 168,
});
assert.equal(mfScenarioManifest.outcome.exposureDays, 10);
assert.equal(mfScenarioManifest.outcome.recoveredDays, 8);
assert.equal(mfScenarioManifest.disciplines.length, 15);
assert.equal(mfScenarioManifest.disciplines.filter((discipline) => discipline.impacted).length, 10);

for (const source of mfScenarioManifest.sources) {
  assert(["live", "demo", "pilot"].includes(source.mode), `invalid source mode: ${source.id}`);
  assert(source.authorizedRoleIds.length > 0, `source has no authorized roles: ${source.id}`);
}

for (const task of mfScenarioManifest.workflow.tasks) {
  assert(
    mfScenarioManifest.roles.some((role) => role.id === task.ownerRoleId),
    `unknown task owner: ${task.ownerRoleId}`,
  );
  for (const dependency of task.dependsOn) {
    assert(
      mfScenarioManifest.workflow.tasks.some((candidate) => candidate.id === dependency),
      `unknown task dependency: ${task.id} -> ${dependency}`,
    );
  }
}

const managerActions = mfScenarioManifest.workflow.tasks
  .filter((task) => task.managerAction)
  .map((task) => task.managerAction);
assert.equal(new Set(managerActions.map((action) => action.id)).size, managerActions.length);
assert.deepEqual(managerActions.map((action) => action.id), ["DEC-042", "ACT-IMPACT", "SCN-003", "EXE-02"]);

const workflowTaskIds = new Set(mfScenarioManifest.workflow.tasks.map((task) => task.id));
assert.deepEqual(
  mfScenarioManifest.workflow.handoffStages.map((stage) => stage.id),
  ["truth", "bim", "technical", "gate", "release"],
);
for (const stage of mfScenarioManifest.workflow.handoffStages) {
  assert(stage.taskIds.every((taskId) => workflowTaskIds.has(taskId)), `unknown handoff task: ${stage.id}`);
}
assert(
  mfScenarioManifest.workflow.tasks
    .find((task) => task.id === "verify-gate")
    .dependsOn.includes("select-recovery-scenario"),
);

const validTechnologyIds = new Set(["slack", "cde", "revit", "primavera-p6", "teams", "urso-brain"]);
for (const source of mfScenarioManifest.sources) {
  assert(validTechnologyIds.has(source.technology.id), `invalid source technology: ${source.id}`);
}

const workflowIds = mfScenarioManifest.workflow.catalog.map((workflow) => workflow.id);
const runCodes = mfScenarioManifest.workflow.catalog.map((workflow) => workflow.runCode);
assert.equal(new Set(workflowIds).size, workflowIds.length);
assert.equal(new Set(runCodes).size, runCodes.length);
assert.deepEqual(
  mfScenarioManifest.workflow.catalog.map(({ id, runCode }) => ({ id, runCode })),
  [
    { id: "coordinate-project-change", runCode: "WF-REV-C-001" },
    { id: "update-electrical-package", runCode: "WF-ELE-008" },
    { id: "prepare-bim-coordination", runCode: "WF-BIM-014" },
    { id: "recover-project-schedule", runCode: "WF-PLN-021" },
    { id: "verify-gate-readiness", runCode: "WF-QLT-002" },
  ],
);
for (const workflow of mfScenarioManifest.workflow.catalog) {
  assert(mfScenarioManifest.roles.some((role) => role.id === workflow.ownerRoleId), `unknown workflow owner: ${workflow.id}`);
  assert(workflow.sourceIds.every((sourceId) => mfScenarioManifest.sources.some((source) => source.id === sourceId)));
  assert(workflow.gate && workflowTaskIds.has(workflow.gate.taskId), `unknown workflow gate task: ${workflow.id}`);
  assert(mfScenarioManifest.roles.some((role) => role.id === workflow.gate.roleId), `unknown workflow gate role: ${workflow.id}`);
  assert(workflow.gate.evidenceSourceIds.every((sourceId) => mfScenarioManifest.sources.some((source) => source.id === sourceId)));
  assert(workflow.gate.affectedRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId)));
  assert(workflow.outputs.every((output) => output.recipientRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId))));
  assert(workflow.deliveryRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId)));
  assert(workflow.agents.every((agent) => ["read", "query", "draft", "write"].includes(agent.tool.permission)));
  assert(workflow.agents.every((agent) => agent.tool.permission !== "write"), "pre-gate agents must not write");
}
assert.deepEqual(
  mfScenarioManifest.workflow.catalog
    .find((workflow) => workflow.id === "coordinate-project-change")
    .sourceIds.map((sourceId) => mfScenarioManifest.sources.find((source) => source.id === sourceId).technology.id),
  ["slack", "cde", "revit", "primavera-p6", "teams"],
);

const truthConsumers = [
  "../lib/mf-demo/fixtures.ts",
  "../components/mf/demo-views.tsx",
  "../components/mf/artifact-workspace.tsx",
  "../components/mf/mf-language.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
for (const contradiction of ["640 kW", "736 kW", "496 kW", "recupera 7 dias", "recovers 7 days"]) {
  assert(!truthConsumers.includes(contradiction), `demo contains contradictory truth: ${contradiction}`);
}

const baseline = createMfHarnessSnapshot(0);
assert.equal(baseline.truth.currentRevision, "B");
assert.equal(baseline.truth.revisionB, "current");
assert.equal(baseline.truth.revisionC, "unresolved");
assert.equal(baseline.decision.status, "pending");
const taskStateAt = (step, taskId) => createMfHarnessSnapshot(step).workItems
  .find((task) => task.id === taskId)
  .state;
for (const [actionId, taskId, step, expectedState] of [
  ["DEC-042", "approve-controlled-truth", 0, "blocked"],
  ["DEC-042", "approve-controlled-truth", 2, "in_progress"],
  ["DEC-042", "approve-controlled-truth", 3, "complete"],
  ["ACT-IMPACT", "map-impact", 3, "in_progress"],
  ["ACT-IMPACT", "map-impact", 4, "complete"],
  ["SCN-003", "select-recovery-scenario", 6, "in_progress"],
  ["SCN-003", "select-recovery-scenario", 7, "complete"],
  ["EXE-02", "release-exe-02", 7, "in_progress"],
  ["EXE-02", "release-exe-02", 8, "complete"],
]) {
  assert.equal(taskStateAt(step, taskId), expectedState, `${actionId} at step ${step}`);
}

const approved = transitionMfHarness(baseline, 3, "approve-3", "project-manager");
assert.equal(approved.truth.currentRevision, "C");
assert.equal(approved.truth.revisionB, "superseded");
assert.equal(approved.truth.revisionC, "current");
assert.equal(approved.decision.status, "approved");
assert.equal(approved.receipts.length, 1);
assert.deepEqual(transitionMfHarness(approved, 3, "approve-3", "project-manager"), approved);

const rewound = transitionMfHarness(approved, 2, "rewind-2", "project-manager");
assert.equal(rewound.truth.currentRevision, "B");
assert.equal(rewound.decision.status, "pending");

const execution = createMfHarnessSnapshot(6);
const electrical = getMfRoleWorkspace(execution, "electrical");
assert(electrical.tasks.length > 0);
assert(electrical.tasks.every((task) => task.ownerRoleId === "electrical"));
assert(electrical.sources.every((source) => source.authorizedRoleIds.includes("electrical")));
assert(!electrical.sources.some((source) => source.id === "project-schedule"));

const release = createMfHarnessSnapshot(8);
const tower = deriveMfControlTower(release);
assert.equal(tower.impactedDisciplines, 10);
assert.equal(tower.openBlockers, 0);
assert.equal(tower.daysRecovered, 8);
assert.equal(tower.releaseReadiness, 100);

const queueAtStep2 = deriveMfManagerQueue(createMfHarnessSnapshot(2));
assert.deepEqual(queueAtStep2.now.map((item) => item.taskId), ["approve-controlled-truth"]);
assert.deepEqual(queueAtStep2.next.map((item) => item.taskId), ["map-impact", "select-recovery-scenario"]);
assert.deepEqual(queueAtStep2.waitingOnTeam.map((item) => item.actionId), ["EXE-02"]);
assert.deepEqual(queueAtStep2.decisionsRequiringAction.map((item) => item.actionId), ["DEC-042"]);
const releaseAtStep2 = queueAtStep2.waitingOnTeam[0];
assert.deepEqual(releaseAtStep2.blockingRoleIds, ["quality", "electrical", "bim", "planning"]);
assert.equal(releaseAtStep2.blockingTeamCount, 4);
const shuffledStep2Snapshot = {
  ...createMfHarnessSnapshot(2),
  workItems: [...createMfHarnessSnapshot(2).workItems].reverse(),
};
assert.deepEqual(
  deriveMfManagerQueue(shuffledStep2Snapshot).next.map((item) => item.taskId),
  ["map-impact", "select-recovery-scenario"],
);
const cyclicStep2Snapshot = {
  ...createMfHarnessSnapshot(2),
  workItems: createMfHarnessSnapshot(2).workItems.map((task) => task.id === "verify-gate"
    ? { ...task, dependsOn: [...task.dependsOn, "release-exe-02"] }
    : task),
};
assert(!deriveMfManagerQueue(cyclicStep2Snapshot).waitingOnTeam[0].transitiveBlockerIds.includes("release-exe-02"));

const teamAtStep5 = deriveMfTeamCommand(createMfHarnessSnapshot(5));
assert.equal(teamAtStep5.teams.find((team) => team.roleId === "bim").state, "in_progress");
assert.equal(teamAtStep5.teams.find((team) => team.roleId === "planning").state, "in_progress");
assert.equal(teamAtStep5.teams.find((team) => team.roleId === "electrical").atRisk, true);
assert.equal(teamAtStep5.teams.find((team) => team.roleId === "quality").atRisk, true);
assert.deepEqual(teamAtStep5.handoffStages.map((stage) => stage.state), [
  "complete",
  "in_progress",
  "in_progress",
  "blocked",
  "blocked",
]);
const electricalInProgressAtStep5 = {
  ...createMfHarnessSnapshot(5),
  workItems: createMfHarnessSnapshot(5).workItems.map((task) => task.id === "update-electrical"
    ? { ...task, state: "in_progress" }
    : task),
};
assert.equal(
  deriveMfTeamCommand(electricalInProgressAtStep5).teams.find((team) => team.roleId === "electrical").atRisk,
  false,
);

const queueAtStep6 = deriveMfManagerQueue(createMfHarnessSnapshot(6));
assert.deepEqual(queueAtStep6.decisionsRequiringAction.map((item) => item.actionId), ["SCN-003"]);

const queueAtStep3 = deriveMfManagerQueue(createMfHarnessSnapshot(3));
assert.equal(queueAtStep3.actionRequiredCount, 1);

const queueAtStep7 = deriveMfManagerQueue(createMfHarnessSnapshot(7));
assert.equal(createMfHarnessSnapshot(7).workItems.find((task) => task.id === "verify-gate").state, "complete");
assert.equal(createMfHarnessSnapshot(7).workItems.find((task) => task.id === "release-exe-02").state, "in_progress");
assert.deepEqual(queueAtStep7.decisionsRequiringAction.map((item) => item.actionId), ["EXE-02"]);

const queueAtStep8 = deriveMfManagerQueue(release);
const workspaceAtStep8 = deriveMfManagerWorkspace(release);
assert.equal(queueAtStep8.actionRequiredCount, 0);
assert.equal(queueAtStep8.done.length, 4);
assert(workspaceAtStep8.team.handoffStages.every((stage) => stage.state === "complete"));

const rewoundManagerSnapshot = transitionMfHarness(createMfHarnessSnapshot(7), 2, "manager-rewind-2", "project-manager");
const rewoundManagerQueue = deriveMfManagerQueue(rewoundManagerSnapshot);
const rewoundManagerTeam = deriveMfTeamCommand(rewoundManagerSnapshot);
assert.deepEqual(rewoundManagerQueue.decisionsRequiringAction.map((item) => item.actionId), ["DEC-042"]);
assert.equal(rewoundManagerTeam.handoffStages.find((stage) => stage.id === "release").state, "blocked");

const token = "presenter-secret-token";
const session = createMfSessionRecord({
  id: "session-1",
  tokenHash: hashMfSessionToken(token),
  now: "2026-08-03T12:00:00.000Z",
});
assert(verifyMfSessionToken(session, token));
assert(!verifyMfSessionToken(session, "wrong-token"));
assert.equal(session.snapshot.step, 0);

const advancedSession = transitionMfSessionRecord(session, {
  expectedStep: 0,
  targetStep: 1,
  idempotencyKey: "session-1-step-1",
  roleId: "project-manager",
  now: "2026-08-03T12:01:00.000Z",
});
assert.equal(advancedSession.snapshot.step, 1);
assert.equal(advancedSession.version, 2);
assert.deepEqual(
  transitionMfSessionRecord(advancedSession, {
    expectedStep: 1,
    targetStep: 1,
    idempotencyKey: "session-1-step-1",
    roleId: "project-manager",
    now: "2026-08-03T12:02:00.000Z",
  }),
  advancedSession,
);
assert.throws(
  () => transitionMfSessionRecord(advancedSession, {
    expectedStep: 0,
    targetStep: 2,
    idempotencyKey: "stale-step",
    roleId: "project-manager",
    now: "2026-08-03T12:02:00.000Z",
  }),
  (error) => error.code === "stale_session",
);
assert.throws(
  () => transitionMfSessionRecord(advancedSession, {
    expectedStep: 1,
    targetStep: 2,
    idempotencyKey: "unknown-role",
    roleId: "director",
    now: "2026-08-03T12:02:00.000Z",
  }),
  (error) => error.code === "invalid_role",
);

let usageSession = session;
for (let index = 0; index < 10; index += 1) usageSession = consumeMfSessionUsage(usageSession, "chat", 10);
assert.throws(() => consumeMfSessionUsage(usageSession, "chat", 10), (error) => error.code === "usage_limit");
const electricalSession = selectMfSessionRole(advancedSession, "electrical", "2026-08-03T12:03:00.000Z");
assert.equal(electricalSession.selectedRoleId, "electrical");
assert.equal(electricalSession.snapshot.step, advancedSession.snapshot.step);

const scenarioRouteSource = readFileSync(new URL("../app/api/mf/brain/scenario/route.ts", import.meta.url), "utf8");
assert.match(scenarioRouteSource, /action\s*===\s*["']create["']/);
assert.match(scenarioRouteSource, /expectedStep/);
assert.match(scenarioRouteSource, /idempotencyKey/);
assert.match(scenarioRouteSource, /MfSessionContractError/);

const scenarioServerSource = readFileSync(new URL("../lib/mf-demo/scenario-server.ts", import.meta.url), "utf8");
assert.match(scenarioServerSource, /applyMfBrainScenarioState/);
assert.match(scenarioServerSource, /idempotencyKey/);
assert.match(scenarioServerSource, /demoSessionId/);
assert.doesNotMatch(scenarioServerSource, /normalizedStep\s*===\s*0/);
assert.doesNotMatch(scenarioServerSource, /normalizedStep\s*>=\s*3/);

const brainConfigSource = readFileSync(new URL("../lib/mf-demo/brain-config.ts", import.meta.url), "utf8");
assert.match(brainConfigSource, /isMfDemoRoleId/);
for (const routePath of [
  "../app/api/mf/brain/workspace/route.ts",
  "../app/api/mf/brain/chat/route.ts",
  "../app/api/mf/brain/threads/route.ts",
  "../app/api/mf/brain/learning/route.ts",
]) {
  const routeSource = readFileSync(new URL(routePath, import.meta.url), "utf8");
  assert.match(routeSource, /mfSessionCredentialsFromRequest/, `${routePath} does not require a demo session`);
}

const demoClientSource = readFileSync(new URL("../components/mf/mf-demo.tsx", import.meta.url), "utf8");
assert.doesNotMatch(demoClientSource, /void fetch\(["']\/api\/mf\/brain\/scenario/);
assert.match(demoClientSource, /sessionStorage/);
assert.match(demoClientSource, /expectedStep/);
assert.match(demoClientSource, /transitionError/);

const storyPanelSource = readFileSync(new URL("../components/mf/mf-story-panels.tsx", import.meta.url), "utf8");
for (const componentName of [
  "ExecutiveValueBar",
  "StoryRail",
  "ConnectedSourcesPanel",
  "ControlledChangePanel",
  "ObjectiveWorkflowPanel",
  "EmployeeObjectivePanel",
  "OutcomeComparisonPanel",
  "PilotProposalPanel",
]) {
  assert.match(storyPanelSource, new RegExp(`export function ${componentName}`));
}
for (const semanticLabel of [
  "Connection mode",
  "Authority",
  "Freshness",
  "Evidence",
  "Human gate",
  "Definition of done",
  "Approve the pilot, select the project, and nominate the team",
]) {
  assert(storyPanelSource.includes(semanticLabel), `missing story semantics: ${semanticLabel}`);
}

console.log("✓ MF manifest values, references, and impact contract are consistent.");
