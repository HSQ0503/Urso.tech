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

const tokensOf = (value: string): string[] =>
  value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const termsOf = (query: string): string[] =>
  [...new Set(tokensOf(query).filter((term) => term.length >= 3 && !STOP_WORDS.has(term)))].slice(
    0,
    24,
  );

const phrasesOf = (query: string): string[] => {
  const tokens = tokensOf(query).filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
  return [...new Set(tokens.slice(0, -1).map((term, index) => `${term} ${tokens[index + 1]}`))].slice(
    0,
    24,
  );
};

const queryVariants = (query: string): string[] => {
  const normalized = query.replace(/\s+/g, " ").trim();
  const clauses = normalized
    .split(
      /[;?]+|,\s*(?=(?:and\s+)?(?:is|are|do|does|did|what|where|which|how|when|why|whether|can|could|should|will)\b)|\band\s+(?=(?:is|are|do|does|did|what|where|which|how|when|why|whether|can|could|should|will)\b)/i,
    )
    .map((part) => part.trim())
    .filter((part) => termsOf(part).length >= 2);
  const expandedClauses = clauses.map((clause) => {
    const terms = new Set(tokensOf(clause));
    const asksCurrentStatus = ["current", "currently", "live", "today", "now"].some((term) =>
      terms.has(term),
    );
    const asksDataSource = ["data", "fetch", "source", "integration"].some((term) =>
      terms.has(term),
    );
    if (asksCurrentStatus && asksDataSource) {
      return `${clause} production active system of record operational status handoff`;
    }
    if (terms.has("criteria") || terms.has("requirements") || terms.has("required")) {
      return `${clause} acceptance checklist pass fail what it works means exact constraints`;
    }
    if (terms.has("handoff") || terms.has("provide") || terms.has("deliver")) {
      return `${clause} required inputs fields content checklist deliverables`;
    }
    return clause;
  });
  return [...new Set([normalized, ...expandedClauses])].slice(0, 3);
};

const excerpt = (value: string, max = 2_100): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

function roundRobinEvidence(lists: RetrievedEvidence[][]): RetrievedEvidence[] {
  const merged: RetrievedEvidence[] = [];
  const largest = Math.max(0, ...lists.map((items) => items.length));
  for (let index = 0; index < largest; index += 1) {
    for (const items of lists) {
      const item = items[index];
      if (item) merged.push(item);
    }
  }
  return merged;
}

async function consolidateCompactPrimaryDocument(
  admin: Admin,
  query: string,
  items: RetrievedEvidence[],
): Promise<RetrievedEvidence[]> {
  if (
    !/\b(list|phases?|steps?|criteria|requirements?|workflow|handoff|provide|must|end[- ]to[- ]end)\b/i.test(
      query,
    )
  ) {
    return items;
  }
  const primary = items.find((item) => item.chunkId);
  if (!primary) return items;

  const { data, error } = await admin
    .from("brain_doc_chunks")
    .select("content,token_count")
    .eq("doc_id", primary.docId)
    .eq("version", primary.version)
    .order("ordinal");
  if (error || !data || data.length < 2 || data.length > 8) return items;

  const combined = data.map((row) => String(row.content)).join("\n\n");
  if (combined.length > 7_000) return items;
  const complete: RetrievedEvidence = {
    ...primary,
    chunkId: null,
    heading: `${primary.title} — complete document`,
    excerpt: combined,
    reasons: [...new Set([...primary.reasons, "complete compact document"])],
    tokenCount: data.reduce((sum, row) => sum + Number(row.token_count ?? 0), 0),
  };
  return [complete, ...items.filter((item) => item.docId !== primary.docId)];
}

function prioritizeDocumentCoverage(
  items: RetrievedEvidence[],
  uniqueTarget: number,
): RetrievedEvidence[] {
  const firstByDocument: RetrievedEvidence[] = [];
  const remaining: RetrievedEvidence[] = [];
  const paths = new Set<string>();
  const chunks = new Set<string>();
  const chunksPerDocument = new Map<string, number>();
  for (const item of items) {
    const chunkKey = item.chunkId ?? `${item.path}\0${item.heading}\0${item.excerpt}`;
    if (chunks.has(chunkKey)) continue;
    const documentCount = chunksPerDocument.get(item.path) ?? 0;
    if (documentCount >= 6) continue;
    chunks.add(chunkKey);
    chunksPerDocument.set(item.path, documentCount + 1);
    if (firstByDocument.length < uniqueTarget && !paths.has(item.path)) {
      paths.add(item.path);
      firstByDocument.push(item);
    } else remaining.push(item);
  }
  return [...firstByDocument, ...remaining];
}

function tokenCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokensOf(value)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

const normalizedTerms = (value: string): string =>
  tokensOf(value)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    .join(" ");

