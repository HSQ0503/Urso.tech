// Model catalog for Urso Brain — pure data, safe to import from client
// components (no SDK imports; those live in models.ts). The org stores one API
// key per provider; users pick any model here for providers that have a key.
// The chat route rejects anything not in this catalog, so an arbitrary id can
// never reach a provider. Ids verified against provider docs 2026-07-20.

import type { BrainProvider } from "./types";

export type BrainModelInfo = { id: string; label: string; note: string };

export const BRAIN_PROVIDERS: Record<
  BrainProvider,
  { name: string; defaultModel: string; models: BrainModelInfo[] }
> = {
  anthropic: {
    name: "Anthropic",
    defaultModel: "claude-sonnet-5",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Everyday work" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "Deep reasoning" },
      { id: "claude-fable-5", label: "Claude Fable 5", note: "Frontier" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fast + cheap" },
    ],
  },
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-5.6-terra",
    models: [
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Everyday work" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", note: "Flagship" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", note: "Fast + cheap" },
    ],
  },
  google: {
    name: "Google",
    defaultModel: "gemini-3.5-flash",
    models: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Everyday work" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Reliable fallback" },
    ],
  },
  moonshot: {
    name: "Moonshot",
    defaultModel: "kimi-k3",
    models: [
      { id: "kimi-k3", label: "Kimi K3", note: "Flagship" },
      { id: "kimi-k2.6", label: "Kimi K2.6", note: "Lower cost" },
    ],
  },
};

export const BRAIN_PROVIDER_IDS = Object.keys(BRAIN_PROVIDERS) as BrainProvider[];

export function isBrainProvider(v: string): v is BrainProvider {
  // Object.hasOwn, not `in`: `in` walks the prototype chain, so "toString" or
  // "constructor" would pass the guard and crash downstream lookups.
  return Object.hasOwn(BRAIN_PROVIDERS, v);
}

// True only for (provider, model) pairs the catalog lists.
export function isCatalogModel(provider: BrainProvider, modelId: string): boolean {
  return BRAIN_PROVIDERS[provider].models.some((m) => m.id === modelId);
}
