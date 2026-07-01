"use client";

// The "what to fix first" card — clickable (opens the full problem + proposed
// solution), marked by the orange left rail, with a "Have Urso fix this" CTA (the human team —
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
        className="dash-raise group relative flex cursor-pointer flex-col justify-center rounded-xl border border-edge border-l-2 border-l-orange bg-panel p-5 transition-colors duration-150 hover:border-edge-strong hover:border-l-orange"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">{eyebrow}</Micro>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-[0.12em] text-orange/70">
            <Spark /> urso.ai
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h2>
        <p className="mt-3 max-w-[640px] text-sm leading-relaxed text-ink-dim">{detail}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Tag tone="orange">{metric}</Tag>
          {pending && <Tag tone="muted">{t("Pending data")}</Tag>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={MAILTO}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange/90"
          >
            {cta}
          </a>
          <span className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer transition-colors group-hover:text-ink-dim">{t("See breakdown")} →</span>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={t("Proposed fix")}
        title={title}
        footer={
          <a href={MAILTO} className="flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange/90">
            {cta} →
          </a>
        }
      >
        <ActionPlanBody plan={plan} metric={metric} />
      </Modal>
    </>
  );
}