const scoreText = (
  queryTerms: string[],
  queryPhrases: string[],
  termWeights: Map<string, number>,
  doc: { title: string; description: string; content: string; project_id: string | null; doc_type: string },
  projectId: string | null,
): number => {
  const titleCounts = tokenCounts(doc.title);
  const descriptionCounts = tokenCounts(doc.description);
  const contentCounts = tokenCounts(doc.content);
  const termScore = queryTerms.reduce(
    (score, term) => {
      const weight = termWeights.get(term) ?? 1;
      return (
        score +
        (titleCounts.has(term) ? 6 * weight : 0) +
        (descriptionCounts.has(term) ? 3 * weight : 0) +
        Math.min(4, contentCounts.get(term) ?? 0) * 0.9 * weight
      );
    },
    0,
  );
  const normalizedTitle = normalizedTerms(doc.title);
  const normalizedDescription = normalizedTerms(doc.description);
  const normalizedContent = normalizedTerms(doc.content);
  const phraseScore = queryPhrases.reduce(
    (score, phrase) =>
      score +
      (normalizedTitle.includes(phrase) ? 7 : 0) +
      (normalizedDescription.includes(phrase) ? 3.5 : 0) +
      (normalizedContent.includes(phrase) ? 5 : 0),
    0,
  );
  const relevance = termScore + phraseScore;
  if (relevance <= 0) return 0;
  const scopeBoost = projectId && doc.project_id === projectId ? 2.5 : 0;
  const policyBoost = doc.doc_type === "rule" ? 0.35 : doc.doc_type === "core" ? 0.2 : 0;
  return relevance + scopeBoost + policyBoost;
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
  const queryPhrases = phrasesOf(query);
  const documentTokens = (data ?? []).map((row) => new Set(tokensOf(`${row.title} ${row.description} ${row.content}`)));
  const termWeights = new Map(
    queryTerms.map((term) => {
      const documentFrequency = documentTokens.filter((tokens) => tokens.has(term)).length;
      const inverseFrequency = 1 + Math.log(((data?.length ?? 0) + 1) / (documentFrequency + 1));
      const prevalence = documentFrequency / Math.max(data?.length ?? 0, 1);
      const prevalenceWeight = prevalence >= 0.2 ? 0.2 : prevalence >= 0.1 ? 0.55 : 1;
      const identifierBoost = term.length >= 10 && /[a-z].*\d|\d.*[a-z]/.test(term) ? 12 : 0;
      return [term, inverseFrequency * prevalenceWeight + identifierBoost];
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

    const docScore = scoreText(queryTerms, queryPhrases, termWeights, doc, projectId);
    const documentIdentity = new Set(tokensOf(doc.title));
    const chunkTerms = queryTerms.filter((term) => !documentIdentity.has(term));
    const normalizedDocumentTitle = normalizedTerms(doc.title);
    const chunkPhrases = queryPhrases.filter(
      (phrase) => !normalizedDocumentTitle.includes(phrase),
    );
    const chunks = chunkMarkdown(doc.content);
    searchedChunks += chunks.length;
    for (const chunk of chunks) {
      const chunkScore = scoreText(
        chunkTerms,
        chunkPhrases,
        termWeights,
        {
          ...doc,
          title: chunk.heading.split(" › ").at(-1) || doc.title,
          content: chunk.content,
        },
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
          ...(queryTerms.some((term) =>
            new Set(tokensOf(`${doc.title} ${chunk.heading} ${chunk.content}`)).has(term),
          )
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
    evidence: prioritizeDocumentCoverage(candidates, Math.min(5, limit)).slice(0, limit),
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
  const variants = queryVariants(query);
  const searches = await Promise.all(
    variants.map(async (variant) => {
      const embedding = await queryEmbedding(openAiKey, variant);
      const [{ data, error }, lexicalFallback] = await Promise.all([
        admin.rpc("brain_authorized_hybrid_search", {
          p_organization_id: principal.organizationId,
          p_user_id: principal.userId,
          p_department_id: principal.departmentId,
          p_project_id: projectId,
          p_query: variant,
          p_query_embedding: embedding,
          p_limit: limit,
        }),
        fallbackLexicalSearch(
          admin,
          authorizedDocs,
          variant,
          projectId,
          principal.departmentId,
          limit,
        ),
      ]);
      if (error) {
        console.error("[brain] hybrid RPC unavailable; using lexical fallback:", error.message);
        return {
          mode: lexicalFallback.mode,
          searchedChunks: lexicalFallback.searchedChunks,
          evidence: lexicalFallback.evidence,
        };
      }

      const rows = (data ?? []) as SearchRow[];
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
        ? roundRobinEvidence([rpcEvidence.slice(0, 8), lexicalFallback.evidence])
        : [...lexicalFallback.evidence, ...rpcEvidence];
      return {
        mode:
          embedding && rows.some((row) => row.semantic_score > 0)
            ? ("hybrid" as const)
            : ("lexical" as const),
        searchedChunks:
          Number(rows[0]?.candidate_count ?? rows.length) +
          lexicalFallback.searchedChunks,
        evidence: prioritizeDocumentCoverage(evidence, Math.min(3, limit)).slice(0, limit),
      };
    }),
  );

  const mode: BrainRetrievalMode = searches.some((result) => result.mode === "hybrid")
    ? "hybrid"
    : searches.some((result) => result.mode === "lexical")
      ? "lexical"
      : "none";
  const evidence = prioritizeDocumentCoverage(
    roundRobinEvidence(searches.map((result) => result.evidence)),
    Math.min(3, limit),
  ).slice(0, limit);
  return {
    mode,
    searchedChunks: searches.reduce((sum, result) => sum + result.searchedChunks, 0),
    evidence: await consolidateCompactPrimaryDocument(admin, query, evidence),
  };
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

  const indexedVersions = new Map<string, { version: number; count: number }>();
  for (const row of rows) {
    const current = indexedVersions.get(row.doc_id);
    indexedVersions.set(row.doc_id, {
      version: row.version,
      count: (current?.count ?? 0) + 1,
    });
  }
  for (const [docId, indexed] of indexedVersions) {
    const { error: cleanupError } = await admin
      .from("brain_doc_chunks")
      .delete()
      .eq("doc_id", docId)
      .eq("version", indexed.version)
      .gte("ordinal", indexed.count);
    if (cleanupError) throw new Error(`stale chunk cleanup failed: ${cleanupError.message}`);
  }

  return {
    documents: new Set(rows.map((row) => row.doc_id)).size,
    chunks: rows.length,
    embedded,
  };
}
