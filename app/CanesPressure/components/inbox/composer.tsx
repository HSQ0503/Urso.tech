"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Paperclip, Send, X } from "lucide-react";
import { sendMessage, sendPhotoMessage } from "@/app/CanesPressure/actions";
import { prepareMessagePhoto } from "@/lib/canes/message-photo-client";

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
  const [preparing, setPreparing] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; preview: string } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => {
    if (attachment) URL.revokeObjectURL(attachment.preview);
  }, [attachment]);

  async function pickPhoto(file: File) {
    const attempt = ++selection.current;
    setPreparing(true);
    setNotice(null);
    try {
      const prepared = await prepareMessagePhoto(file);
      if (mounted.current && attempt === selection.current) {
        setAttachment({ file: prepared, preview: URL.createObjectURL(prepared) });
      }
    } catch {
      if (mounted.current && attempt === selection.current) setNotice("That photo could not be opened. Try a JPEG, PNG, or WebP image.");
    } finally {
      if (mounted.current && attempt === selection.current) setPreparing(false);
    }
  }

  // Grow with content (2 rows base, capped) — including after clears/restores.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function send() {
    const body = draft.trim();
    if ((!body && !attachment) || pending || preparing) return;
    setNotice(null);
    startTransition(async () => {
      try {
        let result;
        if (attachment) {
          const form = new FormData();
          form.set("file", attachment.file);
          form.set("message", body);
          form.set("leadId", leadId ?? "");
          result = await sendPhotoMessage(peerPhone, form);
        } else {
          result = await sendMessage(peerPhone, body, leadId);
        }
        if (!result.ok) setNotice(result.notice ?? "Send failed.");
        else { setDraft(""); setAttachment(null); }
      } catch {
        setNotice("The message could not be sent. Your draft is still here; try again.");
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
            disabled={pending}
            onClick={() => pickQuickReply(q)}
            className="cp-chip shrink-0 cursor-pointer border border-[var(--cp-line)] bg-[var(--cp-surface)] text-[var(--cp-muted)] transition-colors hover:border-[var(--cp-line-strong)] hover:text-[var(--cp-ink)]"
          >
            {q}
          </button>
        ))}
      </div>
      {notice && <p className="text-[13px] text-[var(--cp-warn)]">{notice}</p>}
      {preparing ? <p className="text-sm text-[var(--cp-muted)]">Preparing photo…</p> : null}
      {attachment ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--cp-line)] p-2">
          <Image src={attachment.preview} alt="Attached photo" width={56} height={56} unoptimized className="size-14 rounded object-cover" />
          <p className="flex-1 text-sm text-[var(--cp-muted)]">Photo ready · caption optional</p>
          <button type="button" aria-label="Remove attached photo" disabled={pending || preparing} onClick={() => setAttachment(null)} className="cp-icon-btn"><X size={18} /></button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" aria-label="Choose a photo" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void pickPhoto(file);
        }} />
        <button type="button" aria-label="Attach a photo" title="Attach a photo" disabled={pending || preparing} onClick={() => fileRef.current?.click()} className="cp-icon-btn shrink-0"><Paperclip size={20} /></button>
        {/* Filled rounded field on mobile (iOS), bordered cp-textarea on desktop */}
        <textarea
          ref={boxRef}
          rows={2}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={attachment ? "Add a caption (optional)" : "Type a message"}
          className="cp-textarea max-h-40 resize-none rounded-2xl border-transparent bg-[var(--cp-hover)] md:rounded-[5px] md:border-[var(--cp-line-strong)] md:bg-[var(--cp-surface)]"
        />
        {/* Round orange send on mobile; text button on desktop */}
        <button
          type="button"
          onClick={send}
          disabled={pending || preparing || (!draft.trim() && !attachment)}
          aria-label="Send message"
          className="cp-icon-btn cp-icon-btn-primary shrink-0 disabled:opacity-40 md:hidden"
        >
          <Send size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending || preparing || (!draft.trim() && !attachment)}
          className="cp-btn cp-btn-primary hidden min-h-[44px] shrink-0 disabled:opacity-60 md:inline-flex"
        >
          <Send size={16} strokeWidth={2} />
          Send
        </button>
      </div>
    </div>
  );
}
