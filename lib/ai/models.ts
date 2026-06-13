// Model registry for urso.ai. Two tiers: a fast tool-caller for interactive
// chat and a stronger writer for the weekly brief + action generation.
// IDs are env-overridable because Google renames Gemini models every few
// months — swap via env, not a deploy.

import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

export const chatModel = () => google(process.env.AI_CHAT_MODEL ?? "gemini-3.5-flash");

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
