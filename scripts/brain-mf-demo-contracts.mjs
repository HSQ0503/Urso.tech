import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mfScenarioManifest } from "../lib/mf-demo/manifest.mjs";

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

console.log("✓ MF manifest values, references, and impact contract are consistent.");
