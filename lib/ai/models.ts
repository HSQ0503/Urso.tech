// Model registry for urso.ai. Two tiers: a fast tool-caller for interactive
// chat and a stronger writer for the weekly brief + action generation.
// IDs are env-overridable because Google renames Gemini models every few
// months — swap via env, not a deploy.

import { google } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

// Pin the Anthropic endpoint to the real /v1 host. A stray ANTHROPIC_BASE_URL in
// the environment (e.g. local tooling that sets it without the /v1 path) is read
// by the provider and would 404 every report call. Set AI_ANTHROPIC_BASE_URL to
// override for a real gateway.
const anthropic = createAnthropic({
  baseURL: process.env.AI_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
});

// Chat model selection. The DEFAULT is gemini-2.5-flash — the only model
// verified to actually work in this tool loop. The gemini-3.x flash family
// (3-flash-preview AND 3.5-flash) answers a ping with 200 but is broken here: in
// the tool loop it over-calls and burns the entire step budget WITHOUT ever
// writing an answer (empty reply → the "something went wrong" you saw). So we do
// NOT prefer it, even when it's up. To opt a smarter model in once it behaves
// (e.g. after raising stepCountIs or upgrading @ai-sdk/google), set
// AI_CHAT_MODEL=<model> plus AI_CHAT_FALLBACK_MODEL=gemini-2.5-flash — the
// liveness probe below then serves the fallback whenever the preferred model
// 503s and auto-returns to it on recovery. When PREFERRED===FALLBACK (the
// default) the probe is skipped and we just use it.
const CHAT_PREFERRED = process.env.AI_CHAT_MODEL ?? "gemini-2.5-flash";
const CHAT_FALLBACK = process.env.AI_CHAT_FALLBACK_MODEL ?? "gemini-2.5-flash";
const HEALTHY_TTL_MS = 60_000; // trust a healthy preferred model for a minute
const DOWN_TTL_MS = 5 * 60_000; // stay on the fallback for 5 min after a failure

let chatCache: { model: string; until: number } | null = null;

// One-token liveness check against the Generative Language API. Any non-2xx
// (notably 503 high-demand or 429 quota) counts as unavailable.
async function isModelHealthy(model: string): Promise<boolean> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return false;
  const base = process.env.AI_GOOGLE_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  try {
    const r = await fetch(`${base}/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ok" }] }], generationConfig: { maxOutputTokens: 1 } }),
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false; // timeout / network blip → use the reliable fallback
  }
}

// Resolve the chat model to use right now, honoring a short health cache so the
// probe runs at most once per cache window, never per request.
export async function resolveChatModel() {
  if (CHAT_PREFERRED === CHAT_FALLBACK) return google(CHAT_PREFERRED);
  const now = Date.now();
  if (chatCache && now < chatCache.until) return google(chatCache.model);
  const healthy = await isModelHealthy(CHAT_PREFERRED);
  chatCache = healthy
    ? { model: CHAT_PREFERRED, until: now + HEALTHY_TTL_MS }
    : { model: CHAT_FALLBACK, until: now + DOWN_TTL_MS };
  return google(chatCache.model);
}

// Flip to the fallback immediately — called when a live stream fails on the
// preferred model inside its health window, so the next requests skip it.
export function markChatModelDown() {
  chatCache = { model: CHAT_FALLBACK, until: Date.now() + DOWN_TTL_MS };
}

// The report tier defaults to Opus but the env var can point at either vendor
// (resolved by id prefix) — e.g. AI_REPORT_MODEL=gemini-3.5-flash runs the
// weekly brief on Gemini until an Anthropic key exists.
const reportModelId = () => process.env.AI_REPORT_MODEL ?? "claude-opus-4-8";
export const reportModel = () => (reportModelId().startsWith("gemini") ? google(reportModelId()) : anthropic(reportModelId()));

export function assertChatKey() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set — add it to .env.local (chat runs on Gemini).");
  }
}

export function assertReportKey() {
  const needed = reportModelId().startsWith("gemini") ? "GOOGLE_GENERATIVE_AI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[needed]) {
    throw new Error(`${needed} is not set — add it to .env.local (the weekly brief runs on ${reportModelId()}).`);
  }
}

// The general analyst agent — the owner's open-ended strategist on the AI actions
// page. Defaults to the strongest tier (Opus 4.8) for deeper reasoning than the
// snappy graph chats; Claude is also rock-solid in the tool loop (it always
// finalizes, unlike the gemini-3.x flash family). Override with AI_AGENT_MODEL —
// a gemini-* id routes to Google (faster, cheaper), anything else to Anthropic.
const agentModelId = () => process.env.AI_AGENT_MODEL ?? "claude-opus-4-8";
export const agentModel = () => (agentModelId().startsWith("gemini") ? google(agentModelId()) : anthropic(agentModelId()));

export function assertAgentKey() {
  const needed = agentModelId().startsWith("gemini") ? "GOOGLE_GENERATIVE_AI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[needed]) {
    throw new Error(`${needed} is not set — add it to .env.local (the analyst agent runs on ${agentModelId()}).`);
  }
}
