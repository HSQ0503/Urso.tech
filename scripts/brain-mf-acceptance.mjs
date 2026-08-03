// End-to-end acceptance for the public MF demo Brain.
// Run against a local or deployed app:
//   MF_DEMO_BASE_URL=http://localhost:3000 node scripts/brain-mf-acceptance.mjs

const baseUrl = (process.env.MF_DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const checks = [];
let credentials = null;
let session = null;

const assert = (name, condition, detail) => {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
};

function sessionHeaders() {
  return credentials
    ? { "x-mf-demo-session-id": credentials.sessionId, "x-mf-demo-session-token": credentials.token }
    : {};
}

async function request(path, init = {}, { allowError = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!allowError && !response.ok) {
    throw new Error(`${path} returned ${response.status}: ${body.error ?? JSON.stringify(body)}`);
  }
  return { response, body };
}

async function jsonRequest(path, init) {
  return (await request(path, init)).body;
}

async function createSession() {
  const created = await jsonRequest("/api/mf/brain/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create" }),
  });
  credentials = { sessionId: created.sessionId, token: created.token };
  session = created.session;
  return created;
}

async function setScenario(targetStep, idempotencyKey = `acceptance-${Date.now()}-${targetStep}`) {
  const updated = await jsonRequest("/api/mf/brain/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "transition",
      ...credentials,
      expectedStep: session.snapshot.step,
      targetStep,
      idempotencyKey,
      roleId: session.selectedRoleId,
    }),
  });
  session = updated.session;
  return session;
}

async function ask(roleId, question) {
  const { thread } = await jsonRequest("/api/mf/brain/threads", {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ roleId }),
  });
  const response = await fetch(`${baseUrl}/api/mf/brain/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders() },
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
      try { return JSON.parse(line.slice(6)); } catch { return null; }
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
  const unauthorized = await request("/api/mf/brain/workspace?roleId=project-manager", {}, { allowError: true });
  assert("Session boundary", unauthorized.response.status === 401, `anonymous request returned ${unauthorized.response.status}`);

  const created = await createSession();
  assert("Presenter session created", Boolean(created.token) && session.snapshot.step === 0, `${session.id} at step ${session.snapshot.step}`);

  await setScenario(0, `acceptance-baseline-${session.id}`);
  const managerWorkspace = await jsonRequest("/api/mf/brain/workspace?roleId=project-manager", {
    headers: sessionHeaders(),
  });
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
  assert(
    "Authorized retrieval",
    ["hybrid", "lexical"].includes(baseline.receipt?.retrieval?.mode),
    `${baseline.receipt?.retrieval?.mode ?? "missing"} (${baseline.receipt?.retrieval?.selectedChunks ?? 0} selected chunks)`,
  );
  assert("Manager scope", baseline.receipt?.scope?.role === "knowledge_steward", baseline.receipt?.scope?.role ?? "missing");
  assert("Baseline truth answer", /Revision B/i.test(baseline.answer) && /pending/i.test(baseline.answer), baseline.answer.slice(0, 240));

  const approvalKey = `acceptance-approve-${session.id}`;
  const approved = await setScenario(3, approvalKey);
  assert("Approval changes governed truth", approved.snapshot.truth.currentRevision === "C", JSON.stringify(approved.snapshot.truth));
  const replayed = await setScenario(3, approvalKey);
  assert("Transition is idempotent", replayed.version === approved.version, `version ${approved.version} -> ${replayed.version}`);

  const stale = await request("/api/mf/brain/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "transition",
      ...credentials,
      expectedStep: 2,
      targetStep: 4,
      idempotencyKey: `acceptance-stale-${session.id}`,
      roleId: "project-manager",
    }),
  }, { allowError: true });
  assert("Stale presenter writes fail closed", stale.response.status === 409, `stale request returned ${stale.response.status}`);

  const electrical = await ask(
    "electrical",
    "After the approval, which supplier revision and installed electrical load are current, and what happened to the old values?",
  );
  assert("Electrical ACL scope", /trica$/i.test(electrical.receipt?.scope?.department ?? ""), electrical.receipt?.scope?.department ?? "missing");
  assert("Approved truth answer", /Revision C/i.test(electrical.answer) && /483/.test(electrical.answer), electrical.answer.slice(0, 240));
  assert("Historical truth retained", /supersed|histor/i.test(electrical.answer), electrical.answer.slice(0, 240));

  const learning = await jsonRequest("/api/mf/brain/learning", {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ roleId: "electrical", contextRunId: electrical.receipt.runId }),
  });
  const learningPassed = learning.status === "complete";
  const learningRejectedUnsafeEvidence = learning.status === "failed"
    && learning.candidateCount === 0
    && /exact source-version text/i.test(learning.error ?? "");
  assert(
    "Controlled learning fails closed",
    learning.mode === "shadow" && (learningPassed || learningRejectedUnsafeEvidence),
    JSON.stringify(learning),
  );

  await setScenario(0, `acceptance-reset-${session.id}`);
  const resetWorkspace = await jsonRequest("/api/mf/brain/workspace?roleId=project-manager", {
    headers: sessionHeaders(),
  });
  const revisionB = resetWorkspace.claims.find((claim) => claim.object === "Revision B");
  const revisionC = resetWorkspace.claims.find((claim) => claim.object === "Revision C");
  assert("Deterministic demo reset", revisionB?.lifecycle === "active" && revisionC?.resolution === "unresolved", `B=${revisionB?.lifecycle}, C=${revisionC?.resolution}`);

  const loaded = await jsonRequest("/api/mf/brain/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "load", ...credentials }),
  });
  assert("Session reload is durable", loaded.session.snapshot.step === 0 && loaded.session.id === session.id, `${loaded.session.id} at step ${loaded.session.snapshot.step}`);

  console.log("\nMF Brain acceptance:\n");
  for (const check of checks) console.log(`  [PASS] ${check.name}\n         ${check.detail}`);
  console.log(`\n[PASS] ${checks.length}/${checks.length} acceptance gates passed. Demo reset to Revision B.\n`);
} catch (error) {
  console.error("\nMF Brain acceptance failed:\n");
  for (const check of checks) console.error(`  [${check.passed ? "PASS" : "FAIL"}] ${check.name}\n         ${check.detail}`);
  console.error(`\n[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
  if (credentials && session) {
    try { await setScenario(0, `acceptance-recovery-${session.id}`); } catch {}
  }
  process.exit(1);
}
