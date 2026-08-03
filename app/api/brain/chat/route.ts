import type { UIMessage } from "ai";
import { getBrainUser } from "@/lib/brain/access";
import { resolveBrainPrincipal } from "@/lib/brain/authorization";
import { createBrainChatResponse } from "@/lib/brain/chat-runtime";
import {
  isBrainProvider,
  isCatalogModel,
  BRAIN_PROVIDERS,
} from "@/lib/brain/models";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainUIData } from "@/lib/brain/types";

export const maxDuration = 120;

type BrainUIMessage = UIMessage<unknown, BrainUIData>;

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    messages?: BrainUIMessage[];
    threadId?: string;
    projectId?: string;
    provider?: string;
    model?: string;
  } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length > 100) {
    return Response.json({ error: "invalid messages" }, { status: 400 });
  }

  const provider = body.provider ?? "";
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });
  const modelId = body.model ?? BRAIN_PROVIDERS[provider].defaultModel;
  if (!isCatalogModel(provider, modelId)) {
    return Response.json({ error: "model not in catalog" }, { status: 400 });
  }

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) return Response.json({ error: "active brain membership required" }, { status: 403 });

  return createBrainChatResponse({
    admin,
    principal,
    body: {
      messages: body.messages,
      threadId: body.threadId,
      projectId: body.projectId,
      provider,
      model: modelId,
    },
  });
}
