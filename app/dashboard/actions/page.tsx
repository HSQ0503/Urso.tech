import { getAllAgentActions } from "@/components/dashboard/data.server";
import { ActionsClient } from "@/components/dashboard/actions-client";

export default async function ActionsPage() {
  const actions = await getAllAgentActions();

  return <ActionsClient initialActions={actions} />;
}
