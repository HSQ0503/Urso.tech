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
  deriveMfManagerCockpitPresentation,
  deriveMfManagerQueue,
  deriveMfManagerWorkspace,
  deriveMfTeamCommand,
} from "../lib/mf-demo/manager-runtime.mjs";
import {
  deriveMfWorkflowAccess,
  deriveMfWorkflowInteraction,
  deriveMfWorkflowPresentation,
} from "../lib/mf-demo/workflow-runtime.mjs";
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
  assert(
    workflow.gate.evidenceSourceIds.every((sourceId) => mfScenarioManifest.sources
      .find((source) => source.id === sourceId)
      .authorizedRoleIds.includes(workflow.gate.roleId)),
    `gate evidence is not authorized for gate role: ${workflow.id}`,
  );
  assert(workflow.gate.affectedRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId)));
  assert(workflow.outputs.every((output) => output.recipientRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId))));
  assert(workflow.deliveryRoleIds.every((roleId) => mfScenarioManifest.roles.some((role) => role.id === roleId)));
  assert(workflow.agents.every((agent) => ["read", "query", "draft", "write"].includes(agent.tool.permission)));
  assert(workflow.agents.every((agent) => agent.tool.permission !== "write"), "pre-gate agents must not write");
}
assert.deepEqual(
  mfScenarioManifest.workflow.catalog.flatMap((workflow) => workflow.outputs.map((output) => [
    `${workflow.id}:${output.id}`,
    output.availableAtStep,
  ])),
  [
    ["coordinate-project-change:decision-receipt", 3],
    ["coordinate-project-change:impact-plan", 4],
    ["coordinate-project-change:role-briefs", 5],
    ["update-electrical-package:electrical-package", 6],
    ["prepare-bim-coordination:bim-scaffold", 6],
    ["recover-project-schedule:recovery-scenarios", 6],
    ["verify-gate-readiness:exe-02-checklist", 7],
  ],
);
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

const managerCockpitPresentationTable = [
  [0, "DEC-042", "upcoming", null, ["receive-revision", "advance", null], ["baseline", 0, false]],
  [1, "DEC-042", "upcoming", null, ["inspect-revision", "advance", null], ["baseline", 0, false]],
  [2, "DEC-042", "actionable", "DEC-042", null, ["exposed", 10, false]],
  [3, "ACT-IMPACT", "actionable", "ACT-IMPACT", null, ["exposed", 10, false]],
  [4, "ACT-IMPACT", "completed", null, ["distribute-work", "advance", null], ["exposed", 10, false]],
  [5, "ACT-IMPACT", "completed", null, ["open-workflow", "navigate", "workflows"], ["exposed", 10, false]],
  [6, "SCN-003", "actionable", "SCN-003", ["open-recovery-workflow", "navigate", "workflows"], ["recovery_proposed", 8, true]],
  [7, "EXE-02", "actionable", "EXE-02", ["review-outputs", "navigate", "artifacts"], ["recovery_selected", 8, false]],
  [8, "EXE-02", "completed", null, null, ["protected", 8, false]],
];
for (const [step, featuredActionId, actionPlacement, primaryActionId, scenarioControl, milestone] of managerCockpitPresentationTable) {
  const cockpitSnapshot = createMfHarnessSnapshot(step);
  const presentation = deriveMfManagerCockpitPresentation(cockpitSnapshot);
  const actionableQueueIds = deriveMfManagerQueue(cockpitSnapshot).now.map((item) => item.actionId);
  assert.equal(presentation.featuredManagerAction.actionId, featuredActionId, `featured action at step ${step}`);
  assert.equal(presentation.consistent, true, `cockpit consistency at step ${step}`);
  assert.equal(presentation.managerActionPlacement, actionPlacement, `action placement at step ${step}`);
  assert.equal(presentation.primaryManagerAction?.actionId ?? null, primaryActionId, `primary action at step ${step}`);
  assert.deepEqual(actionableQueueIds, primaryActionId ? [primaryActionId] : [], `actionable queue at step ${step}`);
  assert.deepEqual(
    presentation.scenarioControl
      ? [presentation.scenarioControl.id, presentation.scenarioControl.kind, presentation.scenarioControl.targetView]
      : null,
    scenarioControl,
    `scenario control at step ${step}`,
  );
  assert.deepEqual(
    [presentation.milestone.status, presentation.milestone.days, presentation.milestone.selectionRequired],
    milestone,
    `milestone at step ${step}`,
  );
  if (presentation.primaryManagerAction) {
    assert.equal(presentation.primaryManagerAction.lane, "now");
    assert(["ready", "in_progress"].includes(presentation.primaryManagerAction.state));
  }
}

