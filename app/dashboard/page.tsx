import { getSession } from "@/lib/auth";
import { parseMonth } from "@/components/dashboard/data";
import { OwnerHome } from "@/components/dashboard/owner-home";
import { ManagerHome } from "@/components/dashboard/manager-home";

// Identity-derived: the same /dashboard route renders the owner's full view or
// the manager's store-scoped view depending on who is signed in.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const user = await getSession();

  if (user?.role === "manager" && user.storeId) {
    const sp = await searchParams;
    return <ManagerHome store={user.storeId} month={parseMonth(sp.month)} userName={user.name} />;
  }

  return <OwnerHome searchParams={searchParams} />;
}
