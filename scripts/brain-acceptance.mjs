#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of ["../.env", "../.env.local"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const runFixtures = args.has("--fixtures");
const organizationArgument = process.argv.find((value) => value.startsWith("--organization="));
const organizationId = organizationArgument?.split("=", 2)[1] || "urso";
const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const key = process.env.URSO_SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY.");
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const checks = [];

function record(milestone, status, name, detail, remediation = null) {
  checks.push({ milestone, status, name, detail, remediation });
}

async function selectAll(table, columns, configure = (query) => query) {
  const pageSize = 1_000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const query = configure(db.from(table).select(columns)).range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function countRows(table, configure = (query) => query) {
  const { count, error } = await configure(db.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

function sameValues(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function readCanAccess(userId, docId, projectId = null) {
  const { data, error } = await db.rpc("brain_can_read_doc", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_doc_id: docId,
    p_project_id: projectId,
  });
  if (error) throw new Error(`brain_can_read_doc: ${error.message}`);
  return data === true;
}

async function searchFixture(userId, departmentId, projectId, query) {
  const { data, error } = await db.rpc("brain_authorized_hybrid_search", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_department_id: departmentId,
    p_project_id: projectId,
    p_query: query,
    p_query_embedding: null,
    p_limit: 40,
  });
  if (error) throw new Error(`brain_authorized_hybrid_search: ${error.message}`);
  return (data ?? []).map((row) => row.path);
}

async function runAuthorizationFixtures() {
  const runId = randomUUID();
  const shortRunId = runId.slice(0, 8);
  const pathPrefix = `_Acceptance/${runId}`;
  const userPrefix = `acceptance-${runId}`;
  const userIds = {
    member: `${userPrefix}-member`,
    outsider: `${userPrefix}-outsider`,
    inactive: `${userPrefix}-inactive`,
    steward: `${userPrefix}-steward`,
  };
  let cleanupError = null;

  try {
    const [departments, projects] = await Promise.all([
      selectAll("brain_departments", "id", (query) => query.eq("organization_id", organizationId).order("sort")),
      selectAll("brain_projects", "id", (query) =>
        query.eq("organization_id", organizationId).eq("status", "active").order("sort"),
      ),
    ]);
    if (departments.length < 2 || projects.length < 1) {
      throw new Error("Fixtures require at least two departments and one active project.");
    }

    const memberDepartment = departments[0].id;
    const outsiderDepartment = departments[1].id;
    const projectId = projects[0].id;
    const { error: membershipError } = await db.from("brain_memberships").insert([
      {
        organization_id: organizationId,
        user_id: userIds.member,
        role: "member",
        department_id: memberDepartment,
        active: true,
      },
      {
        organization_id: organizationId,
        user_id: userIds.outsider,
        role: "viewer",
        department_id: outsiderDepartment,
        active: true,
      },
      {
        organization_id: organizationId,
        user_id: userIds.inactive,
        role: "member",
        department_id: memberDepartment,
        active: false,
      },
      {
        organization_id: organizationId,
        user_id: userIds.steward,
        role: "knowledge_steward",
        department_id: outsiderDepartment,
        active: true,
      },
    ]);
    if (membershipError) throw new Error(`fixture memberships: ${membershipError.message}`);

    const probe = `acceptanceprobe${shortRunId}`;
    const definitions = [
      { key: "organization", visibility: "organization", department_id: null, project_id: null },
      {
        key: "member-department",
        visibility: "department",
        department_id: memberDepartment,
        project_id: null,
      },
      {
        key: "outsider-department",
        visibility: "department",
        department_id: outsiderDepartment,
        project_id: null,
      },
      { key: "project", visibility: "project", department_id: null, project_id: projectId },
      { key: "restricted", visibility: "restricted", department_id: null, project_id: null },
      { key: "acl", visibility: "restricted", department_id: null, project_id: null },
    ];
    const documentRows = definitions.map((definition) => {
      const content = `${probe} ${definition.key} authorization fixture`;
      return {
        organization_id: organizationId,
        path: `${pathPrefix}/${definition.key}.md`,
        title: `Acceptance ${definition.key}`,
        description: "Temporary M1–M3 acceptance fixture.",
        department_id: definition.department_id,
        project_id: definition.project_id,
        doc_type: "doc",
        audience: [],
        tags: ["acceptance-fixture"],
        links: [],
        content,
        content_hash: createHash("sha256").update(content).digest("hex"),
        origin: "brain",
        updated_by: "brain-acceptance",
        visibility: definition.visibility,
      };
    });
    const { data: insertedDocs, error: documentError } = await db
      .from("brain_docs")
      .insert(documentRows)
      .select("id,path,current_version");
    if (documentError) throw new Error(`fixture documents: ${documentError.message}`);
    const docByKey = Object.fromEntries(
      definitions.map((definition) => [
        definition.key,
        insertedDocs.find((row) => row.path === `${pathPrefix}/${definition.key}.md`),
      ]),
    );
    if (Object.values(docByKey).some((doc) => !doc)) throw new Error("Not every fixture document was returned.");

    const { error: aclError } = await db.from("brain_doc_acl").insert({
      organization_id: organizationId,
      doc_id: docByKey.acl.id,
      principal_type: "user",
      principal_id: userIds.member,
      permission: "read",
      created_by: "brain-acceptance",
    });
    if (aclError) throw new Error(`fixture ACL: ${aclError.message}`);

    const chunkRows = definitions.map((definition, index) => ({
      organization_id: organizationId,
      doc_id: docByKey[definition.key].id,
      version: docByKey[definition.key].current_version,
      ordinal: 0,
      heading: `Fixture ${index + 1}`,
      content: `${probe} ${definition.key} authorization fixture`,
      token_count: 8,
      metadata: { acceptance: true, runId },
    }));
    const { error: chunkError } = await db.from("brain_doc_chunks").insert(chunkRows);
    if (chunkError) throw new Error(`fixture chunks: ${chunkError.message}`);

    const policyCases = [
      [userIds.member, "organization", null, true],
      [userIds.member, "member-department", null, true],
      [userIds.member, "outsider-department", null, false],
      [userIds.member, "project", projectId, true],
      [userIds.member, "project", null, false],
      [userIds.member, "restricted", null, false],
      [userIds.member, "acl", null, true],
      [userIds.outsider, "organization", null, true],
      [userIds.outsider, "member-department", null, false],
      [userIds.outsider, "outsider-department", null, true],
      [userIds.outsider, "restricted", null, false],
      [userIds.inactive, "organization", null, false],
      [userIds.steward, "restricted", null, true],
    ];
    for (const [userId, docKey, activeProjectId, expected] of policyCases) {
      const actual = await readCanAccess(userId, docByKey[docKey].id, activeProjectId);
      if (actual !== expected) {
        throw new Error(`Policy case failed for ${docKey}: expected ${expected}, received ${actual}.`);
      }
    }

    const memberSearch = await searchFixture(userIds.member, memberDepartment, projectId, probe);
    const expectedMemberPaths = ["organization", "member-department", "project", "acl"].map(
      (key) => `${pathPrefix}/${key}.md`,
    );
    if (!sameValues(memberSearch, expectedMemberPaths)) {
      throw new Error(`Authorized member search returned the wrong catalog (${memberSearch.length} paths).`);
    }

    const outsiderSearch = await searchFixture(userIds.outsider, outsiderDepartment, null, probe);
    const expectedOutsiderPaths = ["organization", "outsider-department"].map(
      (key) => `${pathPrefix}/${key}.md`,
    );
    if (!sameValues(outsiderSearch, expectedOutsiderPaths)) {
      throw new Error(`Authorized viewer search returned the wrong catalog (${outsiderSearch.length} paths).`);
    }

    return {
      passed: true,
      detail: `${policyCases.length} policy cases and 2 retrieval-isolation cases passed.`,
    };
  } catch (error) {
    return {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    const { data: remainingDocs, error: fixtureReadError } = await db
      .from("brain_docs")
      .select("id")
      .eq("organization_id", organizationId)
      .like("path", `${pathPrefix}/%`);
    if (fixtureReadError) {
      cleanupError = fixtureReadError.message;
    } else {
      const remainingIds = (remainingDocs ?? []).map((row) => row.id);
      if (remainingIds.length) {
        const { error } = await db
          .from("brain_docs")
          .delete()
          .eq("organization_id", organizationId)
          .in("id", remainingIds);
        if (error) cleanupError = error.message;
      }
    }
    const { error: membershipCleanupError } = await db
      .from("brain_memberships")
      .delete()
      .eq("organization_id", organizationId)
      .like("user_id", `${userPrefix}-%`);
    if (membershipCleanupError) cleanupError = membershipCleanupError.message;

    if (cleanupError) {
      record(
        "M1",
        "fail",
        "Fixture cleanup",
        `Temporary fixture cleanup failed: ${cleanupError}`,
        `Remove documents under ${pathPrefix} and memberships beginning ${userPrefix}.`,
      );
    }
  }
}

async function audit() {
  const fixtureResult = runFixtures ? await runAuthorizationFixtures() : null;

  const [
    organizations,
    departments,
    projects,
    memberships,
    docs,
    versions,
    chunks,
    aclCount,
    proposalRows,
    auditCount,
    contextRuns,
  ] = await Promise.all([
    selectAll("brain_organizations", "id,name", (query) => query.eq("id", organizationId)),
    selectAll("brain_departments", "id", (query) => query.eq("organization_id", organizationId)),
    selectAll("brain_projects", "id,status", (query) => query.eq("organization_id", organizationId)),
    selectAll("brain_memberships", "user_id,role,department_id,active", (query) =>
      query.eq("organization_id", organizationId),
    ),
    selectAll(
      "brain_docs",
      "id,path,project_id,department_id,doc_type,visibility,current_version,origin,deleted_at",
      (query) => query.eq("organization_id", organizationId),
    ),
    selectAll("brain_doc_versions", "doc_id,version", (query) =>
      query.eq("organization_id", organizationId),
    ),
    selectAll("brain_doc_chunks", "id,doc_id,version", (query) =>
      query.eq("organization_id", organizationId),
    ),
    countRows("brain_doc_acl", (query) => query.eq("organization_id", organizationId)),
    selectAll("brain_knowledge_proposals", "id,status", (query) =>
      query.eq("organization_id", organizationId),
    ),
    countRows("brain_audit_events", (query) => query.eq("organization_id", organizationId)),
    selectAll(
      "brain_context_runs",
      "id,status,retrieval_mode,receipt,created_at",
      (query) => query.eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ),
  ]);

  const liveDocs = docs.filter((doc) => !doc.deleted_at);
  const activeMemberships = memberships.filter((membership) => membership.active);
  const currentVersionKeys = new Set(liveDocs.map((doc) => `${doc.id}:${doc.current_version}`));
  const versionKeys = new Set(versions.map((version) => `${version.doc_id}:${version.version}`));
  const currentChunks = chunks.filter((chunk) => currentVersionKeys.has(`${chunk.doc_id}:${chunk.version}`));
  const chunkedDocumentIds = new Set(currentChunks.map((chunk) => chunk.doc_id));
  const missingVersionDocs = liveDocs.filter((doc) => !versionKeys.has(`${doc.id}:${doc.current_version}`));
  const missingChunkDocs = liveDocs.filter((doc) => !chunkedDocumentIds.has(doc.id));
  let embeddedCurrentChunks = 0;
  for (let start = 0; start < currentChunks.length; start += 100) {
    const ids = currentChunks.slice(start, start + 100).map((chunk) => chunk.id);
    const { count, error } = await db
      .from("brain_doc_chunks")
      .select("*", { count: "exact", head: true })
      .in("id", ids)
      .not("embedding", "is", null);
    if (error) throw new Error(`brain_doc_chunks embeddings: ${error.message}`);
    embeddedCurrentChunks += count ?? 0;
  }

  record(
    "M1",
    organizations.length === 1 ? "pass" : "fail",
    "Organization boundary",
    organizations.length === 1
      ? `Organization "${organizations[0].name}" is present.`
      : `Expected one "${organizationId}" organization row; found ${organizations.length}.`,
    "Apply 0002_company_brain.sql to the dedicated Urso project.",
  );
  record(
    "M1",
    departments.length >= 2 && projects.length >= 1 ? "pass" : "fail",
    "Scope catalog",
    `${departments.length} departments and ${projects.length} projects are configured.`,
    "Seed the organization department and project catalog.",
  );
  record(
    "M1",
    activeMemberships.length > 0 ? "pass" : "fail",
    "Active memberships",
    `${activeMemberships.length} active membership${activeMemberships.length === 1 ? "" : "s"} found.`,
    "Provision at least one active organization membership.",
  );
  const nonStewardRoles = activeMemberships.filter(
    (membership) => membership.role === "member" || membership.role === "viewer",
  );
  record(
    "M1",
    nonStewardRoles.length > 0 ? "pass" : "warn",
    "Least-privileged users",
    nonStewardRoles.length > 0
      ? `${nonStewardRoles.length} active member/viewer account${nonStewardRoles.length === 1 ? "" : "s"} can exercise restricted access.`
      : "Every active user is an administrator or steward; production segregation is not demonstrated.",
    "Create member and viewer test accounts before client acceptance.",
  );
  record(
    "M1",
    liveDocs.length > 0 ? "pass" : "fail",
    "Governed corpus",
    `${liveDocs.length} live documents are organization-scoped.`,
    "Run node scripts/brain-sync.mjs.",
  );
  record(
    "M1",
    missingVersionDocs.length === 0 && versions.length >= liveDocs.length ? "pass" : "fail",
    "Immutable versions",
    missingVersionDocs.length === 0
      ? `${versions.length} version rows cover every current document version.`
      : `${missingVersionDocs.length} live documents are missing their current immutable version.`,
    "Re-run 0002_company_brain.sql or repair missing version baselines.",
  );
  const restrictedDocs = liveDocs.filter((doc) => doc.visibility !== "organization");
  record(
    "M1",
    restrictedDocs.length > 0 ? "pass" : "warn",
    "Production visibility policies",
    restrictedDocs.length > 0
      ? `${restrictedDocs.length} documents exercise department, project, or restricted visibility.`
      : "All live documents are organization-visible.",
    "Add controlled department, project, and restricted documents before acceptance.",
  );
  record(
    "M1",
    aclCount > 0 ? "pass" : "warn",
    "Production ACL coverage",
    `${aclCount} document ACL entr${aclCount === 1 ? "y" : "ies"} configured.`,
    "Add at least one explicit ACL exception and verify it with a least-privileged account.",
  );
  if (fixtureResult) {
    record(
      "M1",
      fixtureResult.passed ? "pass" : "fail",
      "Authorization and retrieval fixtures",
      fixtureResult.detail,
      "Inspect brain_can_read_doc and brain_authorized_hybrid_search before accepting M1.",
    );
  } else {
    record(
      "M1",
      "warn",
      "Authorization and retrieval fixtures",
      "Not run in the read-only audit.",
      "Run npm run brain:acceptance -- --fixtures.",
    );
  }

  record(
    "M2",
    currentChunks.length > 0 ? "pass" : "fail",
    "Current knowledge index",
    `${currentChunks.length} current-version chunks found.`,
    "Open /brain/settings and build the hybrid index.",
  );
  record(
    "M2",
    liveDocs.length > 0 && missingChunkDocs.length === 0 ? "pass" : "fail",
    "Index document coverage",
    missingChunkDocs.length === 0
      ? `Every live document has current-version chunks.`
      : `${missingChunkDocs.length} of ${liveDocs.length} live documents are missing current-version chunks.`,
    "Force-build the index after the latest vault sync.",
  );
  record(
    "M2",
    currentChunks.length > 0 && embeddedCurrentChunks === currentChunks.length ? "pass" : "fail",
    "Embedding coverage",
    `${embeddedCurrentChunks} of ${currentChunks.length} current chunks have embeddings.`,
    "Configure the OpenAI org key and force-build the hybrid index.",
  );

  let lexicalSmokePassed = false;
  let lexicalSmokeDetail = "No current chunks were available for an RPC smoke test.";
  if (currentChunks.length > 0 && activeMemberships.length > 0) {
    const sourceChunk = currentChunks[0];
    const { data: chunkContent, error: chunkContentError } = await db
      .from("brain_doc_chunks")
      .select("content")
      .eq("id", sourceChunk.id)
      .single();
    if (chunkContentError) throw new Error(`brain_doc_chunks smoke source: ${chunkContentError.message}`);
    const queryTerm = (chunkContent.content.toLowerCase().match(/[a-z][a-z0-9'-]{4,}/g) ?? [])[0];
    if (queryTerm) {
      const membership = activeMemberships[0];
      const { data: results, error } = await db.rpc("brain_authorized_hybrid_search", {
        p_organization_id: organizationId,
        p_user_id: membership.user_id,
        p_department_id: membership.department_id,
        p_project_id: null,
        p_query: queryTerm,
        p_query_embedding: null,
        p_limit: 5,
      });
      lexicalSmokePassed = !error && (results?.length ?? 0) > 0;
      lexicalSmokeDetail = error
        ? error.message
        : `${results?.length ?? 0} authorized result${results?.length === 1 ? "" : "s"} returned for a corpus term.`;
    }
  }
  record(
    "M2",
    lexicalSmokePassed ? "pass" : "fail",
    "Authorized retrieval RPC",
    lexicalSmokeDetail,
    "Build the index, then inspect the authorized hybrid-search RPC.",
  );

  const latestRun = contextRuns[0] ?? null;
  const latestReceipt = latestRun?.receipt;
  const receiptShapeValid = Boolean(
    latestReceipt?.runId &&
      latestReceipt?.scope &&
      latestReceipt?.authorization &&
      latestReceipt?.retrieval &&
      Array.isArray(latestReceipt?.evidence),
  );
  record(
    "M3",
    contextRuns.length > 0 ? "pass" : "fail",
    "Production context runs",
    `${contextRuns.length} persisted Context Compiler run${contextRuns.length === 1 ? "" : "s"} found.`,
    "Send a production Brain chat after indexing.",
  );
  record(
    "M3",
    receiptShapeValid ? "pass" : "fail",
    "Context Receipt integrity",
    receiptShapeValid
      ? `Latest receipt selected ${latestReceipt.retrieval.selectedChunks} chunks from ${latestReceipt.authorization.permittedEvidenceCount} permitted documents.`
      : "No structurally valid production Context Receipt exists yet.",
    "Run a chat and inspect the emitted Context Receipt panel.",
  );

  let persistedEvidenceCount = 0;
  if (latestRun) {
    persistedEvidenceCount = await countRows("brain_context_evidence", (query) =>
      query.eq("context_run_id", latestRun.id),
    );
  }
  const receiptEvidenceCount = Array.isArray(latestReceipt?.evidence) ? latestReceipt.evidence.length : 0;
  record(
    "M3",
    latestRun && receiptEvidenceCount > 0 && persistedEvidenceCount === receiptEvidenceCount ? "pass" : "fail",
    "Evidence provenance",
    latestRun
      ? `${persistedEvidenceCount} persisted evidence rows for ${receiptEvidenceCount} receipt entries.`
      : "No run exists to verify evidence provenance.",
    "Run a grounded production chat and confirm its evidence rows persist.",
  );
  record(
    "M3",
    latestRun?.retrieval_mode === "hybrid" ? "pass" : "fail",
    "Hybrid compiler execution",
    latestRun ? `Latest production compiler mode: ${latestRun.retrieval_mode}.` : "No production compiler mode recorded.",
    "Build embeddings and run a production chat with an OpenAI embedding key available.",
  );

  const reviewedProposals = proposalRows.filter(
    (proposal) => proposal.status === "approved" || proposal.status === "rejected",
  );
  const changedDocuments = liveDocs.filter((doc) => doc.current_version > 1);
  record(
    "M3",
    reviewedProposals.length > 0 ? "pass" : "fail",
    "Proposal review flow",
    `${reviewedProposals.length} approved/rejected proposal${reviewedProposals.length === 1 ? "" : "s"} found.`,
    "Ask the Brain to save knowledge, then approve or reject the queued proposal.",
  );
  record(
    "M3",
    changedDocuments.length > 0 ? "pass" : "fail",
    "Versioned truth change",
    `${changedDocuments.length} live document${changedDocuments.length === 1 ? " has" : "s have"} a version above v1.`,
    "Approve an update proposal and verify that it creates a new immutable version.",
  );
  record(
    "M3",
    auditCount > 0 ? "pass" : "fail",
    "Audit trail",
    `${auditCount} audit event${auditCount === 1 ? "" : "s"} recorded.`,
    "Exercise indexing, proposals, or steward edits through the application routes.",
  );

  const summary = {
    organizationId,
    generatedAt: new Date().toISOString(),
    fixturesRun: runFixtures,
    totals: {
      pass: checks.filter((check) => check.status === "pass").length,
      warn: checks.filter((check) => check.status === "warn").length,
      fail: checks.filter((check) => check.status === "fail").length,
    },
    liveState: {
      documents: liveDocs.length,
      memberships: activeMemberships.length,
      versions: versions.length,
      currentChunks: currentChunks.length,
      embeddedCurrentChunks,
      contextRuns: contextRuns.length,
      proposals: proposalRows.length,
      auditEvents: auditCount,
    },
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\nUrso Brain M1–M3 acceptance · ${organizationId}\n`);
    for (const milestone of ["M1", "M2", "M3"]) {
      console.log(`${milestone}`);
      for (const check of checks.filter((item) => item.milestone === milestone)) {
        const symbol = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✖";
        console.log(`  ${symbol} ${check.name} — ${check.detail}`);
        if (check.status !== "pass" && check.remediation) console.log(`    → ${check.remediation}`);
      }
      console.log("");
    }
    console.log(
      `${summary.totals.pass} passed · ${summary.totals.warn} warnings · ${summary.totals.fail} failed`,
    );
    console.log(
      `${liveDocs.length} docs · ${currentChunks.length} current chunks · ${embeddedCurrentChunks} embedded · ${contextRuns.length} context runs\n`,
    );
  }

  process.exitCode = summary.totals.fail > 0 ? 1 : 0;
}

try {
  await audit();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          organizationId,
          generatedAt: new Date().toISOString(),
          fatal: message,
          checks,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`\nAcceptance audit could not complete: ${message}`);
  }
  process.exitCode = 2;
}