const step4ActionStillRunning = {
  ...createMfHarnessSnapshot(4),
  workItems: createMfHarnessSnapshot(4).workItems.map((task) => task.id === "map-impact"
    ? { ...task, state: "in_progress", receiptId: null }
    : task),
};
const driftedStep4Cockpit = deriveMfManagerCockpitPresentation(step4ActionStillRunning);
assert.equal(driftedStep4Cockpit.consistent, false);
assert.equal(driftedStep4Cockpit.featuredManagerAction, null);
assert.equal(driftedStep4Cockpit.primaryManagerAction, null);
assert.equal(driftedStep4Cockpit.scenarioControl, null);

const step4MissingFeaturedAction = {
  ...createMfHarnessSnapshot(4),
  workItems: createMfHarnessSnapshot(4).workItems.map((task) => task.id === "map-impact"
    ? { ...task, managerAction: null }
    : task),
};
const missingFeaturedCockpit = deriveMfManagerCockpitPresentation(step4MissingFeaturedAction);
assert.equal(missingFeaturedCockpit.consistent, false);
assert.equal(missingFeaturedCockpit.featuredManagerAction, null);
assert.equal(missingFeaturedCockpit.scenarioControl, null);

const step3ExtraActionableItem = {
  ...createMfHarnessSnapshot(3),
  workItems: createMfHarnessSnapshot(3).workItems.map((task) => task.id === "approve-controlled-truth"
    ? { ...task, state: "in_progress", receiptId: null }
    : task),
};
const extraActionableCockpit = deriveMfManagerCockpitPresentation(step3ExtraActionableItem);
assert.equal(extraActionableCockpit.consistent, false);
assert.equal(extraActionableCockpit.primaryManagerAction, null);
assert.equal(extraActionableCockpit.scenarioControl, null);

const coordinateWorkflow = mfScenarioManifest.workflow.catalog.find(
  (workflow) => workflow.id === "coordinate-project-change",
);
const coordinateAtStep2 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(2), coordinateWorkflow.id);
assert.equal(coordinateAtStep2.definition, coordinateWorkflow);
assert.deepEqual(coordinateAtStep2.stages.map((stage) => stage.id), [
  "connected_context",
  "brain_boundary",
  "agents_tools",
  "human_gate",
  "controlled_outputs",
]);
assert.equal(coordinateAtStep2.truth.currentRevision, "B");
assert.equal(coordinateAtStep2.truth.revisionC, "unresolved");
assert.equal(coordinateAtStep2.gate.state, "in_progress");
assert.equal(coordinateAtStep2.gate.task.id, "approve-controlled-truth");
assert.equal(coordinateAtStep2.gate.role.id, "project-manager");
assert.deepEqual(
  coordinateAtStep2.gate.evidenceSources.map((source) => source.id),
  coordinateWorkflow.gate.evidenceSourceIds,
);
assert.equal(coordinateAtStep2.gate.evidenceCount, coordinateWorkflow.gate.evidenceSourceIds.length);
assert.equal(coordinateAtStep2.gate.affectedRoleCount, coordinateWorkflow.gate.affectedRoleIds.length);
assert.equal(coordinateAtStep2.outputsReady, false);
assert.deepEqual(
  coordinateAtStep2.sources.map((source) => source.technology.id),
  ["slack", "cde", "revit", "primavera-p6", "teams"],
);
assert(coordinateAtStep2.sources.every((source) => source.authorizedRoleIds.includes(coordinateWorkflow.ownerRoleId)));

