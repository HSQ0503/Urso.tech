// Service-role provisioning fallback for the data-only MF tenant migration.
// This performs the same idempotent row upserts as 0012 without DDL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of ["../.env.local", "../.env"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const key = process.env.URSO_SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const organizationId = "minerbo-fuchs-demo";
const projectId = "uberlandia-refrescos-f3";
const departments = [
  ["viability", "Viabilidade", "Project feasibility, capacity premises, and early delivery constraints."],
  ["bid", "BID", "Commercial scope, bid assumptions, and contractual interfaces."],
  ["planning", "Planejamento e Controle", "Schedule, progress, dependencies, and milestone recovery."],
  ["quality", "Qualidade", "Design-gate evidence, reviews, release criteria, and nonconformities."],
  ["bim", "Metodologia BIM", "Federation, coordination, model standards, and information requirements."],
  ["architecture", "Arquitetura", "Industrial architecture, circulation, access, and spatial coordination."],
  ["infrastructure", "Infraestrutura", "Site utilities, external networks, grading, and project interfaces."],
  ["concrete", "Estruturas de Concreto", "Foundations, equipment bases, and concrete structural interfaces."],
  ["steel", "Estruturas Metálicas", "Steel framing, platforms, supports, and secondary structures."],
  ["hydraulics", "Hidráulica", "Water, sanitary drainage, floor drainage, and hydraulic interfaces."],
  ["hvac", "HVAC", "Thermal loads, chilled water, ventilation, and environmental systems."],
  ["electrical", "Elétrica", "Loads, feeders, distribution, grounding, and electrical diagrams."],
  ["mechanical", "Mecânica e Tubulação", "Process utilities, piping, tie-ins, supports, and equipment connections."],
  ["automation", "Sistemas Especiais e Automação", "Controls, I/O, interlocks, networks, and cause-and-effect logic."],
  ["fire", "Proteção Contra Incêndio", "Fire coverage, access, classification, and life-safety interfaces."],
].map(([id, name, blurb], sort) => ({ organization_id: organizationId, id, name, blurb, sort }));

const personas = [
  ["mf-demo:project-manager", "Marina Costa", "planning", "Gerente do Projeto", "knowledge_steward"],
  ["mf-demo:electrical", "Rafael Almeida", "electrical", "Líder de Elétrica", "member"],
  ["mf-demo:bim", "Camila Nunes", "bim", "Coordenadora BIM", "member"],
  ["mf-demo:planning", "Lucas Ferreira", "planning", "Engenheiro de Planejamento", "member"],
  ["mf-demo:quality", "Beatriz Souza", "quality", "Líder de Qualidade", "member"],
];

async function upsert(table, rows, onConflict) {
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

try {
  await upsert("brain_organizations", [{
    id: organizationId,
    name: "Minerbo-Fuchs Engenharia — Demonstration",
    slug: organizationId,
    settings: { demo: true, locale: "pt-BR", dataClassification: "synthetic" },
  }], "id");
  await upsert("brain_departments", departments, "organization_id,id");
  await upsert("brain_projects", [{
    organization_id: organizationId,
    id: projectId,
    name: "Uberlândia Refrescos — Phase 3",
    blurb: "Synthetic executive-design coordination scenario grounded in the public MF case study.",
    status: "active",
    sort: 0,
  }], "organization_id,id");
  await upsert("brain_profiles", personas.map(([userId, name, departmentId, title]) => ({
    organization_id: organizationId,
    user_id: userId,
    name,
    department_id: departmentId,
    title,
  })), "organization_id,user_id");
  await upsert("brain_memberships", personas.map(([userId, , departmentId, , role]) => ({
    organization_id: organizationId,
    user_id: userId,
    role,
    department_id: departmentId,
    active: true,
  })), "organization_id,user_id");
  await upsert("brain_project_memberships", personas.map(([userId]) => ({
    organization_id: organizationId,
    project_id: projectId,
    user_id: userId,
    active: true,
  })), "organization_id,project_id,user_id");
  const { error: learningPolicyError } = await db.rpc("brain_set_learning_policy", {
    p_organization_id: organizationId,
    p_actor_user_id: "mf-demo:project-manager",
    p_mode: "shadow",
    p_settings: { demo: true, gardenerEnabled: false },
  });
  if (learningPolicyError) throw new Error(`brain learning policy: ${learningPolicyError.message}`);
  const migrationSql = readFileSync(
    new URL("../supabase/urso/0012_minerbo_fuchs_demo_org.sql", import.meta.url),
    "utf8",
  );
  await upsert("schema_migrations", [{
    filename: "0012_minerbo_fuchs_demo_org.sql",
    checksum: createHash("sha256").update(migrationSql).digest("hex"),
    applied_by: "brain-mf-provision.mjs",
  }], "filename");
  console.log("✓ Provisioned isolated MF demo organization, project, 15 departments, and five project-scoped personas.");
} catch (error) {
  console.error(`✖ MF provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
