import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getBrainUser } from "@/lib/brain/access";
import { resolveBrainPrincipal } from "@/lib/brain/authorization";
import { compileBrainContext } from "@/lib/brain/context-compiler";
import { getDepartments, getOrgKey, getProjects } from "@/lib/brain/db";
import { buildBrainTools } from "@/lib/brain/tools";
import {
  brainModel,
  isBrainProvider,
  isCatalogModel,
  BRAIN_PROVIDERS,
} from "@/lib/brain/models";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getOwnedBrainThread, persistBrainTurn, type StoredBrainMessage } from "@/lib/brain/threads";
import type { BrainUIData } from "@/lib/brain/types";

export const maxDuration = 120;

type BrainUIMessage = UIMessage<unknown, BrainUIData>;

const BRAIN_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";
const short = (value: unknown, max = 300): string => {
  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  return stringValue && stringValue.length > max ? `${stringValue.slice(0, max)}…` : (stringValue ?? "");
};

function safeStreamError(provider: keyof typeof BRAIN_PROVIDERS, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[brain] stream error:", message);
  if (/401|403|invalid.*key|unauthorized|authentication/i.test(message)) {
    return `The ${BRAIN_PROVIDERS[provider].name} key was rejected — an admin should re-check it in Brain settings.`;
  }
  if (/overloaded|unavailable|503/i.test(message)) {
    return "That model is briefly overloaded — try again, or switch models.";
  }
  if (/quota|rate.?limit|429|resource_exhausted|insufficient/i.test(message)) {
    return "The org key hit its rate/credit limit — give it a moment or switch providers.";
  }
  return "Something went wrong generating that answer — try again.";
}

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

  let apiKey: string | null = null;
  try {
    apiKey = await getOrgKey(admin, provider, principal.organizationId);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[brain] org-key read failed:", raw);
    const friendly = raw.includes("BRAIN_KEYS_SECRET")
      ? raw
      : "The org key store can't be read (BRAIN_KEYS_SECRET changed?) — an admin should re-save the keys in Brain settings.";
    return Response.json({ error: friendly }, { status: 503 });
  }
  if (!apiKey) {
    return Response.json(
      { error: `No ${BRAIN_PROVIDERS[provider].name} key is configured — an admin can add one in Brain settings.` },
      { status: 503 },
    );
  }

  const [departments, projects] = await Promise.all([
    getDepartments(admin, principal.organizationId),
    getProjects(admin, principal.organizationId),
  ]);
  const department = departments.find((item) => item.id === principal.departmentId);
  if (!department) return Response.json({ error: "membership department is invalid" }, { status: 403 });
  const activeProject = projects.find((item) => item.id === body.projectId) ?? null;

  const ownedThread = body.threadId
    ? await getOwnedBrainThread(admin, principal.userId, body.threadId, principal.organizationId)
    : null;
  const ownedThreadId = ownedThread?.id ?? null;

  let embeddingKey: string | null = provider === "openai" ? apiKey : null;
  if (!embeddingKey) {
    try {
      embeddingKey = await getOrgKey(admin, "openai", principal.organizationId);
    } catch {
      // Retrieval remains valid in lexical mode when no embedding key exists.
    }
  }

  const compiled = await compileBrainContext({
    admin,
    principal,
    department,
    activeProject,
    messages: body.messages,
    threadId: ownedThreadId,
    embeddingKey,
  });
  const tools = buildBrainTools({
    admin,
    principal,
    authorizedDocs: compiled.authorizedDocs,
    evidenceIds: compiled.receipt.evidence.map((item) => item.id),
  });

  if (BRAIN_DEBUG) {
    console.log(
      `\n┌─ [brain] ${principal.name} (${department.id}/${principal.role}) · ${activeProject?.id ?? "company"} · ${provider}/${modelId}`,
    );
    console.log(
      `│  context ${compiled.receipt.runId} · ${compiled.receipt.retrieval.mode} · ${compiled.receipt.retrieval.selectedChunks}/${compiled.receipt.retrieval.searchedChunks} chunks`,
    );
  }

  const result = streamText({
    model: brainModel(provider, modelId, apiKey),
    system: compiled.system,
    messages: await convertToModelMessages(body.messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
    tools,
    stopWhen: stepCountIs(6),
    onStepFinish: BRAIN_DEBUG
      ? (step) => {
          for (const call of step.toolCalls) console.log(`│  proposal · ${call.toolName}(${short(call.input, 200)})`);
          for (const toolResult of step.toolResults) {
            console.log(`│  ↳ ${toolResult.toolName} → ${short(toolResult.output, 300)}`);
          }
          if (step.text?.trim()) console.log(`│  answer · ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: BRAIN_DEBUG
      ? ({ steps, finishReason }) => console.log(`└─ [brain] done · ${steps.length} step(s) · ${finishReason}\n`)
      : undefined,
  });

  const stream = createUIMessageStream<BrainUIMessage>({
    originalMessages: body.messages,
    generateId,
    execute: ({ writer }) => {
      writer.write({
        type: "data-context-receipt",
        id: compiled.receipt.runId,
        data: compiled.receipt,
      });
      writer.merge(
        result.toUIMessageStream<BrainUIMessage>({
          sendSources: false,
          onError: (error) => safeStreamError(provider, error),
        }),
      );
    },
    onFinish: ownedThreadId
      ? async ({ responseMessage }) => {
          try {
            const assistant = responseMessage as unknown as StoredBrainMessage;
            const answer = assistant.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text ?? "")
              .join("")
              .trim();
            if (!answer) return;
            const last = body.messages?.at(-1);
            const userMessage =
              last?.role === "user"
                ? ({ id: generateId(), role: "user", parts: last.parts } as unknown as StoredBrainMessage)
                : null;
            await persistBrainTurn({
              threadId: ownedThreadId,
              model: `${provider}/${modelId}`,
              userMessage,
              assistantMessage: assistant,
            });
          } catch (error) {
            console.error("[brain] persist failed:", error instanceof Error ? error.message : error);
          }
        }
      : undefined,
    onError: (error) => safeStreamError(provider, error),
  });

  return createUIMessageStreamResponse({ stream });
}
