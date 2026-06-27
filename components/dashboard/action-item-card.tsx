"use client";

// The "what to fix first" card — clickable (opens the full problem + proposed
// solution), shaded orange, with a "Have Urso fix this" CTA (the human team —
// distinct from urso.ai, the AI that generated the recommendation). Shared by the
// owner and manager Home; the CTA label is overridable via `cta`.

import { useState } from "react";
import { Micro, Tag } from "./ui";
import { Modal } from "./modal";
import { ActionPlanBody } from "./action-plan";
import { actionPlans } from "./data";
import { useT } from "@/components/dashboard/locale-provider";

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
  cta = "Have Urso fix this",
}: {
  eyebrow: string;
  title: string;
  detail: string;
  metric: string;
  pending?: boolean;
  planKey: string;
  cta?: string;
}) {
  const t = useT();
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
        className="dash-raise group relative flex cursor-pointer flex-col justify-center overflow-hidden rounded-3xl border border-[rgba(254,81,0,0.28)] p-6 transition-all duration-200 hover:-translate-y-px hover:border-[rgba(254,81,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50"
        style={{ background: "linear-gradient(158deg, rgba(254,81,0,0.12) 0%, rgba(254,81,0,0.035) 48%, rgba(254,81,0,0) 100%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(254,81,0,0.22), transparent 70%)" }} />
        <div aria-hidden className="dash-grain pointer-events-none absolute inset-0" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">{eyebrow}</Micro>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-orange/70">
            <Spark /> urso.ai
          </span>
        </div>

        <h2 className="relative mt-4 text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{title}</h2>
        <p className="relative mt-3 max-w-[640px] text-[13.5px] leading-[1.6] text-ink-dim">{detail}</p>

        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <Tag tone="orange">{metric}</Tag>
          {pending && <Tag tone="muted">{t("Pending data")}</Tag>}
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={MAILTO}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-[#070707] transition hover:bg-[#FF6A1F]"
          >
            {cta}
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer transition-colors group-hover:text-ink-dim">{t("See breakdown")} →</span>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={t("Proposed fix")}
        title={title}
        footer={
          <a href={MAILTO} className="flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-[#070707] transition hover:bg-[#FF6A1F]">
            {cta} →
          </a>
        }
      >
        <ActionPlanBody plan={plan} metric={metric} />
      </Modal>
    </>
  );
}
