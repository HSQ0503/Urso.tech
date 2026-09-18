import { requirePagePermission } from "@/lib/canes/access";
import { getPlanDetail, listPlans } from "@/lib/canes/recurring";
import { listCrews } from "@/lib/canes/estimates";
import { RecurringWorkspace } from "@/app/CanesPressure/components/recurring/workspace";
export const dynamic = "force-dynamic";
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  await requirePagePermission("estimates");
  const { plan: id } = await searchParams;
  const [plans, selected, crews] = await Promise.all([
    listPlans(),
    id ? getPlanDetail(id) : null,
    listCrews(true),
  ]);
  return <RecurringWorkspace plans={plans} selected={selected} crews={crews} />;
}
