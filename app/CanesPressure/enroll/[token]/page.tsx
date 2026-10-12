import { notFound } from "next/navigation";
import { fmtMoney } from "@urso/types";
import { getEnrollmentPage } from "@/lib/canes/service-agreements";
import {
  ResumeServicePayment,
  ServiceEnrollmentForm,
} from "../../components/service-enrollment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = {
  title: "Recurring service offer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function EnrollmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    data = await getEnrollmentPage(token);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <p className="mb-5 text-sm text-[var(--cp-muted)]">
        Canes Pressure Washing
      </p>
      {data.status === "offer" ? (
        <ServiceEnrollmentForm
          token={token}
          offer={data.offer}
          configuration={data.configuration}
          terms={data.terms}
          recovery={data.recovery}
        />
      ) : (
        <div className="space-y-5">
          <h1 className="cp-display text-3xl">
            {data.paid
              ? "Recurring services accepted"
              : "Your enrollment is pending payment"}
          </h1>
          <p className="text-sm">
            {data.paid
              ? "The current invoice is settled. Canes will confirm the next appointment for each service."
              : "Your terms and card authorization are saved. No recurring appointment is created until the current invoice is fully settled."}
          </p>
          {data.notice ? (
            <p className="cp-card p-4 text-sm">{data.notice}</p>
          ) : null}
          {data.agreements.map((agreement) => (
            <section key={agreement.id} className="cp-card p-4">
              <h2 className="font-semibold">{agreement.service_name}</h2>
              <p className="mt-1 text-sm">
                {fmtMoney(agreement.recurring_price_cents)} per visit before tax
                · next due {agreement.next_due_on}
              </p>
              <p className="mt-1 text-sm text-[var(--cp-muted)]">
                {agreement.state.replaceAll("_", " ")}
              </p>
            </section>
          ))}
          {!data.paid ? <ResumeServicePayment token={token} /> : null}
          {data.hostedUrl && !data.paid ? (
            <a className="cp-btn min-h-11" href={data.hostedUrl}>
              View Square invoice
            </a>
          ) : null}
        </div>
      )}
    </main>
  );
}
