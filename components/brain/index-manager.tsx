"use client";

import { useState } from "react";
import { Database, LoaderCircle, Search } from "lucide-react";

type IndexResult = {
  documents: number;
  chunks: number;
  embedded: number;
  mode: "hybrid" | "lexical";
};

export function BrainIndexManager() {
  const [running, setRunning] = useState<"hybrid" | "lexical" | null>(null);
  const [result, setResult] = useState<IndexResult | null>(null);
  const [error, setError] = useState("");

  const build = async (mode: "hybrid" | "lexical") => {
    setRunning(mode);
    setError("");
    try {
      const response = await fetch("/api/brain/index", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true, embeddings: mode === "hybrid" }),
      });
      const data = (await response.json()) as IndexResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Indexing failed.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-orange-soft text-orange">
            <Database className="size-4" />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[var(--ob-text)]">Knowledge index</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--ob-muted)]">
              Heading-aware chunks · full-text · pgvector
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void build("lexical")}
            disabled={running !== null}
            className="ob-btn"
          >
            {running === "lexical" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Lexical only
          </button>
          <button
            type="button"
            onClick={() => void build("hybrid")}
            disabled={running !== null}
            className="ob-btn ob-btn-cta"
          >
            {running === "hybrid" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
            Build hybrid index
          </button>
        </div>
      </div>
      {running && (
        <p role="status" className="mt-3 text-[12px] text-[var(--ob-muted)]">
          Chunking and {running === "hybrid" ? "embedding" : "indexing"} the current document versions…
        </p>
      )}
      {result && !running && (
        <p className="mt-3 text-[12px] text-[var(--ob-muted)]">
          Indexed {result.documents} docs into {result.chunks} chunks
          {result.mode === "hybrid" ? ` · ${result.embedded} embeddings` : " · lexical mode"}.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-[12px] leading-5 text-orange">{error}</p>}
    </div>
  );
}
