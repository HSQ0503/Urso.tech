// BYO-key model routing for Urso Brain. The catalog itself (ids, labels) lives
// in catalog.ts so client components can import it without dragging provider
// SDKs into the bundle; this file is server-only.

import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { BrainProvider } from "./types";

export * from "./catalog";

// Build the AI SDK model for a catalog entry using the org's own key.
export function brainModel(provider: BrainProvider, modelId: string, apiKey: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      // Pin the endpoint like lib/ai/models.ts — a stray ANTHROPIC_BASE_URL 404s.
      return createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "moonshot":
      return createOpenAICompatible({ name: "moonshot", apiKey, baseURL: "https://api.moonshot.ai/v1" })(modelId);
  }
}
