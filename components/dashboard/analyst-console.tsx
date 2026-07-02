"use client";

// urso.ai — the owner's full strategy console (AI actions page). A premium,
// full-screen-capable chat over the same scope-locked analytics tools as the
// graph chats, but model-stronger (Opus 4.8) and prompted to lead the analysis.
//
// Conversations are PERSISTED (multiple named threads per user) and the analyst
// carries a rolling, distilled memory across them — see lib/ai/memory.ts and
// /api/ai/threads. The chat itself hits /api/ai/agent with the active threadId.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { parseScope, parseMonth, scopeLabel, monthLabel } from "./data";
import { RichText } from "./rich-text";
import { useT } from "@/components/dashboard/locale-provider";

type ThreadSummary = { id: string; title: string; updated_at: string };

// Friendly names for the tool-activity chips, so the owner sees what it checked.
const TOOL_LABELS: Record<string, string> = {
  metrics_overview: "headline metrics",
  monthly_series: "monthly trends",
  store_comparison: "store comparison",
  store_comparison_range: "store comparison (date range)",
  product_performance: "product performance",
  team_performance: "groomer contribution",
  customer_health: "customer health",
  decompose_revenue_change: "revenue drivers",
  metrics_range: "a date range",
  month_pace: "month pace",
  retention_detail: "retention",
  winback_targets: "win-back list",
  top_customers: "top customers",
  new_vs_repeat: "new vs repeat",
  business_context: "business playbook",
  cross_sell: "cross-sell mix",
  list_actions: "the action pipeline",
  events_in_range: "logged events",
};

const SUGGESTIONS = [
  "Where am I losing the most money right now?",
  "What should I focus on this week?",
  "Which store needs the most attention, and why?",
  "Who are my most valuable customers slipping away?",
];

