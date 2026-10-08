"use client";

import { useEffect, useRef, useState } from "react";
import { BuildConnectOperate, TONE_BG, type Tone } from "./brand";

const STEPS: { title: string; text: string; tone: Tone }[] = [
  {
    title: "Sit with the team",
    text: "We watch how jobs, money, and handoffs move today, and write down where they stall.",
    tone: "red",
  },
  {
    title: "Name the friction",
    text: "We pick one specific drag to fix first. The double entry, the missed call, or the report someone rebuilds every Monday.",
    tone: "yellow",
  },
  {
    title: "Build the system",
    text: "Software, a data connection, or an automation, sized to that one problem.",
    tone: "blue",
  },
  {
    title: "Stay with it",
    text: "We maintain what we ship on a monthly plan and keep improving it as the business changes.",
    tone: "ink",
  },
];

const EASE = "transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";

export function Approach() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const element of stepRefs.current) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
      <div className="lg:sticky lg:top-32 lg:self-start">
        <div aria-hidden className="relative mx-auto aspect-[1/1.04] w-full max-w-[300px] lg:mx-0 lg:max-w-[440px]">
          <div className="absolute left-0 top-0 h-[43%] w-full rounded-[28px] border-2 border-dashed border-[#cfcbc3]" />
          <div className="absolute left-0 top-[49%] h-[47%] w-1/2 rounded-[28px] border-2 border-dashed border-[#cfcbc3]" />

          <div className={`absolute left-0 top-[49%] h-[47%] w-1/2 rounded-[28px] bg-pt-red ${EASE} ${active >= 0 ? "opacity-100" : "translate-y-8 opacity-0"}`} />
          <div className={`absolute left-0 top-0 h-[43%] w-1/2 rounded-l-[28px] bg-pt-yellow ${EASE} ${active >= 1 ? "opacity-100" : "-translate-x-8 opacity-0"}`} />
          <div className={`absolute right-0 top-0 h-[43%] w-1/2 rounded-r-[28px] bg-pt-blue ${EASE} ${active >= 2 ? "opacity-100" : "translate-x-8 opacity-0"}`} />
        </div>
        <div
          aria-hidden
          className={`mx-auto mt-6 flex h-14 w-full max-w-[300px] items-center justify-center rounded-[16px] bg-pt-ink text-[13px] font-semibold uppercase tracking-[0.08em] text-white lg:mx-0 lg:max-w-[440px] ${EASE} ${
            active >= 3 ? "opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <BuildConnectOperate />
        </div>
        <p className="mt-6 hidden text-[15px] font-medium text-pt-muted lg:block">
          Step {active + 1} of {STEPS.length}
        </p>
      </div>

      <ol className="space-y-4 lg:space-y-0">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            data-step={index}
            ref={(element) => {
              stepRefs.current[index] = element;
            }}
            className="border-t border-[#cfcbc3] py-8 lg:flex lg:min-h-[38vh] lg:flex-col lg:justify-center lg:py-10"
          >
            <span
              className={`inline-grid size-10 place-items-center rounded-[12px] text-[15px] font-bold transition-colors duration-200 ${
                active === index
                  ? `${TONE_BG[step.tone]} ${step.tone === "yellow" ? "text-pt-ink" : "text-white"}`
                  : "bg-white text-pt-ink ring-1 ring-pt-line"
              }`}
            >
              {index + 1}
            </span>
            <h3 className="mt-5 text-[26px] font-semibold leading-[32px] tracking-[-0.02em] lg:text-[32px] lg:leading-[38px]">{step.title}</h3>
            <p className="mt-3 max-w-[46ch] text-[17px] leading-[27px] text-pt-muted lg:text-[18px] lg:leading-[29px]">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
