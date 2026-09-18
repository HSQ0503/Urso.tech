import { notFound } from "next/navigation";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getInvoiceByJob } from "@/lib/canes/invoices";
import { listJobItems } from "@/lib/canes/estimates";
import { CANES_CUSTOMER_PHONE } from "@/lib/canes/customer-messages";
import { fmtEtTimeRange, fmtMoney, invoiceBalanceCents } from "@urso/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your scheduled job | Canes Pressure Washing",
  robots: { index: false, follow: false },
};

export default async function CustomerJobPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!canesConfigured() || !/^[\da-f-]{36}$/i.test(token)) notFound();
  const { data: job, error } = await canesDb()
    .from("jobs")
    .select(
      "id, customer_name, job_name, job_address, scheduled_at, ends_at, total_cents, deposit_collected_cents, status",
    )
    .eq("public_token", token)
    .is("archived_at", null)
    .maybeSingle();
  if (error)
    throw new Error("The appointment could not be loaded. Please try again.");
  if (!job) notFound();
  const [items, invoice] = await Promise.all([
    listJobItems(job.id),
    getInvoiceByJob(job.id),
  ]);
  const deposit = job.deposit_collected_cents ?? 0;
  const balance = invoice
    ? invoiceBalanceCents(invoice)
    : Math.max(0, job.total_cents - deposit);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-10">
      <header>
        <p className="cp-mono">Canes Pressure Washing</p>
        <h1 className="cp-display mt-2 text-3xl">Your appointment</h1>
      </header>
      <section className="cp-card space-y-3 p-5">
        <h2 className="text-xl font-semibold">
          {job.job_name ?? "Pressure washing"}
        </h2>
        <p>
          {job.status === "canceled"
            ? "This appointment was canceled."
            : job.scheduled_at
              ? fmtEtTimeRange(job.scheduled_at, job.ends_at)
              : "Your appointment time is being arranged."}
        </p>
        <p className="text-sm">All appointment times are Eastern.</p>
        <p>{job.job_address}</p>
      </section>
      <section className="cp-card p-5">
        <h2 className="mb-3 font-semibold">Services</h2>
        {items
          .filter((item) => !item.checklist_only)
          .map((item) => (
            <div
              key={item.id}
              className="flex justify-between gap-4 border-b py-3 last:border-0"
            >
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>{fmtMoney(item.line_total_cents)}</span>
            </div>
          ))}
        <dl className="mt-4 space-y-2">
          <div className="flex justify-between">
            <dt>Job total</dt>
            <dd>{fmtMoney(job.total_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Deposit received</dt>
            <dd>−{fmtMoney(deposit)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Balance due</dt>
            <dd>{fmtMoney(balance)}</dd>
          </div>
        </dl>
      </section>
      <p>Need to reschedule? Call or text us at 561-537-5674.</p>
      <div className="flex gap-3">
        <a
          className="cp-btn-primary flex-1 justify-center"
          href={`tel:${CANES_CUSTOMER_PHONE}`}
        >
          Call Canes
        </a>
        <a
          className="cp-btn flex-1 justify-center"
          href={`sms:${CANES_CUSTOMER_PHONE}`}
        >
          Text Canes
        </a>
      </div>
    </main>
  );
}
