"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Mail, Pencil, Phone } from "lucide-react";
import { updateCustomer } from "@/app/CanesPressure/actions";
import { CallButton } from "../call-button";
import { PhoneInput } from "../phone-input";
import { fmtEt, fmtPhone, SOURCE_LABEL, type Contact } from "@/lib/canes/types";

// Contact info with an inline edit toggle. The card owns its edit state; the
// page-header Edit button (EditContactButton / EditContactQuick below) opens it
// via a window event, so repeat Edit → Cancel → Edit cycles always work.
// Archive lives in the edit view — it hides the customer from day-to-day lists
// without deleting history. Desktop renders a bordered card (frozen); mobile
// (md:hidden) renders an iOS inset list under a mono section label. The two
// edit forms use distinct field ids so the visible one always focuses.

const EDIT_EVENT = "canes:contact-edit";

// Desktop header affordance for the card's edit mode.
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

// Mobile quick-action tile (in the contact-card cp-quick-row) that opens edit.
export function EditContactQuick() {
  return (
    <button
      type="button"
      className="cp-quick"
      onClick={() => window.dispatchEvent(new Event(EDIT_EVENT))}
    >
      <Pencil size={18} strokeWidth={2} />
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
      // Focus whichever breakpoint's name field is actually visible.
      window.setTimeout(() => {
        const candidates = ["ci-name", "ci-name-m"];
        for (const id of candidates) {
          const el = document.getElementById(id) as HTMLInputElement | null;
          if (el && el.offsetParent !== null) {
            el.focus();
            return;
          }
        }
      }, 0);
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
    <div ref={cardRef}>
      {/* ── Mobile: iOS inset list ─────────────────────────────────── */}
      <div className="md:hidden">
        <div className="flex items-end justify-between px-1.5 pb-[7px]">
          <span className="cp-list-header p-0">Contact info</span>
          {!editing && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--cp-brand-deep)]"
              onClick={() => {
                setEditing(true);
                setNotice("");
              }}
            >
              <Pencil size={14} strokeWidth={2} />
              Edit
            </button>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--cp-good)]">
              <Check size={13} strokeWidth={2} /> Saved
            </span>
          )}
        </div>

        {editing ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-4"
          >
            <div>
              <label className="cp-label" htmlFor="ci-name-m">Name</label>
              <input id="ci-name-m" name="name" className="cp-input" defaultValue={contact.name ?? ""} />
            </div>
            <div>
              <label className="cp-label" htmlFor="ci-phone-m">Phone</label>
              <PhoneInput id="ci-phone-m" name="phone" defaultValue={contact.phone} />
            </div>
            <div>
              <label className="cp-label" htmlFor="ci-email-m">Email</label>
              <input id="ci-email-m" name="email" type="email" className="cp-input" defaultValue={contact.email ?? ""} />
            </div>
            <div className="space-y-2">
              <button type="submit" className="cp-btn cp-btn-primary cp-btn-block" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </button>
              <button type="button" className="cp-btn cp-btn-block" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`cp-btn cp-btn-block ${contact.archived ? "" : "cp-btn-danger"}`}
                onClick={toggleArchived}
                disabled={isPending}
              >
                {contact.archived ? "Unarchive" : "Archive"}
              </button>
            </div>
            {notice && <p className="text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
          </form>
        ) : (
          <div className="cp-list">
            <div className="cp-list-row">
              <div className="min-w-0 flex-1">
                <p className="cp-list-sub">Phone</p>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} className="cp-list-title tabular-nums">
                    {fmtPhone(contact.phone)}
                  </a>
                ) : (
                  <p className="cp-list-title text-[var(--cp-faint)]">None on file</p>
                )}
              </div>
              {contact.phone && (
                <CallButton
                  phone={contact.phone}
                  label=""
                  iconSize={16}
                  className="cp-icon-btn"
                  showFeedback={false}
                />
              )}
            </div>
            <div className="cp-list-row">
              <div className="min-w-0 flex-1">
                <p className="cp-list-sub">Email</p>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="cp-list-title block truncate">
                    {contact.email}
                  </a>
                ) : (
                  <p className="cp-list-title text-[var(--cp-faint)]">None on file</p>
                )}
              </div>
            </div>
            <div className="cp-list-row">
              <div className="min-w-0 flex-1">
                <p className="cp-list-sub">Source</p>
                <p className="cp-list-title">{SOURCE_LABEL[contact.source]}</p>
              </div>
            </div>
            <div className="cp-list-row">
              <div className="min-w-0 flex-1">
                <p className="cp-list-sub">Customer since</p>
                <p className="cp-list-title tabular-nums">
                  {fmtEt(contact.created_at, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop: bordered card ───────────────────────────── (frozen) */}
      <div className="hidden cp-card p-4 md:block">
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
              <PhoneInput id="ci-phone" name="phone" defaultValue={contact.phone} />
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
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex items-center gap-1.5 text-[14px] font-semibold tabular-nums hover:underline"
                  >
                    <Phone size={13} strokeWidth={2} className="text-[var(--cp-muted)]" />
                    {fmtPhone(contact.phone)}
                  </a>
                  <CallButton
                    phone={contact.phone}
                    className="cp-btn cp-btn-ghost cp-btn-sm"
                    showFeedback={false}
                  />
                </div>
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
    </div>
  );
}
