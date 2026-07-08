"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CheckCircle2, CreditCard, ThumbsDown } from "lucide-react";
import { approveEstimate, declineEstimate } from "@/app/CanesPressure/actions";
import { fmtMoney, type EstimateItem } from "@/lib/canes/types";

// The one interactive island on the public /e/[token] page. Everything else on
// that page is server-rendered. Three things live here: the option toggles
// (only shown for an options estimate), the Approve panel (type-your-name
// e-signature) and the Decline panel (reason). Both use the inline-expansion
// pattern from disposition.tsx — no modal. After approval the whole thing
// collapses to a confirmation + deposit stub.

type Totals = {
  subtotal: number;
  tax: number;
  total: number;
  deposit: number;
};

// Mirror the server's line-total math for a live preview as options toggle.
// The server recomputes authoritatively on approve; this is display-only.
function computeTotals(
  items: EstimateItem[],
  selected: Set<string>,
  adjustmentCents: number,
  taxRateBps: number,
  depositPercent: number,
): Totals {
  let subtotal = 0;
  let taxableBase = 0;
  for (const item of items) {
    const counts = item.is_mandatory || !item.is_option || selected.has(item.id);
    if (!counts) continue;
    subtotal += item.line_total_cents;
    if (item.taxable) taxableBase += item.line_total_cents;
  }
  const tax = Math.round((taxableBase * taxRateBps) / 10000);
  const total = subtotal + adjustmentCents + tax;
  const deposit = Math.round((total * depositPercent) / 100);
  return { subtotal, tax, total, deposit };
}

