import "server-only";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessBrainProject,
  getAuthorizedProjects,
} from "./authorization";
import { compileBrainContext } from "./context-compiler";
import { getDepartments, getOrgKey } from "./db";
import { buildBrainTools } from "./tools";
import { brainModel, BRAIN_PROVIDERS } from "./models";
import { getOwnedBrainThread, persistBrainTurn, type StoredBrainMessage } from "./threads";
import type { BrainPrincipal, BrainProvider, BrainUIData } from "./types";

type BrainUIMessage = UIMessage<unknown, BrainUIData>;

export type BrainChatRequestBody = {
  messages: BrainUIMessage[];
  threadId?: string;
  projectId?: string;
  provider: BrainProvider;
  model: string;
};

const BRAIN_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";

const short = (value: unknown, max = 300): string => {
  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  return stringValue && stringValue.length > max
    ? `${stringValue.slice(0, max)}…`
    : (stringValue ?? "");
};

function safeStreamError(provider: BrainProvider, error: unknown): string {
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

export async function createBrainChatResponse(input: {
  admin: SupabaseClient;
  principal: BrainPrincipal;
  body: BrainChatRequestBody;
  forcedProjectId?: string;
  responseLanguage?: "en" | "pt";
}) {
  const { admin, principal, body } = input;
  let apiKey: string | null = null;
  try {
    apiKey = await getOrgKey(admin, body.provider, principal.organizationId);
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
      {
        error: `No ${BRAIN_PROVIDERS[body.provider].name} key is configured for this Brain organization.`,
      },
      { status: 503 },
    );
  }

  const [departments, projects] = await Promise.all([
    getDepartments(admin, principal.organizationId),
    getAuthorizedProjects(admin, principal),
  ]);
  const department = departments.find((item) => item.id === principal.departmentId);
  if (!department) return Response.json({ error: "membership department is invalid" }, { status: 403 });

  const ownedThread = body.threadId
    ? await getOwnedBrainThread(admin, principal.userId, body.threadId, principal.organizationId)
    : null;
  if (body.threadId && !ownedThread) {
    return Response.json({ error: "conversation not found" }, { status: 404 });
  }

  const requestedProjectId = input.forcedProjectId ?? body.projectId?.trim() ?? null;
  const requestedProjectIdProvided = input.forcedProjectId !== undefined || body.projectId !== undefined;
  const threadProjectId = ownedThread?.project_id ?? null;
  if (ownedThread && requestedProjectIdProvided && requestedProjectId !== threadProjectId) {
    return Response.json(
      { error: "Project scope is fixed for this conversation. Start a new conversation to change it." },
      { status: 409 },
    );
  }
  const effectiveProjectId = ownedThread ? threadProjectId : requestedProjectId;
  if (
    effectiveProjectId &&
    !(await canAccessBrainProject(admin, principal, effectiveProjectId).catch(() => false))
  ) {
    return Response.json({ error: "project access required" }, { status: 403 });
  }
  const activeProject = projects.find((item) => item.id === effectiveProjectId) ?? null;
  if (effectiveProjectId && !activeProject) {
    return Response.json({ error: "project access required" }, { status: 403 });
  }

  let embeddingKey: string | null = body.provider === "openai" ? apiKey : null;
  if (!embeddingKey) {
    try {
      embeddingKey = await getOrgKey(admin, "openai", principal.organizationId);
    } catch {
      // The authorized lexical path remains valid without an embedding key.
    }
  }

  let compiled: Awaited<ReturnType<typeof compileBrainContext>>;
  try {
    compiled = await compileBrainContext({
      admin,
      principal,
      department,
      activeProject,
      messages: body.messages,
      threadId: ownedThread?.id ?? null,
      embeddingKey,
    });
  } catch (error) {
    console.error("[brain] context compilation failed:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "The Brain could not create a durable Context Receipt. No answer was generated." },
      { status: 503 },
    );
  }

  const tools = buildBrainTools({
    admin,
    principal,
    authorizedDocs: compiled.authorizedDocs,
    contextEvidence: compiled.receipt.evidence,
    projectId: activeProject?.id ?? null,
  });
  const localeInstruction = input.responseLanguage === "pt"
    ? "\n\nRespond in clear Brazilian Portuguese unless the employee explicitly asks for another language. Preserve source titles and E# citations exactly."
    : input.responseLanguage === "en"
      ? "\n\nRespond in clear English unless the employee explicitly asks for another language. Preserve source titles and E# citations exactly."
      : "";

  if (BRAIN_DEBUG) {
    console.log(
      `\n┌─ [brain] ${principal.name} (${department.id}/${principal.role}) · ${activeProject?.id ?? "company"} · ${body.provider}/${body.model}`,
    );
    console.log(
      `│  context ${compiled.receipt.runId} · ${compiled.receipt.retrieval.mode} · ${compiled.receipt.retrieval.selectedChunks}/${compiled.receipt.retrieval.searchedChunks} chunks`,
    );
  }

  const result = streamText({
    model: brainModel(body.provider, body.model, apiKey),
    system: `${compiled.system}${localeInstruction}`,
    messages: await convertToModelMessages(body.messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
    tools,
    stopWhen: stepCountIs(6),
    onStepFinish: BRAIN_DEBUG
      ? (step) => {
          for (const call of step.toolCalls) {
            console.log(`│  proposal · ${call.toolName}(${short(call.input, 200)})`);
          }
          for (const toolResult of step.toolResults) {
            console.log(`│  ↳ ${toolResult.toolName} → ${short(toolResult.output, 300)}`);
          }
          if (step.text?.trim()) console.log(`│  answer · ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: BRAIN_DEBUG
      ? ({ steps, finishReason }) =>
          console.log(`└─ [brain] done · ${steps.length} step(s) · ${finishReason}\n`)
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
          onError: (error) => safeStreamError(body.provider, error),
        }),
      );
    },
    onFinish: ownedThread?.id
      ? async ({ responseMessage }) => {
          try {
            const assistant = responseMessage as unknown as StoredBrainMessage;
            const answer = assistant.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text ?? "")
              .join("")
              .trim();
            if (!answer) return;
            const last = body.messages.at(-1);
            const userMessage = last?.role === "user"
              ? ({ id: generateId(), role: "user", parts: last.parts } as unknown as StoredBrainMessage)
              : null;
            await persistBrainTurn({
              threadId: ownedThread.id,
              model: `${body.provider}/${body.model}`,
              userMessage,
              assistantMessage: assistant,
            });
          } catch (error) {
            console.error("[brain] persist failed:", error instanceof Error ? error.message : error);
          }
        }
      : undefined,
    onError: (error) => safeStreamError(body.provider, error),
  });

  return createUIMessageStreamResponse({ stream });
}
