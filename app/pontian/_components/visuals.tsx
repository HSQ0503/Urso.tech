import type { ReactNode } from "react";
import { Check } from "./brand";

function Window({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-[18px] bg-white text-pt-ink shadow-[0_1px_0_rgba(17,17,17,0.04),0_24px_48px_-24px_rgba(17,17,17,0.4)]">
      <div className="flex items-center justify-between border-b border-pt-line px-5 py-3.5 text-[13px]">
        <span className="font-semibold">{title}</span>
        <span className="font-medium text-pt-muted">{meta}</span>
      </div>
      {children}
    </div>
  );
}

const HOURS = ["8:00", "9:00", "10:00", "11:00", "12:00", "1:00"];
const HOUR_PX = 40;

type Block = { label: string; start: number; length: number; className: string };

const CREWS: { name: string; blocks: Block[] }[] = [
  {
    name: "Crew A",
    blocks: [
      { label: "House wash", start: 0, length: 2, className: "bg-pt-ink text-white" },
      { label: "Paver sealing", start: 3, length: 1.5, className: "bg-pt-paper ring-1 ring-inset ring-pt-line" },
    ],
  },
  {
    name: "Crew B",
    blocks: [
      { label: "Roof clean", start: 1, length: 2, className: "bg-[#e6f0ff] ring-1 ring-inset ring-[#b9d4ff]" },
      { label: "Driveway", start: 4, length: 1, className: "bg-pt-yellow" },
    ],
  },
];