const divergentSourceSnapshot = {
  ...createMfHarnessSnapshot(2),
  sources: createMfHarnessSnapshot(2).sources.map((source) => source.id === "supplier-communication"
    ? {
      ...source,
      name: { pt: "Divergent source", en: "Divergent source" },
      authorizedRoleIds: [],
      status: "available_in_pilot",
    }
    : source),
};
const canonicalSourcePresentation = deriveMfWorkflowPresentation(divergentSourceSnapshot, coordinateWorkflow.id);
const canonicalSupplierSource = mfScenarioManifest.sources.find((source) => source.id === "supplier-communication");
assert.deepEqual(
  canonicalSourcePresentation.sources.find((source) => source.id === canonicalSupplierSource.id),
  { ...canonicalSupplierSource, status: "available_in_pilot" },
);
assert(canonicalSourcePresentation.roleDeliveries
  .find((delivery) => delivery.role.id === "project-manager")
  .sources.some((source) => source.id === canonicalSupplierSource.id));

const coordinateAtStep3 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(3), coordinateWorkflow.id);
assert.equal(coordinateAtStep3.gate.state, "complete");
assert.equal(coordinateAtStep3.truth.currentRevision, "C");
const coordinateAtStep4 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(4), coordinateWorkflow.id);

const coordinateAtStep5 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(5), coordinateWorkflow.id);
assert(coordinateAtStep5.roleDeliveries.every((delivery) =>
  delivery.sources.every((source) => source.authorizedRoleIds.includes(delivery.role.id)),
));
assert(!coordinateAtStep5.roleDeliveries.find((delivery) => delivery.role.id === "electrical")
  .sources.some((source) => source.id === "project-schedule"));
for (const delivery of coordinateAtStep5.roleDeliveries) {
  assert(delivery.role && delivery.objective && delivery.nextAction !== undefined && delivery.deliverable);
  assert.equal(typeof delivery.openActionCount, "number");
  assert.equal(typeof delivery.sourceCount, "number");
}
assert.deepEqual(
  [coordinateAtStep2, coordinateAtStep3, coordinateAtStep4, coordinateAtStep5].map((presentation) => ({
    step: [coordinateAtStep2, coordinateAtStep3, coordinateAtStep4, coordinateAtStep5].indexOf(presentation) + 2,
    outputsReady: presentation.outputsReady,
    outputs: presentation.outputs.map((output) => [output.id, output.ready, output.receipt.state]),
  })),
  [
    { step: 2, outputsReady: false, outputs: [["decision-receipt", false, "pending"], ["impact-plan", false, "pending"], ["role-briefs", false, "pending"]] },
    { step: 3, outputsReady: false, outputs: [["decision-receipt", true, "available"], ["impact-plan", false, "pending"], ["role-briefs", false, "pending"]] },
    { step: 4, outputsReady: false, outputs: [["decision-receipt", true, "available"], ["impact-plan", true, "available"], ["role-briefs", false, "pending"]] },
    { step: 5, outputsReady: true, outputs: [["decision-receipt", true, "available"], ["impact-plan", true, "available"], ["role-briefs", true, "available"]] },
  ],
);

for (const workflowId of ["update-electrical-package", "recover-project-schedule"]) {
  const draftAtStep6 = deriveMfWorkflowPresentation(createMfHarnessSnapshot(6), workflowId);
  assert.equal(draftAtStep6.gate.state, "in_progress");
  assert.equal(draftAtStep6.outputsReady, true);
  assert(draftAtStep6.outputs.every((output) => output.ready && output.receipt.state === "pending"));
}

