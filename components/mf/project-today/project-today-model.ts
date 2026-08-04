import { getMfRoleWorkspace } from "@/lib/mf-demo/harness-runtime.mjs";
import {
  deriveMfManagerCockpitPresentation,
  deriveMfManagerWorkspace,
} from "@/lib/mf-demo/manager-runtime.mjs";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import type { MfHarnessSnapshot, MfWorkItem } from "@/lib/mf-demo/types";

function latestRoleTask(tasks: readonly MfWorkItem[]) {
  return [...tasks]
    .filter((task) => task.state === "complete")
    .sort((left, right) => right.completeAt - left.completeAt)[0] ?? null;
}

export function deriveProjectTodayModel(snapshot: MfHarnessSnapshot, roleId: string) {
  const managerWorkspace = deriveMfManagerWorkspace(snapshot);
  const managerPresentation = deriveMfManagerCockpitPresentation(snapshot);
  const roleWorkspace = getMfRoleWorkspace(snapshot, roleId);
  const focusTask = roleWorkspace.nextTask ?? latestRoleTask(roleWorkspace.tasks);
  const taskById = new Map(snapshot.workItems.map((task) => [task.id, task]));
  const dependencyTasks = focusTask
    ? focusTask.dependsOn.map((taskId) => taskById.get(taskId)).filter((task): task is MfWorkItem => Boolean(task))
    : [];
  const activeTeams = managerWorkspace.team.teams.filter(
    (team) => team.state === "ready" || team.state === "in_progress",
  );
  const managerQueue = [
    ...managerWorkspace.queue.now,
    ...managerWorkspace.queue.next,
    ...managerWorkspace.queue.waitingOnTeam,
    ...managerWorkspace.queue.done,
  ];

  return {
    isManager: roleId === "project-manager",
    role: roleWorkspace.role,
    roleWorkspace,
    focusTask,
    dependencyTasks,
    activeTeams,
    managerQueue,
    managerWorkspace,
    managerPresentation,
    controlTower: managerWorkspace.controlTower,
    handoffStages: managerWorkspace.team.handoffStages,
    storyStage: mfScenarioManifest.story[snapshot.step],
    project: mfScenarioManifest.project,
    outcome: mfScenarioManifest.outcome,
  };
}
