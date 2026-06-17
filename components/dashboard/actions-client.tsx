"use client";

// Interactive AI action center. The actions are loaded on the server
// (data.server) and passed in as the initial list; this component owns the
// approve / dismiss / filter / agent-toggle state.

import { useMemo, useState, useTransition } from "react";
import { ACTION_FLOW, actionStatusLabel, actionPlans, type ActionStatus, type AgentAction } from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag, Segmented } from "@/components/dashboard/ui";
import { Modal } from "@/components/dashboard/modal";
import { ActionPlanBody } from "@/components/dashboard/action-plan";
import { InfoTip } from "@/components/dashboard/info-tip";
import { approveAction, dismissAction } from "@/app/dashboard/actions/actions";

type ActionWithPlan = AgentAction & { planKey: string };

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

const stageHelp: Record<ActionStatus, string> = {
  suggested: "Found by AI — waiting for you",
  approved: "You approved — getting ready",
  running: "The agent is doing the work",
  completed: "Done, with a result",
};

const AGENTS = [
  { key: "Call capture", desc: "Texts back missed calls" },
  { key: "Reputation", desc: "Reviews, replies & fake flags" },
  { key: "Retention", desc: "Win-backs & rebooking" },
  { key: "Team", desc: "Coaching tasks" },
  { key: "Visibility", desc: "Listings & local search" },
];

const autonomyOptions: { value: "ask" | "auto"; label: string }[] = [
  { value: "ask", label: "Ask first" },
  { value: "auto", label: "Auto" },
];

const order: Record<ActionStatus, number> = { suggested: 0, running: 1, approved: 2, completed: 3 };

