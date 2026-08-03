// End-to-end acceptance for the public MF demo Brain.
// Run against a local or deployed app:
//   MF_DEMO_BASE_URL=http://localhost:3000 node scripts/brain-mf-acceptance.mjs

const baseUrl = (process.env.MF_DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const checks = [];
const assert = (name, condition, detail) => {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
};

async function jsonRequest(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}

async function setScenario(step) {
  return jsonRequest("/api/mf/brain/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step }),
  });
}

async function ask(roleId, question) {
  const { thread } = await jsonRequest("/api/mf/brain/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId }),
  });
  const response = await fetch(`${baseUrl}/api/mf/brain/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: `mf-acceptance-${Date.now()}`, role: "user", parts: [{ type: "text", text: question }] }],
      threadId: thread.id,
      roleId,
      language: "en",
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`chat returned ${response.status}: ${raw.slice(0, 500)}`);
  const events = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const receipt = events.find((event) => event.type === "data-context-receipt")?.data ?? null;
  const answer = events
    .filter((event) => event.type === "text-delta")
    .map((event) => event.delta)
    .join("");
  return { receipt, answer };
}

try {
  await setScenario(0);

  const managerWorkspace = await jsonRequest("/api/mf/brain/workspace?roleId=project-manager");
  assert("Isolated workspace", managerWorkspace.organization === "minerbo-fuchs-demo", managerWorkspace.organization);
  assert("Fifteen departments", managerWorkspace.departments.length === 15, `${managerWorkspace.departments.length} departments`);
  assert("Complete project corpus", managerWorkspace.documents.length === 39, `${managerWorkspace.documents.length} documents`);
  const graphEdges = managerWorkspace.graph.reduce((total, document) => total + document.links.length, 0);
  assert("Connected project graph", graphEdges >= 20, `${graphEdges} authorized links`);

  const baseline = await ask(
    "project-manager",
    "Which filling-line revision is currently approved, what evidence supports it, and what decision is still pending?",
  );
  assert("Context Receipt emitted", Boolean(baseline.receipt?.runId), baseline.receipt?.runId ?? "missing");
  assert("Hybrid retrieval", baseline.receipt?.retrieval?.mode === "hybrid", baseline.receipt?.retrieval?.mode ?? "missing");
  assert("Manager scope", baseline.receipt?.scope?.role === "knowledge_steward", baseline.receipt?.scope?.role ?? "missing");
  assert("Baseline truth answer", /Revision B/i.test(baseline.answer) && /pending/i.test(baseline.answer), baseline.answer.slice(0, 240));

  const approved = await setScenario(3);
  assert("Approval changes governed truth", approved.truth === "revision-c", JSON.stringify(approved));
  const electrical = await ask(
    "electrical",
    "After the approval, which supplier revision and installed electrical load are current, and what happened to the old values?",
  );
  assert("Electrical ACL scope", electrical.receipt?.scope?.department === "Elétrica", electrical.receipt?.scope?.department ?? "missing");
  assert("Approved truth answer", /Revision C/i.test(electrical.answer) && /483/.test(electrical.answer), electrical.answer.slice(0, 240));
  assert("Historical truth retained", /supersed|histor/i.test(electrical.answer), electrical.answer.slice(0, 240));

  const learning = await jsonRequest("/api/mf/brain/learning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: "electrical", contextRunId: electrical.receipt.runId }),
  });
  const learningPassed = learning.status === "complete";
  const learningRejectedUnsafeEvidence =
    learning.status === "failed" &&
    learning.candidateCount === 0 &&
    /exact source-version text/i.test(learning.error ?? "");
  assert(
    "Controlled learning fails closed",
    learning.mode === "shadow" && (learningPassed || learningRejectedUnsafeEvidence),
    JSON.stringify(learning),
  );

  await setScenario(0);
  const resetWorkspace = await jsonRequest("/api/mf/brain/workspace?roleId=project-manager");
  const revisionB = resetWorkspace.claims.find((claim) => claim.object === "Revision B");
  const revisionC = resetWorkspace.claims.find((claim) => claim.object === "Revision C");
  assert("Deterministic demo reset", revisionB?.lifecycle === "active" && revisionC?.resolution === "unresolved", `B=${revisionB?.lifecycle}, C=${revisionC?.resolution}`);

  console.log("\nMF Brain acceptance:\n");
  for (const check of checks) console.log(`  ✓ ${check.name}\n      ${check.detail}`);
  console.log(`\n✓ ${checks.length}/${checks.length} acceptance gates passed. Demo reset to Revision B.\n`);
} catch (error) {
  console.error("\nMF Brain acceptance failed:\n");
  for (const check of checks) console.error(`  ${check.passed ? "✓" : "✖"} ${check.name}\n      ${check.detail}`);
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  try {
    await setScenario(0);
  } catch {}
  process.exit(1);
}
