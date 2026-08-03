import type { UIMessage } from "ai";
import { createBrainChatResponse } from "@/lib/brain/chat-runtime";
import { BRAIN_PROVIDERS } from "@/lib/brain/models";
import { getOrgKeyStatus } from "@/lib/brain/db";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainProvider, BrainUIData } from "@/lib/brain/types";
import { isMfDemoRoleId, MF_BRAIN_PROJECT_ID } from "@/lib/mf-demo/brain-config";
import { resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";
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
  const available = new Set(keyStatus.map((key) => key.provider));
  const provider = providerPreference.find((candidate) => available.has(candidate)) ?? null;
  if (!provider) {
    return Response.json(
      { error: "The MF Brain has no model provider configured yet." },
      { status: 503 },
    );
  }

  return createBrainChatResponse({
    admin,
    principal,
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
