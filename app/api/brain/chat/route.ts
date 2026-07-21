// Urso Brain chat endpoint. Assembles the identity-aware context (who the user
// is, their department's standing rules, the active project, the vault manifest),
// routes to the org's BYO key for the picked provider/model, and persists turns.
// Mirrors /api/ai/agent's hardening: server-generated message ids, complete-turn
// persistence only, ignoreIncompleteToolCalls on hydration.

import { streamText, convertToModelMessages, stepCountIs, generateId, type UIMessage } from "ai";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getAlwaysOnDocs, getDepartments, getDocManifest, getOrgKey, getProfile, getProjects } from "@/lib/brain/db";
import { buildBrainSystemPrompt } from "@/lib/brain/context";
import { buildBrainTools } from "@/lib/brain/tools";
import { brainModel, isBrainProvider, isCatalogModel, BRAIN_PROVIDERS } from "@/lib/brain/models";
import { getOwnedBrainThread, persistBrainTurn, type StoredBrainMessage } from "@/lib/brain/threads";

export const maxDuration = 120;

const BRAIN_DEBUG = process.env.AI_CHAT_DEBUG === "1" || process.env.NODE_ENV !== "production";
const short = (v: unknown, n = 300) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    messages: UIMessage[];
    threadId?: string;
    projectId?: string;
    provider?: string;
    model?: string;
  };

  const provider = body.provider ?? "";
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });
  const modelId = body.model ?? BRAIN_PROVIDERS[provider].defaultModel;
  if (!isCatalogModel(provider, modelId)) return Response.json({ error: "model not in catalog" }, { status: 400 });

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  const profile = await getProfile(admin, user.id);
  if (!profile) return Response.json({ error: "profile-required" }, { status: 403 });

  let apiKey: string | null = null;
  try {
    apiKey = await getOrgKey(admin, provider);
  } catch (e) {
    // BRAIN_KEYS_SECRET missing or rotated — log the real cause, but never leak
    // a raw crypto error ("Unsupported state…") to every employee's chat box.
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[brain] org-key read failed:", raw);
    const friendly = raw.includes("BRAIN_KEYS_SECRET")
      ? raw
      : "The org key store can't be read (BRAIN_KEYS_SECRET changed?) — an admin should re-save the keys in Brain settings.";
    return Response.json({ error: friendly }, { status: 503 });
  }
  if (!apiKey) {
    return Response.json(
      { error: `No ${BRAIN_PROVIDERS[provider].name} key is configured — an admin can add one in Brain settings.` },
      { status: 503 },
    );
  }

  const [departments, projects, alwaysOn, manifest] = await Promise.all([
    getDepartments(admin),
    getProjects(admin),
    getAlwaysOnDocs(admin, profile.department_id),
    getDocManifest(admin),
  ]);

  const department = departments.find((d) => d.id === profile.department_id) ?? {
    id: profile.department_id,
    name: profile.department_id,
    blurb: "",
  };
  const activeProject = projects.find((p) => p.id === body.projectId) ?? null;

  // Persist only to a thread the caller actually owns — never trust the id blindly.
  const ownedThreadId = body.threadId ? (await getOwnedBrainThread(admin, user.id, body.threadId))?.id ?? null : null;

  if (BRAIN_DEBUG) console.log(`\n┌─ [brain] ${profile.name} (${department.id}) · ${activeProject?.id ?? "no project"} · ${provider}/${modelId}`);

  const tools = buildBrainTools({ email: user.email });

  const result = streamText({
    model: brainModel(provider, modelId, apiKey),
    system: buildBrainSystemPrompt({ profile, department, departments, projects, activeProject, core: alwaysOn.core, rules: alwaysOn.rules, manifest }),
    messages: await convertToModelMessages(body.messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish: BRAIN_DEBUG
      ? (step) => {
          for (const c of step.toolCalls) console.log(`│  🔧 ${c.toolName}(${short(c.input, 200)})`);
          for (const r of step.toolResults) console.log(`│  ↳  ${r.toolName} → ${short(r.output, 300)}`);
          if (step.text?.trim()) console.log(`│  💬 ${short(step.text, 500)}`);
        }
      : undefined,
    onFinish: BRAIN_DEBUG ? ({ steps, finishReason }) => console.log(`└─ [brain] done · ${steps.length} step(s) · ${finishReason}\n`) : undefined,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    generateMessageId: generateId,
    onFinish: ownedThreadId
      ? async ({ responseMessage }) => {
          try {
            const assistant = responseMessage as unknown as StoredBrainMessage;
            // Only persist a COMPLETE turn — an aborted/step-capped turn would
            // store a dangling tool-call that 400s every future send.
            const answer = assistant.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("").trim();
            if (!answer) return;
            const last = body.messages.at(-1);
            // Server-generated user-message id — never trust the client id
            // (global PK; a crafted id could overwrite another user's row).
            const userMessage =
              last && last.role === "user" ? ({ id: generateId(), role: "user", parts: last.parts } as StoredBrainMessage) : null;
            await persistBrainTurn({ threadId: ownedThreadId, model: `${provider}/${modelId}`, userMessage, assistantMessage: assistant });
          } catch (e) {
            console.error("[brain] persist failed:", e instanceof Error ? e.message : e);
          }
        }
      : undefined,
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[brain] stream error:", msg);
      if (/401|403|invalid.*key|unauthorized|authentication/i.test(msg))
        return `The ${BRAIN_PROVIDERS[provider].name} key was rejected — an admin should re-check it in Brain settings.`;
      if (/overloaded|unavailable|503/i.test(msg)) return "That model is briefly overloaded — try again, or switch models.";
      if (/quota|rate.?limit|429|resource_exhausted|insufficient/i.test(msg))
        return "The org key hit its rate/credit limit — give it a moment or switch providers.";
      return "Something went wrong generating that answer — try again.";
    },
  });
}
