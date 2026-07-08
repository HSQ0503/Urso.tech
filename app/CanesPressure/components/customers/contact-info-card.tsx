"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Mail, Pencil, Phone } from "lucide-react";
import { updateCustomer } from "@/app/CanesPressure/actions";
import { fmtEt, fmtPhone, SOURCE_LABEL, type Contact } from "@/lib/canes/types";

// Contact info with an inline edit toggle. The card owns its edit state; the
// page-header Edit button (EditContactButton below) opens it via a window
// event, so repeat Edit → Cancel → Edit cycles always work. Archive lives in
// the edit view — it hides the customer from day-to-day lists without
// deleting history.

const EDIT_EVENT = "canes:contact-edit";

// Header affordance for the card's edit mode — rendered by the server page,
// talks to the card without any URL state.
export function EditContactButton() {
  return (
    <button
      type="button"
      className="cp-btn cp-btn-sm"
      onClick={() => window.dispatchEvent(new Event(EDIT_EVENT))}
    >
      <Pencil size={14} strokeWidth={2} />
      Edit
    </button>
  );
}

export function ContactInfoCard({ contact }: { contact: Contact }) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function openEdit() {
      setNotice("");
      setEditing(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      window.setTimeout(() => document.getElementById("ci-name")?.focus(), 0);
    }
    window.addEventListener(EDIT_EVENT, openEdit);
    return () => window.removeEventListener(EDIT_EVENT, openEdit);
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setNotice("");
    startTransition(async () => {
      const res = await updateCustomer(contact.id, {
        name: String(fd.get("name") ?? "").trim(),
        phone: String(fd.get("phone") ?? "").trim(),
        email: String(fd.get("email") ?? "").trim(),
      });
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } else {
        setNotice(res.notice ?? "Could not save.");
      }
    });
  }

  function toggleArchived() {
    setNotice("");
    startTransition(async () => {
      const res = await updateCustomer(contact.id, { archived: !contact.archived });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setNotice(res.notice ?? "Could not save.");
      }
    });
  }

  return (
    <div ref={cardRef} className="cp-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Contact info</h2>
        {!editing && (
          <button
            type="button"
            className="cp-btn cp-btn-ghost cp-btn-sm"
            onClick={() => {
              setEditing(true);
              setNotice("");
            }}
          >
            <Pencil size={13} strokeWidth={2} />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label className="cp-label" htmlFor="ci-name">Name</label>
            <input id="ci-name" name="name" className="cp-input" defaultValue={contact.name ?? ""} />
          </div>
          <div>
            <label className="cp-label" htmlFor="ci-phone">Phone</label>
            <input id="ci-phone" name="phone" type="tel" className="cp-input" defaultValue={contact.phone ?? ""} />
          </div>
          <div>
            <label className="cp-label" htmlFor="ci-email">Email</label>
            <input id="ci-email" name="email" type="email" className="cp-input" defaultValue={contact.email ?? ""} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </button>
            <button type="button" className="cp-btn cp-btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={`cp-btn cp-btn-ghost cp-btn-sm ${contact.archived ? "" : "cp-btn-danger"}`}
              onClick={toggleArchived}
              disabled={isPending}
            >
              {contact.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
          {notice && <p className="text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
        </form>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div>
            <p className="cp-mono">Phone</p>
            {contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold tabular-nums hover:underline"
              >
                <Phone size={13} strokeWidth={2} className="text-[var(--cp-muted)]" />
                {fmtPhone(contact.phone)}
              </a>
            ) : (
              <p className="mt-0.5 text-[14px] text-[var(--cp-faint)]">None on file</p>
            )}
          </div>
          <div>
            <p className="cp-mono">Email</p>
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="mt-0.5 inline-flex max-w-full items-center gap-1.5 text-[14px] font-semibold hover:underline"
              >
                <Mail size={13} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
                <span className="truncate">{contact.email}</span>
              </a>
            ) : (
              <p className="mt-0.5 text-[14px] text-[var(--cp-faint)]">None on file</p>
            )}
          </div>
          <div>
            <p className="cp-mono">Source</p>
            <p className="mt-0.5 text-[14px]">{SOURCE_LABEL[contact.source]}</p>
          </div>
          <div>
            <p className="cp-mono">Customer since</p>
            <p className="mt-0.5 text-[14px] tabular-nums">
              {fmtEt(contact.created_at, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          {saved && (
            <p className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cp-good)]">
              <Check size={14} strokeWidth={2} /> Saved
            </p>
          )}
        </div>
      )}
    </div>
  );
}
