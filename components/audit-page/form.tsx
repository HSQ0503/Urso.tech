"use client";

import { useState } from "react";
import { ArrowRight } from "@/components/ui/arrow-right";
import { Pill } from "@/components/ui/pill";

type FormState = {
  name: string;
  email: string;
  phone: string;
  about: string;
};

const empty: FormState = { name: "", email: "", phone: "", about: "" };
type Status = "idle" | "submitting" | "ok" | "error";

const RESPONSE_TIMEFRAME = "two business days";

export function AuditForm() {
  const [form, setForm] = useState<FormState>(empty);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/request-audit", {
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

  return (
    <section
      id="request-an-audit"
      className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14 md:py-[120px]"
    >
      <div className="relative mx-auto max-w-[680px]">
        <div className="text-center">
          <Pill>Request an audit</Pill>
          <h2 className="mt-5 text-[clamp(36px,8vw,64px)] font-medium leading-[0.98] tracking-[-0.035em] sm:mt-6">
            Request an audit<span className="text-orange">.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
            Tell us a little about your business. We&apos;ll set up a short
            call to see if it&apos;s a fit.
          </p>
        </div>

        {status === "ok" ? (
          <div className="mt-12 rounded-2xl border border-orange/40 bg-orange-soft p-8 text-center sm:mt-14 sm:p-10">
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
              We&apos;ll reach out within {RESPONSE_TIMEFRAME} to set up a
              call.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-10 grid gap-4 text-left sm:mt-12"
          >
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="Jane Roberts"
              type="text"
            />
            <Field
              label="Email"
              required
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="you@yourstores.com"
              type="email"
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+1 555 0142"
              type="tel"
            />
            <Field
              label="Tell us about your business"
              value={form.about}
              onChange={(v) => setForm({ ...form, about: v })}
              placeholder="A few sentences — what you run, where, what you'd like the audit to dig into."
              type="textarea"
            />

            {error && (
              <div className="text-[13px] text-[#F87171]">{error}</div>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="mt-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-orange px-6 py-4 font-sans text-[15px] font-medium tracking-[-0.005em] text-white transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            >
              {status === "submitting" ? "Sending…" : "Request an audit"}
              {status !== "submitting" && <ArrowRight />}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  type: "text" | "email" | "tel" | "textarea";
};

function Field({ label, value, onChange, placeholder, required, type }: FieldProps) {
  const baseInputClass =
    "w-full rounded-[10px] border border-edge bg-[#0d0d0d] px-4 py-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong";

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        {label}
        {!required && (
          <span className="ml-2 text-ink-dimmer/60">· optional</span>
        )}
      </div>
      {type === "textarea" ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={`${baseInputClass} resize-none`}
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseInputClass}
        />
      )}
    </div>
  );
}
