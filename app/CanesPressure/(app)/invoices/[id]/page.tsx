import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ExternalLink } from "lucide-react";
import { getLead } from "@/lib/canes/data";
import { getInvoiceWithItems } from "@/lib/canes/invoices";
import { listInvoiceRewards } from "@/lib/canes/rewards";
import {
  approvedRewardCents,
  fmtEt,
  fmtMoney,
  invoiceBalanceCents,
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/canes/types";
import { InvoiceActions } from "@/app/CanesPressure/components/invoices/invoice-actions";
import { RewardManager } from "@/app/CanesPressure/components/invoices/reward-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice" };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoiceWithItems(id);
  if (!invoice) notFound();

  const lead = invoice.lead_id ? await getLead(invoice.lead_id) : null;
  const optedOut = Boolean(lead?.opted_out);
  const balance = invoiceBalanceCents(invoice);
  // Applied review rewards are inside total_cents — the totals block explains
  // them; the manage/verify panel lives in the rail (RewardManager).
  const appliedRewardCents = approvedRewardCents(await listInvoiceRewards(invoice.id));
  const payLink = `${APP_URL}/CanesPressure/i/${invoice.public_token}`;
  const isPublic = invoice.status !== "draft" && invoice.status !== "void";

  return (
    <div>
      {/* ── Mobile: iOS back row + large title header. ── */}
      <div className="md:hidden">
        <Link
          href="/CanesPressure/invoices"
          className="mb-1 inline-flex items-center gap-1 text-[13px] text-[var(--cp-muted)]"
        >
          <ChevronLeft size={16} strokeWidth={2} /> Invoices
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="cp-ios-title tabular-nums">{invoice.number}</h1>
          <span className={`cp-chip ${INVOICE_STATUS_CLASS[invoice.status]}`}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </span>
        </div>
        <p className="mt-1 text-[13.5px] tabular-nums text-[var(--cp-muted)]">
          {invoice.customer_name ?? "No customer"} · {fmtMoney(invoice.total_cents)}
        </p>
        {(invoice.sent_at || invoice.viewed_at) && (
          <p className="mt-0.5 text-[12.5px] tabular-nums text-[var(--cp-faint)]">
            {invoice.sent_at && <>Sent {fmtEt(invoice.sent_at)}</>}
            {invoice.viewed_at && <> · Viewed {fmtEt(invoice.viewed_at)}</>}
          </p>
        )}
      </div>

      {/* ── Desktop (md+): unchanged, frozen. ── */}
      <div className="hidden md:block">
      <Link
        href="/CanesPressure/invoices"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> All invoices
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="cp-display text-[24px] leading-tight tabular-nums">{invoice.number}</h1>
        <span className={`cp-chip ${INVOICE_STATUS_CLASS[invoice.status]}`}>
          {INVOICE_STATUS_LABEL[invoice.status]}
        </span>
      </div>
      <p className="mt-1 text-[13.5px] tabular-nums text-[var(--cp-muted)]">
        {invoice.customer_name ?? "No customer"} · {fmtMoney(invoice.total_cents)}
        {invoice.sent_at && <> · Sent {fmtEt(invoice.sent_at)}</>}
        {invoice.viewed_at && <> · Viewed {fmtEt(invoice.viewed_at)}</>}
        {invoice.paid_at && <> · Paid {fmtEt(invoice.paid_at)}</>}
      </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* Rail first on mobile so the primary action sits above the fold. */}
        <div className="order-1 md:order-2">
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            phone={invoice.customer_phone ?? ""}
            email={invoice.customer_email ?? ""}
            optedOut={optedOut}
            balanceCents={balance > 0 ? balance : invoice.total_cents}
            hasSquareUrl={Boolean(invoice.hosted_payment_url)}
            sentAt={invoice.sent_at}
          />
          <div className="mt-3">
            <RewardManager invoiceId={invoice.id} invoiceStatus={invoice.status} />
          </div>
          {isPublic && (
            <div className="cp-card mt-4 p-3">
              <p className="cp-label">Customer link</p>
              <a
                href={payLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 break-all text-[12.5px] font-medium text-[var(--cp-brand-deep)] hover:underline"
              >
                <ExternalLink size={13} strokeWidth={2} className="shrink-0" />
                {payLink}
              </a>
            </div>
          )}
        </div>

        <div className="order-2 min-w-0 space-y-4 md:order-1">
          {/* Line items */}
          <div className="cp-card p-4">
            <p className="cp-label">Line items</p>
            <ul className="mt-2">
              {invoice.items.map((item, i) => (
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
              {invoice.items.length === 0 && (
                <li className="py-2.5 text-[13.5px] text-[var(--cp-muted)]">No line items.</li>
              )}
            </ul>

            <div className="cp-divider mt-2 space-y-1.5 pt-3">
              {invoice.adjustment_cents !== 0 && (
                <div className="flex items-center justify-between text-[13px] text-[var(--cp-muted)]">
                  <span>{invoice.adjustment_cents < 0 ? "Discount" : "Adjustment"}</span>
                  <span className="tabular-nums">{fmtMoney(invoice.adjustment_cents)}</span>
                </div>
              )}
              {invoice.tax_cents > 0 && (
                <div className="flex items-center justify-between text-[13px] text-[var(--cp-muted)]">
                  <span>Tax</span>
                  <span className="tabular-nums">{fmtMoney(invoice.tax_cents)}</span>
                </div>
              )}
              {appliedRewardCents > 0 && (
                <div className="flex items-center justify-between text-[13px] text-[var(--cp-good)]">
                  <span>Review rewards</span>
                  <span className="tabular-nums">−{fmtMoney(appliedRewardCents)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">Total</span>
                <span className="text-[18px] font-semibold tabular-nums">{fmtMoney(invoice.total_cents)}</span>
              </div>
              {invoice.amount_paid_cents > 0 && (
                <>
                  <div className="flex items-center justify-between text-[13px] text-[var(--cp-muted)]">
                    <span>Paid</span>
                    <span className="tabular-nums">−{fmtMoney(invoice.amount_paid_cents)}</span>
                  </div>
                  {balance > 0 && (
                    <div className="flex items-center justify-between text-[13px] font-semibold">
                      <span>Balance</span>
                      <span className="tabular-nums text-[var(--cp-warn)]">{fmtMoney(balance)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Payment history */}
          {invoice.payments.length > 0 && (
            <div className="cp-card p-4">
              <p className="cp-label">Payments</p>
              <ul className="mt-2 space-y-2">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                      <span className="font-medium">{PAYMENT_METHOD_LABEL[p.method]}</span>
                      <span className="text-[var(--cp-faint)]"> · {fmtEt(p.created_at)}</span>
                    </span>
                    <span className="tabular-nums font-semibold">{fmtMoney(p.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
