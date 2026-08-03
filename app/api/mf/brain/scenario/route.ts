import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { MfSessionContractError } from "@/lib/mf-demo/session-runtime.mjs";
import {
  createMfDemoSession,
  loadMfDemoSession,
  mfSessionErrorResponse,
  selectMfDemoSessionRole,
  transitionMfDemoSession,
} from "@/lib/mf-demo/session-server";

type ScenarioRequest =
  | { action: "create" }
  | { action: "load"; sessionId: string; token: string }
  | { action: "select-role"; sessionId: string; token: string; roleId: string }
  | {
      action: "transition";
      sessionId: string;
      token: string;
      expectedStep: number;
      targetStep: number;
      idempotencyKey: string;
      roleId: string;
    };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ScenarioRequest | null;
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  try {
    if (!body) throw new MfSessionContractError("invalid_request", 400, "Scenario action required.");
    if (body.action === "create") return Response.json(await createMfDemoSession(admin));
    if (body.action === "load") {
      return Response.json({ session: await loadMfDemoSession(admin, body) });
    }
    if (body.action === "select-role") {
      return Response.json({ session: await selectMfDemoSessionRole(admin, body, body.roleId) });
    }
    if (body.action === "transition") {
      if (
        typeof body.expectedStep !== "number"
        || typeof body.targetStep !== "number"
        || !body.idempotencyKey
        || !body.roleId
      ) {
        throw new MfSessionContractError("invalid_request", 400, "Complete transition state required.");
      }
      return Response.json({ session: await transitionMfDemoSession(admin, body) });
    }
    throw new MfSessionContractError("invalid_request", 400, "Unknown scenario action.");
  } catch (error) {
    return mfSessionErrorResponse(error);
  }
}
