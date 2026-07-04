"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { sendMessage } from "@/app/CanesPressure/actions";

const QUICK_REPLIES = [
  "On my way",
  "Running 10 minutes late",
  "Thanks for choosing Canes!",
  "What's the property address?",
];

export function Composer({ peerPhone, leadId }: { peerPhone: string; leadId: string | null }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Grow with content (2 rows base, capped) — including after clears/restores.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function send() {
    const body = draft.trim();
    if (!body || pending) return;
    setNotice(null);
    setDraft(""); // optimistic clear; restored below if the send fails
    startTransition(async () => {
      const result = await sendMessage(peerPhone, body, leadId);
      if (!result.ok) {
        setNotice(result.notice ?? "Send failed.");
        setDraft(body);
      }
    });
  }

  function pickQuickReply(text: string) {
    setDraft(text);
    boxRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="cp-scroll flex gap-1.5 overflow-x-auto pb-0.5">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => pickQuickReply(q)}
            className="cp-chip shrink-0 cursor-pointer border border-[var(--cp-line)] bg-[var(--cp-surface)] text-[var(--cp-muted)] transition-colors hover:border-[var(--cp-line-strong)] hover:text-[var(--cp-ink)]"
          >
            {q}
          </button>
        ))}
      </div>
      {notice && <p className="text-[13px] text-[var(--cp-warn)]">{notice}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={boxRef}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message"
          className="cp-textarea max-h-40 resize-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !draft.trim()}
          className="cp-btn cp-btn-primary min-h-[44px] shrink-0 disabled:opacity-60"
        >
          <Send size={16} />
          Send
        </button>
      </div>
    </div>
  );
}
