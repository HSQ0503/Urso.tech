"use client";

import { useState } from "react";
import {
  agentActions,
  ACTION_FLOW,
  actionStatusLabel,
  type ActionStatus,
  type AgentAction,
} from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag } from "@/components/dashboard/ui";

type Filter = "all" | ActionStatus;
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "suggested", label: "Suggested" },
  { value: "approved", label: "Approved" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
];

const statusTone: Record<ActionStatus, "muted" | "orange" | "good" | "warn"> = {
  suggested: "orange",
  approved: "muted",
  running: "warn",
  completed: "good",
};

export default function ActionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const list = filter === "all" ? agentActions : agentActions.filter((a) => a.status === filter);
  const count = (s: ActionStatus) => agentActions.filter((a) => a.status === s).length;

  return (
    <div className="animate-stage-in space-y-8">
      <PageHeader
        eyebrow="AI action center"
        title="The dashboard does the work"
        sub="Each agent turns a finding into a concrete action and carries it from approval through to a result. Nothing runs without your approval — the dashboard recommends, you decide."
      />

      {/* Pipeline summary */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-4">
        {ACTION_FLOW.map((s) => (
          <div key={s} className="bg-bg p-4">
            <Micro>{actionStatusLabel[s]}</Micro>
            <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]">{count(s)}</div>
          </div>
        ))}
      </section>

      {/* Status filter */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {filters.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                active ? "border-edge-strong bg-white/[0.06] text-ink" : "border-edge text-ink-dim hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Action list */}
      <div className="space-y-4">
        {list.length === 0 ? (
          <Card>
            <p className="text-center text-[13px] text-ink-dim">No actions in this stage.</p>
          </Card>
        ) : (
          list.map((a) => <ActionCard key={a.id} action={a} />)
        )}
      </div>
    </div>
  );
}

function ActionCard({ action: a }: { action: AgentAction }) {
  const idx = ACTION_FLOW.indexOf(a.status);
  const next = a.status !== "completed" ? actionStatusLabel[ACTION_FLOW[idx + 1]] : null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{a.agent} agent</span>
            <span className="text-edge-strong">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{a.store}</span>
            {a.pending && <Tag tone="muted">Pending data</Tag>}
          </div>
          <h2 className="mt-2 text-[16px] font-medium tracking-[-0.01em] text-ink">{a.title}</h2>
        </div>
        <Tag tone={statusTone[a.status]}>{actionStatusLabel[a.status]}</Tag>
      </div>

      <p className="text-[13.5px] leading-[1.55] text-ink-dim">{a.detail}</p>

      {/* Lifecycle progress */}
      <div className="flex items-center gap-1.5">
        {ACTION_FLOW.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-orange" : "bg-white/[0.08]"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          {actionStatusLabel[a.status]}
          {next ? ` → ${next}` : ""}
        </span>
        <Tag tone="orange">{a.metric}</Tag>
      </div>

      {/* Result or approval CTA */}
      {a.result ? (
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(70,209,138,0.3)] bg-white/[0.02] px-3.5 py-2.5">
          <span className="size-1.5 rounded-full bg-[#46d18a]" />
          <span className="text-[12.5px] text-ink">{a.result}</span>
        </div>
      ) : a.status === "suggested" ? (
        <div className="flex items-center gap-2">
          <button className="rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110">Approve</button>
          <button className="rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.05]">Dismiss</button>
        </div>
      ) : null}
    </Card>
  );
}
