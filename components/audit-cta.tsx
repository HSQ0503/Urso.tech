"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Pill } from "./ui/pill";
import { ArrowRight } from "./ui/arrow-right";
import { armIntro } from "@/lib/intro-state";
import { triggerWipe } from "@/components/wipe-transition";

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

export function AuditCta() {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    router.prefetch("/book-an-audit");
  }, [router]);

  const go = () => {
    armIntro();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      triggerWipe("/book-an-audit", {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        r0: Math.max(rect.width, rect.height) / 2,
      });
    } else {
      triggerWipe("/book-an-audit");
    }
  };

  return (
    <section className="relative overflow-hidden border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14 md:py-[120px]">
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

        <div className="mt-10 flex justify-center sm:mt-12">
          <button
            ref={btnRef}
            onClick={go}
            className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-orange px-[26px] py-4 font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter,box-shadow] hover:brightness-110"
          >
            Request an audit
            <ArrowRight />
          </button>
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
