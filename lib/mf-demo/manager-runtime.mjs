import { deriveMfControlTower } from "./harness-runtime.mjs";
import { mfScenarioManifest } from "./manifest.mjs";

const incompleteStates = new Set(["blocked", "ready", "in_progress"]);

const managerCockpitSteps = [
  { featuredActionId: "DEC-042", placement: "upcoming", scenarioControl: { id: "receive-revision", kind: "advance", targetView: null, label: { pt: "Receber Revisão C", en: "Receive Revision C" } }, milestoneStatus: "baseline" },
  { featuredActionId: "DEC-042", placement: "upcoming", scenarioControl: { id: "inspect-revision", kind: "advance", targetView: null, label: { pt: "Inspecionar revisão", en: "Inspect revision" } }, milestoneStatus: "baseline" },
  { featuredActionId: "DEC-042", placement: "actionable", scenarioControl: null, milestoneStatus: "exposed" },
  { featuredActionId: "ACT-IMPACT", placement: "actionable", scenarioControl: null, milestoneStatus: "exposed" },
  { featuredActionId: "ACT-IMPACT", placement: "completed", scenarioControl: { id: "distribute-work", kind: "advance", targetView: null, label: { pt: "Distribuir pacotes de trabalho", en: "Distribute work packages" } }, milestoneStatus: "exposed" },
  { featuredActionId: "ACT-IMPACT", placement: "completed", scenarioControl: { id: "open-workflow", kind: "navigate", targetView: "workflows", label: { pt: "Abrir workflow coordenado", en: "Open coordinated workflow" } }, milestoneStatus: "exposed" },
  { featuredActionId: "SCN-003", placement: "actionable", scenarioControl: { id: "open-recovery-workflow", kind: "navigate", targetView: "workflows", label: { pt: "Abrir workflow de recuperação", en: "Open recovery workflow" } }, milestoneStatus: "recovery_proposed" },
  { featuredActionId: "EXE-02", placement: "actionable", scenarioControl: { id: "review-outputs", kind: "navigate", targetView: "artifacts", label: { pt: "Revisar resultados técnicos", en: "Review technical outputs" } }, milestoneStatus: "recovery_selected" },
  { featuredActionId: "EXE-02", placement: "completed", scenarioControl: null, milestoneStatus: "pilot_complete" },
];

function findTaskById(workItems) {
  return new Map(workItems.map((task) => [task.id, task]));
}

function incompleteDependencyIds(task, tasksById, directOnly = false) {
  const blockerIds = [];
  const visited = new Set([task.id]);
  const visit = (taskId) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const dependency = tasksById.get(taskId);
    if (!dependency) return;
    if (incompleteStates.has(dependency.state)) blockerIds.push(dependency.id);
    if (!directOnly) dependency.dependsOn.forEach(visit);
  };
  task.dependsOn.forEach(visit);
  return blockerIds;
}

function managerActionItem(task, tasksById, lane) {
  const transitiveBlockerIds = incompleteDependencyIds(task, tasksById);
  const directBlockerIds = incompleteDependencyIds(task, tasksById, true);
  const blockingRoleIds = [];
  for (const blockerId of transitiveBlockerIds) {
    const blocker = tasksById.get(blockerId);
    if (blocker.ownerRoleId !== "project-manager" && !blockingRoleIds.includes(blocker.ownerRoleId)) {
      blockingRoleIds.push(blocker.ownerRoleId);
    }
  }
  return {
    taskId: task.id,
    actionId: task.managerAction.id,
    kind: task.managerAction.kind,
    label: task.managerAction.label,
    due: task.managerAction.due,
    state: task.state,
    lane,
    evidenceSourceIds: task.sourceIds,
    evidenceCount: task.sourceIds.length,
    directBlockerIds,
    transitiveBlockerIds,
    blockingRoleIds,
    blockingTeamCount: blockingRoleIds.length,
    receiptId: task.receiptId,
  };
}

export function deriveMfManagerQueue(snapshot) {
  const tasksById = findTaskById(snapshot.workItems);
  const lanes = { done: [], now: [], next: [], waitingOnTeam: [] };

  for (const manifestTask of mfScenarioManifest.workflow.tasks) {
    const task = tasksById.get(manifestTask.id);
    if (!task.managerAction) continue;
    const isNow = snapshot.step >= task.managerAction.actionAt
      && (task.state === "ready" || task.state === "in_progress");
    const lane = task.state === "complete"
      ? "done"
      : isNow
        ? "now"
        : task.managerAction.blockedLane === "waiting_on_team"
          ? "waitingOnTeam"
          : "next";
    lanes[lane].push(managerActionItem(task, tasksById, lane));
  }

  const decisionsRequiringAction = lanes.now.filter(
    (item) => item.kind === "decision" || item.kind === "release",
  );
  return {
    ...lanes,
    decisionsRequiringAction,
    actionRequiredCount: lanes.now.length,
  };
}

