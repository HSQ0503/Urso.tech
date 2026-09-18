"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { signRecurringPlan } from "@/app/CanesPressure/actions";

// The one interactive island on the public /r/[token] page: type-your-name
// e-signature, same inline pattern as the estimate approval panel. After a
// signature the whole thing collapses to a confirmation.
export function PublicPlanSign({ token, pricePerVisit, cadence, updatedAt }: { token: string; updatedAt: string; pricePerVisit: string; cadence: string }) {
  const [signature, setSignature] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await signRecurringPlan(token, signature.trim(), updatedAt);
      if (!result.ok) {
        setError(result.notice ?? "That didn't go through. Please try again.");
        return;
      }
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="cp-card">
        <div className="flex items-start gap-3 p-5">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[var(--cp-good)]" />
          <div>
            <p className="text-[16px] font-semibold">You&apos;re all set.</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
              Your {cadence.toLowerCase()} service agreement is signed. Canes will remind you before each scheduled visit.
              A copy of these terms stays at this link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-card">
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">Per visit</span>
          <span className="cp-display text-[22px] tabular-nums">{pricePerVisit}</span>
        </div>
        <div className="cp-divider space-y-2.5 pt-3">
          <div>
            <label className="cp-label" htmlFor="cp-plan-signature">
              Type your full name to sign
            </label>
            <input
              id="cp-plan-signature"
              className="cp-input"
              placeholder="Your full name"
              autoComplete="name"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
            <p className="mt-1.5 text-[12px] leading-snug text-[var(--cp-faint)]">
              Typing your name here counts as your signature agreeing to the terms above, including the cancellation fee.
            </p>
          </div>
          <button
            type="button"
            className="cp-btn cp-btn-primary cp-btn-block sm:min-h-9 sm:rounded-[5px] sm:text-[13px]"
            disabled={signature.trim().length < 2 || isPending}
            onClick={submit}
          >
            <Check size={16} strokeWidth={2} /> {isPending ? "Signing..." : "Sign agreement"}
          </button>
          {error && <p className="text-[12.5px] leading-snug text-[var(--cp-warn)]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
