import { getMfRoleWorkspace } from "./harness-runtime.mjs";
import { mfScenarioManifest } from "./manifest.mjs";

const stageIds = Object.freeze([
  "connected_context",
  "brain_boundary",
  "agents_tools",
  "human_gate",
  "controlled_outputs",
]);

const interactionLabels = Object.freeze({
  waiting: Object.freeze({ pt: "Aguardando dependências", en: "Waiting for dependencies" }),
  unauthorized: Object.freeze({ pt: "Aguardando o responsável pelo gate", en: "Waiting for the accountable gate role" }),
  external_action: Object.freeze({ pt: "Continuar no sistema conectado", en: "Continue in connected system" }),
  scenario_unavailable: Object.freeze({ pt: "Continuar pelos controles do apresentador", en: "Continue with presenter controls" }),
  outputs_pending: Object.freeze({ pt: "Aguardando saídas controladas", en: "Waiting for controlled outputs" }),
  receipt_missing: Object.freeze({ pt: "Recibo do gate ausente", en: "Gate receipt missing" }),
  complete: Object.freeze({ pt: "Workflow concluído", en: "Workflow complete" }),
});

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

export function deriveMfWorkflowAccess(viewerRoleId) {
  const viewerRole = mfScenarioManifest.roles.find((role) => role.id === viewerRoleId);
  const workflows = viewerRole
    ? mfScenarioManifest.workflow.catalog.filter((workflow) =>
      viewerRoleId === "project-manager" || workflow.ownerRoleId === viewerRoleId)
    : [];
  return {
    viewerRoleId,
    workflows,
    workflowIds: workflows.map((workflow) => workflow.id),
    defaultWorkflowId: workflows[0]?.id ?? null,
  };
}

export function deriveMfArtifactAccess(viewerRoleId) {
  const viewerRole = mfScenarioManifest.roles.find((role) => role.id === viewerRoleId);
  if (!viewerRole) {
    return { viewerRoleId, canViewAll: false, artifactIds: [] };
  }

  const artifactIds = new Set();
  const addArtifact = (artifactId) => {
    if (artifactId) artifactIds.add(artifactId);
  };

  for (const task of mfScenarioManifest.workflow.tasks) {
    if (viewerRoleId === "project-manager" || task.ownerRoleId === viewerRoleId) addArtifact(task.artifactId);
  }

  for (const workflow of mfScenarioManifest.workflow.catalog) {
    const recipientOutputs = workflow.outputs.filter((output) => output.recipientRoleIds.includes(viewerRoleId));
    if (viewerRoleId === "project-manager") {
      workflow.outputs.forEach((output) => addArtifact(output.id));
    } else {
      recipientOutputs.forEach((output) => addArtifact(output.id));
    }
    if (viewerRoleId === "project-manager" || workflow.ownerRoleId === viewerRoleId || recipientOutputs.length > 0) {
      addArtifact(configuredReference(
        mfScenarioManifest.workflow.tasks,
        workflow.gate.taskId,
        "gate task",
        workflow.id,
      ).artifactId);
    }
  }

  return {
    viewerRoleId,
    canViewAll: viewerRoleId === "project-manager",
    artifactIds: [...artifactIds],
  };
}

function projectWorkflowStages(currentStageId, terminal) {
  if (terminal) return stageIds.map((id) => ({ id, state: "complete" }));
  const currentIndex = stageIds.indexOf(currentStageId);
  return stageIds.map((id, index) => ({
    id,
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending",
  }));
}

export function deriveMfWorkflowInteraction(presentation, viewerRoleId) {
  const gateReceipt = presentation.gate.receipt;
  const terminal = presentation.gate.state === "complete"
    && presentation.outputsReady
    && gateReceipt.state === "available";
  const gateIsActionable = presentation.gate.state === "ready" || presentation.gate.state === "in_progress";
  const viewerOwnsGate = viewerRoleId === presentation.gate.role.id;
  const isScenarioAction = presentation.gate.task.id === "approve-controlled-truth";
  const scenarioIsCanonical = presentation.workflowId === "coordinate-project-change"
    && presentation.scenarioStep === presentation.gate.canonicalActionAt
    && presentation.gate.task.managerAction?.actionAt === presentation.gate.canonicalActionAt
    && presentation.truth.currentRevision === "B"
    && presentation.truth.revisionB === "current"
    && presentation.truth.revisionC === "unresolved"
    && presentation.outputs.every((output) => !output.ready);
  const canAdvance = gateIsActionable && viewerOwnsGate && isScenarioAction && scenarioIsCanonical;
  const inProgressNeedsHumanGate = presentation.gate.state === "in_progress"
    && (Boolean(presentation.gate.task.managerAction) || presentation.outputs.some((output) => output.ready));
  const currentStageId = terminal
    ? null
    : presentation.gate.state === "complete"
      ? "controlled_outputs"
      : presentation.gate.state === "blocked"
        ? "brain_boundary"
        : inProgressNeedsHumanGate
        ? "human_gate"
        : "agents_tools";

  let action;
  if (terminal) action = { id: "complete", label: interactionLabels.complete };
  else if (presentation.gate.state === "complete" && gateReceipt.state === "missing") {
    action = { id: "receipt_missing", label: interactionLabels.receipt_missing };
  } else if (presentation.gate.state === "complete") {
    action = { id: "outputs_pending", label: interactionLabels.outputs_pending };
  } else if (gateIsActionable && viewerRoleId !== presentation.gate.role.id) {
    action = { id: "unauthorized", label: interactionLabels.unauthorized };
  } else if (canAdvance) {
    action = {
      id: "advance",
      label: presentation.gate.task.managerAction?.label ?? presentation.gate.task.title,
    };
  } else if (gateIsActionable && viewerOwnsGate && isScenarioAction) {
    action = { id: "scenario_unavailable", label: interactionLabels.scenario_unavailable };
  } else if (gateIsActionable && viewerOwnsGate) {
    action = { id: "external_action", label: interactionLabels.external_action };
  } else action = { id: "waiting", label: interactionLabels.waiting };

  return {
    viewerRoleId,
    terminal,
    canAdvance,
    currentStageId,
    stages: projectWorkflowStages(currentStageId, terminal),
    action,
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
  const canonicalGateTask = configuredReference(
    mfScenarioManifest.workflow.tasks,
    definition.gate.taskId,
    "gate task",
    workflowId,
  );
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
    canonicalActionAt: canonicalGateTask.managerAction?.actionAt ?? null,
    role: gateRole,
    decision: definition.gate.decision,
    evidenceSources,
    evidenceCount: evidenceSources.length,
    affectedRoleIds,
    affectedRoleCount: affectedRoleIds.length,
    receipt,
    receiptId: receipt.id,
  };
  const outputs = definition.outputs.map((output) => {
    const ready = snapshot.step >= output.availableAtStep;
    return {
      id: output.id,
      label: output.label,
      kind: output.kind,
      availableAtStep: output.availableAtStep,
      ready,
      recipients: output.recipientRoleIds.map((roleId) => resolveRole(roleId, workflowId)),
      receipt: ready ? receipt : { state: "pending", id: null },
    };
  });
  const outputsReady = outputs.every((output) => output.ready);
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
    scenarioStep: snapshot.step,
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