export function PublicApproval({
  token,
  estimateType,
  items,
  adjustmentCents,
  taxRateBps,
  depositPercent,
}: {
  token: string;
  estimateType: "standard" | "options" | "packages";
  items: EstimateItem[];
  adjustmentCents: number;
  taxRateBps: number;
  depositPercent: number;
}) {
  const isOptions = estimateType === "options";

  // Optional lines the customer can toggle; mandatory options stay locked on.
  const optionalIds = useMemo(
    () => items.filter((i) => i.is_option && !i.is_mandatory).map((i) => i.id),
    [items],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.is_selected).map((i) => i.id)),
  );

  const [panel, setPanel] = useState<"approve" | "decline" | null>(null);
  const [signature, setSignature] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "declined" | null>(null);
  const [depositUrl, setDepositUrl] = useState<string | null>(null);

  const totals = useMemo(
    () => computeTotals(items, selected, adjustmentCents, taxRateBps, depositPercent),
    [items, selected, adjustmentCents, taxRateBps, depositPercent],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitApprove() {
    const name = signature.trim();
    if (!name) return;
    setError(null);
    // Only optional selections matter to the server; mandatory lines are forced.
    const chosen = isOptions
      ? [...selected].filter((id) => optionalIds.includes(id))
      : undefined;
    startTransition(async () => {
      const res = await approveEstimate(token, name, chosen);
      if (res.ok) {
        setDone("approved");
        setDepositUrl(res.depositUrl ?? null);
      } else {
        setError(res.notice ?? "Something went wrong. Please try again.");
      }
    });
  }

  function submitDecline() {
    setError(null);
    startTransition(async () => {
      const res = await declineEstimate(token, reason.trim());
      if (res.ok) setDone("declined");
      else setError(res.notice ?? "Something went wrong. Please try again.");
    });
  }

  if (done === "approved") {
    return (
      <div className="cp-card">
        <div className="space-y-3 p-5">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-good)]" />
            <div>
              <p className="text-[15px] font-semibold">Approved. Thank you!</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
                We got your approval and we&rsquo;ll be in touch to get you on the schedule.
              </p>
            </div>
          </div>
          {depositPercent > 0 && (
            <div className="cp-divider pt-3">
              <p className="text-[13px] text-[var(--cp-muted)]">
                A deposit of{" "}
                <span className="font-semibold tabular-nums text-[var(--cp-ink)]">
                  {fmtMoney(totals.deposit)}
                </span>{" "}
                holds your spot.
              </p>
              {depositUrl ? (
                <a href={depositUrl} className="cp-btn cp-btn-primary mt-2.5 w-full">
                  <CreditCard size={16} strokeWidth={2} /> Pay deposit
                </a>
              ) : (
                <p className="mt-2 text-[13px] text-[var(--cp-faint)]">
                  Sebastian will send your deposit link shortly.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div className="cp-card">
        <div className="flex items-start gap-2.5 p-5">
          <ThumbsDown size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-muted)]" />
          <div>
            <p className="text-[15px] font-semibold">Thanks for letting us know.</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
              We&rsquo;ve recorded your response. If anything changes, just reply to our text.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOptions && optionalIds.length > 0 && (
        <div className="cp-card">
          <div className="space-y-2.5 p-4">
            <p className="cp-label">Choose your options</p>
            {items
              .filter((i) => i.is_option)
              .map((item) => {
                const locked = item.is_mandatory;
                const on = locked || selected.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={locked}
                    onClick={() => toggle(item.id)}
                    className="cp-slot w-full flex-row justify-between !items-center gap-3 text-left disabled:opacity-100"
                    data-selected={on}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border ${
                          on
                            ? "border-transparent bg-[var(--cp-brand-fill)] text-white"
                            : "border-[var(--cp-line-strong)]"
                        }`}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      {item.name}
                      {locked && <span className="cp-slot-sub">Included</span>}
                    </span>
                    <span className="tabular-nums font-semibold">{fmtMoney(item.line_total_cents)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      <div className="cp-card">
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Total</span>
            <span className="cp-display text-[22px] tabular-nums">{fmtMoney(totals.total)}</span>
          </div>
          {depositPercent > 0 && (
            <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
              <span>Deposit to book ({depositPercent}%)</span>
              <span className="tabular-nums font-semibold text-[var(--cp-ink)]">
                {fmtMoney(totals.deposit)}
              </span>
            </div>
          )}

          <div className="cp-divider grid grid-cols-2 gap-2 pt-3">
            <button
              type="button"
              className="cp-btn cp-btn-primary"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setPanel(panel === "approve" ? null : "approve");
              }}
            >
              <Check size={16} strokeWidth={2} /> Approve
            </button>
            <button
              type="button"
              className="cp-btn"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setPanel(panel === "decline" ? null : "decline");
              }}
            >
              Decline
            </button>
          </div>

          {panel === "approve" && (
            <div className="cp-divider space-y-2.5 pt-3">
              <div>
                <label className="cp-label" htmlFor="cp-signature">
                  Type your full name to approve
                </label>
                <input
                  id="cp-signature"
                  className="cp-input"
                  placeholder="Your full name"
                  autoComplete="name"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] leading-snug text-[var(--cp-faint)]">
                  Typing your name here counts as your signature approving this estimate.
                </p>
              </div>
              <button
                type="button"
                className="cp-btn cp-btn-primary w-full"
                disabled={!signature.trim() || isPending}
                onClick={submitApprove}
              >
                {isPending ? "Approving..." : `Approve ${fmtMoney(totals.total)}`}
              </button>
            </div>
          )}

          {panel === "decline" && (
            <div className="cp-divider space-y-2.5 pt-3">
              <div>
                <label className="cp-label" htmlFor="cp-reason">
                  Anything we could do differently? (optional)
                </label>
                <textarea
                  id="cp-reason"
                  className="cp-textarea"
                  rows={3}
                  placeholder="Let us know why, or leave blank"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="cp-btn cp-btn-danger w-full"
                disabled={isPending}
                onClick={submitDecline}
              >
                {isPending ? "Sending..." : "Decline this estimate"}
              </button>
            </div>
          )}

          {error && (
            <p className="text-[12.5px] leading-snug text-[var(--cp-warn)]">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
