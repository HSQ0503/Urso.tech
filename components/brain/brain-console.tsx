"use client";

// Urso Brain — the company-brain chat console. Adapted from the analyst console
// (components/dashboard/analyst-console.tsx): same thread persistence + hardening,
// but the context is the company vault (not store metrics), and the user picks a
// PROJECT (context scope) and a MODEL (routed via the org's BYO provider keys).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Check, ChevronDown, Copy, Maximize2, Menu, Minimize2, PenLine, Send, Square, Trash2 } from "lucide-react";
import { RichText } from "@/components/dashboard/rich-text";
import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import type { BrainProvider } from "@/lib/brain/types";

type ThreadSummary = { id: string; title: string; project_id: string | null; model: string; updated_at: string };
type ProjectOption = { id: string; name: string };

// Tool-activity chips: show WHAT the brain actually touched (real doc titles,
// search queries), and mark writes distinctly so edits are never invisible.
type ToolPart = { type: string; text?: string; input?: unknown; output?: unknown };
const WRITE_TOOLS = new Set(["create_doc", "update_doc", "link_docs", "delete_doc"]);

function toolChips(parts: ToolPart[]): { label: string; write: boolean }[] {
  const chips: { label: string; write: boolean }[] = [];
  const seen = new Set<string>();
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const baseName = (v: string | null) => (v ? (v.split("/").pop() ?? v).replace(/\.md$/i, "") : null);
  for (const p of parts) {
    if (!p.type.startsWith("tool-")) continue;
    const name = p.type.slice(5);
    const input = (p.input ?? {}) as Record<string, unknown>;
    const output = (p.output ?? {}) as Record<string, unknown>;
    let label: string;
    switch (name) {
      case "fetch_doc": label = `read · ${str(output.title) ?? baseName(str(input.path)) ?? "doc"}`; break;
      case "search_docs": label = `searched · ${str(input.query) ?? "vault"}`; break;
      case "list_docs": label = "listed docs"; break;
      case "create_doc": label = `created · ${baseName(str(output.created)) ?? str(input.title) ?? "doc"}`; break;
      case "update_doc": label = `updated · ${baseName(str(input.path)) ?? "doc"}`; break;
      case "link_docs": label = "connected docs"; break;
      case "delete_doc": label = `deleted · ${baseName(str(input.path)) ?? "doc"}`; break;
      default: label = name.replace(/_/g, " ");
    }
    if (label.length > 44) label = `${label.slice(0, 43)}…`;
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ label, write: WRITE_TOOLS.has(name) });
  }
  return chips;
}

const timeAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const SUGGESTIONS: Record<string, string[]> = {
  default: [
    "Catch me up — what's the current state of this project?",
    "What standing rules apply to my department?",
    "What's Urso's model and who do we serve?",
  ],
  marketing: [
    "I want to make a poster for a client campaign — what do I need to know first?",
    "Summarize our positioning so I can write copy that matches it.",
    "What has legal published that affects marketing work?",
  ],
  sales: [
    "How do we structure deals? Walk me through pricing on past clients.",
    "Draft talking points for pitching the dashboard to a multi-unit franchisee.",
    "What did we agree with Canes Pressure Washing?",
  ],
  legal: [
    "Which client contracts exist and what are their key terms?",
    "What compliance obligations do we have across active projects?",
    "Summarize the acceptance terms in the Canes agreement.",
  ],
  software: [
    "Catch me up on the current state of this build.",
    "What are the operational gotchas I must read before touching anything?",
    "The boss asked for a new feature — what's the stack and conventions?",
  ],
  exec: [
    "Where does every client engagement stand right now?",
    "What's blocked and waiting on whom, across all projects?",
    "What should we build or sell next, based on the vault?",
  ],
};

