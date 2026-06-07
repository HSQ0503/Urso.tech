"use client";

// The comprehensive breakdown shown inside an approval / overview modal:
// the problem, what Urso proposes, what the dashboard does, and what the owner
// does. Shared by the Home action item and the AI-actions approval workflow.

import type { ActionPlan } from "./data";

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer ${className}`}>{children}</div>;
}

function PlanList({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-white/[0.015] p-4">
      <SectionLabel>{title}</SectionLabel>
      <ol className="mt-3 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-[1.5] text-ink-dim">
            <span
              className={`grid size-[16px] shrink-0 place-items-center rounded-full font-mono text-[9px] ${accent ? "bg-orange-soft text-orange" : "border border-edge-strong text-ink-dimmer"}`}
            >
              {i + 1}
            </span>
            {it}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ActionPlanBody({ plan, metric }: { plan: ActionPlan; metric?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>The problem</SectionLabel>
          {metric && (
            <span className="rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-orange">
              {metric}
            </span>
          )}
        </div>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-dim">{plan.problem}</p>
      </div>

      <div className="rounded-xl border border-[rgba(254,81,0,0.3)] bg-orange-wash p-4">
        <SectionLabel className="!text-orange">What Urso proposes</SectionLabel>
        <div className="mt-2 text-[13.5px] font-medium text-ink">{plan.system}</div>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-dim">{plan.proposal}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlanList title="What the dashboard does" items={plan.how} accent />
        <PlanList title="What you do" items={plan.your} />
      </div>
    </div>
  );
}
