"use client";

// The "what to fix first" card — clickable (opens the full problem + proposed
// solution), shaded orange, with a "Talk to Urso" CTA. Shared by the owner Home
// and the manager Home so both behave the same.

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
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[rgba(254,81,0,0.28)] p-5 transition-colors hover:border-[rgba(254,81,0,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
        style={{ background: "linear-gradient(155deg, rgba(254,81,0,0.13), rgba(254,81,0,0.035) 55%, rgba(255,255,255,0.02))" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(circle, rgba(254,81,0,0.3), transparent 70%)" }} />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">{eyebrow}</Micro>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-orange/80">
            <Spark /> Urso AI
          </span>
        </div>
        <h2 className="relative mt-3 text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">{title}</h2>
        <p className="relative mt-2.5 max-w-[680px] text-[13.5px] leading-[1.6] text-ink-dim">{detail}</p>
        <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Tag tone="orange">{metric}</Tag>
            {pending && <Tag tone="muted">Pending data</Tag>}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer transition-colors group-hover:text-ink-dim">See breakdown →</span>
            <a
              href={MAILTO}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110"
            >
              Talk to Urso
            </a>
          </div>
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
