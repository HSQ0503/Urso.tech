import * as SecureStore from "expo-secure-store";

// SecureStore values are limited on some native targets. Supabase sessions can
// be larger than that limit, so keep the chunk protocol local to each client.
const CHUNK_LIMIT = 1_800;
const CHUNK_MARKER = "__urso_chunks__:";

export type SecureStoreAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function createNamespacedSecureStore(namespace: string): SecureStoreAdapter {
  function keyFor(key: string): string {
    return `${namespace}_${key}`;
  }

  async function removeItem(key: string): Promise<void> {
    const base = keyFor(key);
    const head = await SecureStore.getItemAsync(base);
    if (head?.startsWith(CHUNK_MARKER)) {
      const count = Number(head.slice(CHUNK_MARKER.length));
      if (Number.isSafeInteger(count) && count > 0) {
        await Promise.all(
          Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${base}_${index}`)),
        );
      }
    }
    await SecureStore.deleteItemAsync(base);
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const base = keyFor(key);
      const head = await SecureStore.getItemAsync(base);
      if (head === null) return null;
      if (!head.startsWith(CHUNK_MARKER)) return head;

      const count = Number(head.slice(CHUNK_MARKER.length));
      if (!Number.isSafeInteger(count) || count <= 0) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${base}_${index}`)),
      );
      return parts.every((part): part is string => part !== null) ? parts.join("") : null;
    },

    async setItem(key: string, value: string): Promise<void> {
      const base = keyFor(key);
      await removeItem(key);
      if (value.length <= CHUNK_LIMIT) {
        await SecureStore.setItemAsync(base, value);
        return;
      }

      const parts = Array.from(
        { length: Math.ceil(value.length / CHUNK_LIMIT) },
        (_, index) => value.slice(index * CHUNK_LIMIT, (index + 1) * CHUNK_LIMIT),
      );
      await Promise.all(parts.map((part, index) => SecureStore.setItemAsync(`${base}_${index}`, part)));
      await SecureStore.setItemAsync(base, `${CHUNK_MARKER}${parts.length}`);
    },

    removeItem,
  };
}
