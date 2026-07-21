import { notFound } from "next/navigation";
import { CheckCircle2, ChevronDown, CreditCard } from "lucide-react";
import { getEstimateByToken, getEstimateItems, getJobByEstimateId } from "@/lib/canes/estimates";
import { markViewed } from "@/app/CanesPressure/actions";
import { ESTIMATE_TYPE_LABEL, fmtMoney, type EstimateItem } from "@/lib/canes/types";
import { PublicApproval } from "@/app/CanesPressure/components/estimates/public-approval";

// PUBLIC hosted estimate page. It sits directly under /CanesPressure (a sibling
// of login/ and text-us/), OUTSIDE the (app) gate, so hasAccess() never runs
// and a customer with just the token link can review + approve. The root
// layout supplies the .canes scope, the fonts, and the noindex robots tag.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your estimate", robots: { index: false, follow: false } };

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] px-5 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <header className="mb-6">
        <p className="cp-display text-[26px] leading-none sm:text-[19px]">
          Canes<span className="text-[var(--cp-brand)]">.</span>
        </p>
        <p className="cp-mono mt-1.5">Pressure washing</p>
      </header>
      {children}
      <p className="mt-8 text-center text-[11.5px] text-[var(--cp-faint)]">
        Powered by Urso · urso.ws
      </p>
    </div>
  );
}

// A line contributes to what the customer sees as the running estimate: every
// non-option line, plus options that are currently selected or mandatory.
function lineShows(item: EstimateItem): boolean {
  return item.is_mandatory || !item.is_option || item.is_selected;
}