const coordinateAtStep8 = deriveMfWorkflowPresentation(release, coordinateWorkflow.id);
assert.equal(coordinateAtStep8.outputsReady, true);
assert.equal(coordinateAtStep8.gate.state, "complete");
assert.deepEqual(coordinateAtStep8.outputs.map((output) => output.id), coordinateWorkflow.outputs.map((output) => output.id));
assert(coordinateAtStep8.outputs.every((output) => output.ready && output.receipt.state === "available" && output.receipt.id));

const completedWithoutTaskReceipt = {
  ...createMfHarnessSnapshot(3),
  workItems: createMfHarnessSnapshot(3).workItems.map((task) => task.id === "approve-controlled-truth"
    ? { ...task, receiptId: null }
    : task),
  receipts: [{
    id: "RCPT-UNRELATED-TRANSITION",
    idempotencyKey: "unrelated-transition",
    actorRoleId: "project-manager",
    action: "scenario_advance",
    fromStep: 2,
    toStep: 3,
    evidenceIds: [],
  }],
};
const missingGateReceipt = deriveMfWorkflowPresentation(completedWithoutTaskReceipt, coordinateWorkflow.id);
assert.equal(missingGateReceipt.gate.receiptId, null);
assert.deepEqual(
  missingGateReceipt.outputs.map((output) => [output.id, output.ready, output.receipt.state]),
  [["decision-receipt", true, "missing"], ["impact-plan", false, "pending"], ["role-briefs", false, "pending"]],
);

const workflowPresentationSteps = {
  "coordinate-project-change": 2,
  "update-electrical-package": 7,
  "prepare-bim-coordination": 6,
  "recover-project-schedule": 7,
  "verify-gate-readiness": 7,
};
for (const workflow of mfScenarioManifest.workflow.catalog) {
  const presentation = deriveMfWorkflowPresentation(createMfHarnessSnapshot(workflowPresentationSteps[workflow.id]), workflow.id);
  assert.equal(presentation.definition, workflow);
  assert(presentation.gate.evidenceSources.every((source) => source.authorizedRoleIds.includes(presentation.gate.role.id)));
  assert(presentation.roleDeliveries.every((delivery) =>
    delivery.sources.every((source) => source.authorizedRoleIds.includes(delivery.role.id)),
  ));
  assert.equal(presentation.outputsReady, presentation.outputs.every((output) => output.ready));
  assert.deepEqual(presentation.outputs.map((output) => output.id), workflow.outputs.map((output) => output.id));
  assert(presentation.outputs.every((output) => output.ready
    ? presentation.gate.state === "complete"
      ? output.receipt.state === "available" && output.receipt.id === presentation.gate.task.receiptId
      : output.receipt.state === "pending" && output.receipt.id === null
    : output.receipt.state === "pending" && output.receipt.id === null));
}

const catalogWorkflowIds = mfScenarioManifest.workflow.catalog.map((workflow) => workflow.id);
const projectManagerWorkflowAccess = deriveMfWorkflowAccess("project-manager");
assert.deepEqual(projectManagerWorkflowAccess.workflowIds, catalogWorkflowIds);
assert.equal(projectManagerWorkflowAccess.defaultWorkflowId, "coordinate-project-change");
for (const [roleId, workflowId] of [
  ["electrical", "update-electrical-package"],
  ["bim", "prepare-bim-coordination"],
  ["planning", "recover-project-schedule"],
  ["quality", "verify-gate-readiness"],
]) {
  const access = deriveMfWorkflowAccess(roleId);
  assert.deepEqual(access.workflowIds, [workflowId]);
  assert.deepEqual(access.workflows.map((workflow) => workflow.id), [workflowId]);
  assert.equal(access.defaultWorkflowId, workflowId);
}
assert.deepEqual(deriveMfWorkflowAccess("unknown-role"), {
  viewerRoleId: "unknown-role",
  workflows: [],
  workflowIds: [],
  defaultWorkflowId: null,
});

