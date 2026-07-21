"use client";

// Urso Brain — the company-brain chat console. Adapted from the analyst console
// (components/dashboard/analyst-console.tsx): same thread persistence + hardening,
// but the context is the company vault (not store metrics), and the user picks a
// PROJECT (context scope) and a MODEL (routed via the org's BYO provider keys).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { RichText } from "@/components/dashboard/rich-text";
import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import type { BrainProvider } from "@/lib/brain/types";

type ThreadSummary = { id: string; title: string; project_id: string | null; model: string; updated_at: string };
type ProjectOption = { id: string; name: string };

const TOOL_LABELS: Record<string, string> = {
  fetch_doc: "read a doc",
  search_docs: "searched the vault",
  list_docs: "listed docs",
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

const toolLabel = (type: string) => {
  const name = type.replace(/^tool-/, "");
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
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
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-dimmer">
      <span className="size-1.5 animate-pulse rounded-full bg-orange" />
      {label}…
    </span>
  );
}

function Message({ role, parts, live = false }: { role: string; parts: { type: string; text?: string }[]; live?: boolean }) {
  if (role === "user") {
    const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    return (
      <div className="tip-in flex justify-end">
        <div className="max-w-[85%] rounded-none border border-[rgba(254,81,0,0.28)] bg-orange-wash px-3.5 py-2.5 text-[14px] leading-[1.55] text-ink">{text}</div>
      </div>
    );
  }
  const tools = Array.from(new Set(parts.filter((p) => p.type.startsWith("tool-")).map((p) => toolLabel(p.type))));
  const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
  return (
    <div className="tip-in flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-raise text-orange"><Spark /></span>
      <div className="min-w-0 flex-1 space-y-2">
        {tools.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            <span className="text-orange">consulted</span>
            {tools.map((n) => (
              <span key={n} className="chip-in rounded-full border border-edge px-1.5 py-[2px]">{n}</span>
            ))}
          </div>
        )}
        {text ? (
          <RichText text={text} className="text-[14px] text-ink" />
        ) : tools.length > 0 && live ? (
          <ThinkingLabel label="reading the vault" />
        ) : tools.length > 0 ? (
          <span className="text-[12.5px] italic text-ink-dimmer">No written answer was saved for this turn.</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ firstName, departmentId, departmentName, onPick, busy }: { firstName: string; departmentId: string; departmentName: string; onPick: (t: string) => void; busy: boolean }) {
  const suggestions = SUGGESTIONS[departmentId] ?? SUGGESTIONS.default;
  return (
    <div className="relative mx-auto max-w-[560px] py-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-[360px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(254,81,0,0.16), transparent 70%)" }}
      />
      <div className="relative">
        <span className="mx-auto grid size-12 place-items-center rounded-none border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange">
          <Spark className="size-5" />
        </span>
        <h2 className="mt-4 text-[20px] font-bold tracking-[-0.01em] text-ink">Good to see you, {firstName}.</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-dim">
          I&rsquo;m the company brain. I already know you&rsquo;re in {departmentName}, which project you&rsquo;re on, and
          everything in the vault — departments, projects, contracts, standing rules. Just ask.
        </p>
        <div className="mt-6 flex flex-col gap-2 text-left">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              disabled={busy}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-none border border-edge bg-raise px-4 py-3 text-[13.5px] text-ink-dim transition-colors hover:border-[rgba(254,81,0,0.4)] hover:text-ink disabled:opacity-50"
            >
              <span>{s}</span>
              <span className="text-ink-dimmer transition-colors group-hover:text-orange"><Spark /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

function ThreadRow({ thread, active, onOpen, onDelete, onRename }: { thread: ThreadSummary; active: boolean; onOpen: () => void; onDelete: () => void; onRename: (title: string) => void }) {
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
        className="w-full rounded-lg border border-[rgba(254,81,0,0.4)] bg-raise px-2.5 py-2 text-[13px] text-ink outline-none"
      />
    );
  }

  return (
    <div className={`group flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 text-[13px] transition-colors ${active ? "bg-raise text-ink" : "text-ink-dim hover:bg-raise/60 hover:text-ink"}`}>
      <button onClick={onOpen} onDoubleClick={startEdit} className="min-w-0 flex-1 cursor-pointer truncate py-2 text-left" title={`${thread.title}  (double-click to rename)`}>
        {thread.title}
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete conversation"
        title="Delete conversation"
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-ink-dimmer opacity-0 transition-opacity hover:text-orange focus:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ThreadRail({
  threads, activeThreadId, onOpen, onNew, onDelete, onRename, busy, className = "",
}: {
  threads: ThreadSummary[]; activeThreadId: string | null; onOpen: (id: string) => void; onNew: () => void;
  onDelete: (id: string) => void; onRename: (id: string, title: string) => void; busy: boolean; className?: string;
}) {
  return (
    <div className={`w-60 shrink-0 flex-col border-r border-edge bg-bg/40 ${className}`}>
      <div className="p-3">
        <button
          onClick={onNew}
          disabled={busy}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-3 py-2 text-[13px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          New conversation
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 ? (
          <div className="px-2 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Conversations</div>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-ink-dimmer">No conversations yet. Ask something to start one.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((t) => (
              <li key={t.id}>
                <ThreadRow thread={t} active={t.id === activeThreadId} onOpen={() => onOpen(t.id)} onDelete={() => onDelete(t.id)} onRename={(title) => onRename(t.id, title)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const selectCls =
  "cursor-pointer rounded-none border border-edge bg-raise px-2 py-1.5 text-[12px] text-ink outline-none transition-colors hover:border-edge-strong focus:border-[rgba(254,81,0,0.45)]";

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

  return (
    // `relative` anchors the mobile thread-rail overlay (absolute inset-0) to
    // THIS panel — without it the drawer positions against the viewport.
    <div className="relative flex h-full overflow-hidden rounded-none border border-edge bg-panel shadow-[var(--pop-shadow)]">
      <ThreadRail
        className="hidden md:flex"
        threads={threads}
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
            className="flex max-w-[80%] bg-panel"
            threads={threads}
            activeThreadId={activeThreadId}
            onOpen={openThread}
            onNew={newThread}
            onDelete={deleteThread}
            onRename={renameThread}
            busy={busy}
          />
          <button aria-label="Close conversations" className="flex-1 cursor-pointer bg-black/40" onClick={() => setRailOpen(false)} />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header: identity + project + model */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3 md:px-5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setRailOpen(true)}
              aria-label="Conversations"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink md:hidden"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span className="grid size-8 place-items-center rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange"><Spark /></span>
            <div className="leading-tight">
              <span className="text-[14px] font-medium tracking-[-0.01em] text-ink">Urso Brain</span>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">{userName} · {departmentName}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectCls}>
              <option value="">No project — company-wide</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              aria-label="Model"
              value={provider && modelId ? `${provider}:${modelId}` : ""}
              onChange={(e) => {
                const [p, m] = e.target.value.split(":");
                setProvider(p as BrainProvider);
                setModelId(m);
              }}
              className={selectCls}
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
          </div>
        </div>

        {noKeys && (
          <div className="border-b border-edge bg-orange-wash px-4 py-2.5 text-[12.5px] text-ink-dim md:px-5">
            No provider keys are configured yet — add your org&rsquo;s API keys in{" "}
            <Link href="/brain/settings" className="text-orange underline underline-offset-2">settings</Link> to start chatting.
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto w-full max-w-[760px]">
            {hydrating ? (
              <div aria-hidden className="space-y-6 py-1">
                <div className="flex justify-end"><div className="skeleton-shimmer h-10 w-1/2 max-w-[320px] rounded-sm bg-raise" /></div>
                <div className="flex gap-3">
                  <div className="skeleton-shimmer size-7 shrink-0 rounded-full bg-raise" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="skeleton-shimmer h-3.5 w-4/5 rounded-sm bg-raise" />
                    <div className="skeleton-shimmer h-3.5 w-3/5 rounded-sm bg-raise" />
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <EmptyState firstName={firstName} departmentId={departmentId} departmentName={departmentName} onPick={send} busy={busy || noKeys} />
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) => (
                  <Message key={m.id} role={m.role} parts={m.parts as { type: string; text?: string }[]} live={status === "streaming" && i === messages.length - 1} />
                ))}
                {status === "submitted" && (
                  <div className="tip-in flex gap-3">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-raise text-orange"><Spark /></span>
                    <ThinkingLabel label="thinking" />
                  </div>
                )}
              </div>
            )}
            {error && (
              <p className="mt-4 rounded-lg border border-[rgba(254,81,0,0.3)] bg-orange-soft px-3 py-2 text-[12.5px] leading-[1.5] text-ink-dim">
                {errorText(error.message)}
              </p>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-edge px-4 py-3.5 md:px-6">
          <div className="mx-auto w-full max-w-[760px]">
            <form
              onSubmit={(e) => { e.preventDefault(); void send(input); }}
              className="flex items-end gap-2 rounded-none border border-edge bg-raise px-3 py-2 transition-colors focus-within:border-[rgba(254,81,0,0.45)]"
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
                placeholder={noKeys ? "Add an org API key in settings first…" : "Ask about any project, department, contract, or rule…"}
                className="max-h-[160px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink-dimmer disabled:opacity-50"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  aria-label="Stop"
                  className="dash-press grid size-9 shrink-0 cursor-pointer place-items-center rounded-none border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || noKeys}
                  aria-label="Send"
                  className="dash-press grid size-9 shrink-0 cursor-pointer place-items-center rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                </button>
              )}
            </form>
            <p className="mt-2 px-1 text-[10.5px] leading-[1.4] text-ink-dimmer">
              Urso Brain answers from the company vault and can make mistakes — verify anything that drives a real decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
