import { requirePagePermission } from "@/lib/canes/access";
import { listCatalog } from "@/lib/canes/estimates";
import { CatalogEditor } from "@/app/CanesPressure/components/estimates/catalog-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

export default async function CatalogItemsPage() {
  await requirePagePermission("estimates");
  const items = await listCatalog();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="cp-display text-[24px]">Service catalog</h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Default prices for the services you offer, used to prefill estimates
        </p>
      </header>

      <CatalogEditor items={items} />
    </div>
  );
}
