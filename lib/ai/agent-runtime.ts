import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  getAllAgentActions,
  getKpiDeltas,
  getMetrics,
  getWeeklyBrief,
} from "@/components/dashboard/data.server";
import {
  monthLabel,
  scopeLabel,
  stores,
  type MonthValue,
  type Scope,
} from "@/components/dashboard/data";
import { buildAgentSystemPrompt } from "@/lib/ai/analyst";
import { resolveWgBrainContext } from "@/lib/ai/brain-bridge";
import { getAnalystMemory, getOwnedThread, persistTurn, type StoredMessage } from "@/lib/ai/memory";
import { agentModel, assertAgentKey } from "@/lib/ai/models";
import { buildAnalystTools } from "@/lib/ai/tools";
import { resolveScope, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AnalystAgentBody = {
  messages: UIMessage[];
  store?: string;
  month?: string;
  threadId?: string;
};

type ResponseMode = "ui" | "text";

const AGENT_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";
const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const short = (value: unknown, length = 300) => {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized && serialized.length > length ? `${serialized.slice(0, length)}…` : (serialized ?? "");
};

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/overloaded|unavailable|503/i.test(message)) return "The analyst is briefly overloaded — try that again in a moment.";
  if (/quota|rate.?limit|429|resource_exhausted/i.test(message)) return "The analyst is rate-limited right now — give it a few seconds and retry.";
  return "Something went wrong generating that answer — try again.";
}

function userTurn(messages: UIMessage[]): StoredMessage | null {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return null;
  return { id: generateId(), role: "user", parts: last.parts } as unknown as StoredMessage;
}

export function parseAnalystAgentBody(value: unknown): AnalystAgentBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.messages)) return null;
  return {
    messages: body.messages as UIMessage[],
    store: typeof body.store === "string" ? body.store : undefined,
    month: typeof body.month === "string" ? body.month : undefined,
    threadId: typeof body.threadId === "string" ? body.threadId : undefined,
  };
}

export async function createAnalystAgentResponse(
  user: SessionUser,
  body: AnalystAgentBody,
  mode: ResponseMode,
  signal?: AbortSignal,
): Promise<Response> {
  assertAgentKey();
  const scope = resolveScope(user, body.store);
  const cross: Scope = user.role === "manager" && user.storeId ? user.storeId : "all";
  const month = (body.month && /^(all|\d{4}|\d{4}-\d{2})$/.test(body.month) ? body.month : "all") as MonthValue;
  const admin = createAdminClient();
  const ownedThreadId = body.threadId ? (await getOwnedThread(admin, user.id, body.threadId))?.id ?? null : null;

  const [metricsResult, deltasResult, briefResult, actionsResult, memoryResult, bridgeResult] = await Promise.allSettled([
    getMetrics(scope, month),
    getKpiDeltas(scope, month),
    getWeeklyBrief(scope),
    getAllAgentActions(),
    getAnalystMemory(admin, user.id),
    resolveWgBrainContext(user),
  ]);
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value : "";
  const bridge = bridgeResult.status === "fulfilled" ? bridgeResult.value : null;

  let seed = "";
  if (metricsResult.status === "fulfilled" && deltasResult.status === "fulfilled") {
    const metrics = metricsResult.value;
    const deltas = deltasResult.value;
    seed =
      `${scopeLabel(scope)} · ${monthLabel(month)}: revenue $${metrics.revenue.toLocaleString()} ` +
      `(grooming $${metrics.grooming.toLocaleString()} / retail $${metrics.retail.toLocaleString()}), ` +
      `${metrics.bookings.toLocaleString()} bookings, avg visit $${metrics.avgTicket}, return rate ${pct(metrics.rebook)}, retail attach ${pct(metrics.attach)}.` +
      (deltas.revenue != null ? ` Vs prior period: revenue ${deltas.revenue >= 0 ? "+" : ""}${pct(deltas.revenue)}.` : "");
  }

  const brief = briefResult.status === "fulfilled"
    ? {
        headline: briefResult.value.headline,
        wins: briefResult.value.wins,
        risks: briefResult.value.risks,
        opportunity: briefResult.value.opportunity,
        recommendation: briefResult.value.recommendation,
      }
    : null;

  let actions: { title: string; agent: string; store: string; status: string }[] = [];
  if (actionsResult.status === "fulfilled") {
    const allowed = new Set<string>(["All stores"]);
    if (scope === "all") stores.forEach((store) => allowed.add(store.name));
    else {
      const store = stores.find((item) => item.id === scope);
      if (store) allowed.add(store.name);
    }
    actions = actionsResult.value
      .filter((action) => allowed.has(action.store))
      .map((action) => ({ title: action.title, agent: action.agent, store: action.store, status: action.status }))
      .slice(0, 12);
  }

  if (AGENT_DEBUG) {
    console.log(
      `\n┌─ [ai/agent] ${user.name} (${user.role}) · ${scopeLabel(scope)} · ${monthLabel(month)}` +
      (bridge ? ` · brain:${bridge.liveSections ? "live" : "snapshot"}` : "") +
      ` · client=${mode}`,
    );
  }

  const tools: ToolSet = {
    ...buildAnalystTools(scope, cross, { tier: "full", liveSections: bridge?.liveSections }),
    ...(bridge ? bridge.proposalTools : {}),
  };

  const result = streamText({
    model: agentModel(),
    system: buildAgentSystemPrompt(
      { user, scope, month },
      seed,
      brief,
      actions,
      memory,
      bridge ? { live: bridge.liveSections !== undefined, corpusPaths: bridge.corpusPaths } : undefined,
    ),
    messages: await convertToModelMessages(body.messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(8),
    abortSignal: signal,
    onStepFinish: AGENT_DEBUG
      ? (step) => {
          for (const call of step.toolCalls) console.log(`│  🔧 ${call.toolName}(${short(call.input, 200)})`);
          for (const toolResult of step.toolResults) console.log(`│  ↳  ${toolResult.toolName} → ${short(toolResult.output, 300)}`);
          if (step.text?.trim()) console.log(`│  💬 ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: async ({ text, steps, finishReason }) => {
      if (AGENT_DEBUG) console.log(`└─ [ai/agent] done · ${steps.length} step(s) · ${finishReason}\n`);
      if (mode !== "text" || !ownedThreadId || !text.trim() || signal?.aborted) return;
      try {
        await persistTurn({
          userId: user.id,
          clientId: user.clientId,
          threadId: ownedThreadId,
          userMessage: userTurn(body.messages),
          assistantMessage: { id: generateId(), role: "assistant", parts: [{ type: "text", text: text.trim() }] },
        });
      } catch (error) {
        console.error("[ai/agent] mobile persist failed:", error instanceof Error ? error.message : error);
      }
    },
    onError: ({ error }) => console.error("[ai/agent] stream error:", error instanceof Error ? error.message : String(error)),
  });

  if (mode === "text") {
    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Urso-Api-Version": "1",
      },
    });
  }

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    generateMessageId: generateId,
    onFinish: ownedThreadId
      ? async ({ responseMessage }) => {
          try {
            const assistant = responseMessage as unknown as StoredMessage;
            const answer = assistant.parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim();
            if (!answer) return;
            await persistTurn({
              userId: user.id,
              clientId: user.clientId,
              threadId: ownedThreadId,
              userMessage: userTurn(body.messages),
              assistantMessage: assistant,
            });
          } catch (error) {
            console.error("[ai/agent] persist failed:", error instanceof Error ? error.message : error);
          }
        }
      : undefined,
    onError: errorText,
  });
}
