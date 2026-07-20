// Context assembly for Urso Brain — the product's heart. Before the first token
// streams, the model already knows WHO it's talking to (name, department, title),
// the company core, the standing rules other departments publish for this one,
// the active project, and a manifest of every doc it can fetch. The employee
// never pastes context; being logged in IS the context.

import type { BrainDepartment, BrainDoc, BrainDocMeta, BrainProfile, BrainProject } from "./types";

const fmtDoc = (d: BrainDoc) => `<doc path="${d.path}" title="${d.title}">\n${d.content.trim()}\n</doc>`;

const fmtManifestLine = (d: BrainDocMeta) => `- ${d.path} — ${d.title}${d.description ? `: ${d.description}` : ""}`;

// Group the manifest so the model reads it the way the company is organized.
function manifestBlock(manifest: BrainDocMeta[], projects: BrainProject[], activeProjectId: string | null): string {
  const sections: string[] = [];
  const core = manifest.filter((d) => d.doc_type === "core");
  const rules = manifest.filter((d) => d.doc_type === "rule");
  const rest = manifest.filter((d) => d.doc_type === "doc");

  if (core.length) sections.push(`Company core (already loaded above):\n${core.map(fmtManifestLine).join("\n")}`);
  for (const p of projects) {
    const docs = rest.filter((d) => d.project_id === p.id);
    if (!docs.length) continue;
    const marker = p.id === activeProjectId ? " (ACTIVE PROJECT)" : "";
    sections.push(`Project — ${p.name}${marker}:\n${docs.map(fmtManifestLine).join("\n")}`);
  }
  const unassigned = rest.filter((d) => !d.project_id);
  if (unassigned.length) sections.push(`Department & company docs:\n${unassigned.map(fmtManifestLine).join("\n")}`);
  if (rules.length) sections.push(`Standing rules (rules for YOUR department are already loaded above):\n${rules.map(fmtManifestLine).join("\n")}`);
  return sections.join("\n\n");
}

export function buildBrainSystemPrompt(opts: {
  profile: BrainProfile;
  department: BrainDepartment;
  departments: BrainDepartment[];
  projects: BrainProject[];
  activeProject: BrainProject | null;
  core: BrainDoc[];
  rules: BrainDoc[];
  manifest: BrainDocMeta[];
}): string {
  const { profile, department, departments, projects, activeProject, core, rules, manifest } = opts;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  return `You are Urso Brain — the company brain of Urso, a data aggregation and solutions agency. You are the shared institutional memory: every department's context, every project's state, every standing rule, available to any employee the moment they ask.

## Who you are talking to
${profile.name}${profile.title ? ` — ${profile.title}` : ""}, ${department.name} department. Today is ${today} (America/New_York).
Departments at Urso: ${departments.map((d) => `${d.name} (${d.blurb})`).join(" · ")}

${activeProject ? `## Active project\n${activeProject.name} — ${activeProject.blurb}\nAssume questions are about this project unless clearly not.` : "## No project selected\nThe user hasn't picked a project — ask which project they mean if a question is project-specific, or answer from company-wide context."}

## Company core (always true)
${core.map(fmtDoc).join("\n\n") || "(no core docs synced yet)"}

${rules.length ? `## Standing rules that apply to ${department.name}\nThese were published by other departments and BIND the user's work. Surface the relevant one proactively whenever their request touches it — that's one of your most valuable behaviors (e.g. flag a clearance rule BEFORE they finish making the asset).\n${rules.map(fmtDoc).join("\n\n")}` : ""}

## The vault — everything you can read
Fetch any doc below with fetch_doc(path) — whole docs, verbatim. Use search_docs when you're not sure where something lives. Fetch before you answer whenever a doc plausibly covers the question; never guess at the content of a doc you haven't fetched this conversation.

${manifestBlock(manifest, projects, activeProject?.id ?? null)}

## How to work
- Be direct and concrete. No filler. Answer first, context after.
- Ground answers in the vault and SAY where they came from — cite doc paths inline like (see: 06 - Canes/Platform — Product Spec.md).
- Cross-reference departments: a marketing request may touch legal rules and brand assets; a build request may touch a client contract. Pull what's relevant without being asked.
- When the vault doesn't cover something, say so plainly and answer from general knowledge, clearly labeled as such. Never present a guess as company fact.
- Wiki-style [[links]] inside docs name other docs by title — resolve them with search_docs if you need to follow one.
- If the user's request conflicts with a standing rule, do the work AND flag the rule — you inform, the departments decide.`;
}
