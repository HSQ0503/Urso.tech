"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createLead } from "@/app/CanesPressure/actions";
import { etLocalToIso, SOURCE_LABEL, type LeadSource, type LeadType } from "@/lib/canes/types";
import { isCompleteWhen, SchedulePicker } from "./schedule-picker";

// Loose on purpose: 10 digits with an optional +1 and common separators.
// toE164 on the server is the real gate.
const PHONE_RE = /^\+?1?[\s.\-()]*(\d[\s.\-()]*){10}$/;

// Disclosure form for manual leads (door-to-door, referrals). Renders the
// trigger button plus, when open, a w-full card — the parent header row must
// be flex-wrap so the card drops onto its own full-width line.
// variant "icon" is the round iOS header action; "button" is the desktop pill.

export function NewLead({ variant = "button" }: { variant?: "button" | "icon" }) {
  const router = useRouter();
  // Both the mobile (icon) and desktop (button) triggers mount at once (Tailwind
  // hides one via display), so field ids must differ or they collide in the DOM.
  const idp = variant === "icon" ? "new-m-" : "new-";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeadType>("cold");
  const [when, setWhen] = useState("");
  const [notice, setNotice] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    setExistingId(null);
    if (!name) {
      setNotice("Name is required.");
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setNotice("Enter a valid 10 digit phone number.");
      return;
    }
    const email = String(fd.get("email") ?? "").trim();
    const service = String(fd.get("service") ?? "").trim();
    const address = String(fd.get("address") ?? "").trim();
    const source = String(fd.get("source")) as LeadSource;
    setNotice("");
    startTransition(async () => {
      const res = await createLead({
        name,
        phone,
        type,
        source,
        email: email || undefined,
        service: service || undefined,
        address: address || undefined,
        appointmentIso: type === "hot" && isCompleteWhen(when) ? etLocalToIso(when) : undefined,
      });
      if (res.ok) {
        setOpen(false);
        setType("cold");
        setWhen("");
        router.refresh();
      } else {
        // Phone conflict: the number already has a lead — route to it instead
        // of leaving the owner stuck on a duplicate error.
        setExistingId(res.existingLeadId ?? null);
        setNotice(res.notice ?? "Could not add the lead.");
      }
    });
  }

  const toggle = () => {
    setOpen((o) => !o);
    setNotice("");
    setExistingId(null);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          className="cp-icon-btn cp-icon-btn-primary"
          aria-expanded={open}
          aria-label="Add lead"
          onClick={toggle}
        >
          <Plus size={20} strokeWidth={2} />
        </button>
      ) : (
        <button type="button" className="cp-btn cp-btn-primary" aria-expanded={open} onClick={toggle}>
          <Plus size={16} strokeWidth={2} /> Add lead
        </button>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="cp-card w-full rounded-xl p-4 md:rounded-md">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="cp-label" htmlFor={`${idp}name`}>Name</label>
              <input id={`${idp}name`} name="name" required className="cp-input" placeholder="Customer name" />
            </div>
            <div>
              <label className="cp-label" htmlFor={`${idp}phone`}>Phone</label>
              <input id={`${idp}phone`} name="phone" type="tel" required className="cp-input" placeholder="(561) 555-0123" />
            </div>
            <div>
              <label className="cp-label" htmlFor={`${idp}email`}>Email (optional)</label>
              <input id={`${idp}email`} name="email" type="email" className="cp-input" placeholder="name@example.com" />
            </div>
            <div>
              <span className="cp-label">Lead type</span>
              <div className="cp-seg w-full">
                <button
                  type="button"
                  className="cp-seg-btn flex-1"
                  data-active={type === "hot"}
                  onClick={() => setType("hot")}
                >
                  Hot
                </button>
                <button
                  type="button"
                  className="cp-seg-btn flex-1"
                  data-active={type === "cold"}
                  onClick={() => setType("cold")}
                >
                  Cold
                </button>
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">
                {type === "hot" ? "Appointment already set with the customer." : "Needs a call to quote and book."}
              </p>
            </div>
            <div>
              <label className="cp-label" htmlFor={`${idp}source`}>Source</label>
              <select id={`${idp}source`} name="source" className="cp-select" defaultValue="referral">
                {(Object.entries(SOURCE_LABEL) as [LeadSource, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="cp-label" htmlFor={`${idp}service`}>Service</label>
              <input id={`${idp}service`} name="service" className="cp-input" placeholder="House wash, driveway..." />
            </div>
            <div>
              <label className="cp-label" htmlFor={`${idp}address`}>Address</label>
              <input id={`${idp}address`} name="address" className="cp-input" placeholder="Street, city" />
            </div>
            {type === "hot" && (
              <div className="sm:col-span-2">
                <span className="cp-label">Estimate visit (optional)</span>
                <SchedulePicker value={when} onChange={setWhen} />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <button
              type="submit"
              className="cp-btn cp-btn-primary cp-btn-block md:w-auto md:min-h-9 md:rounded-[5px] md:text-[13px]"
              disabled={isPending}
            >
              {isPending ? "Adding..." : "Save lead"}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-block md:w-auto md:min-h-9 md:rounded-[5px] md:text-[13px]"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            {notice && (
              <span className="text-[12.5px] text-[var(--cp-warn)]">
                {notice}
                {existingId && (
                  <>
                    {" "}
                    <Link
                      href={`/CanesPressure/leads/${existingId}`}
                      className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
                    >
                      Open lead
                    </Link>
                  </>
                )}
              </span>
            )}
          </div>
        </form>
      )}
    </>
  );
}
