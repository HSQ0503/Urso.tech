"use server";

// Server actions for the AI action center. The approve/dismiss/advance loop was
// client-only React state (lost on reload); these persist each move and log the
// transition via the set_action_status RPC (migration 0019), so the weekly AI
// run can see what the owner actually did. Auth + store scope are enforced here
// before the SECURITY DEFINER RPC writes.

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Statuses a user may move an action TO from the UI (never back to 'suggested').
const SETTABLE = new Set(["approved", "running", "completed", "dismissed"]);

export async function setActionStatus(
  id: string,
  status: string,
  result?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role === "urso_admin") return { ok: false, error: "Admins manage actions from the console" };
  if (!SETTABLE.has(status)) return { ok: false, error: `Invalid status: ${status}` };

  const supabase = await createClient();

  // Authorize against the action's store: a manager may only touch their own
  // store's actions (never all-stores actions); owners may touch any.
  const { data: action, error: readErr } = await supabase
    .from("agent_actions")
    .select("store_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!action) return { ok: false, error: "Action not found" };
  if (user.role === "manager" && action.store_id !== user.storeId) {
    return { ok: false, error: "That action is outside your store" };
  }

  const { error: rpcErr } = await supabase.rpc("set_action_status", {
    p_id: id,
    p_status: status,
    p_result: result ?? null,
    p_actor: user.email,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath("/dashboard/actions");
  return { ok: true };
}

export async function approveAction(id: string) {
  return setActionStatus(id, "approved");
}

export async function dismissAction(id: string) {
  return setActionStatus(id, "dismissed");
}
