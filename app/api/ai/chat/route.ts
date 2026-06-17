// urso.ai chat endpoint. Auth + scope come from the session (managers are
// pinned to their store before any tool exists); the card the user opened
// from arrives as topicId so the first answer needs no tool round-trip.

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { getSession, resolveScope } from "@/lib/auth";
import { getMetrics, getKpiDeltas, getWeeklyBrief, getAllAgentActions } from "@/components/dashboard/data.server";
import { buildSystemPrompt } from "@/lib/ai/analyst";
import { buildAnalystTools } from "@/lib/ai/tools";
import { resolveChatModel, markChatModelDown, assertChatKey } from "@/lib/ai/models";
import { stores, scopeLabel, monthLabel, type MonthValue, type Scope } from "@/components/dashboard/data";

export const maxDuration = 60;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

// Dev trace of the analyst's tool calls, results and answers, printed to the
// server (npm run dev) terminal so you can watch its reasoning. On by default in
// dev; opt in for a production build with AI_CHAT_DEBUG=1.
const CHAT_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";
const short = (v: unknown, n = 300) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    assertChatKey();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const body = (await req.json()) as {
    messages: UIMessage[];
    topic?: string;
    topicId?: string;
    store?: string;
    month?: string;
    pending?: boolean;
    comparison?: { aLabel: string; aStart: string; aEnd: string; bLabel: string; bStart: string; bEnd: string; metric: string };
  };

  const scope = resolveScope(user, body.store);
  // `scope` is what they're viewing (drives the seed/brief/actions + prompt default).
  // `cross` lets an owner's comparison tools span all stores so they can ask
  // cross-store questions without clearing the filter; managers stay locked.
  const cross: Scope = user.role === "manager" && user.storeId ? user.storeId : "all";
  const month = (body.month && /^(all|\d{4}|\d{4}-\d{2})$/.test(body.month) ? body.month : "all") as MonthValue;

  // Resolve the chat model up front (health-checked, may fall back to a GA model
  // if the preferred one is down) — kicked off here so its probe runs concurrently
  // with the data reads and adds no latency on the hot path.
  const modelPromise = resolveChatModel();

  // Pre-load everything the prompt wants, in parallel and best-effort: the
  // headline numbers (seed), this week's brief, and the action center for this
  // scope — so the chat is brief- and action-aware with no tool round-trip.
  const [mRes, dRes, briefRes, actionsRes] = await Promise.allSettled([
    getMetrics(scope, month),
    getKpiDeltas(scope, month),
    getWeeklyBrief(scope),
    getAllAgentActions(),
  ]);

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
      ? { headline: briefRes.value.headline, recommendation: briefRes.value.recommendation, opportunityTitle: briefRes.value.opportunity?.title }
      : null;

  // Only the actions this scope may see (managers are store-locked) — mirrors
  // the list_actions tool's label filter.
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
      .slice(0, 10);
  }

  const model = await modelPromise;
  if (CHAT_DEBUG) {
    const last = body.messages.at(-1);
    const q = (last?.parts ?? []).map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join(" ").trim();
    console.log(`\n┌─ [ai/chat] ${user.name} (${user.role}) · ${scopeLabel(scope)} · ${monthLabel(month)} · model=${model.modelId}`);
    if (q) console.log(`│  Q: ${short(q, 200)}`);
  }

  const result = streamText({
    model,
    system: buildSystemPrompt(
      { user, scope, month, topic: body.topic, topicId: body.topicId, pending: body.pending, comparison: body.comparison },
      seed,
      brief,
      actions,
    ),
    messages: await convertToModelMessages(body.messages),
    tools: buildAnalystTools(scope, cross),
    stopWhen: stepCountIs(6),
    onStepFinish: CHAT_DEBUG
      ? (step) => {
          if (step.reasoningText?.trim()) console.log(`│  🧠 ${short(step.reasoningText, 400)}`);
          for (const c of step.toolCalls) console.log(`│  🔧 ${c.toolName}(${short(c.input, 200)})`);
          for (const r of step.toolResults) console.log(`│  ↳  ${r.toolName} → ${short(r.output, 300)}`);
          if (step.text?.trim()) console.log(`│  💬 ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: CHAT_DEBUG
      ? ({ steps, finishReason }) => console.log(`└─ [ai/chat] done · ${steps.length} step(s) · ${finishReason}\n`)
      : undefined,
  });

  // Surface the real failure instead of masking it: log it server-side, and
  // return a useful client message. On a model-overload error, flip to the
  // fallback model so the next requests don't hit the down model.
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ai/chat] stream error:", msg);
      if (/overloaded|unavailable|503/i.test(msg)) {
        markChatModelDown();
        return "The AI model is briefly busy — try that again in a moment.";
      }
      if (/quota|rate.?limit|429|resource_exhausted/i.test(msg)) {
        return "The AI is rate-limited right now — give it a few seconds and retry.";
      }
      return "Something went wrong generating that answer — try again.";
    },
  });
}
