import "server-only";

import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditBrainEvent } from "./authorization";
import { getDepartments, getDocByPath } from "./db";
import type { BrainDocMeta, BrainPrincipal } from "./types";
import { checkMeta, normalizeDocPath, sanitizePathPart } from "./write";

type Admin = SupabaseClient;

const exactReplacementSchema = z.object({
  find: z.string().min(1).max(4_000).describe("Exact current text to replace; it must occur exactly once"),
  replace: z.string().max(8_000).describe("Replacement text, or an empty string to remove the exact text"),
});

const relatedEditSchema = z.object({
  targetPath: z.string().describe("Existing authorized document path"),
  baseVersion: z.number().int().positive().describe("Current version returned by inspect_knowledge_impact"),
  replacements: z.array(exactReplacementSchema).min(1).max(12),
});

const occurrences = (content: string, value: string): number =>
  value ? content.split(value).length - 1 : 0;

async function normalizeRuleAudience(
  admin: Admin,
  organizationId: string,
  audience: string[] | undefined,
): Promise<{ audience?: string[]; error?: string }> {
  if (!audience?.length) return { audience: ["all"] };
  const departments = await getDepartments(admin, organizationId);
  const byId = new Map(departments.map((item) => [item.id.toLowerCase(), item.id]));
  const byName = new Map(departments.map((item) => [item.name.toLowerCase(), item.id]));
  const normalized = audience.map((raw) => {
    const value = raw.trim().toLowerCase();
    if (value === "all" || value === "everyone" || value === "all employees") return "all";
    return byId.get(value) ?? byName.get(value) ?? "";
  });
  const invalid = audience.filter((_, index) => !normalized[index]);
  if (invalid.length) {
    return {
      error: `Invalid rule audience: ${invalid.join(", ")}. Use "all" or department IDs: ${departments
        .map((item) => item.id)
        .join(", ")}.`,
    };
  }
  return { audience: [...new Set(normalized)] };
}

