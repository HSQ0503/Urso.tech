"use client";

import { useState } from "react";
import { ArrowRight } from "@/components/ui/arrow-right";

type FormState = {
  name: string;
  email: string;
  brand: string;
  clarity: string;
};

const empty: FormState = { name: "", email: "", brand: "", clarity: "" };
type Status = "idle" | "submitting" | "ok" | "error";

const RESPONSE_TIMEFRAME = "two business days";
const CLARITY_OPTIONS = [
  "No idea",
  "A rough sense",
  "Pretty clear",
  "Dialed in",
] as const;

export function DiagnosticForm() {
  const [form, setForm] = useState<FormState>(empty);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (!form.clarity) {
      setError("Pick the one that sounds most like you.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/request-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-orange/40 bg-orange-soft p-8 text-center sm:p-10">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-full border border-orange/60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5 9-11"
              stroke="#FE5100"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-[20px] font-medium tracking-[-0.02em]">
          Thanks — we&apos;ll be in touch.
        </div>
        <p className="mx-auto mt-3 max-w-[420px] text-[14px] text-ink-dim">
          We&apos;ll reach out within {RESPONSE_TIMEFRAME} — and we&apos;ll have
          already started looking at your business before we do.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 text-left">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          required
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder="Jane Roberts"
          type="text"
        />
        <Field
          label="Email"
          required
          value={form.email}
          onChange={(v) => set("email", v)}
          placeholder="you@yourbusiness.com"
          type="email"
        />
      </div>

      <Field
        label="Business name"
        required
        value={form.brand}
        onChange={(v) => set("brand", v)}
        placeholder="Your business name"
        type="text"
      />

      <Segmented
        label="How well do you know where you're losing money?"
        value={form.clarity}
        onChange={(v) => set("clarity", v)}
        options={CLARITY_OPTIONS}
      />

      {error && <div className="text-[13px] text-[#F87171]">{error}</div>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-orange px-6 py-4 font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Request the diagnostic"}
        {status !== "submitting" && <ArrowRight />}
      </button>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        A short call first · no obligation · we&apos;ll never share your email
      </p>
    </form>
  );
}

const inputClass =
  "w-full rounded-[10px] border border-edge bg-[#0d0d0d] px-4 py-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong";

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  type: "text" | "email" | "tel" | "textarea";
};

function Field({ label, value, onChange, placeholder, required, type }: FieldProps) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      {type === "textarea" ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <FieldLabel label={label} required />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={active}
              className={`cursor-pointer rounded-[10px] border px-2 py-3 font-sans text-[13px] tracking-[-0.005em] transition-colors duration-200 ${
                active
                  ? "border-orange/60 bg-orange-soft text-ink"
                  : "border-edge bg-[#0d0d0d] text-ink-dim hover:border-edge-strong hover:text-ink"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
      {label}
      {!required && <span className="ml-2 text-ink-dimmer/60">· optional</span>}
    </div>
  );
}
