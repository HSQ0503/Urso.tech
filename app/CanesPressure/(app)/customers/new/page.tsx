import Link from "next/link";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { NewCustomerForm } from "@/app/CanesPressure/components/customers/new-customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl">
      {/* Mobile back row */}
      <Link
        href="/CanesPressure/customers"
        className="mb-1 inline-flex items-center gap-1 text-[13px] text-[var(--cp-muted)] md:hidden"
      >
        <ChevronLeft size={16} strokeWidth={2} />
        Customers
      </Link>
      {/* Desktop back row — frozen */}
      <Link
        href="/CanesPressure/customers"
        className="hidden items-center gap-1.5 text-[13px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)] md:inline-flex"
      >
        <ArrowLeft size={15} strokeWidth={2} />
        Customers
      </Link>
      <h1 className="cp-display mt-3 text-[28px] leading-[1.08] md:text-[24px] md:leading-tight">
        New customer<span className="text-[var(--cp-brand)]">.</span>
      </h1>
      <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
        For repeat work and referrals that never came through as a lead.
      </p>
      <div className="mt-5">
        <NewCustomerForm />
      </div>
    </div>
  );
}
