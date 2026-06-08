import { parseScope, STORE_OPTIONS } from "@/components/dashboard/data";
import { getReviewsData } from "@/components/dashboard/data.server";
import { ReviewsClient } from "@/components/dashboard/reviews-client";

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const data = await getReviewsData();
  const defaultStore = scope === "all" ? data.reputation[0].store : STORE_OPTIONS.find((o) => o.value === scope)!.label;

  return <ReviewsClient {...data} defaultStore={defaultStore} />;
}
