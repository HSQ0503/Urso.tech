"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteContact, type ActionResult } from "@/app/CanesPressure/actions";

// Danger zone: permanently remove a junk or duplicate customer. Two-step
// confirm; on success the action redirects to the customers list. Anyone with
// an estimate, job, or invoice on file is refused server-side.

export function DeleteCustomerCard({ contactId }: { contactId: string }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  function run(fn: () => Promise<ActionResult>) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      // A successful delete redirects — Next carries it through the
      // transition; only refusals land here.
      if (!res) return;
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
    });
  }

  return (
    <div className="space-y-2 pb-2">
      {!open ? (
        <button
          type="button"
          className="cp-btn cp-btn-sm cp-btn-danger"
          disabled={isPending}
          onClick={() => setOpen(true)}
        >
          <Trash2 size={14} strokeWidth={2} /> Delete customer
        </button>
      ) : (
        <>
          <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
            This permanently deletes the customer and their saved addresses.
            Customers with an estimate, job, or invoice on file can&apos;t be
            deleted — they&apos;re your business record. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="cp-btn cp-btn-sm flex-1"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Keep them
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-sm cp-btn-danger flex-1"
              disabled={isPending}
              onClick={() => run(() => deleteContact(contactId))}
            >
              {isPending ? "Deleting..." : "Confirm delete"}
            </button>
          </div>
        </>
      )}
      {feedback && (
        <p
          className={`text-[12.5px] leading-snug ${
            feedback.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
