import Link from "next/link";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/canes/access";
import { listCustomerDirectory } from "@/lib/canes/customers";
import { NewInvoiceForm } from "@/app/CanesPressure/components/invoices/new-invoice-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New invoice" };

// Standalone invoice creation — for billing work that never went through an
// estimate or the schedule (Sebastian's ask). The form is client-first: pick
// an existing customer or type a new name, and the invoice files under them.

export default async function NewInvoicePage() {
  await requirePagePermission("invoices");
  const customers = await listCustomerDirectory();

  return (
    <div>
      {/* ── Mobile: iOS back row + large title. ── */}
      <div className="md:hidden">
        <Link
          href="/CanesPressure/invoices"
          className="mb-1 inline-flex items-center gap-1 text-[13px] text-[var(--cp-muted)]"
        >
          <ChevronLeft size={16} strokeWidth={2} /> All invoices
        </Link>
        <h1 className="cp-ios-title">
          New invoice<span className="text-[var(--cp-brand)]">.</span>
        </h1>
      </div>

      {/* ── Desktop (md+). ── */}
      <div className="hidden md:block">
        <Link
          href="/CanesPressure/invoices"
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
        >
          <ArrowLeft size={15} strokeWidth={2} /> All invoices
        </Link>
        <h1 className="cp-display mt-1 text-[24px] leading-tight">
          New invoice<span className="text-[var(--cp-brand)]">.</span>
        </h1>
      </div>

      <div className="mt-5">
        <NewInvoiceForm customers={customers} />
      </div>
    </div>
  );
}
