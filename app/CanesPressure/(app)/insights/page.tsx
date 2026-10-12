import { redirect } from "next/navigation";
import { requireOwnerPage } from "@/lib/canes/access";
export default async function InsightsPage() {
  await requireOwnerPage();
  redirect("/CanesPressure/money");
}
