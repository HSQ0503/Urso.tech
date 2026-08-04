import { getOrgKey, getOrgKeyStatus } from "@/lib/brain/db";
import {
  BRAIN_LEARNING_PROMPT_VERSION,
  resolveBrainLearningPolicy,
} from "@/lib/brain/learning";
import { runAuthorizedContextLearningReview } from "@/lib/brain/learning-service";
import {
  BRAIN_PROVIDERS,
  brainModel,
  isBrainProvider,
  isCatalogModel,
} from "@/lib/brain/models";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainProvider } from "@/lib/brain/types";
import {
  isMfDemoRoleId,
  MF_BRAIN_PROVIDER_ORGANIZATION_ID,
} from "@/lib/mf-demo/brain-config";
import { resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";
import { MfSessionContractError } from "@/lib/mf-demo/session-runtime.mjs";
import {
  consumeMfDemoSessionUsage,
  mfSessionCredentialsFromRequest,
  mfSessionErrorResponse,
} from "@/lib/mf-demo/session-server";

export const maxDuration = 120;

type LearningPolicyRow = {
  mode: "off" | "shadow" | "review" | "auto_low_risk";
  policy_version: string;
  settings: Record<string, unknown>;
};

const numberSetting = (settings: Record<string, unknown>, key: string): number | undefined => {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    roleId?: string;
    contextRunId?: string;
  } | null;
  if (!body?.contextRunId) {
    return Response.json({ error: "contextRunId required" }, { status: 400 });
  }

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  if (!isMfDemoRoleId(body.roleId)) {
    return mfSessionErrorResponse(new MfSessionContractError("invalid_role", 400, "Unknown MF demo role."));
  }
  try {
    await consumeMfDemoSessionUsage(admin, mfSessionCredentialsFromRequest(request), "learning", 5);
  } catch (error) {
    return mfSessionErrorResponse(error);
  }
  const principal = await resolveMfDemoPrincipal(admin, body.roleId);
  if (!principal) return Response.json({ error: "MF Brain unavailable" }, { status: 503 });

  const { data: rawPolicy, error: policyError } = await admin
    .from("brain_learning_policies")
    .select("mode, policy_version, settings")
    .eq("organization_id", principal.organizationId)
    .maybeSingle();
  if (policyError) return Response.json({ error: policyError.message }, { status: 500 });
  const policyRow = rawPolicy as LearningPolicyRow | null;
  if (!policyRow || policyRow.mode === "off") {
    return Response.json({ error: "Controlled learning is disabled for this Brain." }, { status: 409 });
  }

  const configured = await getOrgKeyStatus(admin, MF_BRAIN_PROVIDER_ORGANIZATION_ID);
  const configuredProviders = configured.map((item) => item.provider);
  const settings = policyRow.settings ?? {};
  const requestedProvider = typeof settings.provider === "string" ? settings.provider : "";
  const provider: BrainProvider | null =
    isBrainProvider(requestedProvider) && configuredProviders.includes(requestedProvider)
      ? requestedProvider
      : configuredProviders.includes("openai")
        ? "openai"
        : configuredProviders[0] ?? null;
  if (!provider) {
    return Response.json({ error: "No model provider is configured for learning review." }, { status: 503 });
  }

  const requestedModel = typeof settings.model === "string" ? settings.model : "";
  const modelId = isCatalogModel(provider, requestedModel)
    ? requestedModel
    : BRAIN_PROVIDERS[provider].defaultModel;
  const apiKey = await getOrgKey(admin, provider, MF_BRAIN_PROVIDER_ORGANIZATION_ID);
  if (!apiKey) {
    return Response.json({ error: `No ${BRAIN_PROVIDERS[provider].name} key is configured.` }, { status: 503 });
  }

  const policy = resolveBrainLearningPolicy(policyRow.mode, {
    policyVersion: policyRow.policy_version,
    promptVersion:
      typeof settings.promptVersion === "string"
        ? settings.promptVersion
        : BRAIN_LEARNING_PROMPT_VERSION,
    minimumConfidence: numberSetting(settings, "minimumConfidence"),
  });

  try {
    const result = await runAuthorizedContextLearningReview({
      admin,
      principal,
      contextRunId: body.contextRunId,
      policy,
      provider,
      modelId,
      model: brainModel(provider, modelId, apiKey),
    });
    return Response.json({ ...result, mode: policy.mode });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
