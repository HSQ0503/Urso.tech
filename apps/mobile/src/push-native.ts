import { Platform } from "react-native";

export type NotificationsModule = typeof import("expo-notifications");

let notificationsPromise: Promise<NotificationsModule> | null = null;
let lifecycleGeneration = 0;
let pendingInvalidationGeneration = -1;
let nativeOperationTail: Promise<void> = Promise.resolve();

export function getNotificationsModule(): Promise<NotificationsModule> {
  notificationsPromise ??= import("expo-notifications");
  return notificationsPromise;
}

export function currentPushLifecycleGeneration(): number {
  return lifecycleGeneration;
}

export function rotatePushLifecycle(): number {
  lifecycleGeneration += 1;
  return lifecycleGeneration;
}

export function recordExpoTokenGeneration(generation: number): boolean {
  if (generation !== lifecycleGeneration) return false;
  if (pendingInvalidationGeneration === generation) pendingInvalidationGeneration = -1;
  return true;
}

export function isStalePushLifecycle(generation: number): boolean {
  return generation !== lifecycleGeneration;
}

export function runSerializedNativePushOperation<T>(operation: () => Promise<T>): Promise<T> {
  const run = nativeOperationTail.catch(() => undefined).then(operation);
  nativeOperationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function cleanupFailedExpoRegistration(generation: number): Promise<void> {
  if (
    generation !== lifecycleGeneration ||
    pendingInvalidationGeneration !== generation
  ) {
    return;
  }
  await cleanupNativePushRegistration({
    invalidateToken: true,
    clearNotifications: false,
  });
}

export async function cleanupNativePushRegistration({
  invalidateToken,
  clearNotifications = true,
}: {
  invalidateToken: boolean;
  clearNotifications?: boolean;
}): Promise<void> {
  if (Platform.OS === "web") return;
  if (invalidateToken) pendingInvalidationGeneration = lifecycleGeneration;

  const performCleanup = async (): Promise<void> => {
    const Notifications = await getNotificationsModule();
    const tasks: Promise<unknown>[] = [
      Notifications.setAutoServerRegistrationEnabledAsync(false),
    ];
    if (invalidateToken) tasks.push(Notifications.unregisterForNotificationsAsync());
    if (clearNotifications) {
      tasks.push(
        Notifications.dismissAllNotificationsAsync(),
        Notifications.setBadgeCountAsync(0),
      );
      Notifications.clearLastNotificationResponse();
    }
    await Promise.allSettled(tasks);
  };

  // Run once now to close delivery immediately, then replay behind every
  // earlier token request. A later login also joins this queue, so a late old
  // request can neither revive logout nor delete the new account's token.
  const immediate = performCleanup().catch(() => undefined);
  const replay = runSerializedNativePushOperation(performCleanup).catch(() => undefined);

  // Native token deletion can wait on FCM/APNs. Authentication must still be
  // able to finish on a half-open mobile connection.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled([immediate, replay]),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 4_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
