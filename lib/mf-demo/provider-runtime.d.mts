import type { BrainProvider } from "../brain/types";

export type ReadableBrainProviderResolution = {
  provider: BrainProvider | null;
  apiKey: string | null;
  configuredCount: number;
  unreadableProviders: BrainProvider[];
};

export function resolveReadableBrainProvider(input: {
  preferences: readonly BrainProvider[];
  configuredProviders: readonly BrainProvider[];
  readKey: (provider: BrainProvider) => Promise<string | null>;
}): Promise<ReadableBrainProviderResolution>;
