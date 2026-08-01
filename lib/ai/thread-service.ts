import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedThread, type StoredMessage } from "@/lib/ai/memory";
import type { SessionUser } from "@/lib/auth";

export type AnalystThreadSummary = {
  id: string;
  title: string;
  updated_at: string;
};

export async function listAnalystThreads(user: SessionUser): Promise<AnalystThreadSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("analyst_threads")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AnalystThreadSummary[];
}

export async function createAnalystThread(user: SessionUser, scope: string): Promise<AnalystThreadSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("analyst_threads")
    .insert({ user_id: user.id, client_id: user.clientId, scope })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  return data as AnalystThreadSummary;
}

export async function getAnalystThreadMessages(user: SessionUser, threadId: string): Promise<StoredMessage[] | null> {
  const admin = createAdminClient();
  if (!(await getOwnedThread(admin, user.id, threadId))) return null;
  const { data, error } = await admin
    .from("analyst_messages")
    .select("id, role, parts")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StoredMessage[];
}

export async function renameAnalystThread(user: SessionUser, threadId: string, title: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!(await getOwnedThread(admin, user.id, threadId))) return null;
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) throw new Error("title required");
  const { error } = await admin.from("analyst_threads").update({ title: trimmed }).eq("id", threadId);
  if (error) throw error;
  return trimmed;
}

export async function deleteAnalystThread(user: SessionUser, threadId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!(await getOwnedThread(admin, user.id, threadId))) return false;
  const { error } = await admin.from("analyst_threads").delete().eq("id", threadId);
  if (error) throw error;
  return true;
}
