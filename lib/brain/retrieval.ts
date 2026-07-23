import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkMarkdown } from "./chunking";
import type {
  BrainContextEvidence,
  BrainDocMeta,
  BrainPrincipal,
  BrainRetrievalMode,
} from "./types";

type Admin = SupabaseClient;

type SearchRow = {
  chunk_id: string;
  doc_id: string;
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  visibility: string;
  version: number;
  heading: string;
  content: string;
  token_count: number;
  lexical_score: number;
  semantic_score: number;
  fused_score: number;
  candidate_count?: number;
};

export type RetrievedEvidence = BrainContextEvidence & {
  docId: string;
  chunkId: string | null;
  tokenCount: number;
};

export type RetrievalResult = {
  mode: BrainRetrievalMode;
  searchedChunks: number;
  evidence: RetrievedEvidence[];
};

const termsOf = (query: string): string[] =>
  [...new Set(query.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? [])].slice(0, 24);

const excerpt = (value: string, max = 900): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const scoreText = (
  queryTerms: string[],
  doc: { title: string; description: string; content: string; project_id: string | null; doc_type: string },
  projectId: string | null,
): number => {
  const title = doc.title.toLowerCase();
  const description = doc.description.toLowerCase();
  const content = doc.content.toLowerCase();
  const termScore = queryTerms.reduce(
    (score, term) =>
      score +
      (title.includes(term) ? 5 : 0) +
      (description.includes(term) ? 2.5 : 0) +
      Math.min(3, content.split(term).length - 1) * 0.7,
    0,
  );
  const scopeBoost = projectId && doc.project_id === projectId ? 2.5 : 0;
  const policyBoost = doc.doc_type === "rule" ? 0.35 : doc.doc_type === "core" ? 0.2 : 0;
  return termScore + scopeBoost + policyBoost;
};

async function queryEmbedding(apiKey: string | null, query: string): Promise<number[] | null> {
  if (!apiKey) return null;
  try {
    const openai = createOpenAI({ apiKey });
    const result = await embed({
      model: openai.embeddingModel("text-embedding-3-small"),
      value: query,
    });
    return result.embedding;
  } catch (error) {
    console.error("[brain] query embedding failed; using lexical retrieval:", error instanceof Error ? error.message : error);
    return null;
  }
}

function reasonsFor(row: SearchRow, projectId: string | null): string[] {
  const reasons: string[] = [];
  if (row.semantic_score > 0) reasons.push("semantic match");
  if (row.lexical_score > 0) reasons.push("keyword match");
  if (projectId && row.project_id === projectId) reasons.push("active project");
  if (row.doc_type === "rule") reasons.push("standing rule");
  if (row.doc_type === "core") reasons.push("company core");
  return reasons.length ? reasons : ["retrieval match"];
}

