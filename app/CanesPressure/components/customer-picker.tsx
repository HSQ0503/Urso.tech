"use client";

import { useMemo, useState } from "react";
import { UserRound, UserRoundPlus, Link2 } from "lucide-react";
import { fmtPhone } from "@/lib/canes/types";
import type { CustomerHit } from "@/lib/canes/customers";

// Client-first typeahead (Sebastian's ask): every create flow leads with the
// client name. Typing filters the existing customer directory — picking a hit
// links the record and prefills contact fields; a name with no match reads as
// a NEW client, which the server saves to Customers on create. Pure combobox
// over a directory the page already fetched: no per-keystroke requests.

const MAX_HITS = 6;

function matches(c: CustomerHit, q: string, qDigits: string): boolean {
  if (c.name?.toLowerCase().includes(q)) return true;
  if (qDigits.length >= 3 && c.phone?.includes(qDigits)) return true;
  return false;
}

export function CustomerPicker({
  id,
  customers,
  value,
  onChange,
  onPick,
  linkedId,
  placeholder = "Start typing a client name...",
  disabled,
  required,
}: {
  id?: string;
  customers: CustomerHit[];
  value: string;
  onChange: (name: string) => void;
  onPick: (hit: CustomerHit) => void;
  // The currently linked contact id (null = new client). Drives the status
  // line; the parent owns the link state and clears it when the name diverges.
  linkedId: string | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Suppress reopening the list for the exact name just picked.
  const [pickedName, setPickedName] = useState<string | null>(null);

  const hits = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 1 || q === pickedName?.toLowerCase()) return [];
    const qDigits = q.replace(/\D/g, "");
    return customers.filter((c) => matches(c, q, qDigits)).slice(0, MAX_HITS);
  }, [customers, value, pickedName]);

  const show = open && hits.length > 0;
  const trimmed = value.trim();

  function pick(hit: CustomerHit) {
    setPickedName(hit.name ?? "");
    setOpen(false);
    setActive(-1);
    onPick(hit);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // pick, don't submit the wrapping form
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          className="cp-input"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => {
            // Typing past a pick re-enables the list — even retyping the
            // exact picked name after an unlink must suggest again.
            if (pickedName && e.target.value.trim() !== pickedName) setPickedName(null);
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          autoComplete="off"
          role="combobox"
          aria-expanded={show}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && id ? `${id}-opt-${active}` : undefined}
        />
        {show && (
          <ul
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] py-1 shadow-[0_10px_28px_var(--cp-shadow)]"
          >
            {hits.map((c, i) => (
              <li
                key={c.id}
                id={id ? `${id}-opt-${i}` : undefined}
                role="option"
                aria-selected={i === active}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${
                  i === active ? "bg-[var(--cp-hover)]" : ""
                }`}
                // pointerdown beats the input's blur on desktop and iOS alike.
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <UserRound size={14} className="shrink-0 text-[var(--cp-faint)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium leading-snug">
                    {c.name ?? "No name"}
                  </span>
                  <span className="block truncate text-[12px] leading-snug text-[var(--cp-muted)]">
                    {[c.phone ? fmtPhone(c.phone) : null, c.address].filter(Boolean).join(" · ") ||
                      "No details on file"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* The link state, in plain words — existing client files under their
          record; an unmatched name becomes a new Customers entry. */}
      {trimmed &&
        (linkedId ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--cp-good)]">
            <Link2 size={12} strokeWidth={2.5} /> Existing client — files under their record
          </p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--cp-muted)]">
            <UserRoundPlus size={12} strokeWidth={2.5} /> New client — will be added to Customers
          </p>
        ))}
    </div>
  );
}