export function ActionsClient({ initialActions, showHeader = true }: { initialActions: ActionWithPlan[]; showHeader?: boolean }) {
  const [actions, setActions] = useState<ActionWithPlan[]>(initialActions);
  const [filter, setFilter] = useState<Filter>("all");
  const [agents, setAgents] = useState(() =>
    Object.fromEntries(AGENTS.map((a) => [a.key, { active: true, autonomy: "ask" as "ask" | "auto" }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sorted = useMemo(() => [...actions].sort((a, b) => order[a.status] - order[b.status]), [actions]);
  const list = filter === "all" ? sorted : sorted.filter((a) => a.status === filter);
  const count = (s: ActionStatus) => actions.filter((a) => a.status === s).length;

  const approve = (id: string) => {
    setError(null);
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: "approved" } : a)));
    startTransition(async () => {
      const res = await approveAction(id);
      if (!res.ok) {
        setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: "suggested" } : a)));
        setError(res.error);
      }
    });
  };
  const dismiss = (id: string) => {
    setError(null);
    const removed = actions.find((a) => a.id === id);
    setActions((prev) => prev.filter((a) => a.id !== id));
    startTransition(async () => {
      const res = await dismissAction(id);
      if (!res.ok && removed) {
        setActions((prev) => (prev.some((a) => a.id === id) ? prev : [...prev, removed]));
        setError(res.error);
      }
    });
  };

  return (
    <div className="animate-stage-in space-y-8">
      {showHeader && (
        <PageHeader
          eyebrow="AI action center"
          title="The dashboard does the work"
          sub="Each agent turns a finding into a concrete action and carries it from approval through to a result. Nothing runs without your approval — the dashboard recommends, you decide."
        />
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(226,75,74,0.4)] bg-[rgba(226,75,74,0.08)] px-4 py-3 text-[13px] text-ink">
          Couldn’t save that change — {error}. Please try again.
        </div>
      )}

      {/* Status filter */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {filters.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                active ? "border-edge-strong bg-raise-strong text-ink" : "border-edge text-ink-dim hover:text-ink"
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
          list.map((a) => <ActionCard key={a.id} action={a} onApprove={() => approve(a.id)} onDismiss={() => dismiss(a.id)} />)
        )}
      </div>

      {/* Pipeline summary */}
      <section>
        <div className="mb-3 flex items-center gap-1.5">
          <Micro>Pipeline · most urgent first</Micro>
          <InfoTip text="Every action moves left to right: the AI suggests it, you approve, the agent runs it, then it completes with a result. The list above is ordered by what needs you most." />
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-4">
          {ACTION_FLOW.map((s, i) => (
            <div key={s} className="relative bg-cell p-4">
              <div className="flex items-center justify-between">
                <Micro>{actionStatusLabel[s]}</Micro>
                <span className="font-mono text-[10px] text-ink-dimmer">{i + 1}/4</span>
              </div>
              <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]" style={{ color: s === "suggested" && count(s) > 0 ? "#fe5100" : undefined }}>
                {count(s)}
              </div>
              <p className="mt-2 text-[11px] leading-[1.4] text-ink-dimmer">{stageHelp[s]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent management */}
      <section>
        <div className="mb-3 flex items-center gap-1.5">
          <Micro>Your agents</Micro>
          <InfoTip text="Turn each agent on or off, and choose whether it asks before acting or runs automatically. Paused agents stop suggesting new actions." />
        </div>
        <Card pad={false}>
          {AGENTS.map((a, i) => {
            const st = agents[a.key];
            return (
              <div key={a.key} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-edge" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${st.active ? "bg-[var(--color-good)]" : "bg-ink-dimmer"}`} />
                    <span className="text-[14px] text-ink">{a.key} agent</span>
                  </div>
                  <Micro className="mt-0.5 !normal-case !tracking-normal">{a.desc}</Micro>
                </div>
                <div className="flex items-center gap-2.5">
                  <Segmented
                    options={autonomyOptions}
                    value={st.autonomy}
                    onChange={(v) => setAgents((p) => ({ ...p, [a.key]: { ...p[a.key], autonomy: v } }))}
                  />
                  <button
                    onClick={() => setAgents((p) => ({ ...p, [a.key]: { ...p[a.key], active: !p[a.key].active } }))}
                    className={`w-[78px] cursor-pointer rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                      st.active ? "border-[rgba(70,209,138,0.3)] text-[var(--color-good)]" : "border-edge text-ink-dim hover:text-ink"
                    }`}
                  >
                    {st.active ? "Active" : "Paused"}
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}

function ActionCard({ action: a, onApprove, onDismiss }: { action: ActionWithPlan; onApprove: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const idx = ACTION_FLOW.indexOf(a.status);
  const next = a.status !== "completed" ? actionStatusLabel[ACTION_FLOW[idx + 1]] : null;
  const plan = actionPlans[a.planKey] ?? actionPlans["call-capture"];
  const isSuggested = a.status === "suggested";

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
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-orange" : "bg-raise-strong"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          {actionStatusLabel[a.status]}
          {next ? ` → ${next}` : ""}
        </span>
        <Tag tone="orange">{a.metric}</Tag>
      </div>

      {a.result && (
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(70,209,138,0.3)] bg-raise px-3.5 py-2.5">
          <span className="size-1.5 rounded-full bg-[var(--color-good)]" />
          <span className="text-[12.5px] text-ink">{a.result}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isSuggested ? (
          <>
            <button onClick={() => setOpen(true)} className="cursor-pointer rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110">
              Review &amp; approve
            </button>
            <button onClick={onDismiss} className="cursor-pointer rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-raise">
              Dismiss
            </button>
          </>
        ) : (
          <button onClick={() => setOpen(true)} className="cursor-pointer rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-raise">
            View plan
          </button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={`${a.agent} agent · ${a.store}`}
        title={a.title}
        footer={
          isSuggested ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onApprove();
                  setOpen(false);
                }}
                className="flex-1 cursor-pointer rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110"
              >
                Approve &amp; start
              </button>
              <button
                onClick={() => {
                  onDismiss();
                  setOpen(false);
                }}
                className="cursor-pointer rounded-lg border border-edge-strong px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-raise"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <a href="mailto:han@urso.tech?subject=Urso%20%E2%80%94%20action" className="flex w-full items-center justify-center rounded-lg border border-edge-strong px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-raise">
              Have Urso fix this →
            </a>
          )
        }
      >
        <ActionPlanBody plan={plan} metric={a.metric} />
      </Modal>
    </Card>
  );
}
