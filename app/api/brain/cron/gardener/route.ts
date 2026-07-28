import {
  isBrainGardenerCronAuthorized,
  listEnabledBrainGardeners,
  runBrainGardener,
} from "@/lib/brain/gardener-service";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "gardener cron is not configured" }, 503);
  if (!isBrainGardenerCronAuthorized(request, secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = ursoDbSafe();
  if (!admin) return json({ error: URSO_DB_MISSING }, 503);

  let policies;
  try {
    policies = await listEnabledBrainGardeners(admin);
  } catch {
    console.error("[brain gardener] policy read failed");
    return json({ error: "gardener policy read failed" }, 500);
  }

  const results: Array<{
    organizationId: string;
    status: "complete" | "running" | "skipped" | "failed";
    runId: string | null;
    findingCount: number;
    durationMs: number;
    failureCode?: string;
  }> = [];
  let failed = false;

  for (const policy of policies) {
    const startedAt = Date.now();
    console.info("[brain gardener] start", {
      organizationId: policy.organization_id,
    });
    try {
      const result = await runBrainGardener({
        admin,
        organizationId: policy.organization_id,
        settings: policy.settings,
      });
      results.push({
        organizationId: policy.organization_id,
        status: result.state,
        runId: result.runId,
        findingCount: result.findingCount,
        durationMs: result.durationMs,
      });
      console.info("[brain gardener] finish", {
        organizationId: policy.organization_id,
        status: result.state,
        runId: result.runId,
        findingCount: result.findingCount,
        newFindingCount: result.newFindingCount,
        repeatFindingCount: result.repeatFindingCount,
        resolvedFindingCount: result.resolvedFindingCount,
        durationMs: result.durationMs,
      });
    } catch (caught) {
      failed = true;
      const failureCode =
        caught && typeof caught === "object" && "code" in caught
          ? String(caught.code)
          : "gardener_failed";
      results.push({
        organizationId: policy.organization_id,
        status: "failed",
        runId: null,
        findingCount: 0,
        durationMs: Date.now() - startedAt,
        failureCode,
      });
      console.error("[brain gardener] finish", {
        organizationId: policy.organization_id,
        status: "failed",
        failureCode,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  return json(
    {
      status: failed ? "partial_failure" : "complete",
      eligibleOrganizations: policies.length,
      results,
    },
    failed ? 500 : 200,
  );
}
