"use client";

import { useRef } from "react";

// Phone input that formats as you type — "5615375674" renders "(561) 537-5674"
// (Sebastian's Markate-parity ask). NANP-only by design: digits cap at ten and
// a leading 1 is absorbed, matching toE164 on the server, which strips the
// punctuation right back out. The input manages its own DOM value (uncontrolled)
// so reformat + caret placement stay a single synchronous step; parents that
// track state get the formatted string via onChange.

function fmt(d: string): string {
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Format `raw` and map a caret sitting after `caretRaw` chars to its spot in
// the formatted string (counted in digits, so inserted punctuation never
// displaces the cursor).
function reformat(raw: string, caretRaw: number): { text: string; caret: number } {
  let digits = raw.replace(/\D/g, "");
  let before = raw.slice(0, caretRaw).replace(/\D/g, "").length;
  if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
    before = Math.max(0, before - 1);
  }
  digits = digits.slice(0, 10);
  before = Math.min(before, digits.length);
  const text = fmt(digits);
  let caret = 0;
  for (let seen = 0; caret < text.length && seen < before; caret++) {
    if (/\d/.test(text[caret])) seen++;
  }
  return { text, caret };
}

export function PhoneInput({
  id,
  name,
  defaultValue,
  onChange,
  placeholder = "(561) 555-0123",
  required,
  disabled,
  className = "cp-input",
  autoComplete = "tel",
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  autoComplete?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function apply(raw: string, caretRaw: number) {
    const el = ref.current;
    if (!el) return;
    const { text, caret } = reformat(raw, caretRaw);
    el.value = text;
    el.setSelectionRange(caret, caret);
    onChange?.(text);
  }

  return (
    <input
      ref={ref}
      id={id}
      name={name}
      type="tel"
      inputMode="tel"
      className={className}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete={autoComplete}
      defaultValue={fmt((defaultValue ?? "").replace(/\D/g, "").replace(/^1(?=\d{10})/, ""))}
      onInput={(e) => {
        const el = e.currentTarget;
        apply(el.value, el.selectionStart ?? el.value.length);
      }}
      onKeyDown={(e) => {
        // Backspace over punctuation would otherwise be undone by the
        // reformat — delete the nearest digit to its left instead.
        if (e.key !== "Backspace") return;
        const el = e.currentTarget;
        const s = el.selectionStart ?? 0;
        if (el.selectionEnd !== s || s === 0 || /\d/.test(el.value[s - 1])) return;
        e.preventDefault();
        let i = s - 1;
        while (i > 0 && !/\d/.test(el.value[i - 1])) i--;
        if (i === 0) return;
        apply(el.value.slice(0, i - 1) + el.value.slice(s), i - 1);
      }}
    />
  );
}
