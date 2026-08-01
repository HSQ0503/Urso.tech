import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";
import { createClient } from "@/lib/supabase/server";

type ActionBody = { id?: unknown; status?: unknown };

export const POST = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  if (actor.role !== "owner") return apiFail(actor.role === "urso_admin" ? "Admins manage actions from Urso Control." : "This dashboard section is owner-only.", 403);
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return apiFail("Send a valid action update.", 400);
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = body.status === "approved" || body.status === "dismissed" ? body.status : null;
  if (!id || !status) return apiFail("Choose an action and a valid update.", 400);

  try {
    const supabase = await createClient();
    const { data: action, error: readError } = await supabase.from("agent_actions").select("id").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!action) return apiFail("Action not found.", 404);
    const { error } = await supabase.rpc("set_action_status", { p_id: id, p_status: status, p_result: null, p_actor: actor.user.email });
    if (error) throw error;
    return apiOk({ id, status });
  } catch (error) {
    console.error(`[api/v1/workspaces/woof-gang/actions] ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("The action could not be updated. Try again.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
