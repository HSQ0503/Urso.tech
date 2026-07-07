import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSettings } from "@/lib/canes/data";
import { getEstimate, getEstimateItems, listCatalog } from "@/lib/canes/estimates";
import {
  fmtEt,
  fmtMoney,
  ESTIMATE_STATUS_CLASS,
  ESTIMATE_STATUS_LABEL,
  ESTIMATE_TYPE_LABEL,
} from "@/lib/canes/types";
import { EstimateBuilder } from "@/app/CanesPressure/components/estimates/estimate-builder";
import { EstimateActions } from "@/app/CanesPressure/components/estimates/estimate-actions";

export const dynamic = "force-dynamic";

// A single estimate. Draft estimates are fully editable; once sent/approved the
// builder renders read-only and the actions rail carries whatever moves are
// still valid (send, void, open public link, mark approved).
export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [estimate, items, catalog, settings] = await Promise.all([
    getEstimate(id),
    getEstimateItems(id),
    listCatalog(true),
    getSettings(),
  ]);
  if (!estimate) notFound();

  const readOnly = estimate.status !== "draft";

  return (
    <div>
      <Link
        href="/CanesPressure/estimates"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> All estimates
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="cp-display text-[24px] leading-tight tabular-nums">{estimate.number}</h1>
        <span className={`cp-chip ${ESTIMATE_STATUS_CLASS[estimate.status]}`}>
          {ESTIMATE_STATUS_LABEL[estimate.status]}
        </span>
        <span className="cp-chip cp-status-new">{ESTIMATE_TYPE_LABEL[estimate.estimate_type]}</span>
      </div>
      <p className="mt-1 text-[13.5px] tabular-nums text-[var(--cp-muted)]">
        {estimate.customer_name ?? "No customer"} · {fmtMoney(estimate.total_cents)}
        {estimate.sent_at && <> · Sent {fmtEt(estimate.sent_at)}</>}
        {estimate.approved_at && <> · Approved {fmtEt(estimate.approved_at)}</>}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* Rail first on mobile so the primary action sits above the fold. */}
        <div className="order-1 md:order-2">
          <EstimateActions estimateId={estimate.id} status={estimate.status} />
        </div>
        <div className="order-2 min-w-0 md:order-1">
          <EstimateBuilder
            key={estimate.id}
            mode="edit"
            estimate={estimate}
            initialItems={items}
            catalog={catalog}
            depositPresets={settings.deposit_presets}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}
