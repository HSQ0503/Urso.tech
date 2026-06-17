// urso.ai general analyst endpoint — the owner's open-ended strategy console on
// the AI actions page. Same scope-locked tool belt as the graph chat (/api/ai/chat)
// but a stronger model (Opus 4.8 by default), a strategist system prompt, a bigger
// reasoning budget, and richer pre-loaded context (full brief + action pipeline).
// Auth + scope come from the session; managers stay locked to their store.

import { streamText, convertToModelMessages, stepCountIs, generateId, type UIMessage } from "ai";
import { getSession, resolveScope } from "@/lib/auth";
import { getMetrics, getKpiDeltas, getWeeklyBrief, getAllAgentActions } from "@/components/dashboard/data.server";
import { buildAgentSystemPrompt } from "@/lib/ai/analyst";
import { buildAnalystTools } from "@/lib/ai/tools";
import { agentModel, assertAgentKey } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalystMemory, getOwnedThread, persistTurn, type StoredMessage } from "@/lib/ai/memory";
import { stores, scopeLabel, monthLabel, type MonthValue, type Scope } from "@/components/dashboard/data";

// Opus + a multi-tool analysis can run longer than a quick chat answer.
export const maxDuration = 120;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const AGENT_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";
const short = (v: unknown, n = 300) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    assertAgentKey();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const body = (await req.json()) as { messages: UIMessage[]; store?: string; month?: string; threadId?: string };

  const scope = resolveScope(user, body.store);
  const cross: Scope = user.role === "manager" && user.storeId ? user.storeId : "all";
  const month = (body.month && /^(all|\d{4}|\d{4}-\d{2})$/.test(body.month) ? body.month : "all") as MonthValue;

  const admin = createAdminClient();
  // Persist only to a thread the caller actually owns — never trust the id blindly.
  const ownedThreadId = body.threadId ? (await getOwnedThread(admin, user.id, body.threadId))?.id ?? null : null;

  // Pre-load the analyst's opening picture in parallel, best-effort: scope seed,
  // the full weekly brief, the action pipeline, and the user's rolling memory —
  // so it starts already informed and remembers prior conversations.
  const [mRes, dRes, briefRes, actionsRes, memRes] = await Promise.allSettled([
    getMetrics(scope, month),
    getKpiDeltas(scope, month),
    getWeeklyBrief(scope),
    getAllAgentActions(),
    getAnalystMemory(admin, user.id),
  ]);
  const memory = memRes.status === "fulfilled" ? memRes.value : "";

  let seed = "";
  if (mRes.status === "fulfilled" && dRes.status === "fulfilled") {
    const m = mRes.value;
    const deltas = dRes.value;
    seed =
      `${scopeLabel(scope)} · ${monthLabel(month)}: revenue $${m.revenue.toLocaleString()} ` +
      `(grooming $${m.grooming.toLocaleString()} / retail $${m.retail.toLocaleString()}), ` +
      `${m.bookings.toLocaleString()} bookings, avg visit $${m.avgTicket}, return rate ${pct(m.rebook)}, retail attach ${pct(m.attach)}.` +
      (deltas.revenue != null ? ` Vs prior period: revenue ${deltas.revenue >= 0 ? "+" : ""}${pct(deltas.revenue)}.` : "");
  }

  const brief =
    briefRes.status === "fulfilled"
      ? {
          headline: briefRes.value.headline,
          wins: briefRes.value.wins,
          risks: briefRes.value.risks,
          opportunity: briefRes.value.opportunity,
          recommendation: briefRes.value.recommendation,
        }
      : null;

  let actions: { title: string; agent: string; store: string; status: string }[] = [];
  if (actionsRes.status === "fulfilled") {
    const allowed = new Set<string>(["All stores"]);
    if (scope === "all") stores.forEach((s) => allowed.add(s.name));
    else {
      const s = stores.find((st) => st.id === scope);
      if (s) allowed.add(s.name);
    }
    actions = actionsRes.value
      .filter((a) => allowed.has(a.store))
      .map((a) => ({ title: a.title, agent: a.agent, store: a.store, status: a.status }))
      .slice(0, 12);
  }

  if (AGENT_DEBUG) console.log(`\n┌─ [ai/agent] ${user.name} (${user.role}) · ${scopeLabel(scope)} · ${monthLabel(month)}`);

  const result = streamText({
    model: agentModel(),
    system: buildAgentSystemPrompt({ user, scope, month }, seed, brief, actions, memory),
    messages: await convertToModelMessages(body.messages),
    tools: buildAnalystTools(scope, cross),
    stopWhen: stepCountIs(8),
    onStepFinish: AGENT_DEBUG
      ? (step) => {
          for (const c of step.toolCalls) console.log(`│  🔧 ${c.toolName}(${short(c.input, 200)})`);
          for (const r of step.toolResults) console.log(`│  ↳  ${r.toolName} → ${short(r.output, 300)}`);
          if (step.text?.trim()) console.log(`│  💬 ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: AGENT_DEBUG ? ({ steps, finishReason }) => console.log(`└─ [ai/agent] done · ${steps.length} step(s) · ${finishReason}\n`) : undefined,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    generateMessageId: generateId,
    // Persist this turn once the answer is complete — best-effort, never blocks
    // or breaks the response. Only writes to a thread the user owns.
    onFinish: ownedThreadId
      ? async ({ responseMessage }) => {
          try {
            const last = body.messages.at(-1);
            const userMessage =
              last && last.role === "user" ? ({ id: last.id, role: "user", parts: last.parts } as StoredMessage) : null;
            await persistTurn({
              userId: user.id,
              clientId: user.clientId,
              threadId: ownedThreadId,
              userMessage,
              assistantMessage: responseMessage as unknown as StoredMessage,
            });
          } catch (e) {
            console.error("[ai/agent] persist failed:", e instanceof Error ? e.message : e);
          }
        }
      : undefined,
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ai/agent] stream error:", msg);
      if (/overloaded|unavailable|503/i.test(msg)) return "The analyst is briefly overloaded — try that again in a moment.";
      if (/quota|rate.?limit|429|resource_exhausted/i.test(msg)) return "The analyst is rate-limited right now — give it a few seconds and retry.";
      return "Something went wrong generating that answer — try again.";
    },
  });
}
