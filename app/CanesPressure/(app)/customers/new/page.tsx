import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCustomerForm } from "@/app/CanesPressure/components/customers/new-customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/CanesPressure/customers"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
      >
        <ArrowLeft size={15} strokeWidth={2} />
        Customers
      </Link>
      <h1 className="cp-display mt-3 text-[24px] leading-tight">
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