const interactionFor = (step, workflowId, viewerRoleId, snapshotOverride) => deriveMfWorkflowInteraction(
  deriveMfWorkflowPresentation(snapshotOverride ?? createMfHarnessSnapshot(step), workflowId),
  viewerRoleId,
);
for (const scenario of [
  { step: 0, workflowId: "coordinate-project-change", roleId: "project-manager", current: "brain_boundary", canAdvance: false, action: "waiting", terminal: false },
  { step: 2, workflowId: "coordinate-project-change", roleId: "project-manager", current: "human_gate", canAdvance: true, action: "advance", terminal: false },
  { step: 2, workflowId: "coordinate-project-change", roleId: "electrical", current: "human_gate", canAdvance: false, action: "unauthorized", terminal: false },
  { step: 3, workflowId: "coordinate-project-change", roleId: "project-manager", current: "controlled_outputs", canAdvance: false, action: "outputs_pending", terminal: false },
  { step: 5, workflowId: "coordinate-project-change", roleId: "project-manager", current: null, canAdvance: false, action: "complete", terminal: true },
  { step: 4, workflowId: "prepare-bim-coordination", roleId: "bim", current: "agents_tools", canAdvance: true, action: "advance", terminal: false },
  { step: 5, workflowId: "prepare-bim-coordination", roleId: "bim", current: "agents_tools", canAdvance: true, action: "advance", terminal: false },
  { step: 6, workflowId: "update-electrical-package", roleId: "electrical", current: "human_gate", canAdvance: true, action: "advance", terminal: false },
  { step: 6, workflowId: "update-electrical-package", roleId: "project-manager", current: "human_gate", canAdvance: false, action: "unauthorized", terminal: false },
  { step: 6, workflowId: "recover-project-schedule", roleId: "project-manager", current: "human_gate", canAdvance: true, action: "advance", terminal: false },
  { step: 6, workflowId: "recover-project-schedule", roleId: "planning", current: "human_gate", canAdvance: false, action: "unauthorized", terminal: false },
  { step: 6, workflowId: "verify-gate-readiness", roleId: "quality", current: "brain_boundary", canAdvance: false, action: "waiting", terminal: false },
  { step: 7, workflowId: "verify-gate-readiness", roleId: "quality", current: null, canAdvance: false, action: "complete", terminal: true },
]) {
  const interaction = interactionFor(scenario.step, scenario.workflowId, scenario.roleId);
  assert.equal(interaction.currentStageId, scenario.current, `${scenario.workflowId} current stage at ${scenario.step}`);
  assert.equal(interaction.canAdvance, scenario.canAdvance, `${scenario.workflowId} advance at ${scenario.step}`);
  assert.equal(interaction.action.id, scenario.action, `${scenario.workflowId} action at ${scenario.step}`);
  assert.equal(interaction.terminal, scenario.terminal, `${scenario.workflowId} terminal at ${scenario.step}`);
  assert.equal(interaction.stages.filter((stage) => stage.state === "current").length, scenario.current ? 1 : 0);
  if (scenario.terminal) assert(interaction.stages.every((stage) => stage.state === "complete"));
}

const coordinateStep2ManagerInteraction = interactionFor(2, "coordinate-project-change", "project-manager");
assert.deepEqual(
  coordinateStep2ManagerInteraction.action.label,
  coordinateAtStep2.gate.task.managerAction.label,
);
const bimStep4Presentation = deriveMfWorkflowPresentation(createMfHarnessSnapshot(4), "prepare-bim-coordination");
assert.deepEqual(
  deriveMfWorkflowInteraction(bimStep4Presentation, "bim").action.label,
  bimStep4Presentation.gate.task.title,
);

