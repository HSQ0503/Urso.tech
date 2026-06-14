"use client";

import { useState } from "react";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { WipeLink } from "./wipe-link";
import { cx } from "./ui";

const BUSINESS_TYPES = [
  "Appointment-based services",
  "Multi-location or franchise",
  "Clinic or practice",
  "Education or childcare",
  "Home services",
  "Fitness or wellness",
  "Other",
];

const LOCATION_BANDS = ["1", "2–3", "4–9", "10–24", "25+"];

const fieldBase =
  "w-full rounded-lg border border-edge bg-[#0c0c0c] px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-dimmer outline-none transition-colors focus:border-edge-strong focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-orange";

const labelBase =
  "mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelBase}>
        {label}
        {required && <span className="text-orange"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function ContactForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    website: "",
    businessType: "",
    locations: "",
    challenge: "",
    stack: "",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sliderKey, setSliderKey] = useState(0);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const canSubmit =
    form.name.trim().length > 1 && emailOk && form.company.trim().length > 0;

  const set =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
      setSliderKey((k) => k + 1);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-edge bg-panel p-8 sm:p-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-orange">
          Received
        </div>
        <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          You&rsquo;re on the founders&rsquo; desk.
        </h2>
        <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.55] text-ink-dim">
          You&rsquo;ll hear back from a founder — usually within two business days. No
          autoresponder, no sales sequence.
        </p>
        <WipeLink
          href="/what-we-find"
          className="group mt-6 inline-flex items-center gap-2 text-[14px] text-ink-dim transition-colors hover:text-ink"
        >
          While you wait, see what we find
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform group-hover:translate-x-0.5">
            <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </WipeLink>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="rounded-xl border border-edge bg-panel p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            className={fieldBase}
            value={form.name}
            onChange={set("name")}
            autoComplete="name"
            placeholder="Your name"
          />
        </Field>
        <Field label="Work email" required>
          <input
            className={fieldBase}
            value={form.email}
            onChange={set("email")}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Company" required>
          <input
            className={fieldBase}
            value={form.company}
            onChange={set("company")}
            autoComplete="organization"
            placeholder="Company name"
          />
        </Field>
        <Field label="Website">
          <input
            className={fieldBase}
            value={form.website}
            onChange={set("website")}
            inputMode="url"
            placeholder="company.com"
          />
        </Field>
        <Field label="Business type">
          <div className="relative">
            <select
              className={cx(fieldBase, "appearance-none pr-10", !form.businessType && "text-ink-dimmer")}
              value={form.businessType}
              onChange={set("businessType")}
            >
              <option value="">Select…</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t} className="text-ink">
                  {t}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </Field>
        <Field label="Locations">
          <div className="relative">
            <select
              className={cx(fieldBase, "appearance-none pr-10", !form.locations && "text-ink-dimmer")}
              value={form.locations}
              onChange={set("locations")}
            >
              <option value="">Select…</option>
              {LOCATION_BANDS.map((t) => (
                <option key={t} value={t} className="text-ink">
                  {t}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </Field>
      </div>

      <div className="mt-5">
        <Field label="What's getting harder as you grow?">
          <textarea
            className={cx(fieldBase, "min-h-[120px] resize-y")}
            value={form.challenge}
            onChange={set("challenge")}
            placeholder="The thing you keep circling — staffing, a second location, why Tuesdays die…"
          />
        </Field>
      </div>
      <div className="mt-5">
        <Field label="What runs the business today?">
          <input
            className={fieldBase}
            value={form.stack}
            onChange={set("stack")}
            placeholder="POS, books, scheduling, phones…"
          />
        </Field>
      </div>

      {error && (
        <p className="mt-5 rounded-lg border border-[#E5484D]/30 bg-[#E5484D]/5 px-3.5 py-2.5 text-[13px] text-[#E5484D]">
          {error}
        </p>
      )}

      <div className="mt-7">
        <SlideToConfirm
          key={sliderKey}
          label="Slide to start the conversation"
          onConfirm={submit}
          loading={loading}
          disabled={!canSubmit}
        />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          {canSubmit
            ? "A founder reads every note."
            : "Name, work email, and company to begin."}
        </p>
      </div>
    </form>
  );
}

function Chevron() {
  return (
    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-dim">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
