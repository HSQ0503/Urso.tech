import { mfScenarioManifest } from "./manifest.mjs";

const completionStepByTask = Object.freeze({
  "approve-controlled-truth": 3,
  "map-impact": 4,
  "coordinate-bim": 6,
  "update-electrical": 7,
  "recover-schedule": 6,
  "verify-gate": 8,
  "release-exe-02": 8,
});

const readinessByStep = [84, 78, 72, 59, 46, 55, 68, 91, 100];

function normalizeStep(step) {
  return Math.max(0, Math.min(8, Math.trunc(Number.isFinite(step) ? step : 0)));
}

function receiptId(idempotencyKey) {
  const normalized = idempotencyKey.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-18);
  return `RCPT-${normalized || "TRANSITION"}`;
}

function buildWorkItems(step) {
  const states = new Map();
  return mfScenarioManifest.workflow.tasks.map((task) => {
    const completeAt = completionStepByTask[task.id];
    const dependenciesComplete = task.dependsOn.every((dependencyId) => states.get(dependencyId) === "complete");
    let state = "blocked";
    if (step >= completeAt) state = "complete";
    else if (dependenciesComplete && step >= Math.max(0, completeAt - 1)) state = "in_progress";
    else if (dependenciesComplete) state = "ready";
    states.set(task.id, state);
    return {
      ...task,
      state,
      completeAt,
      receiptId: state === "complete" ? `RCPT-${task.id.toUpperCase()}` : null,
    };
  });
}

export function createMfHarnessSnapshot(step = 0) {
  const normalizedStep = normalizeStep(step);
  const approved = normalizedStep >= 3;
  const workItems = buildWorkItems(normalizedStep);
  const completed = workItems.filter((task) => task.state === "complete").length;
  return {
    scenarioId: mfScenarioManifest.id,
    step: normalizedStep,
    state: mfScenarioManifest.story[normalizedStep].state,
    version: 1,
    truth: {
      currentRevision: approved ? "C" : "B",
      revisionB: approved ? "superseded" : "current",
      revisionC: approved ? "current" : "unresolved",
    },
    decision: {
      id: mfScenarioManifest.decision.id,
      status: approved ? "approved" : "pending",
      approvingRoleId: mfScenarioManifest.decision.approvingRoleId,
      effectiveDate: approved ? mfScenarioManifest.decision.effectiveDate : null,
    },
    objective: {
      id: mfScenarioManifest.objective.id,
      status: normalizedStep < 3 ? "pending" : normalizedStep === 8 ? "complete" : "active",
      completedTasks: completed,
      totalTasks: workItems.length,
    },
    sources: mfScenarioManifest.sources.map((source) => ({
      ...source,
      status: source.mode === "pilot" ? "available_in_pilot" : "connected",
    })),
    workItems,
    receipts: [],
    appliedKeys: [],
  };
}

export function transitionMfHarness(snapshot, targetStep, idempotencyKey, actorRoleId) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new Error("idempotency key required");
  }
  if (snapshot.appliedKeys.includes(idempotencyKey)) return snapshot;

  const next = createMfHarnessSnapshot(targetStep);
  const receipt = {
    id: receiptId(idempotencyKey),
    idempotencyKey,
    actorRoleId,
    action: next.step === 0 ? "scenario_reset" : next.step < snapshot.step ? "scenario_rewind" : "scenario_advance",
    fromStep: snapshot.step,
    toStep: next.step,
    evidenceIds: next.step >= 3 ? ["controlled-documents", "rfi-decisions"] : ["supplier-communication"],
  };
  return {
    ...next,
    version: snapshot.version + 1,
    receipts: [...snapshot.receipts, receipt],
    appliedKeys: [...snapshot.appliedKeys, idempotencyKey],
  };
}

export function getMfRoleWorkspace(snapshot, roleId) {
  const role = mfScenarioManifest.roles.find((candidate) => candidate.id === roleId);
  if (!role) throw new Error(`unknown MF role: ${roleId}`);
  const tasks = snapshot.workItems.filter((task) => task.ownerRoleId === roleId);
  const permittedSourceIds = new Set(tasks.flatMap((task) => task.sourceIds));
  const sources = snapshot.sources.filter(
    (source) => source.authorizedRoleIds.includes(roleId) && permittedSourceIds.has(source.id),
  );
  const nextTask = tasks.find((task) => task.state === "in_progress")
    ?? tasks.find((task) => task.state === "ready")
    ?? tasks.find((task) => task.state === "blocked")
    ?? null;
  return {
    role,
    objective: mfScenarioManifest.objective,
    tasks,
    sources,
    nextTask,
    downstreamTasks: snapshot.workItems.filter((candidate) =>
      tasks.some((task) => candidate.dependsOn.includes(task.id)),
    ),
  };
}

export function deriveMfControlTower(snapshot) {
  const completed = snapshot.workItems.filter((task) => task.state === "complete").length;
  const openBlockers = snapshot.workItems.filter((task) => task.state === "blocked").length;
  return {
    milestone: mfScenarioManifest.project.milestone,
    targetDate: mfScenarioManifest.project.targetDate,
    impactedDisciplines: mfScenarioManifest.disciplines.filter((discipline) => discipline.impacted).length,
    completedActions: completed,
    totalActions: snapshot.workItems.length,
    openBlockers,
    releaseReadiness: readinessByStep[snapshot.step],
    exposureDays: mfScenarioManifest.outcome.exposureDays,
    daysRecovered: snapshot.step >= 8 ? mfScenarioManifest.outcome.recoveredDays : snapshot.step >= 6 ? 4 : 0,
    forecastDate: snapshot.step >= 8 ? mfScenarioManifest.outcome.coordinatedDate : mfScenarioManifest.outcome.sequentialDate,
    releaseConfidence: snapshot.step >= 8 ? "ready" : snapshot.step >= 7 ? "review" : "at_risk",
  };
}
