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
  "Select the project and nominate the pilot team",
]) {
  assert(storyPanelSource.includes(semanticLabel), `missing story semantics: ${semanticLabel}`);
}

console.log("✓ MF manifest values, references, and impact contract are consistent.");
