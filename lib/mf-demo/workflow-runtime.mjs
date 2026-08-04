import { getMfRoleWorkspace } from "./harness-runtime.mjs";
import { mfScenarioManifest } from "./manifest.mjs";

const stageIds = Object.freeze([
  "connected_context",
  "brain_boundary",
  "agents_tools",
  "human_gate",
  "controlled_outputs",
]);

function configuredReference(items, id, kind, workflowId) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`MF workflow ${workflowId} references unknown ${kind}: ${id}`);
  return item;
}

function snapshotReference(items, id, kind, workflowId) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`MF workflow ${workflowId} is missing snapshot ${kind}: ${id}`);
  return item;
}

function resolveSource(snapshot, sourceId, workflowId) {
  const source = configuredReference(mfScenarioManifest.sources, sourceId, "source", workflowId);
  const snapshotSource = snapshotReference(snapshot.sources, sourceId, "source", workflowId);
  return { ...source, status: snapshotSource.status };
}

function resolveRole(roleId, workflowId) {
  return configuredReference(mfScenarioManifest.roles, roleId, "role", workflowId);
}

function resolveTask(snapshot, taskId, workflowId) {
  configuredReference(mfScenarioManifest.workflow.tasks, taskId, "task", workflowId);
  return snapshotReference(snapshot.workItems, taskId, "work item", workflowId);
}

function resolveGateReceipt(task) {
  if (task.state !== "complete") return { state: "pending", id: null };
  if (task.receiptId) return { state: "available", id: task.receiptId };
  return { state: "missing", id: null };
}

function resolveRoleDelivery(snapshot, roleId, workflowId) {
  resolveRole(roleId, workflowId);
  const workspace = getMfRoleWorkspace(snapshot, roleId);
  const sourceIds = new Set(workspace.tasks.flatMap((task) => task.sourceIds));
  const sourcesById = new Map([...sourceIds].map((sourceId) => [
    sourceId,
    resolveSource(snapshot, sourceId, workflowId),
  ]));
  const sources = mfScenarioManifest.sources
    .filter((source) => sourceIds.has(source.id))
    .map((source) => sourcesById.get(source.id));
  if (sources.some((source) => !source.authorizedRoleIds.includes(roleId))) {
    throw new Error(`MF workflow ${workflowId} resolved an unauthorized delivery source for role: ${roleId}`);
  }

  return {
    role: workspace.role,
    objective: workspace.role.objective,
    nextAction: workspace.nextTask,
    sources,
    deliverable: workspace.role.deliverable,
    openActionCount: workspace.tasks.filter((task) => task.state !== "complete").length,
    sourceCount: sources.length,
  };
}

export function deriveMfWorkflowPresentation(snapshot, workflowId) {
  const definition = mfScenarioManifest.workflow.catalog.find((workflow) => workflow.id === workflowId);
  if (!definition) throw new Error(`unknown MF workflow: ${workflowId}`);

  const ownerRole = resolveRole(definition.ownerRoleId, workflowId);
  const sources = definition.sourceIds
    .map((sourceId) => resolveSource(snapshot, sourceId, workflowId))
    .filter((source) => source.authorizedRoleIds.includes(definition.ownerRoleId));
  const agents = definition.agents.map((agent) => {
    if (!agent?.id || !agent.tool?.id) throw new Error(`MF workflow ${workflowId} has an invalid configured agent`);
    return agent;
  });
  const gateTask = resolveTask(snapshot, definition.gate.taskId, workflowId);
  const gateRole = resolveRole(definition.gate.roleId, workflowId);
  const evidenceSources = definition.gate.evidenceSourceIds.map((sourceId) =>
    resolveSource(snapshot, sourceId, workflowId),
  );
  if (evidenceSources.some((source) => !source.authorizedRoleIds.includes(gateRole.id))) {
    throw new Error(`MF workflow ${workflowId} has gate evidence unauthorized for role: ${gateRole.id}`);
  }
  const affectedRoleIds = definition.gate.affectedRoleIds.map((roleId) => resolveRole(roleId, workflowId).id);
  const receipt = resolveGateReceipt(gateTask);
  const gate = {
    task: gateTask,
    state: gateTask.state,
    role: gateRole,
    decision: definition.gate.decision,
    evidenceSources,
    evidenceCount: evidenceSources.length,
    affectedRoleIds,
    affectedRoleCount: affectedRoleIds.length,
    receiptId: receipt.id,
  };
  const outputsReady = gateTask.state === "complete";
  const outputs = definition.outputs.map((output) => ({
    id: output.id,
    label: output.label,
    kind: output.kind,
    ready: outputsReady,
    recipients: output.recipientRoleIds.map((roleId) => resolveRole(roleId, workflowId)),
    receipt,
  }));
  const roleDeliveries = definition.deliveryRoleIds.map((roleId) =>
    resolveRoleDelivery(snapshot, roleId, workflowId),
  );
  const truth = {
    currentRevision: snapshot.truth.currentRevision,
    revisionB: snapshot.truth.revisionB,
    revisionC: snapshot.truth.revisionC,
  };
  const stages = [
    { id: stageIds[0], sources },
    { id: stageIds[1], truth },
    { id: stageIds[2], agents },
    { id: stageIds[3], gate },
    { id: stageIds[4], outputsReady, outputs, roleDeliveries },
  ];

  return {
    definition,
    workflowId: definition.id,
    runCode: definition.runCode,
    ownerRole,
    title: definition.title,
    trigger: definition.trigger,
    purpose: definition.purpose,
    truth,
    sources,
    agents,
    gate,
    outputsReady,
    outputs,
    roleDeliveries,
    stages,
  };
}
