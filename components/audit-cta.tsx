"use client";

import { useState } from "react";
import { Pill } from "./ui/pill";
import { SlideToConfirm } from "./ui/slide-to-confirm";

const cadence: Array<{ tag: string; title: string; body: string }> = [
  {
    tag: "WEEK 1",
    title: "External recon",
    body: "Rankings, review state, booking-flow walk-throughs, after-hours call tests. AI runs the scan; we write the findings per store.",
  },
  {
    tag: "WEEK 2–3",
    title: "Baseline & Leak Report",
    body: "Internal data pulled clean, measured identically across stores. Each leak: what it costs, the proposed fix.",
  },
  {
    tag: "WEEK 4–8",
    title: "Fix one leak, measure the after",
    body: "Depth over breadth. The biggest provable leak — fixed well across every store. The delta becomes your case study.",
  },
];

type Stage = "email" | "details" | "confirm" | "success";

const RESPONSE_TIMEFRAME = "two business days";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuditCta() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [about, setAbout] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const detailsValid = name.trim().length > 1;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/request-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, about }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="request-an-audit"
      className="relative overflow-hidden border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14 md:py-[120px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(254,81,0,0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[880px] text-center">
        <Pill>Book the audit</Pill>
        <h2 className="mt-5 text-[clamp(44px,11vw,88px)] font-medium leading-[0.95] tracking-[-0.035em] sm:mt-6">
          Find your leak<span className="text-orange">.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
          45 minutes. We walk in with AI-driven recon already done — every
          store profiled before we sit down. You leave with a dollar-priced
          list of leaks across every store.
        </p>

        <div className="mx-auto mt-10 w-full max-w-[480px] sm:mt-12">
          {stage === "email" && (
            <StageWrap stageKey="email">
              <EmailStage
                email={email}
                setEmail={setEmail}
                valid={emailValid}
                onAdvance={() => setStage("details")}
              />
            </StageWrap>
          )}

          {stage === "details" && (
            <StageWrap stageKey="details">
              <DetailsStage
                name={name}
                phone={phone}
                about={about}
                setName={setName}
                setPhone={setPhone}
                setAbout={setAbout}
                valid={detailsValid}
                onAdvance={() => setStage("confirm")}
                onBack={() => setStage("email")}
              />
            </StageWrap>
          )}

          {stage === "confirm" && (
            <StageWrap stageKey="confirm">
              <ConfirmStage
                email={email}
                name={name}
                phone={phone}
                onBack={() => setStage("details")}
                onSubmit={submit}
                submitting={submitting}
                error={error}
              />
            </StageWrap>
          )}

          {stage === "success" && (
            <StageWrap stageKey="success">
              <SuccessStage />
            </StageWrap>
          )}

          {stage !== "success" && (
            <StepDots
              current={stage === "email" ? 0 : stage === "details" ? 1 : 2}
            />
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-y-8 border-t border-edge pt-8 text-left sm:mt-20 md:grid-cols-3 md:gap-0">
          {cadence.map((s, i) => (
            <div
              key={s.tag}
              className={`px-1 sm:px-5 md:px-7 ${
                i > 0 ? "md:border-l md:border-edge" : ""
              }`}
            >
              <div className="font-mono text-[10px] tracking-[0.1em] text-orange">
                {s.tag}
              </div>
              <h4 className="mt-3 text-[16px] font-medium tracking-[-0.015em]">
                {s.title}
              </h4>
              <p className="mt-2 text-[13px] leading-[1.5] text-ink-dim">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StageWrap({
  stageKey,
  children,
}: {
  stageKey: string;
  children: React.ReactNode;
}) {
  return (
    <div key={stageKey} className="animate-stage-in">
      {children}
    </div>
  );
}

function StepDots({ current }: { current: 0 | 1 | 2 }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-orange"
              : i < current
                ? "w-1.5 bg-orange/60"
                : "w-1.5 bg-edge-strong"
          }`}
        />
      ))}
    </div>
  );
}

/* ---------- Email stage ---------- */

function EmailStage({
  email,
  setEmail,
  valid,
  onAdvance,
}: {
  email: string;
  setEmail: (v: string) => void;
  valid: boolean;
  onAdvance: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourstores.com"
        autoComplete="email"
        inputMode="email"
        className="h-[64px] w-full rounded-full border border-edge bg-[#0d0d0d] px-7 text-center font-sans text-[15px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong"
      />
      <SlideToConfirm
        label={valid ? "Slide to continue" : "Enter your email first"}
        disabled={!valid}
        onConfirm={onAdvance}
      />
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        Step 1 of 3 · We&apos;ll never share your email
      </p>
    </div>
  );
}

/* ---------- Details stage ---------- */

function DetailsStage({
  name,
  phone,
  about,
  setName,
  setPhone,
  setAbout,
  valid,
  onAdvance,
  onBack,
}: {
  name: string;
  phone: string;
  about: string;
  setName: (v: string) => void;
  setPhone: (v: string) => void;
  setAbout: (v: string) => void;
  valid: boolean;
  onAdvance: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-left">
      <Field label="Name" required>
        <input
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Roberts"
          autoComplete="name"
          className={inputClass}
        />
      </Field>

      <Field label="Phone" optional>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 0142"
          autoComplete="tel"
          className={inputClass}
        />
      </Field>

      <Field label="Tell us about your business" optional>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="What you run, where, what you'd like the audit to dig into."
          rows={3}
          className={`${inputClass} h-auto resize-none rounded-[20px] py-3`}
        />
      </Field>

      <div className="mt-2">
        <SlideToConfirm
          label={valid ? "Slide to continue" : "Add your name"}
          disabled={!valid}
          onConfirm={onAdvance}
        />
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-1 self-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer transition hover:text-ink-dim"
      >
        ← Back
      </button>
    </div>
  );
}

const inputClass =
  "h-[52px] w-full rounded-full border border-edge bg-[#0d0d0d] px-6 font-sans text-[14px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong";

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        {label}
        {optional && (
          <span className="ml-2 text-ink-dimmer/60">· optional</span>
        )}
        {required && <span className="ml-1 text-orange">*</span>}
      </div>
      {children}
    </label>
  );
}

/* ---------- Confirm stage ---------- */

function ConfirmStage({
  email,
  name,
  phone,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  email: string;
  name: string;
  phone: string;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 text-left">
      <div className="rounded-[20px] border border-edge bg-[#0d0d0d] px-6 py-5">
        <SummaryRow label="Name" value={name} />
        <SummaryRow label="Email" value={email} />
        {phone && <SummaryRow label="Phone" value={phone} />}
        <div className="mt-4 border-t border-edge pt-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
          We&apos;ll reach out within {RESPONSE_TIMEFRAME}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F87171]/30 bg-[#F87171]/5 px-4 py-3 text-center text-[13px] text-[#F87171]">
          {error}
        </div>
      )}

      <SlideToConfirm
        label="Slide to request now"
        onConfirm={onSubmit}
        loading={submitting}
      />

      {!submitting && (
        <button
          type="button"
          onClick={onBack}
          className="mt-1 self-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer transition hover:text-ink-dim"
        >
          ← Back
        </button>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        {label}
      </div>
      <div className="truncate text-right text-[14px] text-ink">{value}</div>
    </div>
  );
}

/* ---------- Success ---------- */

function SuccessStage() {
  return (
    <div className="rounded-[24px] border border-orange/40 bg-orange-soft px-6 py-8 text-center">
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
        We&apos;ll reach out within {RESPONSE_TIMEFRAME} to set up a call.
      </p>
    </div>
  );
}
