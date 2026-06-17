// Memory layer for the urso.ai strategy console. Two jobs:
//   1. Persist conversation turns to Supabase so threads survive reloads.
//   2. Maintain ONE rolling, distilled memory per user — durable facts the owner
//      has shared (goals, decisions, planned closures, recurring concerns) — that
//      is injected into every NEW conversation so the analyst has continuity
//      across separate threads. Numbers are NEVER stored here (they go stale and
//      are always re-fetched live by the tools); this is qualitative context only.
//
// Everything runs through the service-role admin client; the calling route has
// already authenticated the user and passes a verified user_id.

import { createAdminClient } from "@/lib/supabase/admin";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

type Admin = ReturnType<typeof createAdminClient>;
type UIPart = { type: string; text?: string };
export type StoredMessage = { id: string; role: "user" | "assistant"; parts: UIPart[] };

const MEMORY_MODEL = process.env.AI_MEMORY_MODEL ?? "gemini-2.5-flash";
const DISTILL_EVERY = 6; // refresh the rolling memory every N persisted messages
const RECENT_LIMIT = 40; // how many recent turns to fold in when distilling

const textOf = (parts: UIPart[]): string =>
  parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ").replace(/\s+/g, " ").trim();

// The rolling cross-thread memory for a user (empty string if none yet).
export async function getAnalystMemory(supabase: Admin, userId: string): Promise<string> {
  const { data } = await supabase.from("analyst_memory").select("summary").eq("user_id", userId).maybeSingle();
  return ((data?.summary as string | undefined) ?? "").trim();
}

// Confirm a thread belongs to the user before we read or write it.
export async function getOwnedThread(
  supabase: Admin,
  userId: string,
  threadId: string,
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabase.from("analyst_threads").select("id, user_id, title").eq("id", threadId).maybeSingle();
  if (!data || (data as { user_id: string }).user_id !== userId) return null;
  return { id: (data as { id: string }).id, title: (data as { title: string }).title };
}

// Persist the two new turns (the user message just sent + the assistant reply),
// bump the thread, auto-title a fresh thread from its first message, and refresh
// the rolling memory on cadence. Best-effort: callers wrap this so a failure
// never breaks the chat response.
export async function persistTurn(opts: {
  userId: string;
  clientId: string;
  threadId: string;
  userMessage: StoredMessage | null;
  assistantMessage: StoredMessage;
}): Promise<void> {
  const supabase = createAdminClient();
  const { userId, clientId, threadId, userMessage, assistantMessage } = opts;

  // Stamp distinct created_at so the user turn always sorts before its answer.
  // A single multi-row insert would give both rows the same now() (transaction
  // timestamp), leaving intra-turn order undefined on hydration.
  const base = Date.now();
  const rows = [
    ...(userMessage ? [{ id: userMessage.id, thread_id: threadId, role: "user", parts: userMessage.parts, created_at: new Date(base).toISOString() }] : []),
    { id: assistantMessage.id, thread_id: threadId, role: "assistant", parts: assistantMessage.parts, created_at: new Date(base + 1).toISOString() },
  ];
  await supabase.from("analyst_messages").upsert(rows, { onConflict: "id" });
  await supabase.from("analyst_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

  // Auto-title a still-default thread from its first user message.
  if (userMessage) {
    const { data: t } = await supabase.from("analyst_threads").select("title").eq("id", threadId).maybeSingle();
    if ((t as { title?: string } | null)?.title === "New conversation") {
      const title = textOf(userMessage.parts).slice(0, 60);
      if (title) await supabase.from("analyst_threads").update({ title }).eq("id", threadId);
    }
  }

  const { count } = await supabase
    .from("analyst_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if (count && count % DISTILL_EVERY === 0) {
    await distillMemory(supabase, userId, clientId).catch((e) =>
      console.warn(`[memory] distill failed: ${e instanceof Error ? e.message : e}`),
    );
  }
}

const MEMORY_SYSTEM = `You maintain a compact, durable memory of the OWNER of a multi-store pet-grooming business and how they like to work with their data analyst.

Keep ONLY things that stay true across conversations and would help the analyst be more useful next time:
- Stated goals and priorities (e.g. "wants to grow retail attach", "focused on retention this quarter").
- Decisions and plans they've mentioned (e.g. "closing the Lakeside store in July", "hiring a second groomer at Windermere").
- Preferences for how the analyst should respond (level of detail, which stores/metrics they care about, tone).
- Recurring concerns or context about the business, staff, or customers they've shared.

NEVER store specific metric values, dollar amounts, dates of "this week", or any number — those go stale and are always re-fetched live. Store the durable intent, not the figure.

Return the FULL updated memory as a short list of plain bullet lines (max ~12 bullets, no headers, no preamble). Merge new information into the existing memory, drop anything that's been superseded, and keep it tight. If there is nothing worth remembering, return an empty string.`;

// Fold the user's recent turns (across all their threads) plus the existing
// memory into an updated rolling summary. Uses a cheap model — this is
// summarization, not analysis.
async function distillMemory(supabase: Admin, userId: string, clientId: string): Promise<void> {
  // Distillation only ever runs on the Google model — skip fast if its key is
  // absent (e.g. the agent is on Anthropic) instead of making a doomed call.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return;

  const { data: threads } = await supabase.from("analyst_threads").select("id").eq("user_id", userId);
  const ids = ((threads ?? []) as { id: string }[]).map((t) => t.id);
  if (!ids.length) return;

  const [{ data: msgs }, prev] = await Promise.all([
    supabase
      .from("analyst_messages")
      .select("role, parts, created_at")
      .in("thread_id", ids)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    getAnalystMemory(supabase, userId),
  ]);

  const transcript = ((msgs ?? []) as { role: string; parts: UIPart[] }[])
    .reverse()
    .map((m) => `${m.role}: ${textOf(m.parts)}`)
    .filter((l) => l.length > l.indexOf(":") + 2)
    .join("\n");
  if (!transcript) return;

  const { text } = await generateText({
    model: google(MEMORY_MODEL),
    system: MEMORY_SYSTEM,
    prompt: `Existing memory:\n${prev || "(none yet)"}\n\nRecent conversation turns (oldest first):\n${transcript}\n\nReturn the updated memory.`,
    // This runs inside the chat's onFinish (which keeps the serverless function
    // alive); bound it so a slow distill can't eat the route's whole budget.
    abortSignal: AbortSignal.timeout(20_000),
  });

  await supabase
    .from("analyst_memory")
    .upsert({ user_id: userId, client_id: clientId, summary: text.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}