const toolLabel = (type: string) => {
  const name = type.replace(/^tool-/, "");
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
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

function Thinking() {
  const t = useT();
  return (
    <div className="tip-in flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-raise text-orange"><Spark /></span>
      <ThinkingLabel label={t("analyzing")} />
    </div>
  );
}

function Message({ role, parts, live = false }: { role: string; parts: { type: string; text?: string }[]; live?: boolean }) {
  const t = useT();
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
            <span className="text-orange">{t("analyzed")}</span>
            {tools.map((n, i) => (
              // Chips land one beat apart as analyses complete — keyed by name,
              // so a chip only animates when it first appears.
              <span key={n} className="chip-in rounded-full border border-edge px-1.5 py-[2px]" style={{ "--reveal-delay": `${i * 60}ms` } as CSSProperties}>{t(n)}</span>
            ))}
          </div>
        )}
        {text ? (
          <RichText text={text} className="text-[14px] text-ink" />
        ) : tools.length > 0 && live ? (
          <ThinkingLabel label={t("reading the numbers")} />
        ) : tools.length > 0 ? (
          <span className="text-[12.5px] italic text-ink-dimmer">{t("No written summary was saved for this answer.")}</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ firstName, briefHeadline, onPick, busy }: { firstName: string; briefHeadline?: string | null; onPick: (t: string) => void; busy: boolean }) {
  const t = useT();
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
        <h2 className="mt-4 text-[20px] font-bold tracking-[-0.01em] text-ink">{t("Good to see you,")} {firstName}.</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-dim">
          {t("I’m your data analyst. Ask me what’s working, what’s leaking, and what to do next — I’ll pull the real numbers and come back with a plan. I remember our past conversations.")}
        </p>
        {briefHeadline && (
          <div className="mt-4 inline-block max-w-full rounded-none border border-edge bg-raise px-3.5 py-2.5 text-left">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-orange">{t("This week")}</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-ink">{briefHeadline}</div>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 text-left">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              disabled={busy}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-none border border-edge bg-raise px-4 py-3 text-[13.5px] text-ink-dim transition-colors hover:border-[rgba(254,81,0,0.4)] hover:text-ink disabled:opacity-50"
            >
              <span>{t(s)}</span>
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
  const t = useT();
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
      <button onClick={onOpen} onDoubleClick={startEdit} className="min-w-0 flex-1 cursor-pointer truncate py-2 text-left" title={`${thread.title}  (${t("double-click to rename")})`}>
        {thread.title}
      </button>
      <button
        onClick={onDelete}
        aria-label={t("Delete conversation")}
        title={t("Delete conversation")}
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
  const t = useT();
  return (
    <div className={`w-60 shrink-0 flex-col border-r border-edge bg-bg/40 ${className}`}>
      <div className="p-3">
        <button
          onClick={onNew}
          disabled={busy}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-3 py-2 text-[13px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          {t("New conversation")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 ? (
          <div className="px-2 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">{t("Conversations")}</div>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-ink-dimmer">{t("No conversations yet. Ask something to start one.")}</p>
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

type ChatApi = ReturnType<typeof useChat>;

function ChatPanel({
  chat, input, setInput, scopeText, userName, briefHeadline, expanded, hydrating, onToggleExpand, onToggleRail, onSend,
}: {
  chat: ChatApi; input: string; setInput: (v: string) => void; scopeText: string; userName: string;
  briefHeadline?: string | null; expanded: boolean; hydrating: boolean; onToggleExpand: () => void; onToggleRail: () => void; onSend: (text: string) => void;
}) {
  const t = useT();
  const { messages, status, error, stop } = chat;
  const busy = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    onSend(q);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const firstName = userName.split(" ")[0] || t("there");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleRail}
            aria-label={t("Conversations")}
            title={t("Conversations")}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink md:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="grid size-8 place-items-center rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange">
            <Spark />
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium tracking-[-0.01em] text-ink">urso.ai</span>
              <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                <span className="size-1.5 rounded-full bg-[var(--color-good)]" /> {t("analyst")}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">{scopeText}</div>
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          aria-label={expanded ? t("Exit full screen") : t("Full screen")}
          title={expanded ? t("Exit full screen (Esc)") : t("Full screen")}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
        >
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9 4 4M9 4H4v5M15 9l5-5M15 4h5v5M9 15l-5 5M4 15v5h5M15 15l5 5M20 15v5h-5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          )}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {hydrating ? (
            // Loading a persisted thread — ghost message rows, so the greeting
            // never flashes for returning users before their conversation lands.
            <div aria-hidden className="space-y-6 py-1">
              <div className="flex justify-end">
                <div className="skeleton-shimmer h-10 w-1/2 max-w-[320px] rounded-sm bg-raise" />
              </div>
              <div className="flex gap-3">
                <div className="skeleton-shimmer size-7 shrink-0 rounded-full bg-raise" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <div className="skeleton-shimmer h-3.5 w-4/5 rounded-sm bg-raise" />
                  <div className="skeleton-shimmer h-3.5 w-3/5 rounded-sm bg-raise" />
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <EmptyState firstName={firstName} briefHeadline={briefHeadline} onPick={submit} busy={busy} />
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  role={m.role}
                  parts={m.parts as { type: string; text?: string }[]}
                  live={status === "streaming" && i === messages.length - 1}
                />
              ))}
              {status === "submitted" && <Thinking />}
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-lg border border-[rgba(254,81,0,0.3)] bg-orange-soft px-3 py-2 text-[12.5px] leading-[1.5] text-ink-dim">
              {error.message.includes("API_KEY")
                ? t("The analyst key isn’t configured yet.")
                : error.message.trim() || t("Something went wrong — try again.")}
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-edge px-4 py-3.5 md:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder={t("Ask about revenue, retention, a store, the team, what to fix first…")}
              className="max-h-[160px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink-dimmer"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label={t("Stop")}
                className="dash-press grid size-9 shrink-0 cursor-pointer place-items-center rounded-none border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label={t("Send")}
                className="dash-press grid size-9 shrink-0 cursor-pointer place-items-center rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            )}
          </form>
          <p className="mt-2 px-1 text-[10.5px] leading-[1.4] text-ink-dimmer">
            {t("urso.ai reads your live FranPOS data and can make mistakes — verify anything that drives a real decision.")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AnalystConsole({ userName, briefHeadline }: { userName: string; briefHeadline?: string | null }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [input, setInput] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  // True while a persisted thread is being fetched (initial load + thread
  // switches) so the panel shows ghost rows instead of flashing the greeting.
  const [hydrating, setHydrating] = useState(true);
  const params = useSearchParams();
  const scope = parseScope(params.get("store"));
  const month = parseMonth(params.get("month"));

  const refreshThreads = useCallback(async (): Promise<ThreadSummary[]> => {
    try {
      const r = await fetch("/api/ai/threads");
      if (!r.ok) return [];
      const list: ThreadSummary[] = (await r.json()).threads ?? [];
      setThreads(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/agent" }),
    onFinish: () => { void refreshThreads(); }, // pick up the auto-title + reordering
  });
  const { setMessages, status } = chat;
  const busy = status === "submitted" || status === "streaming";
  // Synchronous guard for the lazy thread-create window: during the create POST,
  // `status` is still "ready" so `busy` is false — a second submit would create a
  // duplicate thread. This closes that gap (busy can't).
  const sendingRef = useRef(false);

  // Initial load: most-recent thread, hydrated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: ThreadSummary[] = [];
      try {
        const r = await fetch("/api/ai/threads");
        if (r.ok) list = (await r.json()).threads ?? [];
      } catch { /* offline / not configured — start fresh */ }
      if (cancelled) return;
      setThreads(list);
      if (!list.length) { setHydrating(false); return; }
      setActiveThreadId(list[0].id);
      try {
        const r = await fetch(`/api/ai/threads/${list[0].id}`);
        if (r.ok && !cancelled) setMessages((await r.json()).messages ?? []);
      } catch { /* leave empty */ }
      if (!cancelled) setHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [setMessages]);

  const openThread = useCallback(async (id: string) => {
    if (busy) return;
    setActiveThreadId(id);
    setRailOpen(false);
    setHydrating(true);
    try {
      const r = await fetch(`/api/ai/threads/${id}`);
      setMessages(r.ok ? (await r.json()).messages ?? [] : []);
    } catch {
      setMessages([]);
    } finally {
      setHydrating(false);
    }
  }, [busy, setMessages]);

  const newThread = useCallback(() => {
    if (busy) return;
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setRailOpen(false);
    setHydrating(false);
  }, [busy, setMessages]);

  const deleteThread = useCallback(async (id: string) => {
    // Stop a live stream on the thread being deleted, else the in-flight answer
    // repopulates the cleared view (and persists to a now-deleted thread).
    if (id === activeThreadId && busy) chat.stop();
    setThreads((t) => t.filter((x) => x.id !== id));
    setActiveThreadId((cur) => {
      if (cur === id) { setMessages([]); return null; }
      return cur;
    });
    await fetch(`/api/ai/threads/${id}`, { method: "DELETE" }).catch(() => {});
  }, [activeThreadId, busy, chat, setMessages]);

  const renameThread = useCallback(async (id: string, title: string) => {
    setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, title } : x)));
    await fetch(`/api/ai/threads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }, []);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy || sendingRef.current) return;
    sendingRef.current = true;
    try {
      let tid = activeThreadId;
      if (!tid) {
        // Lazily create a thread on first send. If this fails (e.g. the memory
        // tables aren't migrated yet), fall back to an ephemeral chat with no
        // threadId — the answer still streams, it just isn't persisted.
        try {
          const r = await fetch("/api/ai/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: params.get("store") ?? "all" }),
          });
          if (r.ok) {
            const { thread } = (await r.json()) as { thread: ThreadSummary };
            tid = thread.id;
            setActiveThreadId(tid);
            setThreads((t) => [thread, ...t]);
          }
        } catch { /* fall through to ephemeral send */ }
      }
      chat.sendMessage({ text: q }, { body: { threadId: tid ?? undefined, store: params.get("store") ?? undefined, month: params.get("month") ?? undefined } });
      setInput("");
    } finally {
      // Released once sendMessage is dispatched; from here `busy` (status) guards.
      sendingRef.current = false;
    }
  }, [activeThreadId, busy, chat, params]);

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
    <div className="relative flex h-full">
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
          <button aria-label={t("Close conversations")} className="flex-1 cursor-pointer bg-black/40" onClick={() => setRailOpen(false)} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <ChatPanel
          chat={chat}
          input={input}
          setInput={setInput}
          scopeText={`${scopeLabel(scope)} · ${monthLabel(month)}`}
          userName={userName}
          briefHeadline={briefHeadline}
          expanded={expanded}
          hydrating={hydrating}
          onToggleExpand={() => setExpanded((e) => !e)}
          onToggleRail={() => setRailOpen(true)}
          onSend={send}
        />
      </div>
    </div>
  );

  if (expanded && typeof document !== "undefined") {
    return createPortal(
      <div className="theme-scope fixed inset-0 z-[60] bg-bg">
        <div className="mx-auto flex h-full max-w-[1180px] flex-col p-3 md:p-6">
          <div className="animate-stage-in flex h-full flex-col overflow-hidden rounded-none border border-edge bg-panel shadow-[var(--modal-shadow)]">{body}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="h-[72vh] min-h-[560px] overflow-hidden rounded-none border border-edge bg-panel shadow-[var(--pop-shadow)]">
      {body}
    </div>
  );
}
