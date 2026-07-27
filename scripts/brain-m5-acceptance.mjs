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

const suite = JSON.parse(
  readFileSync(new URL("../evals/brain/m5-temporal-suite.json", import.meta.url), "utf8"),
);
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
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function claimIds(rows) {
  return new Set((rows ?? []).map((row) => row.claim_id ?? row.id));
}

function exactIds(rows, expectedIds, message) {
  const actual = [...claimIds(rows)].sort();
  const expected = [...expectedIds].sort();
  assert(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${message}: expected [${expected.join(", ")}], received [${actual.join(", ")}].`,
  );
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function record(caseId, status, detail) {
  const definition = suite.cases.find((item) => item.id === caseId);
  if (!definition) throw new Error(`Unknown M5 case: ${caseId}`);
  results.push({
    id: definition.id,
    category: definition.category,
    description: definition.description,
    status,
    detail,
  });
}

async function evaluate(caseId, test) {
  try {
    const detail = await test();
    record(caseId, "pass", detail);
  } catch (error) {
    record(caseId, "fail", error instanceof Error ? error.message : String(error));
  }
}

async function insert(table, rows, columns = "*") {
  const { data, error } = await db.from(table).insert(rows).select(columns);
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return data ?? [];
}

async function count(table, configure = (query) => query) {
  const { count: rowCount, error } = await configure(
    db.from(table).select("*", { count: "exact", head: true }),
  );
  if (error) throw new Error(`${table} count: ${error.message}`);
  return rowCount ?? 0;
}

async function remove(table, configure) {
  const { error } = await configure(db.from(table).delete());
  if (error) throw new Error(`${table} cleanup: ${error.message}`);
}

async function rpc(name, parameters) {
  const { data, error } = await db.rpc(name, parameters);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectRpcFailure(name, parameters) {
  const { error } = await db.rpc(name, parameters);
  assert(error, `${name} unexpectedly succeeded.`);
  return error.message;
}

async function canReadClaim(userId, claimId, projectId = null) {
  return rpc("brain_can_read_claim", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_claim_id: claimId,
    p_project_id: projectId,
  });
}

async function searchClaims(userId, projectId, asOf, query) {
  return (
    (await rpc("brain_authorized_temporal_claim_search", {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_project_id: projectId,
      p_as_of: asOf.slice(0, 10),
      p_query: query,
      p_limit: 100,
    })) ?? []
  );
}

async function verifySchema() {
  const tables = [
    "brain_entities",
    "brain_predicates",
    "brain_claims",
    "brain_claim_evidence",
    "brain_claim_relations",
    "brain_claim_conflicts",
    "brain_claim_proposals",
  ];
  const checks = await Promise.all(
    tables.map(async (table) => {
      const { error } = await db.from(table).select("*", { head: true, count: "exact" });
      return { table, error: error?.message ?? null };
    }),
  );
  const missing = checks.filter((item) => item.error);
  if (missing.length) {
    throw new Error(
      `M5 schema is incomplete: ${missing.map((item) => `${item.table} (${item.error})`).join(", ")}`,
    );
  }
  return `${tables.length} temporal-truth tables are reachable.`;
}

async function runFixturesSuite() {
  const runId = randomUUID();
  const shortId = runId.slice(0, 8);
  const userPrefix = `m5-acceptance-${runId}`;
  const pathPrefix = `_M5Acceptance/${runId}`;
  const projectId = `m5-${shortId}`;
  const probe = `m5probe${shortId}`;
  const fixtureActor = `${userPrefix}-fixture`;
  const entityKeyPrefix = `${probe}-`;
  const predicateIds = {
    status: `${probe}-status`,
    phase: `${probe}-phase`,
  };
  const ids = {
    runId,
    projectId,
    users: {
      member: `${userPrefix}-member`,
      outsider: `${userPrefix}-outsider`,
      steward: `${userPrefix}-steward`,
    },
  };
  const state = {
    entityIds: [],
    claimIds: [],
    proposalIds: [],
  };
  let cleanupFailure = null;

  const cleanup = async () => {
    const cleanupErrors = [];
    const safely = async (operation) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    };

    await safely(() =>
      remove("brain_claim_proposals", (query) =>
        query.eq("organization_id", organizationId).like("proposed_by", `${userPrefix}%`),
      ),
    );
    if (state.claimIds.length) {
      await safely(() =>
        remove("brain_claim_conflicts", (query) =>
          query
            .eq("organization_id", organizationId)
            .or(
              `claim_a_id.in.(${state.claimIds.join(",")}),claim_b_id.in.(${state.claimIds.join(",")})`,
            ),
        ),
      );
      await safely(() =>
        remove("brain_claim_relations", (query) =>
          query
            .eq("organization_id", organizationId)
            .or(
              `from_claim_id.in.(${state.claimIds.join(",")}),to_claim_id.in.(${state.claimIds.join(",")})`,
            ),
        ),
      );
      await safely(() =>
        remove("brain_claim_evidence", (query) =>
          query.eq("organization_id", organizationId).in("claim_id", state.claimIds),
        ),
      );
      await safely(() =>
        remove("brain_claims", (query) =>
          query.eq("organization_id", organizationId).in("id", state.claimIds),
        ),
      );
    }
    await safely(() =>
      remove("brain_predicates", (query) =>
        query.eq("organization_id", organizationId).in("id", Object.values(predicateIds)),
      ),
    );
    await safely(() =>
      remove("brain_entities", (query) =>
        query.eq("organization_id", organizationId).like("canonical_key", `${entityKeyPrefix}%`),
      ),
    );
    await safely(() =>
      remove("brain_docs", (query) =>
        query.eq("organization_id", organizationId).like("path", `${pathPrefix}/%`),
      ),
    );
    await safely(() =>
      remove("brain_audit_events", (query) =>
        query.eq("organization_id", organizationId).like("actor_user_id", `${userPrefix}%`),
      ),
    );
    await safely(() =>
      remove("brain_memberships", (query) =>
        query.eq("organization_id", organizationId).like("user_id", `${userPrefix}%`),
      ),
    );
    await safely(() =>
      remove("brain_projects", (query) =>
        query.eq("organization_id", organizationId).eq("id", projectId),
      ),
    );
    const remaining = await Promise.all([
      count("brain_claim_proposals", (query) =>
        query.eq("organization_id", organizationId).like("proposed_by", `${userPrefix}%`),
      ),
      count("brain_entities", (query) =>
        query.eq("organization_id", organizationId).like("canonical_key", `${entityKeyPrefix}%`),
      ),
      count("brain_docs", (query) =>
        query.eq("organization_id", organizationId).like("path", `${pathPrefix}/%`),
      ),
      count("brain_memberships", (query) =>
        query.eq("organization_id", organizationId).like("user_id", `${userPrefix}%`),
      ),
      count("brain_projects", (query) =>
        query.eq("organization_id", organizationId).eq("id", projectId),
      ),
    ]).catch((error) => {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
      return [];
    });
    if (remaining.some((value) => value !== 0)) {
      cleanupErrors.push(`fixture rows remain after cleanup (${remaining.join(", ")})`);
    }
    if (cleanupErrors.length) throw new Error(unique(cleanupErrors).join("; "));
  };

  try {
    const { data: departments, error: departmentError } = await db
      .from("brain_departments")
      .select("id")
      .eq("organization_id", organizationId)
      .order("sort")
      .limit(2);
    if (departmentError) throw new Error(`brain_departments: ${departmentError.message}`);
    assert((departments?.length ?? 0) >= 2, "M5 fixtures require at least two departments.");
    const memberDepartment = departments[0].id;
    const outsiderDepartment = departments[1].id;

    await insert("brain_projects", {
      organization_id: organizationId,
      id: projectId,
      name: `M5 acceptance ${shortId}`,
      blurb: "Temporary deterministic temporal-truth fixture.",
      status: "active",
      sort: 9999,
    });
    await insert("brain_memberships", [
      {
        organization_id: organizationId,
        user_id: ids.users.member,
        role: "member",
        department_id: memberDepartment,
        active: true,
      },
      {
        organization_id: organizationId,
        user_id: ids.users.outsider,
        role: "viewer",
        department_id: outsiderDepartment,
        active: true,
      },
      {
        organization_id: organizationId,
        user_id: ids.users.steward,
        role: "knowledge_steward",
        department_id: outsiderDepartment,
        active: true,
      },
    ]);
    await insert("brain_project_memberships", {
      organization_id: organizationId,
      project_id: projectId,
      user_id: ids.users.member,
      active: true,
    });

    const docDefinitions = [
      ["general", "organization", null],
      ["conflict-a", "organization", null],
      ["conflict-b", "organization", null],
      ["project", "project", projectId],
      ["restricted", "restricted", null],
      ["hidden-visible", "organization", null],
      ["hidden-restricted", "restricted", null],
      ["proposal", "organization", null],
    ];
    const documentRows = docDefinitions.map(([keyName, visibility, scopedProjectId]) => {
      const content = `${probe} ${keyName} exact temporal evidence`;
      return {
        organization_id: organizationId,
        path: `${pathPrefix}/${keyName}.md`,
        title: `M5 ${keyName} ${shortId}`,
        description: "Temporary deterministic M5 acceptance evidence.",
        department_id: null,
        project_id: scopedProjectId,
        doc_type: "doc",
        audience: [],
        tags: ["m5-acceptance"],
        links: [],
        content,
        content_hash: hash(content),
        origin: "brain",
        updated_by: fixtureActor,
        visibility,
      };
    });
    const documents = await insert(
      "brain_docs",
      documentRows,
      "id,path,current_version,visibility,project_id",
    );
    const docContent = Object.fromEntries(
      docDefinitions.map(([keyName]) => [
        keyName,
        `${probe} ${keyName} exact temporal evidence`,
      ]),
    );
    const doc = Object.fromEntries(
      docDefinitions.map(([keyName]) => [
        keyName,
        documents.find((row) => row.path === `${pathPrefix}/${keyName}.md`),
      ]),
    );
    assert(
      Object.values(doc).every(Boolean),
      "Not every M5 evidence document was returned after insertion.",
    );

    const entityDefinitions = [
      ["woof-gbp", "Woof GBP integration"],
      ["future-feature", "Future booking feature"],
      ["retired-system", "Retired reporting system"],
      ["unresolved-policy", "Unresolved customer-data policy"],
      ["visible-conflict", "Visible source-of-record conflict"],
      ["hidden-conflict", "Authorization-sensitive hidden conflict"],
      ["project-system", "Project-only operating system"],
      ["restricted-system", "Restricted operating system"],
      ["proposal-system", "Proposal-governed operating system"],
    ];
    const entities = await insert(
      "brain_entities",
      entityDefinitions.map(([keyName, name]) => ({
        organization_id: organizationId,
        canonical_key: `${entityKeyPrefix}${keyName}`,
        name: `${probe} ${name}`,
        entity_type: keyName.includes("policy") ? "policy" : "system",
        project_id: keyName === "project-system" ? projectId : null,
        metadata: { acceptance: true, runId },
        created_by: fixtureActor,
      })),
      "id,canonical_key,name,project_id",
    );
    state.entityIds.push(...entities.map((entity) => entity.id));
    const entity = Object.fromEntries(
      entityDefinitions.map(([keyName]) => [
        keyName,
        entities.find((row) => row.canonical_key === `${entityKeyPrefix}${keyName}`),
      ]),
    );
    assert(Object.values(entity).every(Boolean), "Not every M5 entity was returned after insertion.");

    await insert("brain_predicates", [
      {
        organization_id: organizationId,
        id: predicateIds.status,
        name: `${probe} lifecycle status`,
        description: "Exclusive lifecycle value used by M5 acceptance.",
        object_type: "text",
        is_exclusive: true,
        created_by: fixtureActor,
      },
      {
        organization_id: organizationId,
        id: predicateIds.phase,
        name: `${probe} phase`,
        description: "Non-exclusive scheduled phase used by M5 acceptance.",
        object_type: "text",
        is_exclusive: false,
        created_by: fixtureActor,
      },
    ]);

    const claimDefinitions = [
      {
        key: "prior",
        subject: "woof-gbp",
        predicate: "status",
        value: "planned",
        lifecycle: "superseded",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: "2026-05-01",
        doc: "general",
      },
      {
        key: "current",
        subject: "woof-gbp",
        predicate: "status",
        value: "removed-from-scope",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-05-01",
        validUntil: null,
        doc: "general",
      },
      {
        key: "future",
        subject: "future-feature",
        predicate: "phase",
        value: "scheduled",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-08-01",
        validUntil: null,
        doc: "general",
      },
      {
        key: "retired",
        subject: "retired-system",
        predicate: "status",
        value: "legacy-source",
        lifecycle: "retired",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: "2026-05-01",
        doc: "general",
      },
      {
        key: "unresolved",
        subject: "unresolved-policy",
        predicate: "status",
        value: "pending-decision",
        lifecycle: "active",
        resolution: "unresolved",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "general",
      },
      {
        key: "conflictA",
        subject: "visible-conflict",
        predicate: "status",
        value: "franpos",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "conflict-a",
      },
      {
        key: "conflictB",
        subject: "visible-conflict",
        predicate: "status",
        value: "google-business-profile",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "conflict-b",
      },
      {
        key: "hiddenVisible",
        subject: "hidden-conflict",
        predicate: "status",
        value: "visible-value",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "hidden-visible",
      },
      {
        key: "hiddenRestricted",
        subject: "hidden-conflict",
        predicate: "status",
        value: "restricted-value",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "hidden-restricted",
      },
      {
        key: "project",
        subject: "project-system",
        predicate: "status",
        value: "project-current",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "project",
        projectId,
      },
      {
        key: "restricted",
        subject: "restricted-system",
        predicate: "status",
        value: "restricted-current",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "restricted",
      },
      {
        key: "proposalBase",
        subject: "proposal-system",
        predicate: "status",
        value: "proposal-old",
        lifecycle: "active",
        resolution: "accepted",
        validFrom: "2026-01-01",
        validUntil: null,
        doc: "proposal",
      },
    ].map((definition) => ({ ...definition, id: randomUUID() }));
    const claims = await insert(
      "brain_claims",
      claimDefinitions.map((definition) => ({
        id: definition.id,
        organization_id: organizationId,
        subject_entity_id: entity[definition.subject].id,
        predicate_id: predicateIds[definition.predicate],
        object_type: "text",
        object_value: definition.value,
        object_entity_id: null,
        lifecycle: definition.lifecycle,
        resolution: definition.resolution,
        valid_from: definition.validFrom,
        valid_until: definition.validUntil,
        project_id: definition.projectId ?? null,
        asserted_by: fixtureActor,
      })),
      "id,subject_entity_id,predicate_id,object_value,lifecycle,resolution,valid_from,valid_until,project_id",
    );
    state.claimIds.push(...claims.map((claim) => claim.id));
    const claim = Object.fromEntries(
      claimDefinitions.map((definition) => [
        definition.key,
        claims.find((row) => row.id === definition.id),
      ]),
    );
    assert(Object.values(claim).every(Boolean), "Not every M5 claim was returned after insertion.");

    await insert(
      "brain_claim_evidence",
      claimDefinitions.map((definition) => ({
        organization_id: organizationId,
        claim_id: claim[definition.key].id,
        doc_id: doc[definition.doc].id,
        doc_version: doc[definition.doc].current_version,
        evidence_role: "authoritative",
        excerpt: docContent[definition.doc],
        created_by: fixtureActor,
      })),
    );
    await insert("brain_claim_relations", {
      organization_id: organizationId,
      from_claim_id: claim.current.id,
      to_claim_id: claim.prior.id,
      relation_type: "supersedes",
      created_by: fixtureActor,
    });

    for (const subject of ["visible-conflict", "hidden-conflict"]) {
      await rpc("brain_refresh_claim_conflicts", {
        p_organization_id: organizationId,
        p_subject_entity_id: entity[subject].id,
        p_predicate_id: predicateIds.status,
        p_actor_user_id: ids.users.steward,
      });
    }

    const referenceDate = suite.referenceTime.slice(0, 10);
    const historicalDate = suite.historicalTime.slice(0, 10);
    const futureDate = suite.futureTime.slice(0, 10);
    const memberCurrent = await searchClaims(ids.users.member, null, referenceDate, probe);
    const memberHistorical = await searchClaims(ids.users.member, null, historicalDate, probe);
    const memberFuture = await searchClaims(ids.users.member, null, futureDate, probe);
    const memberProject = await searchClaims(ids.users.member, projectId, referenceDate, probe);
    const outsiderProject = await searchClaims(ids.users.outsider, projectId, referenceDate, probe);
    const stewardCurrent = await searchClaims(ids.users.steward, null, referenceDate, probe);

    const forSubject = (rows, subject) =>
      rows.filter((row) => row.subject_entity_id === entity[subject].id);

    await evaluate("current-excludes-superseded", async () => {
      exactIds(
        forSubject(memberCurrent, "woof-gbp"),
        [claim.current.id],
        "Current Woof claim selection",
      );
      return "Current truth selected the replacement and excluded its superseded predecessor.";
    });
    await evaluate("historical-as-of", async () => {
      exactIds(
        forSubject(memberHistorical, "woof-gbp"),
        [claim.prior.id],
        "Historical Woof claim selection",
      );
      return "The historical instant selected only the claim valid on that date.";
    });
    await evaluate("future-effective", async () => {
      assert(
        !claimIds(memberCurrent).has(claim.future.id),
        "Future-effective claim leaked into current truth.",
      );
      assert(claimIds(memberFuture).has(claim.future.id), "Future-effective claim was not selected later.");
      return "Scheduled truth was excluded before and included after its effective date.";
    });
    await evaluate("retired-history-preserved", async () => {
      assert(!claimIds(memberCurrent).has(claim.retired.id), "Retired claim remained current.");
      assert(claimIds(memberHistorical).has(claim.retired.id), "Retired claim history was lost.");
      return "Retirement removed current truth without erasing historical truth.";
    });
    await evaluate("unresolved-is-not-a-commitment", async () => {
      const unresolved = memberCurrent.find((row) => row.claim_id === claim.unresolved.id);
      assert(unresolved, "Unresolved claim was not returned for explicit handling.");
      assert(unresolved.resolution === "unresolved", "Unresolved claim was represented as accepted.");
      return "The claim remained visible with an explicit unresolved resolution state.";
    });
    await evaluate("visible-contested-conflict", async () => {
      const visibleRows = forSubject(memberCurrent, "visible-conflict");
      exactIds(
        visibleRows,
        [claim.conflictA.id, claim.conflictB.id],
        "Visible conflicting claim selection",
      );
      assert(
        visibleRows.every(
          (row) =>
            Array.isArray(row.conflicts) &&
            row.conflicts.some((conflict) => conflict.status === "open"),
        ),
        "Visible contradictory claims were not accompanied by an open conflict.",
      );
      return "Both authorized claims surfaced with their open conflict.";
    });
    await evaluate("source-version-provenance", async () => {
      const fixtureAccepted = claims.filter((row) => row.resolution === "accepted");
      const { data: evidenceRows, error } = await db
        .from("brain_claim_evidence")
        .select("claim_id,doc_id,doc_version,excerpt,evidence_role")
        .eq("organization_id", organizationId)
        .in(
          "claim_id",
          fixtureAccepted.map((row) => row.id),
        );
      if (error) throw new Error(error.message);
      const covered = new Set(
        (evidenceRows ?? [])
          .filter(
            (row) =>
              row.evidence_role === "authoritative" &&
              Number.isInteger(row.doc_version) &&
              documents.some(
                (document) =>
                  document.id === row.doc_id &&
                  document.current_version === row.doc_version &&
                  Object.entries(doc).some(
                    ([keyName, value]) =>
                      value.id === row.doc_id && docContent[keyName] === row.excerpt,
                  ),
              ),
          )
          .map((row) => row.claim_id),
      );
      assert(
        fixtureAccepted.every((row) => covered.has(row.id)),
        "At least one accepted fixture claim lacks exact authoritative provenance.",
      );
      return `${fixtureAccepted.length} accepted claims have exact document-version provenance.`;
    });
    await evaluate("project-claim-isolation", async () => {
      assert(
        (await canReadClaim(ids.users.member, claim.project.id, projectId)) === true,
        "Project member could not read the project claim in scope.",
      );
      assert(
        (await canReadClaim(ids.users.member, claim.project.id, null)) === false,
        "Project claim was readable without active project scope.",
      );
      assert(
        (await canReadClaim(ids.users.outsider, claim.project.id, projectId)) === false,
        "Project claim was readable without project membership.",
      );
      assert(claimIds(memberProject).has(claim.project.id), "Project search omitted its authorized claim.");
      assert(!claimIds(memberCurrent).has(claim.project.id), "Project claim leaked into company scope.");
      assert(!claimIds(outsiderProject).has(claim.project.id), "Project claim leaked to an outsider.");
      return "Project membership and active project scope are both required.";
    });
    await evaluate("restricted-claim-isolation", async () => {
      assert(
        (await canReadClaim(ids.users.member, claim.restricted.id, null)) === false,
        "Restricted claim leaked to a regular member.",
      );
      assert(
        (await canReadClaim(ids.users.steward, claim.restricted.id, null)) === true,
        "Knowledge steward could not read governed restricted truth.",
      );
      assert(!claimIds(memberCurrent).has(claim.restricted.id), "Restricted search result leaked.");
      assert(claimIds(stewardCurrent).has(claim.restricted.id), "Steward search omitted restricted truth.");
      return "Claim visibility inherited exact source-document authorization.";
    });
    await evaluate("hidden-conflict-does-not-leak", async () => {
      const memberRows = forSubject(memberCurrent, "hidden-conflict");
      exactIds(memberRows, [claim.hiddenVisible.id], "Member hidden-conflict selection");
      assert(
        memberRows.every((row) => row.resolution === "accepted"),
        "Visible claim status disclosed the existence of a hidden contradiction.",
      );
      assert(
        memberRows.every((row) => !Array.isArray(row.conflicts) || row.conflicts.length === 0),
        "Visible claim disclosed a conflict involving hidden evidence.",
      );
      const stewardRows = forSubject(stewardCurrent, "hidden-conflict");
      exactIds(
        stewardRows,
        [claim.hiddenVisible.id, claim.hiddenRestricted.id],
        "Steward hidden-conflict selection",
      );
      assert(
        stewardRows.some(
          (row) => Array.isArray(row.conflicts) && row.conflicts.some((item) => item.status === "open"),
        ),
        "Authorized steward did not receive the hidden pair's conflict.",
      );
      return "Conflict existence remained hidden until both claims were authorized.";
    });

    const proposalClaimCountBefore = await count("brain_claims", (query) =>
      query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
    );
    const [applyProposal] = await insert(
      "brain_claim_proposals",
      {
        organization_id: organizationId,
        operation: "supersede",
        target_claim_id: claim.proposalBase.id,
        proposed_claim: {
          subject_entity_id: entity["proposal-system"].id,
          predicate_id: predicateIds.status,
          object_type: "text",
          object_value: "proposal-new",
          object_entity_id: null,
          valid_from: referenceDate,
          valid_until: null,
          resolution: "accepted",
        },
        evidence: [
          {
            doc_id: doc.proposal.id,
            doc_version: doc.proposal.current_version,
            evidence_role: "authoritative",
            excerpt: docContent.proposal,
          },
        ],
        rationale: "Deterministic M5 atomic apply fixture.",
        proposed_by: ids.users.member,
      },
      "id",
    );
    state.proposalIds.push(applyProposal.id);
    const applyResult = await rpc("brain_apply_claim_proposal", {
      p_organization_id: organizationId,
      p_proposal_id: applyProposal.id,
      p_reviewer_user_id: ids.users.steward,
      p_review_note: "M5 atomic acceptance.",
    });
    const appliedClaimId = applyResult?.claimId ?? applyResult?.claim_id;
    if (appliedClaimId) state.claimIds.push(appliedClaimId);

    await evaluate("proposal-apply-is-atomic-and-audited", async () => {
      assert(appliedClaimId, "Apply RPC did not return the new claim ID.");
      const [{ data: proposalRow, error: proposalError }, { data: targetRow, error: targetError }] =
        await Promise.all([
          db
            .from("brain_claim_proposals")
            .select("status,reviewed_by,reviewed_at")
            .eq("id", applyProposal.id)
            .single(),
          db
            .from("brain_claims")
            .select("lifecycle,valid_until")
            .eq("id", claim.proposalBase.id)
            .single(),
        ]);
      if (proposalError) throw new Error(proposalError.message);
      if (targetError) throw new Error(targetError.message);
      assert(proposalRow.status === "approved", "Applied proposal is not approved.");
      assert(targetRow.lifecycle === "superseded", "Predecessor was not superseded.");
      assert(
        (await count("brain_claims", (query) =>
          query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
        )) ===
          proposalClaimCountBefore + 1,
        "Atomic apply did not create exactly one claim.",
      );
      assert(
        (await count("brain_claim_relations", (query) =>
          query
            .eq("organization_id", organizationId)
            .eq("from_claim_id", appliedClaimId)
            .eq("to_claim_id", claim.proposalBase.id)
            .eq("relation_type", "supersedes"),
        )) === 1,
        "Atomic apply did not create supersession lineage.",
      );
      assert(
        (await count("brain_audit_events", (query) =>
          query
            .eq("organization_id", organizationId)
            .eq("actor_user_id", ids.users.steward)
            .eq("resource_id", applyProposal.id),
        )) >= 1,
        "Atomic apply did not persist its audit event.",
      );
      return "Claim, predecessor lifecycle, lineage, proposal review, evidence, and audit committed together.";
    });

    const [invalidProposal] = await insert(
      "brain_claim_proposals",
      {
        organization_id: organizationId,
        operation: "supersede",
        target_claim_id: claim.proposalBase.id,
        proposed_claim: {
          subject_entity_id: entity["proposal-system"].id,
          predicate_id: predicateIds.status,
          object_type: "text",
          object_value: "must-not-commit",
          valid_from: futureDate,
          valid_until: null,
          resolution: "accepted",
        },
        evidence: [
          {
            doc_id: doc.proposal.id,
            doc_version: doc.proposal.current_version,
            evidence_role: "authoritative",
            excerpt: docContent.proposal,
          },
        ],
        rationale: "Must roll back because predecessor is already superseded.",
        proposed_by: ids.users.member,
      },
      "id",
    );
    state.proposalIds.push(invalidProposal.id);
    const rollbackBaseline = {
      claims: await count("brain_claims", (query) =>
        query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
      ),
      relations: await count("brain_claim_relations", (query) =>
        query.eq("organization_id", organizationId),
      ),
      audits: await count("brain_audit_events", (query) =>
        query.eq("organization_id", organizationId).eq("resource_id", invalidProposal.id),
      ),
    };
    const rollbackMessage = await expectRpcFailure("brain_apply_claim_proposal", {
      p_organization_id: organizationId,
      p_proposal_id: invalidProposal.id,
      p_reviewer_user_id: ids.users.steward,
      p_review_note: "Expected rollback fixture.",
    });
    await evaluate("invalid-proposal-rolls-back", async () => {
      const { data: proposalRow, error } = await db
        .from("brain_claim_proposals")
        .select("status")
        .eq("id", invalidProposal.id)
        .single();
      if (error) throw new Error(error.message);
      assert(proposalRow.status === "pending", "Failed apply changed proposal state.");
      assert(
        (await count("brain_claims", (query) =>
          query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
        )) === rollbackBaseline.claims,
        "Failed apply partially created a claim.",
      );
      assert(
        (await count("brain_claim_relations", (query) =>
          query.eq("organization_id", organizationId),
        )) === rollbackBaseline.relations,
        "Failed apply partially created lineage.",
      );
      assert(
        (await count("brain_audit_events", (query) =>
          query.eq("organization_id", organizationId).eq("resource_id", invalidProposal.id),
        )) === rollbackBaseline.audits,
        "Failed apply partially created an audit event.",
      );
      return `Invalid supersession failed closed and rolled back (${rollbackMessage}).`;
    });

    const [rejectProposal] = await insert(
      "brain_claim_proposals",
      {
        organization_id: organizationId,
        operation: "assert",
        target_claim_id: null,
        proposed_claim: {
          subject_entity_id: entity["proposal-system"].id,
          predicate_id: predicateIds.phase,
          object_type: "text",
          object_value: "rejected-value",
          valid_from: referenceDate,
          valid_until: null,
          resolution: "accepted",
        },
        evidence: [
          {
            doc_id: doc.proposal.id,
            doc_version: doc.proposal.current_version,
            evidence_role: "authoritative",
            excerpt: docContent.proposal,
          },
        ],
        rationale: "Deterministic M5 rejection fixture.",
        proposed_by: ids.users.member,
      },
      "id",
    );
    state.proposalIds.push(rejectProposal.id);
    const claimsBeforeReject = await count("brain_claims", (query) =>
      query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
    );
    const rejected = await rpc("brain_reject_claim_proposal", {
      p_organization_id: organizationId,
      p_proposal_id: rejectProposal.id,
      p_reviewer_user_id: ids.users.steward,
      p_review_note: "Rejected by deterministic acceptance.",
    });
    await evaluate("proposal-rejection-is-audited", async () => {
      assert(rejected === true, "Reject RPC did not confirm the decision.");
      const { data: proposalRow, error } = await db
        .from("brain_claim_proposals")
        .select("status,reviewed_by,reviewed_at")
        .eq("id", rejectProposal.id)
        .single();
      if (error) throw new Error(error.message);
      assert(proposalRow.status === "rejected", "Rejected proposal did not reach terminal state.");
      assert(
        (await count("brain_claims", (query) =>
          query.eq("organization_id", organizationId).eq("subject_entity_id", entity["proposal-system"].id),
        )) === claimsBeforeReject,
        "Rejecting a proposal changed governed truth.",
      );
      assert(
        (await count("brain_audit_events", (query) =>
          query
            .eq("organization_id", organizationId)
            .eq("actor_user_id", ids.users.steward)
            .eq("resource_id", rejectProposal.id),
        )) >= 1,
        "Proposal rejection was not audited.",
      );
      return "Rejection changed only review state and wrote its audit event.";
    });
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupFailure = error instanceof Error ? error.message : String(error);
    }
  }

  if (cleanupFailure) {
    throw new Error(`M5 fixture cleanup failed: ${cleanupFailure}`);
  }
}

async function main() {
  let fatal = null;
  let schemaDetail = "";
  try {
    schemaDetail = await verifySchema();
    if (runFixtures) await runFixturesSuite();
  } catch (error) {
    fatal = error instanceof Error ? error.message : String(error);
  }

  const totalCases = suite.cases.length;
  const passed = results.filter((result) => result.status === "pass").length;
  const failed = results.filter((result) => result.status === "fail").length;
  const passRate = results.length ? passed / results.length : null;
  const authorizationLeakageFailures = results.filter(
    (result) => result.category === "security" && result.status === "fail",
  ).length;
  const acceptedClaimsWithoutEvidence = results.some(
    (result) => result.id === "source-version-provenance" && result.status === "fail",
  )
    ? 1
    : 0;
  const unauditedLifecycleChanges = results.filter(
    (result) =>
      result.status === "fail" &&
      ["proposal-apply-is-atomic-and-audited", "proposal-rejection-is-audited"].includes(result.id),
  ).length;
  const gatesPassed =
    !runFixtures ||
    (results.length === totalCases &&
      passRate >= suite.thresholds.casePassRate &&
      authorizationLeakageFailures <= suite.thresholds.authorizationLeakageFailures &&
      acceptedClaimsWithoutEvidence <= suite.thresholds.acceptedClaimsWithoutEvidence &&
      unauditedLifecycleChanges <= suite.thresholds.unauditedLifecycleChanges);
  const summary = {
    suiteId: suite.suiteId,
    version: suite.version,
    organizationId,
    generatedAt: new Date().toISOString(),
    fixturesRun: runFixtures,
    schema: schemaDetail,
    totals: {
      defined: totalCases,
      executed: results.length,
      passed,
      failed,
      passRate,
    },
    metrics: {
      authorizationLeakageFailures,
      acceptedClaimsWithoutEvidence,
      unauditedLifecycleChanges,
    },
    thresholds: suite.thresholds,
    gatesPassed,
    fatal,
    results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\nUrso Brain M5 temporal acceptance · ${organizationId}\n`);
    if (schemaDetail) console.log(`✓ Schema — ${schemaDetail}\n`);
    for (const result of results) {
      const symbol = result.status === "pass" ? "✓" : "✖";
      console.log(`${symbol} ${result.id} — ${result.detail}`);
    }
    if (fatal) console.error(`\nFatal: ${fatal}`);
    console.log(`\n${passed} passed · ${failed} failed · ${results.length}/${totalCases} cases executed\n`);
  }

  if (fatal) {
    process.exitCode = 2;
  } else if (!gatesPassed) {
    process.exitCode = 1;
  }
}

await main();
