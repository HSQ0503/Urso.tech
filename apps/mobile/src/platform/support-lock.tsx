import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { color } from "@/theme";

const SUPPORT_UNLOCK_TTL_MS = 5 * 60 * 1000;

let unlockedUntil = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isSupportModeUnlocked(): boolean {
  return Date.now() < unlockedUntil;
}

export function markSupportModeUnlocked(): void {
  unlockedUntil = Date.now() + SUPPORT_UNLOCK_TTL_MS;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    unlockedUntil = 0;
    expiryTimer = null;
    notify();
  }, SUPPORT_UNLOCK_TTL_MS);
  notify();
}

export function lockSupportMode(): void {
  unlockedUntil = 0;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function SupportGate({
  required,
  children,
}: {
  required: boolean;
  children: ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(isSupportModeUnlocked);

  useEffect(() => subscribe(() => setUnlocked(isSupportModeUnlocked())), []);

  useEffect(() => {
    if (!required) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") lockSupportMode();
    });
    return () => subscription.remove();
  }, [required]);

  useEffect(() => {
    if (required && !unlocked) router.replace("/(admin)");
  }, [required, router, unlocked]);

  if (required && !unlocked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }

  return <>{children}</>;
}