function currentTaskForRole(tasks) {
  for (const state of ["in_progress", "ready", "blocked"]) {
    const activeTask = tasks.find((task) => task.state === state);
    if (activeTask) return activeTask;
  }
  return tasks.reduce(
    (latestTask, task) => task.state === "complete" && (!latestTask || task.completeAt >= latestTask.completeAt)
      ? task
      : latestTask,
    null,
  );
}

function handoffStageState(stage, tasksById) {
  const tasks = stage.taskIds.map((taskId) => tasksById.get(taskId)).filter(Boolean);
  if (tasks.every((task) => task.state === "complete")) return "complete";
  if (tasks.some((task) => task.state === "in_progress") || tasks.some((task) => task.state === "complete")) {
    return "in_progress";
  }
  if (tasks.some((task) => task.state === "ready")) return "ready";
  return "blocked";
}

export function deriveMfTeamCommand(snapshot) {
  const tasksById = findTaskById(snapshot.workItems);
  const teams = mfScenarioManifest.roles.map((role) => {
    const roleTasks = snapshot.workItems.filter((task) => task.ownerRoleId === role.id);
    const currentTask = currentTaskForRole(roleTasks);
    const state = currentTask?.state ?? "complete";
    const atRisk = role.id !== "project-manager"
      && snapshot.step >= 5
      && state !== "complete"
      && state === "blocked";
    return {
      roleId: role.id,
      role: role.name,
      currentTask,
      state,
      atRisk,
      openActionCount: roleTasks.filter((task) => task.state !== "complete").length,
      completedActionCount: roleTasks.filter((task) => task.state === "complete").length,
    };
  });
  const handoffStages = mfScenarioManifest.workflow.handoffStages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    state: handoffStageState(stage, tasksById),
  }));
  const queue = deriveMfManagerQueue(snapshot);
  return {
    teams,
    handoffStages,
    activeWorkCount: teams.filter((team) => team.state === "in_progress").length,
    blockedTeamCount: teams.filter((team) => team.atRisk).length,
    managerDecisionCount: queue.decisionsRequiringAction.length,
  };
}

export function deriveMfManagerWorkspace(snapshot) {
  return {
    objective: mfScenarioManifest.objective,
    controlTower: deriveMfControlTower(snapshot),
    queue: deriveMfManagerQueue(snapshot),
    team: deriveMfTeamCommand(snapshot),
  };
}

export function deriveMfManagerCockpitPresentation(snapshot) {
  const queue = deriveMfManagerQueue(snapshot);
  const stepPresentation = managerCockpitSteps[snapshot.step];
  const queueItems = [...queue.now, ...queue.next, ...queue.waitingOnTeam, ...queue.done];
  const featuredManagerAction = stepPresentation
    ? queueItems.find((item) => item.actionId === stepPresentation.featuredActionId) ?? null
    : null;
  const placementMatches = stepPresentation?.placement === "upcoming"
    ? featuredManagerAction?.lane === "next"
      && featuredManagerAction.state !== "complete"
      && queue.now.length === 0
    : stepPresentation?.placement === "actionable"
      ? featuredManagerAction?.lane === "now"
        && (featuredManagerAction.state === "ready" || featuredManagerAction.state === "in_progress")
        && queue.now.length === 1
      : stepPresentation?.placement === "completed"
        ? featuredManagerAction?.lane === "done"
          && featuredManagerAction.state === "complete"
          && queue.now.length === 0
        : false;
  const consistent = Boolean(stepPresentation && featuredManagerAction && placementMatches);
  const primaryManagerAction = consistent && stepPresentation.placement === "actionable"
    ? featuredManagerAction
    : null;
  const milestoneStatus = stepPresentation?.milestoneStatus ?? "baseline";
  const days = milestoneStatus === "baseline"
    ? 0
    : milestoneStatus === "exposed"
      ? mfScenarioManifest.outcome.exposureDays
      : mfScenarioManifest.outcome.recoveredDays;
  return {
    consistent,
    featuredManagerAction: consistent ? featuredManagerAction : null,
    managerActionPlacement: consistent ? stepPresentation.placement : null,
    primaryManagerAction,
    scenarioControl: consistent && stepPresentation.scenarioControl
      ? { ...stepPresentation.scenarioControl, label: { ...stepPresentation.scenarioControl.label } }
      : null,
    milestone: {
      status: milestoneStatus,
      days,
      selectionRequired: milestoneStatus === "recovery_proposed",
    },
  };
}