export default async function PublicEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ deposit?: string }>;
}) {
  const { token } = await params;
  const estimate = await getEstimateByToken(token);
  // Unknown token, or a draft that was never sent, is a 404 — draft estimates
  // are not public (plan §11.7).
  if (!estimate || estimate.status === "draft") notFound();

  const items = await getEstimateItems(estimate.id);

  // Deposit state for an approved estimate (0013): the job row carries the
  // Payment Link + paid flag. `?deposit=paid` is Square's post-payment redirect
  // — trust it optimistically for the thank-you (the webhook stamp lands
  // seconds later); the ledger stays the record.
  const { deposit: depositParam } = await searchParams;
  const job = estimate.status === "approved" ? await getJobByEstimateId(estimate.id) : null;
  const depositPaid = Boolean(job?.deposit_paid_at) || depositParam === "paid";
  const depositUrl =
    !depositPaid && (job?.deposit_cents ?? 0) > 0 ? (job?.deposit_link_url ?? null) : null;

  // First open of a sent estimate flips it to viewed. Fire-and-forget so the
  // page never waits on the write, and swallow errors — a failed view-mark
  // must not break the customer's page.
  if (estimate.status === "sent") {
    void markViewed(token).catch(() => {});
  }

  const expired = isExpired(estimate.expires_at) && !["approved", "declined"].includes(estimate.status);
  const terminal = estimate.status === "approved" || estimate.status === "declined";

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="cp-display text-[24px] leading-tight">Your estimate</h1>
        <span className="cp-mono tabular-nums">{estimate.number}</span>
      </div>
      {(estimate.job_name || estimate.job_address) && (
        <div className="mt-1.5 space-y-0.5">
          {estimate.job_name && <p className="text-[15px] font-semibold">{estimate.job_name}</p>}
          {estimate.job_address && (
            <p className="text-[13.5px] text-[var(--cp-muted)]">{estimate.job_address}</p>
          )}
        </div>
      )}
      {estimate.estimate_type !== "standard" && (
        <span className="cp-chip cp-status-estimated mt-2 inline-flex">
          {ESTIMATE_TYPE_LABEL[estimate.estimate_type]}
        </span>
      )}

      {estimate.message_to_customer && (
        <div className="cp-card mt-5 p-4">
          <p className="text-[14px] leading-relaxed">{estimate.message_to_customer}</p>
        </div>
      )}

      {/* Line items */}
      <div className="cp-card mt-4">
        <div className="p-4">
          <p className="cp-label">Details</p>
          <ul className="mt-2">
            {items.filter(lineShows).map((item, i) => (
              <li
                key={item.id}
                className={`flex items-start justify-between gap-3 py-2.5 ${i > 0 ? "cp-divider" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">
                    {item.name}
                    {item.quantity !== 1 && (
                      <span className="ml-1.5 text-[13px] tabular-nums text-[var(--cp-muted)]">
                        × {item.quantity}
                      </span>
                    )}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--cp-muted)]">
                      {item.description}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-[14px] tabular-nums font-semibold">
                  {fmtMoney(item.line_total_cents)}
                </p>
              </li>
            ))}
            {items.filter(lineShows).length === 0 && (
              <li className="py-2.5 text-[13.5px] text-[var(--cp-muted)]">
                No line items on this estimate.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Total / deposit block — shown ONLY when the interactive approval island is
          not rendered (approved / declined / expired). While the estimate is live,
          PublicApproval owns the total so an Options estimate can never display two
          diverging figures as the customer toggles add-ons. */}
      {(terminal || expired) && (
        <div className="cp-card mt-4">
          <div className="space-y-2 p-5">
            {estimate.adjustment_cents !== 0 && (
              <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
                <span>{estimate.adjustment_cents < 0 ? "Discount" : "Adjustment"}</span>
                <span className="tabular-nums">{fmtMoney(estimate.adjustment_cents)}</span>
              </div>
            )}
            {estimate.tax_cents > 0 && (
              <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
                <span>Tax</span>
                <span className="tabular-nums">{fmtMoney(estimate.tax_cents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">Total</span>
              <span className="cp-display text-[22px] tabular-nums">{fmtMoney(estimate.total_cents)}</span>
            </div>
            {estimate.deposit_percent > 0 && (
              <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
                <span>Deposit to book ({estimate.deposit_percent}%)</span>
                <span className="tabular-nums font-semibold text-[var(--cp-ink)]">
                  {fmtMoney(estimate.deposit_cents)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action state: live approve/decline, or a terminal / expired notice */}
      <div className="mt-4">
        {terminal ? (
          <div className="cp-card">
            <div className="p-5">
              {estimate.status === "approved" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-good)]" />
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--cp-good)]">
                        Approved{estimate.signature_name ? ` by ${estimate.signature_name}` : ""}.
                      </p>
                      <p className="mt-0.5 text-[13.5px] text-[var(--cp-muted)]">
                        Thanks! We&rsquo;ll be in touch to get you on the schedule.
                      </p>
                    </div>
                  </div>
                  {depositPaid ? (
                    <div className="cp-divider pt-3">
                      <p className="text-[13px] text-[var(--cp-muted)]">
                        <span className="font-semibold text-[var(--cp-good)]">Deposit received</span> —
                        your spot is booked.
                      </p>
                    </div>
                  ) : depositUrl ? (
                    <div className="cp-divider pt-3">
                      <p className="text-[13px] text-[var(--cp-muted)]">
                        A deposit of{" "}
                        <span className="font-semibold tabular-nums text-[var(--cp-ink)]">
                          {fmtMoney(job?.deposit_cents)}
                        </span>{" "}
                        holds your spot.
                      </p>
                      <a
                        href={depositUrl}
                        className="cp-btn cp-btn-primary cp-btn-block mt-2.5 sm:min-h-9 sm:rounded-[5px] sm:text-[13px]"
                      >
                        <CreditCard size={16} strokeWidth={2} /> Pay deposit
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-[15px] font-semibold">This estimate was declined.</p>
                  <p className="mt-0.5 text-[13.5px] text-[var(--cp-muted)]">
                    If anything changes, just reply to our text and we&rsquo;ll take another look.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : expired ? (
          <div className="cp-card">
            <div className="p-5">
              <p className="text-[15px] font-semibold">This estimate has expired.</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
                Reply to our text or give us a call and we&rsquo;ll send you an updated one.
              </p>
            </div>
          </div>
        ) : (
          <PublicApproval
            token={token}
            estimateType={estimate.estimate_type}
            items={items}
            adjustmentCents={estimate.adjustment_cents}
            taxRateBps={estimate.tax_rate_bps}
            depositPercent={estimate.deposit_percent}
          />
        )}
      </div>

      {/* Terms — collapsed by default so the estimate reads clean */}
      {estimate.terms && (
        <details className="cp-card group mt-4">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
            Terms &amp; conditions
            <ChevronDown
              size={16}
              strokeWidth={2}
              className="text-[var(--cp-muted)] transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="cp-divider px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-[var(--cp-muted)]">{estimate.terms}</p>
          </div>
        </details>
      )}
    </Shell>
  );
}