// Pre-stream failures reach useChat as the raw JSON body the route returned
// ({"error":"…"}) — unwrap it so users see the message, not the envelope.
// Mid-stream errors are already plain text and pass through unchanged.
const errorText = (message: string): string => {
  try {
    const j = JSON.parse(message) as { error?: string };
    if (typeof j.error === "string" && j.error) return j.error;
  } catch { /* not JSON */ }
  return message.trim() || "Something went wrong — try again.";
};

function Spark({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M12 5.5l1.7 4.8L18 12l-4.3 1.7L12 18.5l-1.7-4.8L6 12l4.3-1.7L12 5.5Z" />
    </svg>
  );
}

function ThinkingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[14px] text-[var(--brain-muted)]" role="status">
      <span className="size-2 animate-pulse rounded-full bg-orange" />
      {label}…
    </span>
  );
}

function Message({ role, parts, live = false }: { role: string; parts: { type: string; text?: string }[]; live?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");

  if (role === "user") {
    const isLong = text.length > 520;
    return (
      <div className="tip-in flex justify-end">
        <div className="max-w-[88%] rounded-[22px] bg-[var(--brain-user)] px-4 py-3 text-[15px] leading-[1.65] text-[var(--brain-text)] sm:max-w-[72%] sm:px-5">
          <p className={`whitespace-pre-wrap ${isLong && !expanded ? "line-clamp-6" : ""}`}>{text}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 cursor-pointer text-[12px] font-medium text-[var(--brain-muted-strong)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
            >
              {expanded ? "Show less" : "Show full prompt"}
            </button>
          )}
        </div>
      </div>
    );
  }
  const chips = toolChips(parts as ToolPart[]);
  return (
    <div className="tip-in flex gap-4">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center text-orange"><Spark className="size-[18px]" /></span>
      <div className="min-w-0 flex-1 space-y-3">
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-[var(--brain-muted)]">
            {chips.map((c) => (
              <span
                key={c.label}
                className={`chip-in rounded-full px-2.5 py-1 ${
                  c.write ? "bg-orange-soft text-orange" : "bg-[var(--brain-soft)]"
                }`}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
        {text ? (
          <RichText text={text} className="max-w-[72ch] text-[15px] text-[var(--brain-text)] sm:text-[15.5px]" />
        ) : chips.length > 0 && live ? (
          <ThinkingLabel label="working in the vault" />
        ) : chips.length > 0 ? (
          <span className="text-[13px] italic text-[var(--brain-muted)]">No written answer was saved for this turn.</span>
        ) : null}
        {text && !live && (
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
              aria-label={copied ? "Copied response" : "Copy response"}
              title={copied ? "Copied" : "Copy response"}
              className="grid size-11 cursor-pointer place-items-center rounded-full text-[var(--brain-muted)] transition-colors hover:bg-[var(--brain-soft)] hover:text-[var(--brain-text)]"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ firstName, departmentId, departmentName, onPick, busy }: { firstName: string; departmentId: string; departmentName: string; onPick: (t: string) => void; busy: boolean }) {
  const suggestions = SUGGESTIONS[departmentId] ?? SUGGESTIONS.default;
  return (
    <div className="mx-auto flex h-full w-full max-w-[820px] flex-col justify-center py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <Spark className="mb-5 size-8 text-orange" />
        <h2 className="text-[32px] font-medium leading-[1.12] tracking-[-0.035em] sm:text-[42px]">
          <span className="text-orange">Good to see you, {firstName}.</span>
          <span className="mt-1 block text-[var(--brain-muted)]">What should we work on?</span>
        </h2>
        <p className="mt-4 max-w-[620px] text-[14px] leading-6 text-[var(--brain-muted)] sm:text-[15px]">
          Ask about {departmentName.toLowerCase()}, a project, contract, rule, or anything already saved in the company vault.
        </p>
      </div>
      <div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              disabled={busy}
              className="group flex min-h-[88px] cursor-pointer flex-col items-start justify-between gap-4 rounded-[18px] bg-[var(--brain-soft)] p-4 text-left text-[13.5px] leading-5 text-[var(--brain-text)] transition-colors hover:bg-[var(--brain-soft-hover)] disabled:cursor-default disabled:opacity-50"
            >
              <span>{s}</span>
              <span className="self-end text-[var(--brain-muted)] transition-colors group-hover:text-orange"><Spark /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThreadRow({ thread, projectName, active, onOpen, onDelete, onRename }: { thread: ThreadSummary; projectName: string | null; active: boolean; onOpen: () => void; onDelete: () => void; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(thread.title);
  const startEdit = () => { setVal(thread.title); setEditing(true); };

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const t = val.trim();
          if (t && t !== thread.title) onRename(t);
          else setVal(thread.title);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setVal(thread.title); setEditing(false); }
        }}
        className="min-h-11 w-full rounded-xl border border-orange/45 bg-[var(--brain-canvas)] px-3 py-2 text-[13px] text-[var(--brain-text)] outline-none"
      />
    );
  }

  return (
    <div className={`group flex min-h-12 items-center gap-1 rounded-full pl-3.5 pr-1 text-[13px] transition-colors duration-200 ${active ? "bg-[var(--brain-selected)] text-[var(--brain-text)]" : "text-[var(--brain-muted-strong)] hover:bg-[var(--brain-soft-hover)] hover:text-[var(--brain-text)]"}`}>
      <button onClick={onOpen} onDoubleClick={startEdit} className="min-w-0 flex-1 cursor-pointer py-2 text-left" title={`${thread.title} (double-click to rename)`}>
        <span className="block truncate leading-tight">{thread.title}</span>
        <span className="mt-1 block truncate text-[10px] text-[var(--brain-muted)]">
          {projectName ?? "company-wide"} · {timeAgo(thread.updated_at)}
        </span>
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete conversation"
        title="Delete conversation"
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--brain-muted)] opacity-0 transition-[color,background-color,opacity] hover:bg-[var(--brain-soft)] hover:text-orange focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function ThreadRail({
  threads, projectNames, activeThreadId, onOpen, onNew, onDelete, onRename, busy, className = "",
}: {
  threads: ThreadSummary[]; projectNames: Record<string, string>; activeThreadId: string | null; onOpen: (id: string) => void; onNew: () => void;
  onDelete: (id: string) => void; onRename: (id: string, title: string) => void; busy: boolean; className?: string;
}) {
  return (
    <aside className={`w-[272px] shrink-0 flex-col bg-[var(--brain-rail)] ${className}`}>
      <div className="px-3 pb-3 pt-4">
        <button
          onClick={onNew}
          disabled={busy}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-full px-4 text-[13.5px] font-medium text-[var(--brain-text)] transition-colors hover:bg-[var(--brain-soft-hover)] disabled:cursor-default disabled:opacity-50"
        >
          <PenLine className="size-[18px]" />
          New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {threads.length === 0 ? (
          <div className="px-3 py-4">
            <div className="text-[12px] font-medium text-[var(--brain-muted)]">Recent</div>
            <p className="mt-2 text-[12px] leading-[1.5] text-[var(--brain-muted)]">Your conversations will appear here.</p>
          </div>
        ) : (
          <div>
            <div className="px-3 pb-2 pt-1 text-[12px] font-medium text-[var(--brain-muted)]">Recent</div>
            <ul className="space-y-1">
              {threads.map((t) => (
                <li key={t.id}>
                  <ThreadRow
                    thread={t}
                    projectName={t.project_id ? projectNames[t.project_id] ?? t.project_id : null}
                    active={t.id === activeThreadId}
                    onOpen={() => onOpen(t.id)}
                    onDelete={() => onDelete(t.id)}
                    onRename={(title) => onRename(t.id, title)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

const selectCls =
  "h-11 cursor-pointer appearance-none rounded-full border-0 bg-[var(--brain-soft)] py-0 pl-4 pr-11 text-left text-[12px] font-medium leading-none text-[var(--brain-muted-strong)] transition-colors hover:bg-[var(--brain-soft-hover)] focus:ring-2 focus:ring-orange/35";

export function BrainConsole({
  userName,
  departmentId,
  departmentName,
  projects,
  availableProviders,
  initialProvider,
  initialModel,
}: {
  userName: string;
  departmentId: string;
  departmentName: string;
  projects: ProjectOption[];
  availableProviders: BrainProvider[]; // providers with an org key stored
  initialProvider: BrainProvider | null;
  initialModel: string | null;
}) {
  const [input, setInput] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [projectId, setProjectId] = useState<string>("");
  const [provider, setProvider] = useState<BrainProvider | null>(initialProvider);
  const [modelId, setModelId] = useState<string | null>(initialModel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Monotonic guard for thread hydration: only the LATEST fetch may write
  // messages/projectId, so a slow response can't overwrite a newer thread.
  const hydrateSeq = useRef(0);
  // Threads deleted this session — refreshThreads races the DELETE request, so
  // an unfiltered GET could resurrect a just-deleted thread in the rail.
  const deletedIdsRef = useRef<Set<string>>(new Set());

  const refreshThreads = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/api/brain/threads");
      if (r.ok) {
        const list: ThreadSummary[] = (await r.json()).threads ?? [];
        setThreads(list.filter((t) => !deletedIdsRef.current.has(t.id)));
      }
    } catch { /* keep current list */ }
  }, []);

  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/brain/chat" }),
    onFinish: () => { void refreshThreads(); },
  });
  const { messages, status, error, stop, setMessages } = chat;
  const busy = status === "submitted" || status === "streaming";
  const sendingRef = useRef(false); // closes the lazy-thread-create double-send gap

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: ThreadSummary[] = [];
      try {
        const r = await fetch("/api/brain/threads");
        if (r.ok) list = (await r.json()).threads ?? [];
      } catch { /* start fresh */ }
      if (cancelled) return;
      setThreads(list);
      if (!list.length) { setHydrating(false); return; }
      // The rail is clickable while this hydrate is in flight — take a seq so a
      // user click on another thread invalidates this fetch's right to write.
      const seq = ++hydrateSeq.current;
      setActiveThreadId(list[0].id);
      setProjectId(list[0].project_id ?? "");
      try {
        const r = await fetch(`/api/brain/threads/${list[0].id}`);
        if (r.ok && !cancelled && seq === hydrateSeq.current) setMessages((await r.json()).messages ?? []);
      } catch { /* leave empty */ }
      if (!cancelled && seq === hydrateSeq.current) setHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const openThread = useCallback(async (id: string) => {
    if (busy) return;
    const seq = ++hydrateSeq.current;
    setActiveThreadId(id);
    setRailOpen(false);
    setHydrating(true);
    try {
      const r = await fetch(`/api/brain/threads/${id}`);
      if (seq !== hydrateSeq.current) return; // a newer open/new-thread won
      if (r.ok) {
        const data = await r.json();
        if (seq !== hydrateSeq.current) return;
        setMessages(data.messages ?? []);
        setProjectId((data.projectId as string | null) ?? "");
      } else {
        // Thread vanished (deleted in a race / another tab). Drop it entirely:
        // leaving activeThreadId pointing at a dead row would make later sends
        // stream fine but silently skip persistence.
        setThreads((t) => t.filter((x) => x.id !== id));
        setActiveThreadId(null);
        setMessages([]);
      }
    } catch {
      if (seq === hydrateSeq.current) setMessages([]);
    } finally {
      if (seq === hydrateSeq.current) setHydrating(false);
    }
  }, [busy, setMessages]);

  const newThread = useCallback(() => {
    if (busy) return;
    hydrateSeq.current++; // invalidate any in-flight hydrate
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setRailOpen(false);
    setHydrating(false);
  }, [busy, setMessages]);

  const deleteThread = useCallback(async (id: string) => {
    if (id === activeThreadId && busy) chat.stop();
    deletedIdsRef.current.add(id); // refreshThreads must never resurrect it
    setThreads((t) => t.filter((x) => x.id !== id));
    setActiveThreadId((cur) => {
      if (cur === id) { setMessages([]); return null; }
      return cur;
    });
    await fetch(`/api/brain/threads/${id}`, { method: "DELETE" }).catch(() => {});
  }, [activeThreadId, busy, chat, setMessages]);

  const renameThread = useCallback(async (id: string, title: string) => {
    setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, title } : x)));
    await fetch(`/api/brain/threads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }, []);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy || sendingRef.current || !provider || !modelId) return;
    sendingRef.current = true;
    try {
      let tid = activeThreadId;
      if (!tid) {
        // Lazily create a thread on first send; fall back to ephemeral if the
        // brain tables aren't migrated yet.
        try {
          const r = await fetch("/api/brain/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectId: projectId || undefined }),
          });
          if (r.ok) {
            const { thread } = (await r.json()) as { thread: ThreadSummary };
            tid = thread.id;
            setActiveThreadId(tid);
            setThreads((t) => [thread, ...t]);
          }
        } catch { /* ephemeral send */ }
      }
      chat.sendMessage(
        { text: q },
        { body: { threadId: tid ?? undefined, projectId: projectId || undefined, provider, model: modelId } },
      );
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
    } finally {
      sendingRef.current = false;
    }
  }, [activeThreadId, busy, chat, modelId, projectId, provider]);

  const firstName = userName.split(" ")[0] || "there";
  const noKeys = availableProviders.length === 0;
  const projectNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  // Full-screen mode: Esc exits, body scroll locks while open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const body = (
    // `relative` anchors the mobile thread-rail overlay (absolute inset-0) to
    // THIS panel — without it the drawer positions against the viewport.
    <div className="brain-chat relative flex h-full min-h-0 overflow-hidden bg-[var(--brain-canvas)] text-[var(--brain-text)]">
      <ThreadRail
        className="hidden md:flex"
        threads={threads}
        projectNames={projectNames}
        activeThreadId={activeThreadId}
        onOpen={openThread}
        onNew={newThread}
        onDelete={deleteThread}
        onRename={renameThread}
        busy={busy}
      />
      {railOpen && (
        <div className="absolute inset-0 z-20 flex md:hidden">
          <ThreadRail
            className="flex max-w-[86%] shadow-2xl"
            threads={threads}
            projectNames={projectNames}
            activeThreadId={activeThreadId}
            onOpen={openThread}
            onNew={newThread}
            onDelete={deleteThread}
            onRename={renameThread}
            busy={busy}
          />
          <button aria-label="Close conversations" className="flex-1 cursor-pointer bg-black/35 backdrop-blur-[2px]" onClick={() => setRailOpen(false)} />
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-[72px] shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setRailOpen(true)}
              aria-label="Conversations"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--brain-muted-strong)] transition-colors hover:bg-[var(--brain-soft)] hover:text-[var(--brain-text)] md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[16px] font-medium tracking-[-0.015em] text-[var(--brain-text)]">
                {activeThread?.title ?? "New chat"}
              </h1>
              <p className="mt-1 truncate text-[11.5px] text-[var(--brain-muted)]">Urso Brain · {departmentName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <select
                aria-label="Project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={`${selectCls} w-[154px] sm:w-[180px]`}
              >
                <option value="">Company-wide</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--brain-muted-strong)]" />
            </div>
            <div className="relative hidden lg:block">
              <select
                aria-label="Model"
                value={provider && modelId ? `${provider}:${modelId}` : ""}
                onChange={(e) => {
                  const [p, m] = e.target.value.split(":");
                  setProvider(p as BrainProvider);
                  setModelId(m);
                }}
                className={`${selectCls} w-[180px]`}
                disabled={noKeys}
              >
                {noKeys && <option value="">No models — add keys</option>}
                {availableProviders.map((p) => (
                  <optgroup key={p} label={BRAIN_PROVIDERS[p].name}>
                    {BRAIN_PROVIDERS[p].models.map((m) => (
                      <option key={m.id} value={`${p}:${m.id}`}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--brain-muted-strong)]" />
            </div>
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? "Exit full screen" : "Full screen"}
              title={expanded ? "Exit full screen (Esc)" : "Full screen"}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--brain-muted-strong)] transition-colors duration-200 hover:bg-[var(--brain-soft)] hover:text-[var(--brain-text)]"
            >
              {expanded ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}
            </button>
          </div>
        </header>

        {noKeys && (
          <div className="mx-4 rounded-xl bg-orange-wash px-4 py-3 text-[12.5px] text-[var(--brain-muted-strong)] md:mx-6">
            No provider keys are configured yet — add your org&rsquo;s API keys in{" "}
            <Link href="/brain/settings" className="text-orange underline underline-offset-2">settings</Link> to start chatting.
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-7 pt-4 sm:px-8 sm:pt-7">
          <div className="mx-auto h-full w-full max-w-[860px]">
            {hydrating ? (
              <div aria-hidden className="space-y-9 py-3">
                <div className="flex justify-end"><div className="skeleton-shimmer h-12 w-1/2 max-w-[360px] rounded-[22px]" /></div>
                <div className="flex gap-4">
                  <div className="skeleton-shimmer size-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="skeleton-shimmer h-3.5 w-4/5 rounded-full" />
                    <div className="skeleton-shimmer h-3.5 w-3/5 rounded-full" />
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <EmptyState firstName={firstName} departmentId={departmentId} departmentName={departmentName} onPick={send} busy={busy || noKeys} />
            ) : (
              <div className="space-y-9 pb-4">
                {messages.map((m, i) => (
                  <Message key={m.id} role={m.role} parts={m.parts as { type: string; text?: string }[]} live={status === "streaming" && i === messages.length - 1} />
                ))}
                {status === "submitted" && (
                  <div className="tip-in flex gap-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center text-orange"><Spark className="size-[18px]" /></span>
                    <ThinkingLabel label="thinking" />
                  </div>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-orange-soft px-4 py-3 text-[13px] leading-[1.5] text-[var(--brain-muted-strong)]">
                {errorText(error.message)}
              </p>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
          <div className="mx-auto w-full max-w-[860px]">
            <form
              onSubmit={(e) => { e.preventDefault(); void send(input); }}
              className="flex min-h-[64px] items-end gap-2 rounded-[28px] border border-[var(--brain-border)] bg-[var(--brain-composer)] px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:border-orange/50 focus-within:ring-2 focus-within:ring-orange/20 sm:px-4"
            >
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
                }}
                rows={1}
                disabled={noKeys}
                placeholder={noKeys ? "Add an org API key in settings first…" : "Ask Urso Brain"}
                className="max-h-[160px] min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-6 text-[var(--brain-text)] outline-none placeholder:text-[var(--brain-muted)] disabled:opacity-50"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  aria-label="Stop"
                  className="dash-press grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--brain-soft)] text-[var(--brain-text)] transition-colors hover:bg-[var(--brain-soft-hover)]"
                >
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || noKeys}
                  aria-label="Send"
                  className="dash-press grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-orange text-white transition-[background-color,opacity] hover:bg-[#e84900] disabled:cursor-default disabled:bg-[var(--brain-soft)] disabled:text-[var(--brain-muted)]"
                >
                  <Send className="size-[18px]" />
                </button>
              )}
            </form>
            <p className="mt-2.5 px-3 text-center text-[11px] leading-4 text-[var(--brain-muted)]">
              Urso Brain can read and update the company vault. Verify anything that drives a real decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (expanded && typeof document !== "undefined") {
    return createPortal(
      <div className="brain-chat theme-scope fixed inset-0 z-[60] bg-[var(--brain-canvas)]">
        <div className="mx-auto flex h-full max-w-[1280px] flex-col p-3 md:p-6">
          <div className="animate-stage-in flex h-full flex-col overflow-hidden">{body}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return body;
}
