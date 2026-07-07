import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLead, getSettings } from "@/lib/canes/data";
import { listCatalog } from "@/lib/canes/estimates";
import { EstimateBuilder } from "@/app/CanesPressure/components/estimates/estimate-builder";

export const dynamic = "force-dynamic";

// New estimate. When linked from a lead (?lead=<id>) the customer + job fields
// prefill from that lead; otherwise it's a blank estimate. Message/terms/expiry
// come from settings so the builder opens with the shop defaults filled in.
export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead: leadId } = await searchParams;

  const [lead, catalog, settings] = await Promise.all([
    leadId ? getLead(leadId) : Promise.resolve(null),
    listCatalog(true),
    getSettings(),
  ]);

  // eslint-disable-next-line react-hooks/purity -- per-request dynamic server render; "now" is stable for this render
  const nowMs = Date.now();
  const expiresAtIso = new Date(nowMs + settings.estimate_expiry_days * 86_400_000).toISOString();

  return (
    <div>
      <Link
        href={lead ? `/CanesPressure/leads/${lead.id}` : "/CanesPressure/estimates"}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> {lead ? "Back to lead" : "All estimates"}
      </Link>

      <h1 className="cp-display mt-1 text-[24px] leading-tight">New estimate</h1>
      {lead && (
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          For {lead.name ?? "this lead"}
        </p>
      )}

      <div className="mt-5">
        <EstimateBuilder
          mode="create"
          catalog={catalog}
          depositPresets={settings.deposit_presets}
          optedOut={Boolean(lead?.opted_out)}
          prefill={{
            customerName: lead?.name ?? "",
            customerPhone: lead?.phone ?? "",
            jobAddress: lead?.address ?? "",
            jobName: lead?.service ?? "",
            leadId: lead?.id ?? null,
            messageToCustomer: settings.estimate_message,
            terms: settings.estimate_terms,
            expiresAtIso,
          }}
        />
      </div>
    </div>
  );
}
