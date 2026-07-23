// Thread persistence for Urso Brain — the analyst-console pattern (lib/ai/memory.ts)
// without the distilled-memory layer. Ownership is enforced here in code; the
// brain_* tables are RLS-on / no-policies / service-role-only.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ursoDb } from "@/lib/brain/supabase";
import { DEFAULT_BRAIN_ORGANIZATION_ID } from "@/lib/brain/types";

type Admin = SupabaseClient;
type UIPart = { type: string; text?: string };
export type StoredBrainMessage = { id: string; role: "user" | "assistant"; parts: UIPart[] };

const textOf = (parts: UIPart[]): string =>
  parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ").replace(/\s+/g, " ").trim();

// Confirm a thread belongs to the user before we read or write it.
export async function getOwnedBrainThread(
  admin: Admin,
  userId: string,
  threadId: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<{ id: string; title: string; project_id: string | null } | null> {
  const { data } = await admin
    .from("brain_threads")
    .select("id, user_id, title, project_id")
    .eq("organization_id", organizationId)
    .eq("id", threadId)
    .maybeSingle();
  if (!data || (data as { user_id: string }).user_id !== userId) return null;
  const t = data as { id: string; title: string; project_id: string | null };
  return { id: t.id, title: t.title, project_id: t.project_id };
}

// Persist the two new turns, bump the thread (+ record the model used), and
// auto-title a fresh thread from its first user message. Best-effort: callers
// wrap this so a failure never breaks the chat response.
export async function persistBrainTurn(opts: {
  threadId: string;
  model: string;
  userMessage: StoredBrainMessage | null;
  assistantMessage: StoredBrainMessage;
}): Promise<void> {
  const admin = ursoDb();
  const { threadId, model, userMessage, assistantMessage } = opts;

  // Distinct created_at stamps keep intra-turn order deterministic on hydration
  // (a multi-row insert would share one transaction timestamp).
  const base = Date.now();
  const rows = [
    ...(userMessage
      ? [{ id: userMessage.id, thread_id: threadId, role: "user", parts: userMessage.parts, created_at: new Date(base).toISOString() }]
      : []),
    { id: assistantMessage.id, thread_id: threadId, role: "assistant", parts: assistantMessage.parts, created_at: new Date(base + 1).toISOString() },
  ];
  await admin.from("brain_messages").upsert(rows, { onConflict: "id" });
  await admin.from("brain_threads").update({ updated_at: new Date().toISOString(), model }).eq("id", threadId);

  if (userMessage) {
    const { data: t } = await admin.from("brain_threads").select("title").eq("id", threadId).maybeSingle();
    if ((t as { title?: string } | null)?.title === "New conversation") {
      const title = textOf(userMessage.parts).slice(0, 60);
      if (title) await admin.from("brain_threads").update({ title }).eq("id", threadId);
    }
  }
}
