// urso.ai chat endpoint. Auth + scope come from the session (managers are
// pinned to their store before any tool exists); the card the user opened
// from arrives as topicId so the first answer needs no tool round-trip.

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { getSession, resolveScope } from "@/lib/auth";
import { getMetrics, getKpiDeltas } from "@/components/dashboard/data.server";
import { buildSystemPrompt } from "@/lib/ai/analyst";
import { buildAnalystTools } from "@/lib/ai/tools";
import { chatModel, assertChatKey } from "@/lib/ai/models";
import { scopeLabel, monthLabel, type MonthValue } from "@/components/dashboard/data";

export const maxDuration = 60;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

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
  };

  const scope = resolveScope(user, body.store);
  const month = (body.month && /^(all|\d{4}|\d{4}-\d{2})$/.test(body.month) ? body.month : "all") as MonthValue;

  // Seed: the headline numbers for the user's current filter, so "what am I
  // looking at" answers stream instantly instead of waiting on a tool loop.
  let seed = "";
  try {
    const [m, deltas] = await Promise.all([getMetrics(scope, month), getKpiDeltas(scope, month)]);
    seed =
      `${scopeLabel(scope)} · ${monthLabel(month)}: revenue $${m.revenue.toLocaleString()} ` +
      `(grooming $${m.grooming.toLocaleString()} / retail $${m.retail.toLocaleString()}), ` +
      `${m.bookings.toLocaleString()} bookings, avg visit $${m.avgTicket}, return rate ${pct(m.rebook)}, retail attach ${pct(m.attach)}.` +
      (deltas.revenue != null ? ` Vs prior period: revenue ${deltas.revenue >= 0 ? "+" : ""}${pct(deltas.revenue)}.` : "");
  } catch {
    // Seed is best-effort — the model can recover everything via tools.
  }

  const result = streamText({
    model: chatModel(),
    system: buildSystemPrompt(
      { user, scope, month, topic: body.topic, topicId: body.topicId, pending: body.pending },
      seed,
    ),
    messages: await convertToModelMessages(body.messages),
    tools: buildAnalystTools(scope),
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
