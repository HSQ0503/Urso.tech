import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getPlanByToken, listPlanItems } from "@/lib/canes/recurring";
import { markRecurringPlanViewed } from "@/app/CanesPressure/actions";
import { PLAN_CADENCE_LABEL, etLocalToIso, fmtEt, fmtMoney, planCancellationFeeCents } from "@/lib/canes/types";
import { PublicPlanSign } from "@/app/CanesPressure/components/recurring/public-sign";

// PUBLIC recurring service agreement. Sits directly under /CanesPressure,
// OUTSIDE the (app) gate, exactly like the estimate page at /e/[token]: a
// customer with the token link reads the plan and signs it with their name.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your service agreement", robots: { index: false, follow: false } };

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
      <p className="mt-8 text-center text-[11.5px] text-[var(--cp-faint)]">Powered by Urso · urso.ws</p>
    </div>
  );
}

export default async function PublicPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await getPlanByToken(token);
  // A plan that was never sent has no business being public; a canceled one
  // has nothing left to sign.
  if (!plan || (plan.status === "draft" && !plan.sent_at)) notFound();
  const items = await listPlanItems(plan.id);

  if (!plan.viewed_at) void markRecurringPlanViewed(token).catch(() => {});

  const firstVisit = plan.next_due_on ?? plan.starts_on;
  const fee = planCancellationFeeCents(plan);
  const signed = plan.status !== "draft";

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="cp-display text-[24px] leading-tight">Your service agreement</h1>
        <span className="cp-mono tabular-nums">{plan.number}</span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-[15px] font-semibold">
          {plan.job_name ?? "Recurring service"} · {PLAN_CADENCE_LABEL[plan.cadence]}
        </p>
        {plan.job_address && <p className="text-[13.5px] text-[var(--cp-muted)]">{plan.job_address}</p>}
      </div>

      {plan.message_to_customer && (
        <div className="cp-card mt-5 p-4">
          <p className="text-[14px] leading-relaxed">{plan.message_to_customer}</p>
        </div>
      )}

      <div className="cp-card mt-4">
        <div className="p-4">
          <p className="cp-label">Each visit includes</p>
          <ul className="mt-2">
            {items.map((item, i) => (
              <li key={item.id} className={`flex items-start justify-between gap-3 py-2.5 ${i > 0 ? "cp-divider" : ""}`}>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">
                    {item.name}
                    {item.quantity !== 1 && (
                      <span className="ml-1.5 text-[13px] tabular-nums text-[var(--cp-muted)]">× {item.quantity}</span>
                    )}
                  </p>
                  {item.description && <p className="text-[12.5px] text-[var(--cp-muted)]">{item.description}</p>}
                </div>
                <span className="tabular-nums text-[14px] font-semibold">{fmtMoney(item.line_total_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="cp-divider grid grid-cols-2 gap-3 p-4 text-[13.5px]">
          <div>
            <p className="cp-label">How often</p>
            <p className="mt-0.5 font-semibold">{PLAN_CADENCE_LABEL[plan.cadence]}</p>
          </div>
          <div>
            <p className="cp-label">{signed ? "Next visit" : "First visit"}</p>
            <p className="mt-0.5 font-semibold">
              {fmtEt(etLocalToIso(`${firstVisit}T12:00`), { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div>
            <p className="cp-label">Price per visit</p>
            <p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(plan.price_per_visit_cents)}</p>
          </div>
          <div>
            <p className="cp-label">Cancellation fee</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {fee > 0 ? `${fmtMoney(fee)} (${plan.cancellation_fee_bps / 100}% of a visit)` : "None"}
            </p>
          </div>
        </div>
      </div>

      {plan.terms && (
        <details className="cp-card mt-4 p-4" open>
          <summary className="cursor-pointer text-[14px] font-semibold">Terms</summary>
          <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--cp-muted)]">{plan.terms}</p>
        </details>
      )}

      <div className="mt-4">
        {signed ? (
          <div className="cp-card">
            <div className="flex items-start gap-3 p-5">
              <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[var(--cp-good)]" />
              <div>
                <p className="text-[16px] font-semibold">
                  {plan.status === "canceled" ? "This agreement has ended." : "This agreement is signed."}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
                  {plan.signature_name ? `Signed by ${plan.signature_name}` : "Agreed in person"}
                  {plan.signed_at ? ` on ${fmtEt(plan.signed_at, { month: "short", day: "numeric", year: "numeric" })}` : ""}.
                  {plan.status === "paused" ? " Visits are paused for now." : ""}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <PublicPlanSign token={token} pricePerVisit={fmtMoney(plan.price_per_visit_cents)} cadence={PLAN_CADENCE_LABEL[plan.cadence]} />
        )}
      </div>
    </Shell>
  );
}
