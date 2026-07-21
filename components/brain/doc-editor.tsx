"use client";

// Manual doc editor — create or edit a vault doc by hand, the human twin of
// the AI's write tools. Markdown body, [[wikilinks]] connect docs exactly like
// Obsidian. Edits become brain-owned and flow back to disk on the next export.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

export function DocEditor({
  mode,
  departments,
  projects,
  initial,
}: {
  mode: "create" | "edit";
  departments: Option[];
  projects: Option[];
  initial?: {
    path: string;
    title: string;
    description: string;
    department: string;
    project: string;
    type: string;
    audience: string;
    content: string;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [project, setProject] = useState(initial?.project ?? "");
  const [type, setType] = useState(initial?.type ?? "doc");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/brain/docs", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: initial?.path,
          title,
          description,
          department: department || "none",
          project: project || "none",
          type,
          audience: audience.split(",").map((s) => s.trim()).filter(Boolean),
          content,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; path?: string };
      if (!r.ok) {
        setError(data.error ?? "Save failed — try again.");
        return;
      }
      router.push(`/brain/docs/view?path=${encodeURIComponent(data.path ?? initial?.path ?? "")}`);
      router.refresh();
    } catch {
      setError("Save failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || !initial?.path) return;
    if (!window.confirm(`Delete "${initial.title}"? It's recoverable by an admin, but disappears from the brain.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/brain/docs", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: initial.path }),
      });
      if (!r.ok) {
        setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Delete failed.");
        return;
      }
      router.push("/brain/docs");
      router.refresh();
    } catch {
      setError("Delete failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-none border border-edge bg-raise px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]";
  const labelCls = "font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer";

  return (
    <form onSubmit={save} className="space-y-5">
      {mode === "edit" && initial && (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{initial.path}</div>
      )}

      <div>
        <label htmlFor="doc-title" className={labelCls}>Title</label>
        <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1.5 ${inputCls}`} />
      </div>

      <div>
        <label htmlFor="doc-desc" className={labelCls}>One-line description</label>
        <input
          id="doc-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shown in the manifest — helps the brain (and people) find it"
          className={`mt-1.5 ${inputCls}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="doc-dept" className={labelCls}>Department</label>
          <select id="doc-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={`mt-1.5 ${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="doc-proj" className={labelCls}>Project</label>
          <select id="doc-proj" value={project} onChange={(e) => setProject(e.target.value)} className={`mt-1.5 ${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="doc-type" className={labelCls}>Type</label>
          <select id="doc-type" value={type} onChange={(e) => setType(e.target.value)} className={`mt-1.5 ${inputCls} cursor-pointer`}>
            <option value="doc">Doc</option>
            <option value="rule">Standing rule</option>
            <option value="core">Core (always in context)</option>
          </select>
        </div>
      </div>

      {type === "rule" && (
        <div>
          <label htmlFor="doc-aud" className={labelCls}>Rule audience (comma-separated department slugs, or &ldquo;all&rdquo;)</label>
          <input id="doc-aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="all" className={`mt-1.5 ${inputCls}`} />
        </div>
      )}

      <div>
        <label htmlFor="doc-content" className={labelCls}>Content — markdown, connect docs with [[Doc Title]]</label>
        <textarea
          id="doc-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          className={`mt-1.5 ${inputCls} min-h-[320px] resize-y font-mono text-[13px] leading-[1.6]`}
        />
      </div>

      {error && <p className="text-[12.5px] text-orange">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || title.trim().length < 2 || !content.trim()}
          className="dash-press cursor-pointer rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-5 py-2.5 text-[13.5px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
        >
          {busy ? "Saving…" : mode === "create" ? "Create doc" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="cursor-pointer rounded-none border border-edge px-4 py-2.5 text-[13px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
