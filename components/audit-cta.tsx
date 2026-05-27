"use client";

import { useState } from "react";
import { Pill } from "./ui/pill";
import { ArrowRight } from "./ui/arrow-right";
import { Stepper } from "./audit-cta/stepper";
import { SlideToConfirm } from "./audit-cta/slide-to-confirm";

type Step = "email" | "slider" | "form" | "done";
const stepOrder: Step[] = ["email", "slider", "form", "done"];

type FormState = {
  name: string;
  business: string;
  stores: string;
  phone: string;
};

const emptyForm: FormState = { name: "", business: "", stores: "", phone: "" };

const fields: Array<{
  key: keyof FormState;
  label: string;
  placeholder: string;
}> = [
  { key: "name", label: "Your name", placeholder: "Jane Roberts" },
  { key: "business", label: "Business", placeholder: "Woof Gang Bakery — Central FL" },
  { key: "stores", label: "How many stores", placeholder: "4" },
  { key: "phone", label: "Best number", placeholder: "+1 555 0142" },
];

const cadence: Array<{ tag: string; title: string; body: string }> = [
  {
    tag: "WEEK 1",
    title: "External recon",
    body: "Rankings, review state, booking-flow walk-throughs, after-hours call tests. Written findings per store.",
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

export function AuditCta() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const stepIdx = Math.min(stepOrder.indexOf(step), 2);

  return (
    <section className="relative overflow-hidden border-t border-edge bg-bg px-14 py-[120px] text-ink">
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
        <h2 className="mt-6 text-[88px] font-medium leading-[0.95] tracking-[-0.035em]">
          Find your leak<span className="text-orange">.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[560px] text-[17px] leading-[1.5] text-ink-dim">
          45 minutes. We walk in with external recon already done. You leave
          with a dollar-priced list of leaks across every store.
        </p>

        <Stepper stepIdx={stepIdx} />

        <div className="mt-12 flex min-h-[220px] items-start justify-center">
          {step === "email" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email) setStep("slider");
              }}
              className="flex w-full max-w-[560px] items-center rounded-full border border-edge bg-[#0d0d0d] p-1.5"
            >
              <input
                type="email"
                required
                placeholder="you@yourstores.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[52px] flex-1 border-none bg-transparent px-[22px] font-sans text-[15px] tracking-[-0.005em] text-ink outline-none placeholder:text-ink-dimmer"
              />
              <button
                type="submit"
                className="inline-flex h-[52px] cursor-pointer items-center gap-2 rounded-full border-none bg-orange px-6 font-sans text-[15px] font-medium tracking-[-0.005em] text-white"
              >
                Book an audit <ArrowRight />
              </button>
            </form>
          )}

          {step === "slider" && (
            <div className="flex w-full max-w-[560px] flex-col items-stretch">
              <div className="mb-3.5 font-mono text-[13px] tracking-[0.04em] text-ink-dim">
                {email} · ready to continue?
              </div>
              <SlideToConfirm onComplete={() => setStep("form")} />
              <button
                onClick={() => setStep("email")}
                className="mt-4 cursor-pointer self-start border-none bg-transparent font-sans text-[12px] text-ink-dimmer hover:text-ink-dim"
              >
                ← change email
              </button>
            </div>
          )}

          {step === "form" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep("done");
              }}
              className="grid w-full max-w-[560px] gap-3 text-left"
            >
              {fields.map((f) => (
                <div key={f.key}>
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                    {f.label}
                  </div>
                  <input
                    required
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                    className="w-full rounded-[10px] border border-edge bg-[#0d0d0d] px-4 py-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong"
                  />
                </div>
              ))}
              <button
                type="submit"
                className="mt-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-orange px-6 py-4 font-sans text-[15px] font-medium text-white"
              >
                Send the audit request <ArrowRight />
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-orange bg-orange-soft">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l5 5 9-11"
                    stroke="#FE5100"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-[24px] font-medium tracking-[-0.02em]">
                Audit booked.
              </div>
              <p className="mx-auto mt-3 max-w-[420px] text-[14px] text-ink-dim">
                We&apos;ll reach out within 24 hours with a calendar link. In
                the meantime, we&apos;re already doing external recon on every
                store you listed.
              </p>
              <button
                onClick={() => {
                  setStep("email");
                  setEmail("");
                  setForm(emptyForm);
                }}
                className="mt-7 cursor-pointer rounded-lg border border-edge-strong bg-transparent px-[18px] py-2.5 font-sans text-[13px] text-ink hover:bg-white/[0.04]"
              >
                Reset demo
              </button>
            </div>
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-y-8 border-t border-edge pt-8 text-left md:grid-cols-3 md:gap-0">
          {cadence.map((s, i) => (
            <div
              key={s.tag}
              className={`px-7 ${i > 0 ? "md:border-l md:border-edge" : ""}`}
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
