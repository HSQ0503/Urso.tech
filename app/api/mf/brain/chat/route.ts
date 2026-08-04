import type { UIMessage } from "ai";
import { createBrainChatResponse } from "@/lib/brain/chat-runtime";
import { BRAIN_PROVIDERS } from "@/lib/brain/models";
import { getOrgKey, getOrgKeyStatus } from "@/lib/brain/db";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainProvider, BrainUIData } from "@/lib/brain/types";
import { isMfDemoRoleId, MF_BRAIN_PROJECT_ID } from "@/lib/mf-demo/brain-config";
import { resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";
import { resolveReadableBrainProvider } from "@/lib/mf-demo/provider-runtime.mjs";
import { MfSessionContractError } from "@/lib/mf-demo/session-runtime.mjs";
import {
  consumeMfDemoSessionUsage,
  mfSessionCredentialsFromRequest,
  mfSessionErrorResponse,
} from "@/lib/mf-demo/session-server";

export const maxDuration = 120;

type MfBrainMessage = UIMessage<unknown, BrainUIData>;

const providerPreference: BrainProvider[] = ["openai", "google", "anthropic", "moonshot"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    messages?: MfBrainMessage[];
    threadId?: string;
    roleId?: string;
    language?: "pt" | "en";
  } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length > 100) {
    return Response.json({ error: "invalid messages" }, { status: 400 });
  }

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  if (!isMfDemoRoleId(body.roleId)) {
    return mfSessionErrorResponse(new MfSessionContractError("invalid_role", 400, "Unknown MF demo role."));
  }
  try {
    await consumeMfDemoSessionUsage(admin, mfSessionCredentialsFromRequest(request), "chat", 10);
  } catch (error) {
    return mfSessionErrorResponse(error);
  }
  const principal = await resolveMfDemoPrincipal(admin, body.roleId);
  if (!principal) {
    return Response.json(
      { error: "The MF Brain tenant is not provisioned yet." },
      { status: 503 },
    );
  }

  const keyStatus = await getOrgKeyStatus(admin, principal.organizationId).catch(() => []);
  const providerResolution = await resolveReadableBrainProvider({
    preferences: providerPreference,
    configuredProviders: keyStatus.map((key) => key.provider),
    readKey: (provider) => getOrgKey(admin, provider, principal.organizationId),
  });
  if (!providerResolution.provider || !providerResolution.apiKey) {
    const error = providerResolution.configuredCount > 0
      ? "The MF Brain provider credentials cannot be read by this server. Refresh the MF provider keys and restart the app."
      : "The MF Brain has no model provider configured yet.";
    return Response.json(
      { error },
      { status: 503 },
    );
  }

  const provider = providerResolution.provider;

  return createBrainChatResponse({
    admin,
    principal,
    apiKey: providerResolution.apiKey,
    forcedProjectId: MF_BRAIN_PROJECT_ID,
    responseLanguage: body.language === "en" ? "en" : "pt",
    body: {
      messages: body.messages,
      threadId: body.threadId,
      projectId: MF_BRAIN_PROJECT_ID,
      provider,
      model: BRAIN_PROVIDERS[provider].defaultModel,
    },
  });
}