// The model can suggest durable knowledge, but it cannot mutate company truth.
// A steward approves/rejects this queue in a separate transaction.
export function buildBrainTools(opts: {
  admin: Admin;
  principal: BrainPrincipal;
  authorizedDocs: BrainDocMeta[];
  evidenceIds: string[];
}) {
  const { admin, principal, authorizedDocs } = opts;
  const evidenceIds = new Set(opts.evidenceIds);

  return {
    inspect_knowledge_impact: tool({
      description:
        "Find every authorized document containing exact terms before proposing a correction that may supersede project- or company-wide knowledge. Returns current versions and exact matching lines for safe batch replacements.",
      inputSchema: z.object({
        terms: z.array(z.string().min(2).max(120)).min(1).max(8),
        projectId: z.string().optional().describe("Optional exact project slug, for example woof-gang"),
        maxDocuments: z.number().int().min(1).max(30).default(24),
      }),
      execute: async ({ terms, projectId, maxDocuments }) => {
        const authorizedIds = authorizedDocs
          .map((doc) => doc.id)
          .filter((id): id is string => Boolean(id));
        if (!authorizedIds.length) return { matches: [], note: "No authorized documents." };

        const { data, error } = await admin
          .from("brain_docs")
          .select("id, path, title, project_id, current_version, content")
          .eq("organization_id", principal.organizationId)
          .in("id", authorizedIds)
          .is("deleted_at", null)
          .order("path");
        if (error) return { error: `Could not inspect knowledge: ${error.message}` };

        const needles = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
        const allMatches = (data ?? [])
          .filter((raw) => !projectId || raw.project_id === projectId)
          .map((raw) => {
            const lines = String(raw.content).split("\n");
            const allMatchingLines = lines
              .map((line, index) => ({ line, lineNumber: index + 1 }))
              .filter(({ line }) =>
                needles.some((term) => line.toLowerCase().includes(term.toLowerCase())),
              );
            const matchingLines = allMatchingLines
              .slice(0, 12)
              .map(({ line, lineNumber }) => ({
                lineNumber,
                text: line.length > 4_000 ? `${line.slice(0, 3_999)}…` : line,
                exact: line.length <= 4_000,
              }));
            return {
              targetPath: String(raw.path),
              title: String(raw.title),
              projectId: raw.project_id as string | null,
              currentVersion: Number(raw.current_version),
              matchingLines,
              matchingLineCount: allMatchingLines.length,
              truncated: allMatchingLines.length > matchingLines.length,
            };
          })
          .filter((item) => item.matchingLineCount > 0);
        const matches = allMatches.slice(0, maxDocuments);

        return {
          terms: needles,
          matches,
          totalDocuments: allMatches.length,
          truncated: allMatches.length > matches.length || matches.some((item) => item.truncated),
          note:
            "Use relatedEdits for false current/future claims. Preserve genuinely historical or manual-observation references, but label them historical when they could be mistaken for current scope.",
        };
      },
    }),
    propose_knowledge_update: tool({
      description:
        "Queue one reviewable company-brain change. For a correction that supersedes knowledge across a project or company, first call inspect_knowledge_impact, create or update an applicable governing rule, and include exact relatedEdits for every false current/future claim. This never edits truth directly.",
      inputSchema: z.object({
        operation: z.enum(["create", "update", "link", "delete"]),
        targetPath: z.string().describe("Existing authorized path, or the proposed path for a new doc"),
        title: z.string().min(2).max(120).optional(),
        content: z.string().max(40_000).optional().describe("Proposed complete markdown for create/update"),
        description: z.string().max(200).optional(),
        department: z.string().optional(),
        project: z.string().optional(),
        documentType: z.enum(["core", "doc", "rule"]).optional(),
        visibility: z.enum(["organization", "department", "project", "restricted"]).optional(),
        audience: z.array(z.string()).max(20).optional(),
        linkedPath: z.string().optional().describe("Authorized target path for a link proposal"),
        relatedEdits: z
          .array(relatedEditSchema)
          .max(30)
          .default([])
          .describe("Exact edits to other affected authorized documents, based on inspect_knowledge_impact"),
        rationale: z.string().min(4).max(800),
        evidenceIds: z.array(z.string()).max(20).default([]).describe("Context Receipt evidence IDs supporting this change"),
      }),
      execute: async ({
        operation,
        targetPath,
        title,
        content,
        description,
        department,
        project,
        documentType,
        visibility,
        audience,
        linkedPath,
        relatedEdits,
        rationale,
        evidenceIds: proposedEvidence,
      }) => {
        const target = authorizedDocs.find((doc) => doc.path === targetPath);
        if (operation !== "create" && !target) {
          return { error: "That document is not in the caller's permitted catalog." };
        }

        let path = targetPath.trim();
        if (operation === "create") {
          const normalized = normalizeDocPath(path, sanitizePathPart(title ?? "Untitled"));
          if (normalized.error || !normalized.path) return { error: normalized.error ?? "Invalid path." };
          path = normalized.path;
          if (authorizedDocs.some((doc) => doc.path === path)) {
            return { error: "A document already exists at that path; propose an update instead." };
          }
        }

        if ((operation === "create" || operation === "update") && !content?.trim()) {
          return { error: "Create and update proposals need proposed markdown content." };
        }
        if (operation === "link" && !authorizedDocs.some((doc) => doc.path === linkedPath)) {
          return { error: "The linked document is not in the caller's permitted catalog." };
        }

        const checked = await checkMeta(
          admin,
          { department, project, type: documentType },
          principal.organizationId,
        );
        if (checked.error) return { error: checked.error };

        const effectiveType = checked.doc_type ?? target?.doc_type;
        const requestedAudience =
          audience ?? (operation !== "create" && effectiveType === "rule" ? target?.audience : undefined);
        const normalizedAudience =
          effectiveType === "rule"
            ? await normalizeRuleAudience(admin, principal.organizationId, requestedAudience)
            : { audience: [] as string[] };
        if (normalizedAudience.error) return { error: normalizedAudience.error };

        const seenEditPaths = new Set<string>();
        for (const edit of relatedEdits) {
          if (edit.targetPath === path) {
            return { error: "A related edit cannot target the proposal's primary document." };
          }
          if (seenEditPaths.has(edit.targetPath)) {
            return { error: `Duplicate related edit target: ${edit.targetPath}` };
          }
          seenEditPaths.add(edit.targetPath);
          const editTarget = authorizedDocs.find((doc) => doc.path === edit.targetPath);
          if (!editTarget) {
            return { error: `Related edit is outside the permitted catalog: ${edit.targetPath}` };
          }
          if (editTarget.current_version !== edit.baseVersion) {
            return {
              error: `${edit.targetPath} changed after impact inspection. Inspect again before proposing edits.`,
            };
          }
          const current = await getDocByPath(admin, edit.targetPath, principal.organizationId);
          if (!current) return { error: `Related edit target is no longer available: ${edit.targetPath}` };
          let preview = current.content;
          for (const replacement of edit.replacements) {
            if (occurrences(preview, replacement.find) !== 1) {
              return {
                error: `Exact text for ${edit.targetPath} must occur once. Inspect the document again and use an exact matching line.`,
              };
            }
            preview = preview.replace(replacement.find, replacement.replace);
          }
        }

        const groundedEvidence = proposedEvidence.filter((id) => evidenceIds.has(id));
        const proposedChange = {
          title: title?.trim(),
          content: content?.trim(),
          description: description?.trim(),
          department:
            checked.department_id === undefined ? undefined : checked.department_id ?? "none",
          project: checked.project_id === undefined ? undefined : checked.project_id ?? "none",
          documentType: checked.doc_type,
          visibility,
          audience: effectiveType === "rule" ? normalizedAudience.audience : [],
          linkedPath,
          relatedEdits,
          targetBaseVersion: target?.current_version,
        };
        const { data, error } = await admin
          .from("brain_knowledge_proposals")
          .insert({
            organization_id: principal.organizationId,
            operation,
            target_doc_id: target?.id ?? null,
            target_path: path,
            proposed_change: proposedChange,
            evidence: groundedEvidence,
            rationale: rationale.trim(),
            proposed_by: principal.userId,
          })
          .select("id")
          .single();
        if (error) return { error: `Could not queue the proposal: ${error.message}` };

        const proposalId = (data as { id: string }).id;
        await auditBrainEvent(admin, principal, "knowledge.proposed", "knowledge_proposal", proposalId, {
          operation,
          targetPath: path,
          evidenceIds: groundedEvidence,
          affectedPaths: relatedEdits.map((edit) => edit.targetPath),
        });

        return {
          proposalId,
          status: "pending",
          targetPath: path,
          affectedDocuments: relatedEdits.length + 1,
          note: "Queued for a knowledge steward. Company truth has not changed.",
        };
      },
    }),
  };
}