const step5WithoutGateReceipt = {
  ...createMfHarnessSnapshot(5),
  workItems: createMfHarnessSnapshot(5).workItems.map((task) => task.id === "approve-controlled-truth"
    ? { ...task, receiptId: null }
    : task),
};
const missingReceiptInteraction = interactionFor(
  5,
  "coordinate-project-change",
  "project-manager",
  step5WithoutGateReceipt,
);
assert.equal(missingReceiptInteraction.terminal, false);
assert.equal(missingReceiptInteraction.canAdvance, false);
assert.equal(missingReceiptInteraction.currentStageId, "controlled_outputs");
assert.equal(missingReceiptInteraction.action.id, "receipt_missing");
assert.deepEqual(missingReceiptInteraction.stages.map((stage) => stage.state), [
  "complete",
  "complete",
  "complete",
  "complete",
  "current",
]);

assert.throws(
  () => deriveMfWorkflowPresentation(createMfHarnessSnapshot(0), "unknown-workflow"),
  /unknown MF workflow: unknown-workflow/,
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const frozenSnapshot = deepFreeze(createMfHarnessSnapshot(2));
const manifestBeforePresentation = JSON.stringify(mfScenarioManifest);
const snapshotBeforePresentation = JSON.stringify(frozenSnapshot);
assert.doesNotThrow(() => deriveMfWorkflowPresentation(frozenSnapshot, coordinateWorkflow.id));
assert.equal(JSON.stringify(mfScenarioManifest), manifestBeforePresentation);
assert.equal(JSON.stringify(frozenSnapshot), snapshotBeforePresentation);

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

const managerWorkspaceSource = readFileSync(
  new URL("../components/mf/mf-manager-workspace.tsx", import.meta.url),
  "utf8",
);
assert.match(managerWorkspaceSource, /export function MfManagerWorkspace/);
assert.match(managerWorkspaceSource, /export type MfManagerWorkspaceProps/);
assert.match(
  managerWorkspaceSource,
  /export function MfManagerWorkspace\(props: MfManagerWorkspaceProps\): React\.JSX\.Element/,
);
assert.match(managerWorkspaceSource, /deriveMfManagerWorkspace/);
assert.doesNotMatch(managerWorkspaceSource, /\breturn null\b/);
for (const semanticLabel of [
  "Manager briefing",
  "Decisions requiring you",
  "My queue",
  "Waiting on team",
  "What happens next",
]) {
  assert(managerWorkspaceSource.includes(semanticLabel), `missing manager workspace semantics: ${semanticLabel}`);
}
assert.match(managerWorkspaceSource, /data-guide-key=["']project-status["']/);
assert.match(managerWorkspaceSource, /<button[^>]+onClick=\{\(\) => onNavigate\(["']changes["']\)\}/);
assert.match(managerWorkspaceSource, /<button[^>]+onClick=\{onAdvance\}[^>]*disabled=/);
assert.match(managerWorkspaceSource, /<button[^>]+onClick=\{\(\) => onNavigate\(/);
const managerFallbackSource = managerWorkspaceSource.match(
  /if \(!primaryAction\)[\s\S]*?(?=\n  const primaryTask)/,
)?.[0] ?? "";
assert.match(managerFallbackSource, /data-manager-fallback/);
assert.match(managerFallbackSource, /data-guide-key=["']project-status["']/);
assert.match(managerFallbackSource, /<button[^>]+disabled/);

const managerPulseSource = managerWorkspaceSource.match(
  /<section className=["']mf-manager-pulse["'][\s\S]*?<\/section>/,
)?.[0] ?? "";
const managerPulseCards = [...managerPulseSource.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(managerPulseCards.length, 3);
for (const [, pulseCard] of managerPulseCards) {
  assert.equal(pulseCard.match(/data-pulse-value/g)?.length, 1, "each manager pulse card must expose one value");
}
assert.match(
  managerPulseCards[0][1],
  /<strong data-pulse-value>\{workspace\.queue\.decisionsRequiringAction\.length\}<\/strong>/,
);
assert.equal(managerPulseCards[0][1].match(/\.length/g)?.length, 1);
assert.match(managerPulseCards[0][1], /<span>\{managerDecisionStatus\}<\/span>/);
assert(managerWorkspaceSource.includes("Pilot work packages are ready for the current execution roles"));
assert.match(managerWorkspaceSource, /deriveMfManagerCockpitPresentation/);
assert.match(managerWorkspaceSource, /data-manager-action-cta/);
assert.match(managerWorkspaceSource, /data-scenario-control/);

const teamCommandSource = readFileSync(
  new URL("../components/mf/mf-team-command.tsx", import.meta.url),
  "utf8",
);
assert.match(teamCommandSource, /export type MfTeamCommandProps/);
assert.match(teamCommandSource, /export function MfTeamCommand\(props: MfTeamCommandProps\): React\.JSX\.Element/);
assert.match(teamCommandSource, /deriveMfTeamCommand/);
assert.match(teamCommandSource, /deriveMfManager(?:Queue|Workspace)/);
assert.match(teamCommandSource, /getMfRoleWorkspace/);
assert.doesNotMatch(teamCommandSource, /\buseState\b/);
for (const semanticLabel of [
  "Work by discipline",
  "Manager attention",
  "Critical handoff chain",
  "Full 15-discipline map",
]) {
  assert(teamCommandSource.includes(semanticLabel), `missing team command semantics: ${semanticLabel}`);
}
assert.match(teamCommandSource, /data-guide-key=["']role-work["']/);
assert.match(teamCommandSource, /<details/);
assert.match(teamCommandSource, /const managerCommand = \(/);
assert.match(teamCommandSource, /const roleBrief = \(/);
assert.match(teamCommandSource, /\{isManager \? managerCommand : roleBrief\}/);
assert.match(teamCommandSource, /roleWorkspace\.role\.deliverable/);
assert.match(teamCommandSource, /action\.actionId === ["']ACT-IMPACT["'][\s\S]*?view: ["']changes["']/);
assert.match(teamCommandSource, /const impactsAreControlled = snapshot\.step >= 4/);
assert.match(teamCommandSource, /const roleTask = nextRoleTask;/);
assert.doesNotMatch(teamCommandSource, /nextRoleTask \?\? selectedTeam\?\.currentTask/);
assert.match(teamCommandSource, /const visibleTeams = impactsAreControlled/);
assert.match(teamCommandSource, /role\.id !== ["']project-manager["']/);
assert.match(teamCommandSource, /discipline\.impacted/);
assert.doesNotMatch(teamCommandSource, /\{pilotTeams\.map/);

const agentWorkflowSource = readFileSync(
  new URL("../components/mf/mf-agent-workflow.tsx", import.meta.url),
  "utf8",
);
assert.match(agentWorkflowSource, /export type MfAgentWorkflowProps/);
for (const propName of [
  "snapshot",
  "viewerRoleId",
  "selectedWorkflowId",
  "onSelectWorkflow",
  "onAdvance",
  "onOpenOutputs",
]) {
  assert.match(agentWorkflowSource, new RegExp(`\\b${propName}:`), `missing agent workflow prop: ${propName}`);
}
assert.match(
  agentWorkflowSource,
  /export function MfAgentWorkflow\(props: MfAgentWorkflowProps\): React\.JSX\.Element/,
);
for (const selectorName of [
  "deriveMfWorkflowAccess",
  "deriveMfWorkflowInteraction",
  "deriveMfWorkflowPresentation",
]) {
  assert.match(agentWorkflowSource, new RegExp(`\\b${selectorName}\\b`), `missing workflow selector: ${selectorName}`);
}
assert.doesNotMatch(agentWorkflowSource, /snapshot\.step/);
assert.doesNotMatch(agentWorkflowSource, /Ready for decision/);
assert.match(agentWorkflowSource, /accepted current truth/);
assert.doesNotMatch(agentWorkflowSource, /accepted with a recorded receipt/);
assert.match(agentWorkflowSource, /if \(!interaction\.canAdvance\) return;/);
assert.match(agentWorkflowSource, /source\.status/);
assert.match(agentWorkflowSource, /output\.receipt\.state/);
for (const truthLabel of ["Connected", "Available in pilot", "Recorded", "Pending", "Missing"]) {
  assert(agentWorkflowSource.includes(truthLabel), `missing workflow truth label: ${truthLabel}`);
}
for (const semanticLabel of [
  "Connected context",
  "Brain boundary",
  "Agents + tools",
  "Human gate",
  "Controlled outputs",
  "Everything returns to the Brain",
  "What each employee receives",
]) {
  assert(agentWorkflowSource.includes(semanticLabel), `missing agent workflow semantics: ${semanticLabel}`);
}

const mfCssSource = readFileSync(new URL("../app/mf/mf.css", import.meta.url), "utf8");
assert.doesNotMatch(mfCssSource, /\.mf-team-row-owner\s*\{\s*display:\s*none;\s*\}/);
assert.doesNotMatch(mfCssSource, /Agentic workflow deployment studio/);
assert.doesNotMatch(mfCssSource, /\.mf-agentic-map\s*>\s*:nth-child/);
assert.match(mfCssSource, /\/\* Agent workflow canvas \*\//);
assert.match(mfCssSource, /\.mf-source-connection-status/);
assert.match(mfCssSource, /\.mf-receipt-status/);

const demoViewsSource = readFileSync(new URL("../components/mf/demo-views.tsx", import.meta.url), "utf8");
assert.match(demoViewsSource, /import \{ MfManagerWorkspace \} from ["']\.\/mf-manager-workspace["']/);
assert.match(demoViewsSource, /import \{ MfTeamCommand \} from ["']\.\/mf-team-command["']/);
const controlTowerViewSource = demoViewsSource.match(
  /export function ControlTowerView[\s\S]*?(?=\nexport function ChangesView)/,
)?.[0] ?? "";
assert.match(controlTowerViewSource, /<MfManagerWorkspace/);
for (const duplicateClassName of [
  "mf-truth-path",
  "mf-role-focus-card",
  "mf-release-card",
  "mf-what-urso-does",
]) {
  assert(!controlTowerViewSource.includes(duplicateClassName), `legacy ControlTower class remains: ${duplicateClassName}`);
}

const disciplinesViewSource = demoViewsSource.match(
  /export function DisciplinesView[\s\S]*?(?=\nexport function WorkflowsView)/,
)?.[0] ?? "";
assert.match(disciplinesViewSource, /<MfTeamCommand/);
for (const legacyTeamSurface of [
  "EmployeeObjectivePanel",
  "mf-role-brief",
  "mf-team-map",
]) {
  assert(!disciplinesViewSource.includes(legacyTeamSurface), `legacy DisciplinesView surface remains: ${legacyTeamSurface}`);
}

const workflowsViewSource = demoViewsSource.match(
  /export function WorkflowsView[\s\S]*?(?=\nfunction BimScaffold)/,
)?.[0] ?? "";
assert.match(demoViewsSource, /import \{ MfAgentWorkflow \} from ["']\.\/mf-agent-workflow["']/);
assert.match(workflowsViewSource, /<MfAgentWorkflow/);
assert.match(workflowsViewSource, /viewerRoleId=\{roleId\}/);
assert.doesNotMatch(workflowsViewSource, /ObjectiveWorkflowPanel/);
assert.doesNotMatch(workflowsViewSource, /workflowCatalog|selectedAgents|selectedTools|stageClass|mf-agentic-map/);

console.log("✓ MF manifest values, references, and impact contract are consistent.");
