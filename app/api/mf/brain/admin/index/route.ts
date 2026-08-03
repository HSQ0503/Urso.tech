import { getOrgKey } from "@/lib/brain/db";
import { indexBrainDocuments } from "@/lib/brain/retrieval";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { MF_BRAIN_ORGANIZATION_ID } from "@/lib/mf-demo/brain-config";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return json({ error: "unauthorized" }, 401);

  const admin = ursoDbSafe();
  if (!admin) return json({ error: URSO_DB_MISSING }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    force?: boolean;
    embeddings?: boolean;
  };
  const useEmbeddings = body.embeddings !== false;
  let openAiKey: string | null = null;

  if (useEmbeddings) {
    try {
      openAiKey = await getOrgKey(admin, "openai", MF_BRAIN_ORGANIZATION_ID);
    } catch {
      return json({ error: "The MF demo OpenAI key could not be read." }, 503);
    }
    if (!openAiKey) {
      return json(
        { error: "The MF demo tenant has no OpenAI key. Send embeddings:false for lexical indexing." },
        409,
      );
    }
  }

  try {
    const result = await indexBrainDocuments({
      admin,
      organizationId: MF_BRAIN_ORGANIZATION_ID,
      openAiKey,
      force: body.force === true,
    });
    return json({ ok: true, ...result, mode: openAiKey ? "hybrid" : "lexical" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
