import { requirePagePermission } from "@/lib/canes/access";
import { getJobWithItems, listCrews, listJobs } from "@/lib/canes/estimates";
import { getInvoiceByJob } from "@/lib/canes/invoices";
import { listCustomerDirectory } from "@/lib/canes/customers";
import { WorkOrders } from "@/app/CanesPressure/components/schedule/work-orders";

export const dynamic = "force-dynamic";
export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  await requirePagePermission("schedule");
  const { job: id } = await searchParams;
  const [jobs, crews, customers, selected, invoice] = await Promise.all([
    listJobs(),
    listCrews(true),
    listCustomerDirectory(),
    id ? getJobWithItems(id) : null,
    id ? getInvoiceByJob(id) : null,
  ]);
  return (
    <WorkOrders
      jobs={jobs}
      crews={crews}
      customers={customers}
      selected={selected}
      invoice={invoice}
    />
  );
}
