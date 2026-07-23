import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, auditBrainEvent, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { getOrgKey } from "@/lib/brain/db";
import { indexBrainDocuments } from "@/lib/brain/retrieval";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal || !canEditBrainTruth(principal)) {
    return Response.json({ error: "knowledge steward access required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean; embeddings?: boolean };
  const useEmbeddings = body.embeddings !== false;
  let openAiKey: string | null = null;
  if (useEmbeddings) {
    try {
      openAiKey = await getOrgKey(admin, "openai", principal.organizationId);
    } catch {
      return Response.json({ error: "The OpenAI org key could not be read." }, { status: 503 });
    }
    if (!openAiKey) {
      return Response.json({ error: "Add an OpenAI org key, or send {\"embeddings\":false} for lexical-only indexing." }, { status: 409 });
    }
  }

  try {
    const result = await indexBrainDocuments({
      admin,
      organizationId: principal.organizationId,
      openAiKey,
      force: body.force === true,
    });
    await auditBrainEvent(admin, principal, "knowledge.indexed", "organization", principal.organizationId, result);
    return Response.json({ ok: true, ...result, mode: openAiKey ? "hybrid" : "lexical" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
