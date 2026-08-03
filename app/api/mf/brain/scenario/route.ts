import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { setMfDemoScenarioStep } from "@/lib/mf-demo/scenario-server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { step?: number } | null;
  if (!body || typeof body.step !== "number") {
    return Response.json({ error: "scenario step required" }, { status: 400 });
  }
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  try {
    return Response.json(await setMfDemoScenarioStep(admin, body.step));
  } catch (error) {
    console.error("[mf-brain] scenario failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "The MF Brain scenario could not be updated." }, { status: 503 });
  }
}
