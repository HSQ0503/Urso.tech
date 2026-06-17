"use client";

// "Ask urso.ai" — the in-dashboard AI analyst. Click → a chat modal seeded
// with the card it was opened from (topicId) and the page's current store +
// month filter. Conversations are ephemeral: nothing is stored server-side.
// Streaming + tools live in /api/ai/chat; this stays a thin surface.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Modal } from "./modal";
import { RichText } from "./rich-text";

function Spark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M12 5.5l1.7 4.8L18 12l-4.3 1.7L12 18.5l-1.7-4.8L6 12l4.3-1.7L12 5.5Z" />
    </svg>
  );
}

const DEFAULT_SUGGESTIONS = [
  "What's driving this number?",
  "How does this compare to last month?",
  "Which store should I look at first?",
];

export function AskAi({
  topic,
  topicId,
  suggestions = DEFAULT_SUGGESTIONS,
  pending = false,
  label = "Ask urso.ai",
  comparison,
}: {
  topic: string;
  topicId?: string;
  suggestions?: string[];
  pending?: boolean;
  label?: string;
  comparison?: { aLabel: string; aStart: string; aEnd: string; bLabel: string; bStart: string; bEnd: string; metric: string };
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const params = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    sendMessage(
      { text: q },
      {
        body: {
          topic,
          topicId,
          pending,
          comparison,
          store: params.get("store") ?? undefined,
          month: params.get("month") ?? undefined,
        },
      },
    );
    setInput("");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange transition-colors hover:border-[rgba(254,81,0,0.55)] hover:bg-[rgba(254,81,0,0.18)]"
      >
        <Spark />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="urso.ai" title={topic} maxWidth={600}>
        <div className="flex max-h-[60vh] min-h-[280px] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-[13.5px] leading-[1.6] text-ink-dim">
                  Ask anything about this data — what changed, why, and what to do about it. Answers come live from your numbers.
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="cursor-pointer rounded-full border border-edge px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-[rgba(254,81,0,0.45)] hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[rgba(254,81,0,0.28)] bg-orange-wash px-3.5 py-2 text-[13.5px] leading-[1.55] text-ink">
                    {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {m.parts.some((p) => p.type.startsWith("tool-")) && (
                      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                        <Spark /> checked the numbers
                      </div>
                    )}
                    <RichText
                      className="text-[13.5px] text-ink"
                      text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                    />
                  </div>
                )}
              </div>
            ))}

            {status === "submitted" && (
              <div className="flex items-center gap-2 text-[12.5px] text-ink-dimmer">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-orange" />
                thinking…
              </div>
            )}
            {error && (
              <p className="text-[12.5px] leading-[1.5] text-ink-dim">
                {error.message.includes("API_KEY")
                  ? "The AI key isn't configured yet."
                  : error.message.trim() || "Something went wrong — try asking again."}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="mt-4 flex items-center gap-2 border-t border-edge pt-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this data…"
              className="h-9 flex-1 rounded-xl border border-edge bg-transparent px-3 text-[13.5px] text-ink outline-none placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
              aria-label="Send"
            >
              <Spark />
            </button>
          </form>
          <p className="mt-2 text-[10.5px] leading-[1.4] text-ink-dimmer">
            urso.ai reads live dashboard data and can make mistakes — cross-check anything that drives a real decision.
          </p>
        </div>
      </Modal>
    </>
  );
}
