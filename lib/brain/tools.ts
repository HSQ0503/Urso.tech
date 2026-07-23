import "server-only";

import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditBrainEvent } from "./authorization";
import type { BrainDocMeta, BrainPrincipal } from "./types";
import { normalizeDocPath, sanitizePathPart } from "./write";

type Admin = SupabaseClient;

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
    propose_knowledge_update: tool({
      description:
        "Queue a reviewable change to the company brain when the user explicitly asks to save, correct, connect, or remove durable knowledge. This never edits truth directly.",
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

        const groundedEvidence = proposedEvidence.filter((id) => evidenceIds.has(id));
        const proposedChange = {
          title: title?.trim(),
          content: content?.trim(),
          description: description?.trim(),
          department,
          project,
          documentType,
          visibility,
          audience,
          linkedPath,
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
        });

        return {
          proposalId,
          status: "pending",
          targetPath: path,
          note: "Queued for a knowledge steward. Company truth has not changed.",
        };
      },
    }),
  };
}
