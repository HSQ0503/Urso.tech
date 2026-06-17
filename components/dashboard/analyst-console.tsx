"use client";

// urso.ai — the owner's full strategy console (AI actions page). A premium,
// full-screen-capable chat over the same scope-locked analytics tools as the
// graph chats, but model-stronger (Opus 4.8) and prompted to lead the analysis.
// Conversation is ephemeral; nothing is persisted server-side. Hits /api/ai/agent.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { parseScope, parseMonth, scopeLabel, monthLabel } from "./data";
import { RichText } from "./rich-text";

// Friendly names for the tool-activity chips, so the owner sees what it checked.
const TOOL_LABELS: Record<string, string> = {
  metrics_overview: "headline metrics",
  monthly_series: "monthly trends",
  store_comparison: "store comparison",
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
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-raise text-orange"><Spark /></span>
      <ThinkingLabel label="analyzing" />
    </div>
  );
}

function Message({ role, parts }: { role: string; parts: { type: string; text?: string }[] }) {
  if (role === "user") {
    const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[rgba(254,81,0,0.28)] bg-orange-wash px-3.5 py-2.5 text-[14px] leading-[1.55] text-ink">{text}</div>
      </div>
    );
  }
  const tools = Array.from(new Set(parts.filter((p) => p.type.startsWith("tool-")).map((p) => toolLabel(p.type))));
  const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-raise text-orange"><Spark /></span>
      <div className="min-w-0 flex-1 space-y-2">
        {tools.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            <span className="text-orange">analyzed</span>
            {tools.map((n) => (
              <span key={n} className="rounded-full border border-edge px-1.5 py-[2px]">{n}</span>
            ))}
          </div>
        )}
        {text ? <RichText text={text} className="text-[14px] text-ink" /> : tools.length > 0 ? <ThinkingLabel label="reading the numbers" /> : null}
      </div>
    </div>
  );
}

function EmptyState({ firstName, briefHeadline, onPick, busy }: { firstName: string; briefHeadline?: string | null; onPick: (t: string) => void; busy: boolean }) {
  return (
    <div className="relative mx-auto max-w-[560px] py-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-[360px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(254,81,0,0.16), transparent 70%)" }}
      />
      <div className="relative">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange">
          <Spark className="size-5" />
        </span>
        <h2 className="mt-4 text-[20px] font-medium tracking-[-0.01em] text-ink">Good to see you, {firstName}.</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-dim">
          I’m your data analyst across all four stores. Ask me what’s working, what’s leaking, and what to do next — I’ll pull the real numbers and come back with a plan.
        </p>
        {briefHeadline && (
          <div className="mt-4 inline-block max-w-full rounded-xl border border-edge bg-raise px-3.5 py-2.5 text-left">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-orange">This week</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-ink">{briefHeadline}</div>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 text-left">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              disabled={busy}
              className="group flex items-center justify-between gap-3 rounded-xl border border-edge bg-raise px-4 py-3 text-[13.5px] text-ink-dim transition-colors hover:border-[rgba(254,81,0,0.4)] hover:text-ink disabled:opacity-50"
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

type ChatApi = ReturnType<typeof useChat>;

function ChatPanel({
  chat,
  input,
  setInput,
  scopeText,
  storeParam,
  monthParam,
  userName,
  briefHeadline,
  expanded,
  onToggleExpand,
}: {
  chat: ChatApi;
  input: string;
  setInput: (v: string) => void;
  scopeText: string;
  storeParam?: string;
  monthParam?: string;
  userName: string;
  briefHeadline?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { messages, sendMessage, status, error, stop } = chat;
  const busy = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    sendMessage({ text: q }, { body: { store: storeParam, month: monthParam } });
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const firstName = userName.split(" ")[0] || "there";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3 md:px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange">
            <Spark />
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium tracking-[-0.01em] text-ink">urso.ai</span>
              <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                <span className="size-1.5 rounded-full bg-[var(--color-good)]" /> analyst
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">{scopeText}</div>
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          aria-label={expanded ? "Exit full screen" : "Full screen"}
          title={expanded ? "Exit full screen (Esc)" : "Full screen"}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
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
          {messages.length === 0 ? (
            <EmptyState firstName={firstName} briefHeadline={briefHeadline} onPick={ask} busy={busy} />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <Message key={m.id} role={m.role} parts={m.parts as { type: string; text?: string }[]} />
              ))}
              {status === "submitted" && <Thinking />}
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-lg border border-[rgba(254,81,0,0.3)] bg-orange-soft px-3 py-2 text-[12.5px] leading-[1.5] text-ink-dim">
              {error.message.includes("API_KEY")
                ? "The analyst key isn’t configured yet."
                : error.message.trim() || "Something went wrong — try again."}
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
              ask(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-edge bg-raise px-3 py-2 transition-colors focus-within:border-[rgba(254,81,0,0.45)]"
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
                  ask(input);
                }
              }}
              rows={1}
              placeholder="Ask about revenue, retention, a store, the team, what to fix first…"
              className="max-h-[160px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink-dimmer"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label="Stop"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(254,81,0,0.4)] bg-orange-soft text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            )}
          </form>
          <p className="mt-2 px-1 text-[10.5px] leading-[1.4] text-ink-dimmer">
            urso.ai reads your live FranPOS data and can make mistakes — verify anything that drives a real decision.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AnalystConsole({ userName, briefHeadline }: { userName: string; briefHeadline?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const params = useSearchParams();
  const scope = parseScope(params.get("store"));
  const month = parseMonth(params.get("month"));
  const chat = useChat({ transport: new DefaultChatTransport({ api: "/api/ai/agent" }) });

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

  const panel = (
    <ChatPanel
      chat={chat}
      input={input}
      setInput={setInput}
      scopeText={`${scopeLabel(scope)} · ${monthLabel(month)}`}
      storeParam={params.get("store") ?? undefined}
      monthParam={params.get("month") ?? undefined}
      userName={userName}
      briefHeadline={briefHeadline}
      expanded={expanded}
      onToggleExpand={() => setExpanded((e) => !e)}
    />
  );

  if (expanded && typeof document !== "undefined") {
    return createPortal(
      <div className="theme-scope fixed inset-0 z-[60] bg-bg">
        <div className="mx-auto flex h-full max-w-[1120px] flex-col p-3 md:p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]">{panel}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden rounded-2xl border border-edge bg-panel">
      {panel}
    </div>
  );
}
