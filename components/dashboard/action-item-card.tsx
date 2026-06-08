"use client";

// The "what to fix first" card — clickable (opens the full problem + proposed
// solution), shaded orange, with a "Talk to Urso" CTA (the human team — distinct
// from urso.ai, the AI that generated the recommendation). Shared by the owner
// Home and the manager Home so both behave the same.

import { useState } from "react";
import { Micro, Tag } from "./ui";
import { Modal } from "./modal";
import { ActionPlanBody } from "./action-plan";
import { actionPlans } from "./data";

const MAILTO = "mailto:han@urso.tech?subject=Urso%20%E2%80%94%20Woof%20Gang%20action%20item";

function Spark() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.7 4.8L18 9.5l-4.3 1.7L12 16l-1.7-4.8L6 9.5l4.3-1.7L12 3Z" />
    </svg>
  );
}

export function ActionItemCard({
  eyebrow,
  title,
  detail,
  metric,
  pending,
  planKey,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  metric: string;
  pending?: boolean;
  planKey: string;
}) {
  const [open, setOpen] = useState(false);
  const plan = actionPlans[planKey] ?? actionPlans["call-capture"];

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="group relative flex cursor-pointer flex-col justify-center overflow-hidden rounded-2xl border border-[rgba(254,81,0,0.28)] p-6 transition-colors hover:border-[rgba(254,81,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50"
        style={{ background: "linear-gradient(158deg, rgba(254,81,0,0.12) 0%, rgba(254,81,0,0.035) 48%, rgba(254,81,0,0) 100%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(254,81,0,0.22), transparent 70%)" }} />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">{eyebrow}</Micro>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-orange/70">
            <Spark /> urso.ai
          </span>
        </div>

        <h2 className="relative mt-4 text-[20px] font-medium leading-[1.2] tracking-[-0.015em]">{title}</h2>
        <p className="relative mt-3 max-w-[640px] text-[13.5px] leading-[1.6] text-ink-dim">{detail}</p>

        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <Tag tone="orange">{metric}</Tag>
          {pending && <Tag tone="muted">Pending data</Tag>}
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={MAILTO}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110"
          >
            Talk to Urso
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer transition-colors group-hover:text-ink-dim">See breakdown →</span>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Proposed fix"
        title={title}
        footer={
          <a href={MAILTO} className="flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110">
            Talk to Urso about this →
          </a>
        }
      >
        <ActionPlanBody plan={plan} metric={metric} />
      </Modal>
    </>
  );
}