export function DispatchBoard() {
  return (
    <div role="img" aria-label="A dispatch calendar with jobs assigned to two crews and two jobs waiting to be scheduled.">
      <Window title="Schedule" meta="Tue, Sep 29">
        <div className="grid grid-cols-[52px_1fr_1fr] gap-x-2 px-4 pt-3 text-[12px] sm:grid-cols-[60px_1fr_1fr] sm:gap-x-3 sm:px-5">
          <span />
          {CREWS.map((crew) => (
            <span key={crew.name} className="pb-2 font-semibold">
              {crew.name}
            </span>
          ))}
          <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
            {HOURS.map((hour, index) => (
              <span key={hour} className="absolute left-0 -translate-y-1/2 text-pt-muted" style={{ top: index * HOUR_PX + 8 }}>
                {hour}
              </span>
            ))}
          </div>
          {CREWS.map((crew) => (
            <div key={crew.name} className="relative border-l border-pt-line" style={{ height: HOURS.length * HOUR_PX }}>
              {HOURS.map((hour, index) => (
                <span key={hour} className="absolute inset-x-0 border-t border-dashed border-pt-line" style={{ top: index * HOUR_PX + 8 }} />
              ))}
              {crew.blocks.map((block) => (
                <span
                  key={block.label}
                  className={`absolute inset-x-1.5 rounded-[10px] px-2.5 py-2 text-[12px] font-semibold leading-4 ${block.className}`}
                  style={{ top: block.start * HOUR_PX + 10, height: block.length * HOUR_PX - 4 }}
                >
                  {block.label}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-pt-line px-5 py-3.5 text-[12px]">
          <span className="mr-1 font-semibold text-pt-muted">Unscheduled</span>
          {["Gutter clean", "Patio wash"].map((job) => (
            <span key={job} className="rounded-full border border-dashed border-[#bdb8ae] px-3 py-1 font-semibold">
              {job}
            </span>
          ))}
        </div>
      </Window>
    </div>
  );
}

const STORES = [
  { name: "Store 1", share: 92 },
  { name: "Store 2", share: 74 },
  { name: "Store 3", share: 81 },
  { name: "Store 4", share: 58 },
];

export function StoresView() {
  return (
    <div role="img" aria-label="An owner dashboard comparing sales across four stores, marked as matching the point of sale.">
      <Window title="All stores" meta="Last 30 days">
        <div className="px-5 pb-5 pt-4">
          <div className="flex gap-2 text-[12px] font-semibold">
            {["Sales", "Visits", "Return rate"].map((tab, index) => (
              <span key={tab} className={`rounded-full px-3 py-1 ${index === 0 ? "bg-pt-ink text-white" : "bg-pt-paper"}`}>
                {tab}
              </span>
            ))}
          </div>
          <ul className="mt-5 space-y-3.5">
            {STORES.map((store) => (
              <li key={store.name} className="grid grid-cols-[64px_1fr] items-center gap-3 text-[12px]">
                <span className="font-semibold">{store.name}</span>
                <span className="h-3.5 rounded-full bg-pt-paper">
                  <span className="block h-full rounded-full bg-pt-blue" style={{ width: `${store.share}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden className="mt-5 h-16 w-full">
            <path d="M0 52 C 40 48, 60 30, 100 34 S 160 50, 200 28 S 260 16, 300 12" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M0 52 C 40 48, 60 30, 100 34 S 160 50, 200 28 S 260 16, 300 12 V70 H0 Z" fill="#0173fd" opacity="0.1" />
          </svg>
          <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-[#e9f6ef] px-3 py-2 text-[12px] font-semibold text-[#0f5c3c]">
            <Check className="size-3.5" />
            Matches the point of sale to the penny
          </p>
        </div>
      </Window>
    </div>
  );
}

const OPTIONS = ["However,", "For example,", "Therefore,", "Similarly,"];

export function PracticeTest() {
  return (
    <div role="img" aria-label="A digital SAT practice question with four answer choices and one selected.">
      <Window title="Section 1, Module 2" meta="18:42 left">
        <div className="px-5 pb-5 pt-4 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="rounded-[8px] bg-pt-ink px-2.5 py-1 text-[12px] font-bold text-white">7</span>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-pt-muted">
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M4 14V2.5h8l-2 3 2 3H4" />
              </svg>
              Mark for review
            </span>
          </div>
          <p className="mt-4 font-medium leading-[21px]">Which choice completes the text with the most logical transition?</p>
          <ul className="mt-4 space-y-2">
            {OPTIONS.map((option, index) => {
              const selected = index === 2;
              return (
                <li
                  key={option}
                  className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${selected ? "border-2 border-pt-action bg-[#f0f6ff]" : "border-pt-line"}`}
                >
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${selected ? "bg-pt-action text-white" : "ring-1 ring-[#bdb8ae]"}`}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="font-medium">{option}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end gap-2 text-[12px] font-semibold">
            <span className="rounded-[10px] px-3 py-2 ring-1 ring-pt-line">Back</span>
            <span className="rounded-[10px] bg-pt-action px-3 py-2 text-white">Next</span>
          </div>
        </div>
      </Window>
    </div>
  );
}

export function BuildArt() {
  return (
    <div className="w-[168px] rounded-[16px] bg-white p-3.5 text-[11px] text-pt-ink shadow-[0_16px_32px_-16px_rgba(17,17,17,0.45)]">
      <div className="flex items-center justify-between font-semibold">
        <span>Today</span>
        <span className="text-pt-muted">3 jobs</span>
      </div>
      <ul className="mt-3 space-y-2">
        {["House wash", "Roof clean", "Driveway"].map((job, index) => (
          <li key={job} className="flex items-center gap-2 font-medium">
            <span className={`grid size-4 place-items-center rounded-[5px] ${index === 0 ? "bg-pt-ink text-white" : "ring-1 ring-[#cfcbc3]"}`}>
              {index === 0 && <Check className="size-3" />}
            </span>
            {job}
          </li>
        ))}
      </ul>
      <span className="mt-3 flex h-7 items-center justify-center rounded-[8px] bg-pt-action font-semibold text-white">Start job</span>
    </div>
  );
}

export function ConnectArt() {
  return (
    <div className="flex items-center gap-0">
      <ul className="space-y-2">
        {["POS", "Books", "Payroll"].map((source) => (
          <li key={source} className="rounded-[10px] bg-white px-3 py-1.5 text-[11px] font-semibold text-pt-ink shadow-[0_8px_16px_-10px_rgba(17,17,17,0.5)]">
            {source}
          </li>
        ))}
      </ul>
      <svg viewBox="0 0 40 96" aria-hidden className="h-24 w-10 text-pt-ink" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M0 16 C 20 16, 20 48, 40 48" />
        <path d="M0 48 H40" />
        <path d="M0 80 C 20 80, 20 48, 40 48" />
      </svg>
      <div className="w-[104px] rounded-[14px] bg-white p-3 shadow-[0_16px_32px_-16px_rgba(17,17,17,0.45)]">
        <p className="text-[11px] font-semibold text-pt-ink">All stores</p>
        <div className="mt-2 flex h-12 items-end gap-1">
          {[40, 64, 52, 88, 72].map((height, index) => (
            <span key={index} className={`flex-1 rounded-[3px] ${index === 3 ? "bg-pt-ink" : "bg-pt-blue"}`} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function OperateArt() {
  return (
    <div className="flex w-[196px] flex-col gap-2 text-[11px] text-pt-ink">
      {["Missed call, texted back", "Estimate 318 approved", "Weekly brief is ready"].map((message, index) => (
        <p
          key={message}
          className={`flex items-center gap-2 rounded-[12px] bg-white px-3 py-2 font-semibold shadow-[0_10px_20px_-12px_rgba(17,17,17,0.5)] ${index === 1 ? "ml-5" : ""}`}
        >
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-pt-ink text-white">
            <Check className="size-2.5" />
          </span>
          {message}
        </p>
      ))}
    </div>
  );
}
