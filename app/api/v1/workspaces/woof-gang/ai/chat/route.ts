import { generateText, stepCountIs } from "ai";
import { stores, parseMonth, parseScope, scopeLabel, monthLabel, type Scope } from "@/components/dashboard/data";
import { getAllAgentActions, getKpiDeltas, getMetrics, getWeeklyBrief } from "@/components/dashboard/data.server";
import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { buildSystemPrompt } from "@/lib/ai/analyst";
import { assertChatKey, markChatModelDown, resolveChatModel } from "@/lib/ai/models";
import { buildAnalystTools } from "@/lib/ai/tools";
import type { SessionUser } from "@/lib/auth";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";

export const maxDuration = 60;

type ChatBody = {
  message?: unknown;
  store?: unknown;
  month?: unknown;
  topic?: unknown;
};

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

function sessionUser(actor: WgMobileActor): SessionUser {
  return {
    ...actor.user,
    role: actor.role,
    clientId: actor.role === "urso_admin" ? "*" : "woof-gang",
    clientName: "Woof Gang Bakery & Grooming",
    storeId: actor.role === "manager" ? actor.storeId : null,
    streak: 0,
    memberSince: "",
  };
}

export const POST = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return apiFail("Send a valid analyst question.", 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2_000) {
    return apiFail("Ask a question between 1 and 2,000 characters.", 400);
  }

  try {
    assertChatKey();
  } catch (error) {
    console.error(`[api/v1/workspaces/woof-gang/ai/chat] ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("The analyst is not configured yet.", 503);
  }

  const requestedStore = typeof body.store === "string" ? parseScope(body.store) : "all";
  const scope: Scope = actor.role === "manager" && actor.storeId ? actor.storeId : requestedStore;
  const cross: Scope = actor.role === "manager" && actor.storeId ? actor.storeId : "all";
  const month = parseMonth(typeof body.month === "string" ? body.month : undefined);
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : undefined;
  const user = sessionUser(actor);

  try {
    const modelPromise = resolveChatModel();
    const [metricsResult, deltasResult, briefResult, actionsResult] = await Promise.allSettled([
      getMetrics(scope, month),
      getKpiDeltas(scope, month),
      getWeeklyBrief(scope),
      getAllAgentActions(),
    ]);

    let seed = "";
    if (metricsResult.status === "fulfilled" && deltasResult.status === "fulfilled") {
      const metrics = metricsResult.value;
      const delta = deltasResult.value.revenue;
      seed =
        `${scopeLabel(scope)} · ${monthLabel(month)}: revenue $${metrics.revenue.toLocaleString()} ` +
        `(grooming $${metrics.grooming.toLocaleString()} / retail $${metrics.retail.toLocaleString()}), ` +
        `${metrics.bookings.toLocaleString()} bookings, avg visit $${metrics.avgTicket.toFixed(0)}, ` +
        `return rate ${pct(metrics.rebook)}, retail attach ${pct(metrics.attach)}.` +
        (delta === null ? "" : ` Vs prior period: revenue ${delta >= 0 ? "+" : ""}${pct(delta)}.`);
    }

    const brief = briefResult.status === "fulfilled"
      ? {
          headline: briefResult.value.headline,
          recommendation: briefResult.value.recommendation,
          opportunityTitle: briefResult.value.opportunity?.title,
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
        .slice(0, 10);
    }

    const result = await generateText({
      model: await modelPromise,
      system: buildSystemPrompt({ user, scope, month, topic }, seed, brief, actions),
      prompt: message,
      tools: buildAnalystTools(scope, cross),
      stopWhen: stepCountIs(6),
      abortSignal: AbortSignal.timeout(55_000),
    });

    const answer = result.text.trim();
    if (!answer) return apiFail("The analyst did not finish that answer. Try again.", 503);
    return apiOk({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/v1/workspaces/woof-gang/ai/chat] ${message}`);
    if (/overloaded|unavailable|503/i.test(message)) markChatModelDown();
    if (/quota|rate.?limit|429|resource_exhausted/i.test(message)) {
      return apiFail("The analyst is rate-limited right now. Try again in a few seconds.", 429);
    }
    return apiFail("The analyst is temporarily unavailable. Try again.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
