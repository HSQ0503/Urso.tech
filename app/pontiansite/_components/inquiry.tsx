"use client";

import { useState, type FormEvent } from "react";
import { BUTTON } from "./brand";

type Errors = Partial<Record<"name" | "email" | "note", string>>;

const FIELD =
  "block w-full rounded-[12px] border border-[#cfcbc3] bg-white px-4 text-[16px] text-pt-ink placeholder:text-[#6b6b68] transition-colors focus-visible:border-pt-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pt-action aria-[invalid=true]:border-2 aria-[invalid=true]:border-pt-ink";

export function Inquiry() {
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const note = String(data.get("note") ?? "").trim();

    const next: Errors = {};
    if (name.length < 2) next.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a work email, like name@company.com.";
    if (!note) next.note = "Tell us what should get easier.";
    setErrors(next);

    const firstInvalid = (["name", "email", "note"] as const).find((key) => next[key]);
    if (firstInvalid) {
      document.getElementById(`inquiry-${firstInvalid}`)?.focus();
      return;
    }

    const body = [`Name: ${name}`, `Email: ${email}`, "", "What should get easier:", note].join("\n");
    setStatus("Your email app should open with this note addressed to hello@urso.ws. If it doesn't, send it there directly.");
    window.location.href = `mailto:hello@urso.ws?subject=${encodeURIComponent("Pontian project inquiry")}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-[22px] bg-white p-6 text-pt-ink sm:p-8">
      <p role="status" className="mb-4 text-[15px] leading-[24px] empty:hidden">
        {status}
      </p>
      <Field id="name" label="Name" error={errors.name}>
        <input id="inquiry-name" name="name" type="text" autoComplete="name" required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "inquiry-name-error" : undefined} className={`${FIELD} h-12`} />
      </Field>
      <Field id="email" label="Work email" error={errors.email}>
        <input
          id="inquiry-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@company.com"
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "inquiry-email-error" : undefined}
          className={`${FIELD} h-12`}
        />
      </Field>
      <Field id="note" label="What should get easier?" error={errors.note}>
        <textarea
          id="inquiry-note"
          name="note"
          rows={4}
          placeholder="Tell us about the workflow, and where it gets stuck."
          required
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? "inquiry-note-error" : undefined}
          className={`${FIELD} min-h-32 resize-y py-3`}
        />
      </Field>
      <button type="submit" className={`${BUTTON.primary} mt-2 w-full sm:w-auto`}>
        Send inquiry
      </button>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label htmlFor={`inquiry-${id}`} className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold">
        {label}
        <span className="text-[12px] font-semibold text-pt-muted">* Required</span>
      </label>
      {children}
      <p id={`inquiry-${id}-error`} hidden={!error} className="mt-2 text-[14px] leading-[22px]">
        {error}
      </p>
    </div>
  );
}
