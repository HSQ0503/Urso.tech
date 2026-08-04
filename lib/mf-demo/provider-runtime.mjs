/**
 * Selects the first configured provider whose encrypted key can actually be
 * read. A stale row must not prevent a later healthy provider from serving the
 * MF demo.
 */
export async function resolveReadableBrainProvider({
  preferences,
  configuredProviders,
  readKey,
}) {
  const configured = new Set(configuredProviders);
  const unreadableProviders = [];

  for (const provider of preferences) {
    if (!configured.has(provider)) continue;
    try {
      const apiKey = await readKey(provider);
      if (typeof apiKey === "string" && apiKey.trim()) {
        return {
          provider,
          apiKey: apiKey.trim(),
          configuredCount: configured.size,
          unreadableProviders,
        };
      }
    } catch {
      unreadableProviders.push(provider);
    }
  }

  return {
    provider: null,
    apiKey: null,
    configuredCount: configured.size,
    unreadableProviders,
  };
}
