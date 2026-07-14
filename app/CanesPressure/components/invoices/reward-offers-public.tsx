"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Clock3, ExternalLink, Star } from "lucide-react";
import { claimInvoiceReward, type ActionResult } from "@/app/CanesPressure/actions";
import { fmtMoney, type InvoiceRewardKind, type InvoiceRewardStatus } from "@/lib/canes/types";

// The review-rewards island on the PUBLIC /i/[token] invoice page (0012) —
// the customer's side of Sebastian's review engine. Server-rendered page,
// one island, same shape as the estimate page's PublicApproval. A claim is
// token-scoped and idempotent; nothing changes the bill until the owner
// verifies and approves, so the copy promises verification, not money.

export type PublicRewardOffer = {
  id: string;
  kind: InvoiceRewardKind;
  label: string;
  amount_cents: number;
  status: InvoiceRewardStatus; // offered | claimed | approved (declined never renders)
};

type Feedback = { ok: boolean; text: string } | null;

export function RewardOffers({
  token,
  offers,
  links,
}: {
  token: string;
  offers: PublicRewardOffer[];
  links: Record<InvoiceRewardKind, { label: string; url: string }[]>;
}) {
  // Local status overlay so a claim reflects instantly without a reload.
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Which offer is in flight — only ITS button reads "Sending..." (the others
  // just disable while the transition runs).
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (offers.length === 0) return null;

  function claim(offer: PublicRewardOffer) {
    setFeedback(null);
    setPendingId(offer.id);
    startTransition(async () => {
      const res: ActionResult = await claimInvoiceReward(token, offer.kind);
      if (res.ok) setClaimed((c) => ({ ...c, [offer.id]: true }));
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      setPendingId(null);
    });
  }

  return (
    <div className="cp-card mt-4">
      <div className="p-4">
        <p className="cp-label flex items-center gap-1.5">
          <Star size={13} strokeWidth={2} /> Get money off this invoice
        </p>
        <ul className="mt-2">
          {offers.map((offer, i) => {
            const status: InvoiceRewardStatus =
              claimed[offer.id] && offer.status === "offered" ? "claimed" : offer.status;
            const offerLinks = links[offer.kind] ?? [];
            return (
              <li key={offer.id} className={`py-3 ${i > 0 ? "cp-divider" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] font-medium">{offer.label}</p>
                  <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--cp-brand-deep)]">
                    −{fmtMoney(offer.amount_cents)}
                  </p>
                </div>

                {status === "offered" && (
                  <>
                    {offerLinks.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {offerLinks.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                          >
                            <ExternalLink size={13} strokeWidth={2} /> {l.label}
                          </a>
                        ))}
                      </p>
                    )}
                    <button
                      type="button"
                      className="cp-btn cp-btn-sm mt-2"
                      disabled={isPending}
                      onClick={() => claim(offer)}
                    >
                      {pendingId === offer.id ? "Sending..." : "I did it — claim my discount"}
                    </button>
                  </>
                )}

                {status === "claimed" && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[var(--cp-muted)]">
                    <Clock3 size={14} strokeWidth={2} className="shrink-0" />
                    Claim received — we&rsquo;ll verify and take {fmtMoney(offer.amount_cents)} off
                    your balance.
                  </p>
                )}

                {status === "approved" && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--cp-good)]">
                    <BadgeCheck size={14} strokeWidth={2} className="shrink-0" />
                    Verified — {fmtMoney(offer.amount_cents)} off applied to your total. Thank you!
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {feedback && (
          <p
            className={`mt-1 text-[12.5px] leading-snug ${feedback.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}
          >
            {feedback.text}
          </p>
        )}
        <p className="mt-2 text-[11.5px] leading-snug text-[var(--cp-faint)]">
          Discounts are applied after a quick verification by our team — claim before you pay
          so your balance reflects them.
        </p>
      </div>
    </div>
  );
}
