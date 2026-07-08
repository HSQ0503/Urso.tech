import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLead, getSettings } from "@/lib/canes/data";
import { getCustomer } from "@/lib/canes/customers";
import { listCatalog } from "@/lib/canes/estimates";
import { EstimateBuilder } from "@/app/CanesPressure/components/estimates/estimate-builder";

export const dynamic = "force-dynamic";

// New estimate. When linked from a lead (?lead=<id>) the customer + job fields
// prefill from that lead; from a customer profile (?customer=<contactId>) they
// prefill from the contact + primary address; otherwise it's a blank estimate.
// Message/terms/expiry come from settings so the builder opens with the shop
// defaults filled in.
export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; customer?: string }>;
}) {
  const { lead: leadId, customer: customerId } = await searchParams;

  const [lead, customer, catalog, settings] = await Promise.all([
    leadId ? getLead(leadId) : Promise.resolve(null),
    !leadId && customerId ? getCustomer(customerId) : Promise.resolve(null),
    listCatalog(true),
    getSettings(),
  ]);

  // eslint-disable-next-line react-hooks/purity -- per-request dynamic server render; "now" is stable for this render
  const nowMs = Date.now();
  const expiresAtIso = new Date(nowMs + settings.estimate_expiry_days * 86_400_000).toISOString();

  const contact = customer?.contact ?? null;
  const primaryAddress = customer
    ? (customer.addresses.find((a) => a.is_primary) ?? customer.addresses[0] ?? null)
    : null;

  const prefill = lead
    ? {
        customerName: lead.name ?? "",
        customerPhone: lead.phone ?? "",
        customerEmail: lead.email ?? "",
        jobAddress: lead.address ?? "",
        jobName: lead.service ?? "",
        leadId: lead.id,
        contactId: lead.contact_id,
      }
    : contact
      ? {
          customerName: contact.name ?? customer?.lead?.name ?? "",
          customerPhone: contact.phone ?? customer?.lead?.phone ?? "",
          customerEmail: contact.email ?? customer?.lead?.email ?? "",
          jobAddress: primaryAddress?.line ?? customer?.lead?.address ?? "",
          jobName: customer?.lead?.service ?? "",
          leadId: customer?.lead?.id ?? null,
          contactId: contact.id,
        }
      : null;

  const backHref = lead
    ? `/CanesPressure/leads/${lead.id}`
    : contact
      ? `/CanesPressure/customers/${contact.id}`
      : "/CanesPressure/estimates";
  const backLabel = lead ? "Back to lead" : contact ? "Back to customer" : "All estimates";
  const forName = lead?.name ?? contact?.name ?? null;

  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> {backLabel}
      </Link>

      <h1 className="cp-display mt-1 text-[24px] leading-tight">
        New estimate<span className="text-[var(--cp-brand)]">.</span>
      </h1>
      {(lead || contact) && (
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          For {forName ?? (lead ? "this lead" : "this customer")}
        </p>
      )}

      <div className="mt-5">
        <EstimateBuilder
          mode="create"
          catalog={catalog}
          depositPresets={settings.deposit_presets}
          optedOut={Boolean(lead?.opted_out ?? customer?.lead?.opted_out)}
          prefill={{
            ...(prefill ?? {}),
            messageToCustomer: settings.estimate_message,
            terms: settings.estimate_terms,
            expiresAtIso,
          }}
        />
      </div>
    </div>
  );
}
