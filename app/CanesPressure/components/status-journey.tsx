import { Check, X } from "lucide-react";
import { fmtEt } from "@/lib/canes/types";

// Horizontal client-journey strip: "Sent ✓ Jul 20 → Viewed ✓ Jul 21 → Approved".
// Server-safe and purely presentational — pages compose the steps from a
// document's timestamps. Reached steps read as chips (good, or warn for a
// "bad" outcome like Declined/Voided); unreached steps render dimmed so the
// milestone the client hasn't hit yet is obvious at a glance.

export type JourneyStep = { label: string; at: string | null; tone?: "ok" | "bad" };

export function StatusJourney({ steps }: { steps: JourneyStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-y-1.5">
      {steps.map((step, i) => {
        const reached = Boolean(step.at);
        const bad = step.tone === "bad";
        return (
          <span key={step.label} className="flex items-center">
            {i > 0 && (
              <span aria-hidden className="mx-1.5 text-[11px] text-[var(--cp-faint)]">
                →
              </span>
            )}
            <span
              className={`cp-chip ${
                reached
                  ? bad
                    ? "bg-[var(--cp-danger-bg)] text-[var(--cp-danger)]"
                    : "bg-[var(--cp-good-bg)] text-[var(--cp-good)]"
                  : "border border-dashed border-[var(--cp-line)] text-[var(--cp-faint)]"
              }`}
            >
              {reached &&
                (bad ? <X size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={2.5} />)}
              {step.label}
              {reached && (
                <span className="tabular-nums opacity-80">
                  {fmtEt(step.at, { month: "short", day: "numeric" })}
                </span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
