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

const isDecisionDocument = (doc: { title: string; path: string }): boolean =>
  /^decision\b/i.test(doc.title.trim()) ||
  /\bdecision\b/i.test(doc.title) ||
  /(?:^|\/)Decision\s+[—-]/i.test(doc.path);

const authorityFor = (doc: {
  title: string;
  path: string;
  doc_type: "core" | "doc" | "rule";
}): "governing" | "reference" =>
  doc.doc_type === "rule" || isDecisionDocument(doc) ? "governing" : "reference";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "associated",
  "before",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "just",
  "like",
  "may",
  "need",
  "not",
  "our",
  "should",
  "that",
  "the",
  "their",
  "then",
  "this",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
  "would",
  "you",
]);

const termsOf = (query: string): string[] =>
  [
    ...new Set(
      (query.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []).filter(
        (term) => !STOP_WORDS.has(term),
      ),
    ),
  ].slice(0, 24);

const excerpt = (value: string, max = 900): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

function diversifyEvidence(items: RetrievedEvidence[]): RetrievedEvidence[] {
  const firstByDocument: RetrievedEvidence[] = [];
  const remaining: RetrievedEvidence[] = [];
  const paths = new Set<string>();
  for (const item of items) {
    if (paths.has(item.path)) remaining.push(item);
    else {
      paths.add(item.path);
      firstByDocument.push(item);
    }
  }
  return [...firstByDocument, ...remaining];
}

const scoreText = (
  queryTerms: string[],
  termWeights: Map<string, number>,
  doc: { title: string; description: string; content: string; project_id: string | null; doc_type: string },
  projectId: string | null,
): number => {
  const title = doc.title.toLowerCase();
  const description = doc.description.toLowerCase();
  const content = doc.content.toLowerCase();
  const termScore = queryTerms.reduce(
    (score, term) => {
      const weight = termWeights.get(term) ?? 1;
      return (
        score +
        (title.includes(term) ? 6 * weight : 0) +
        (description.includes(term) ? 3 * weight : 0) +
        Math.min(3, content.split(term).length - 1) * 0.8 * weight
      );
    },
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
  const termWeights = new Map(
    queryTerms.map((term) => {
      const documentFrequency = (data ?? []).filter((row) =>
        `${row.title} ${row.description} ${row.content}`.toLowerCase().includes(term),
      ).length;
      const inverseFrequency = 1 + Math.log(((data?.length ?? 0) + 1) / (documentFrequency + 1));
      const identifierBoost = term.length >= 10 && /[a-z].*\d|\d.*[a-z]/.test(term) ? 12 : 0;
      return [term, inverseFrequency + identifierBoost];
    }),
  );
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

    const docScore = scoreText(queryTerms, termWeights, doc, projectId);
    const chunks = chunkMarkdown(doc.content);
    searchedChunks += chunks.length;
    for (const chunk of chunks) {
      const chunkScore = scoreText(
        queryTerms,
        termWeights,
        { ...doc, title: `${doc.title} ${chunk.heading}`, content: chunk.content },
        projectId,
      );
      if (chunkScore <= 0 && doc.doc_type === "doc") continue;
      const score = Math.max(chunkScore, docScore * 0.15);
      candidates.push({
        id: "",
        docId: doc.id,
        chunkId: null,
        path: doc.path,
        title: doc.title,
        documentType: doc.doc_type,
        authority: authorityFor(doc),
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
  return {
    mode: candidates.length ? "lexical" : "none",
    searchedChunks,
    evidence: diversifyEvidence(candidates).slice(0, limit),
  };
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
  const [{ data, error }, lexicalFallback] = await Promise.all([
    admin.rpc("brain_authorized_hybrid_search", {
      p_organization_id: principal.organizationId,
      p_user_id: principal.userId,
      p_department_id: principal.departmentId,
      p_project_id: projectId,
      p_query: query,
      p_query_embedding: embedding,
      p_limit: limit,
    }),
    fallbackLexicalSearch(
      admin,
      authorizedDocs,
      query,
      projectId,
      principal.departmentId,
      Math.min(limit, 12),
    ),
  ]);

  if (!error && data?.length) {
    const rows = data as SearchRow[];
    const rpcEvidence: RetrievedEvidence[] = rows.map((row) => ({
      id: "",
      docId: row.doc_id,
      chunkId: row.chunk_id,
      path: row.path,
      title: row.title,
      documentType: row.doc_type,
      authority: authorityFor(row),
      heading: row.heading,
      excerpt: excerpt(row.content),
      version: row.version,
      reasons: reasonsFor(row, projectId),
      lexicalScore: row.lexical_score,
      semanticScore: row.semantic_score,
      fusedScore: row.fused_score,
      tokenCount: row.token_count,
    }));
    const evidence = embedding
      ? [
          ...rpcEvidence.slice(0, 6),
          ...lexicalFallback.evidence.slice(0, 8),
          ...rpcEvidence.slice(6),
          ...lexicalFallback.evidence.slice(8),
        ]
      : [...lexicalFallback.evidence, ...rpcEvidence];
    return {
      mode: embedding && rows.some((row) => row.semantic_score > 0) ? "hybrid" : "lexical",
      searchedChunks:
        Number(rows[0].candidate_count ?? rows.length) +
        lexicalFallback.searchedChunks,
      evidence: diversifyEvidence(evidence).slice(0, limit),
    };
  }

  if (error) console.error("[brain] hybrid RPC unavailable; using lexical fallback:", error.message);
  return lexicalFallback;
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
      isDecisionDocument(doc) ||
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
    opts.limit ?? 10,
  );
  return result.evidence;
}

export async function indexBrainDocuments(opts: {
  admin: Admin;
  organizationId: string;
  openAiKey: string | null;
  force?: boolean;
  paths?: string[];
}): Promise<{ documents: number; chunks: number; embedded: number }> {
  const { admin, organizationId, openAiKey, force = false, paths } = opts;
  let sourceQuery = admin
    .from("brain_docs")
    .select("id, path, title, content, current_version")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("path");
  if (paths?.length) sourceQuery = sourceQuery.in("path", [...new Set(paths)]);
  const { data, error } = await sourceQuery;
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
    try {
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
    } catch (error) {
      console.error(
        "[brain] document embedding failed; writing lexical index:",
        error instanceof Error ? error.message : error,
      );
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
