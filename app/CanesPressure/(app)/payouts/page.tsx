import { redirect } from "next/navigation";
import { requireOwnerPage } from "@/lib/canes/access";

export default async function PayoutsRedirect() {
  await requireOwnerPage();
  redirect("/CanesPressure/expenses");
}