async function fallbackLexicalSearch(
  admin: Admin,
  authorizedDocs: BrainDocMeta[],
  query: string,
  projectId: string | null,
  departmentId: string,
  limit: number,
): Promise<RetrievalResult> {
  const ids = authorizedDocs.map((doc) => doc.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return { mode: "none", searchedChunks: 0, evidence: [] };

  const { data, error } = await admin
    .from("brain_docs")
    .select("id, path, title, description, department_id, project_id, doc_type, audience, content, current_version")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new Error(`lexical fallback failed: ${error.message}`);

  const queryTerms = termsOf(query);
  const candidates: RetrievedEvidence[] = [];
  let searchedChunks = 0;

  for (const raw of data ?? []) {
    const doc = raw as {
      id: string;
      path: string;
      title: string;
      description: string;
      department_id: string | null;
      project_id: string | null;
      doc_type: "core" | "doc" | "rule";
      audience: string[];
      content: string;
      current_version: number;
    };
    if (doc.doc_type === "rule" && !doc.audience.includes("all") && !doc.audience.includes(departmentId)) {
      continue;
    }

    const docScore = scoreText(queryTerms, doc, projectId);
    const chunks = chunkMarkdown(doc.content);
    searchedChunks += chunks.length;
    for (const chunk of chunks) {
      const chunkScore = scoreText(
        queryTerms,
        { ...doc, title: `${doc.title} ${chunk.heading}`, content: chunk.content },
        projectId,
      );
      if (chunkScore <= 0 && doc.doc_type === "doc") continue;
      const score = Math.max(docScore, chunkScore);
      candidates.push({
        id: "",
        docId: doc.id,
        chunkId: null,
        path: doc.path,
        title: doc.title,
        heading: chunk.heading,
        excerpt: excerpt(chunk.content),
        version: doc.current_version ?? 1,
        reasons: [
          ...(queryTerms.some((term) => `${doc.title} ${chunk.heading} ${chunk.content}`.toLowerCase().includes(term))
            ? ["keyword match"]
            : []),
          ...(projectId && doc.project_id === projectId ? ["active project"] : []),
          ...(doc.doc_type === "rule" ? ["standing rule"] : []),
          ...(doc.doc_type === "core" ? ["company core"] : []),
        ],
        lexicalScore: score,
        semanticScore: 0,
        fusedScore: score,
        tokenCount: chunk.tokenCount,
      });
    }
  }

  candidates.sort((a, b) => b.fusedScore - a.fusedScore || a.path.localeCompare(b.path));
  return { mode: candidates.length ? "lexical" : "none", searchedChunks, evidence: candidates.slice(0, limit) };
}

export async function searchAuthorizedKnowledge(opts: {
  admin: Admin;
  principal: BrainPrincipal;
  authorizedDocs: BrainDocMeta[];
  query: string;
  projectId: string | null;
  openAiKey: string | null;
  limit?: number;
}): Promise<RetrievalResult> {
  const { admin, principal, authorizedDocs, query, projectId, openAiKey } = opts;
  const limit = opts.limit ?? 24;
  const embedding = await queryEmbedding(openAiKey, query);
  const authorizedIds = authorizedDocs.map((doc) => doc.id).filter((id): id is string => Boolean(id));
  const [{ data, error }, keywordDocsResult] = await Promise.all([
    admin.rpc("brain_authorized_hybrid_search", {
      p_organization_id: principal.organizationId,
      p_user_id: principal.userId,
      p_department_id: principal.departmentId,
      p_project_id: projectId,
      p_query: query,
      p_query_embedding: embedding,
      p_limit: limit,
    }),
    query.trim() && authorizedIds.length
      ? admin
          .from("brain_docs")
          .select("id")
          .eq("organization_id", principal.organizationId)
          .in("id", authorizedIds)
          .textSearch("search_document", query, { config: "english", type: "websearch" })
          .is("deleted_at", null)
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!error && data?.length) {
    const rows = data as SearchRow[];
    const keywordIds = new Set(
      ((keywordDocsResult.data ?? []) as { id: string }[]).map((row) => row.id),
    );
    const keywordFallback = keywordIds.size
      ? await fallbackLexicalSearch(
          admin,
          authorizedDocs.filter((doc) => doc.id && keywordIds.has(doc.id)),
          query,
          projectId,
          principal.departmentId,
          8,
        )
      : { mode: "none" as const, searchedChunks: 0, evidence: [] };
    const evidence: RetrievedEvidence[] = rows.map((row) => ({
      id: "",
      docId: row.doc_id,
      chunkId: row.chunk_id,
      path: row.path,
      title: row.title,
      heading: row.heading,
      excerpt: excerpt(row.content),
      version: row.version,
      reasons: reasonsFor(row, projectId),
      lexicalScore: row.lexical_score,
      semanticScore: row.semantic_score,
      fusedScore: row.fused_score,
      tokenCount: row.token_count,
    }));
    const seen = new Set(evidence.map((item) => `${item.path}\0${item.heading}\0${item.excerpt}`));
    for (const item of keywordFallback.evidence) {
      const key = `${item.path}\0${item.heading}\0${item.excerpt}`;
      if (!seen.has(key)) evidence.push(item);
    }
    return {
      mode: embedding && rows.some((row) => row.semantic_score > 0) ? "hybrid" : "lexical",
      searchedChunks:
        Number(rows[0].candidate_count ?? rows.length) +
        keywordFallback.searchedChunks,
      evidence: evidence.slice(0, limit),
    };
  }

  if (error) console.error("[brain] hybrid RPC unavailable; using lexical fallback:", error.message);
  return fallbackLexicalSearch(admin, authorizedDocs, query, projectId, principal.departmentId, limit);
}

export async function loadBaselineKnowledge(opts: {
  admin: Admin;
  principal: BrainPrincipal;
  authorizedDocs: BrainDocMeta[];
  query: string;
  projectId: string | null;
  limit?: number;
}): Promise<RetrievedEvidence[]> {
  const baseline = opts.authorizedDocs.filter(
    (doc) =>
      doc.doc_type === "core" ||
      (doc.doc_type === "rule" &&
        (doc.audience.includes("all") || doc.audience.includes(opts.principal.departmentId))),
  );
  if (!baseline.length) return [];
  const result = await fallbackLexicalSearch(
    opts.admin,
    baseline,
    opts.query,
    opts.projectId,
    opts.principal.departmentId,
    opts.limit ?? 6,
  );
  return result.evidence;
}

export async function indexBrainDocuments(opts: {
  admin: Admin;
  organizationId: string;
  openAiKey: string | null;
  force?: boolean;
}): Promise<{ documents: number; chunks: number; embedded: number }> {
  const { admin, organizationId, openAiKey, force = false } = opts;
  const { data, error } = await admin
    .from("brain_docs")
    .select("id, path, title, content, current_version")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("path");
  if (error) throw new Error(`index source read failed: ${error.message}`);

  const docs = (data ?? []) as {
    id: string;
    path: string;
    title: string;
    content: string;
    current_version: number;
  }[];
  const rows: {
    organization_id: string;
    doc_id: string;
    version: number;
    ordinal: number;
    heading: string;
    content: string;
    token_count: number;
    metadata: { path: string; title: string };
    embedding?: number[];
  }[] = [];

  for (const doc of docs) {
    if (!force) {
      const { count } = await admin
        .from("brain_doc_chunks")
        .select("id", { count: "exact", head: true })
        .eq("doc_id", doc.id)
        .eq("version", doc.current_version);
      if (count) continue;
    }
    for (const chunk of chunkMarkdown(doc.content)) {
      rows.push({
        organization_id: organizationId,
        doc_id: doc.id,
        version: doc.current_version,
        ordinal: chunk.ordinal,
        heading: chunk.heading,
        content: chunk.content,
        token_count: chunk.tokenCount,
        metadata: { path: doc.path, title: doc.title },
      });
    }
  }

  let embedded = 0;
  if (openAiKey && rows.length) {
    const openai = createOpenAI({ apiKey: openAiKey });
    for (let start = 0; start < rows.length; start += 64) {
      const batch = rows.slice(start, start + 64);
      const result = await embedMany({
        model: openai.embeddingModel("text-embedding-3-small"),
        values: batch.map((row) => `${row.metadata.title}\n${row.heading}\n${row.content}`),
        maxParallelCalls: 4,
      });
      result.embeddings.forEach((value, index) => {
        batch[index].embedding = value;
        embedded += 1;
      });
    }
  }

  for (let start = 0; start < rows.length; start += 100) {
    const { error: upsertError } = await admin
      .from("brain_doc_chunks")
      .upsert(rows.slice(start, start + 100), { onConflict: "doc_id,version,ordinal" });
    if (upsertError) throw new Error(`chunk index write failed: ${upsertError.message}`);
  }

  return {
    documents: new Set(rows.map((row) => row.doc_id)).size,
    chunks: rows.length,
    embedded,
  };
}
