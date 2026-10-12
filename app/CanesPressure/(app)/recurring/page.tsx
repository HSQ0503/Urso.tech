import Link from "next/link";
import { getServiceAgreements } from "@/lib/canes/service-agreements";
import { ServiceAgreementsWorkspace } from "@/app/CanesPressure/components/service-agreements-workspace";
import { requirePagePermission } from "@/lib/canes/access";
import { getPlanDetail, listPlans } from "@/lib/canes/recurring";
import { listCrews } from "@/lib/canes/estimates";
import { RecurringWorkspace } from "@/app/CanesPressure/components/recurring/workspace";
export const dynamic = "force-dynamic";
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; legacy?: string }>;
}) {
  const access = await requirePagePermission("estimates");
  const { plan: id, legacy } = await searchParams;
  if (!id && legacy !== "1" && access.kind !== "ops")
    return <ServiceAgreementsWorkspace data={await getServiceAgreements()} />;
  const [plans, selected, crews] = await Promise.all([
    listPlans(),
    id ? getPlanDetail(id) : null,
    listCrews(true),
  ]);
  return (
    <div className="space-y-4">
      <Link className="cp-btn min-h-11" href="/CanesPressure/recurring">
        Service agreements
      </Link>
      <RecurringWorkspace plans={plans} selected={selected} crews={crews} />
    </div>
  );
}
