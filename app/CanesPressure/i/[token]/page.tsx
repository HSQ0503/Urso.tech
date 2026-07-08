import { notFound } from "next/navigation";
import { ChevronDown, CreditCard, ShieldCheck } from "lucide-react";
import { getInvoiceByToken, getInvoiceItems, getInvoicePayments } from "@/lib/canes/invoices";
import { markInvoiceViewed } from "@/app/CanesPressure/actions";
import { fmtMoney, invoiceBalanceCents } from "@/lib/canes/types";

// PUBLIC hosted invoice page. Sits directly under /CanesPressure (a sibling of
// login/, e/ and text-us/), OUTSIDE the (app) gate, so a customer with just the
// token link can view + pay. Fully server-rendered — the Pay button is a link
// to Square's hosted, PCI-compliant page (our server never touches card data).
// Draft/void invoices 404 (never public); the page is noindex.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your invoice", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] px-5 py-10">
      <header className="mb-6">
        <p className="cp-display text-[19px] leading-none">
          Canes<span className="text-[var(--cp-brand)]">.</span>
        </p>
        <p className="cp-mono mt-1.5">Pressure washing</p>
      </header>
      {children}
      <p className="mt-8 text-center text-[11.5px] text-[var(--cp-faint)]">Powered by Urso · urso.ws</p>
    </div>
  );
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  // Unknown token, or a draft/void invoice, is a 404 — those are not public.
  if (!invoice || invoice.status === "draft" || invoice.status === "void") notFound();

  const [items, payments] = await Promise.all([
    getInvoiceItems(invoice.id),
    getInvoicePayments(invoice.id),
  ]);

  // First open of a sent invoice flips it to viewed. Fire-and-forget so the page
  // never waits on the write and a failure never breaks the customer's page.
  if (invoice.status === "sent") void markInvoiceViewed(token).catch(() => {});

  const balance = invoiceBalanceCents(invoice);
  const isPaid = invoice.status === "paid" || balance <= 0;

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="cp-display text-[24px] leading-tight">Your invoice</h1>
        <span className="cp-mono tabular-nums">{invoice.number}</span>
      </div>
      {(invoice.job_name || invoice.job_address) && (
        <div className="mt-1.5 space-y-0.5">
          {invoice.job_name && <p className="text-[15px] font-semibold">{invoice.job_name}</p>}
          {invoice.job_address && (
            <p className="text-[13.5px] text-[var(--cp-muted)]">{invoice.job_address}</p>
          )}
        </div>
      )}

      {invoice.message_to_customer && !isPaid && (
        <div className="cp-card mt-5 p-4">
          <p className="text-[14px] leading-relaxed">{invoice.message_to_customer}</p>
        </div>
      )}

      {/* Line items */}
      <div className="cp-card mt-4">
        <div className="p-4">
          <p className="cp-label">Details</p>
          <ul className="mt-2">
            {items.map((item, i) => (
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
            {items.length === 0 && (
              <li className="py-2.5 text-[13.5px] text-[var(--cp-muted)]">
                No line items on this invoice.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Totals */}
      <div className="cp-card mt-4">
        <div className="space-y-2 p-5">
          {invoice.adjustment_cents !== 0 && (
            <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
              <span>{invoice.adjustment_cents < 0 ? "Discount" : "Adjustment"}</span>
              <span className="tabular-nums">{fmtMoney(invoice.adjustment_cents)}</span>
            </div>
          )}
          {invoice.tax_cents > 0 && (
            <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
              <span>Tax</span>
              <span className="tabular-nums">{fmtMoney(invoice.tax_cents)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Total</span>
            <span className="cp-display text-[22px] tabular-nums">{fmtMoney(invoice.total_cents)}</span>
          </div>
          {invoice.amount_paid_cents > 0 && !isPaid && (
            <>
              <div className="flex items-center justify-between text-[13.5px] text-[var(--cp-muted)]">
                <span>Paid</span>
                <span className="tabular-nums">−{fmtMoney(invoice.amount_paid_cents)}</span>
              </div>
              <div className="cp-divider flex items-center justify-between pt-2">
                <span className="text-[14px] font-semibold">Balance due</span>
                <span className="tabular-nums text-[15px] font-semibold">{fmtMoney(balance)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pay / paid state */}
      <div className="mt-4">
        {isPaid ? (
          <div className="cp-card">
            <div className="flex items-start gap-2.5 p-5">
              <ShieldCheck size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-good)]" />
              <div>
                <p className="text-[15px] font-semibold text-[var(--cp-good)]">Paid in full. Thank you!</p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
                  {payments[0]?.method === "cash"
                    ? "We recorded your cash payment."
                    : "Your payment went through."}{" "}
                  We appreciate your business.
                </p>
              </div>
            </div>
          </div>
        ) : invoice.hosted_payment_url ? (
          <a href={invoice.hosted_payment_url} className="cp-btn cp-btn-primary w-full">
            <CreditCard size={16} strokeWidth={2} /> Pay {fmtMoney(balance)} securely
          </a>
        ) : (
          <div className="cp-card">
            <div className="p-5">
              <p className="text-[14px] font-semibold">Ready to pay?</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
                Online card payment for this invoice is being set up. Reply to our text or give us a
                call and we&rsquo;ll take care of it. We take cash, check, or card.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Terms */}
      {invoice.terms && (
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
            <p className="text-[12.5px] leading-relaxed text-[var(--cp-muted)]">{invoice.terms}</p>
          </div>
        </details>
      )}
    </Shell>
  );
}
