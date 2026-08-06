import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { router, useSegments, type Href } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  pushApi,
  SessionExpiredError,
  type PushDeviceRegistration,
  type PushWorkspace,
} from "@/api";
import { clearCanesSessions, getAccessToken, signOut } from "@/auth";
import {
  cleanupFailedExpoRegistration,
  cleanupNativePushRegistration,
  currentPushLifecycleGeneration,
  getNotificationsModule,
  isStalePushLifecycle,
  recordExpoTokenGeneration,
  rotatePushLifecycle,
  runSerializedNativePushOperation,
  type NotificationsModule,
} from "@/push-native";
import { getAdminToken } from "@/session";

type NotificationResponse = import("expo-notifications").NotificationResponse;
type NotificationPermissionsStatus =
  import("expo-notifications").NotificationPermissionsStatus;
type DevicePushToken = import("expo-notifications").DevicePushToken;

export type PushPermission =
  | "checking"
  | "not-determined"
  | "denied"
  | "granted"
  | "provisional"
  | "unavailable";

export type PushRegistration = "idle" | "registering" | "registered" | "error";
export type PushEnvironment = "device" | "simulator" | "expo-go" | "web";

export type PushStatus = {
  permission: PushPermission;
  registration: PushRegistration;
  environment: PushEnvironment;
  canAskAgain: boolean;
  notice: string | null;
};

type NotificationData = {
  workspace: PushWorkspace;
  href: string;
  eventType: string;
  entityId?: string;
};

type PushContextValue = {
  workspace: PushWorkspace | null;
  status: PushStatus;
  enable: () => Promise<boolean>;
  refresh: () => Promise<void>;
  openSystemSettings: () => Promise<void>;
};

const INSTALLATION_ID_KEY = "urso_push_installation_id";
const PROJECT_ID = readProjectId();

const INITIAL_STATUS: PushStatus = {
  permission: "checking",
  registration: "idle",
  environment: pushEnvironment(),
  canAskAgain: false,
  notice: null,
};

const PushContext = createContext<PushContextValue | null>(null);

let installationIdPromise: Promise<string> | null = null;
let cleanupInProgress = false;
let cleanupDepth = 0;
const activeDeviceUpserts = new Set<Promise<unknown>>();
const handledWorkspaceExits = new Set<PushWorkspace>();

function pushEnvironment(): PushEnvironment {
  if (Platform.OS === "web") return "web";
  if (Constants.appOwnership === "expo") return "expo-go";
  return Device.isDevice ? "device" : "simulator";
}

function runtimeSupportsRemotePush(): boolean {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  // Remote notifications are unavailable in Expo Go on Android. A development
  // or release build includes the native project credentials instead.
  return !(Platform.OS === "android" && Constants.appOwnership === "expo");
}

function readProjectId(): string | null {
  const configured = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof configured === "string" && configured.length > 0) return configured;
  const embedded = Constants.easConfig?.projectId;
  return typeof embedded === "string" && embedded.length > 0 ? embedded : null;
}

async function installForegroundHandler(): Promise<void> {
  if (!runtimeSupportsRemotePush()) return;
  const Notifications = await getNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const eventType = notification.request.content.data?.eventType;
      const trigger = notification.request.trigger;
      const channelId =
        trigger && "remoteMessage" in trigger
          ? trigger.remoteMessage?.notification?.channelId ?? null
          : null;
      const quiet =
        notification.request.content.sound === null ||
        channelId === "quiet" ||
        channelId === "summary" ||
        eventType === "morning_summary" ||
        eventType === "daily_followups";
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !quiet,
        shouldSetBadge: true,
      };
    },
  });
}

// Register the foreground policy as soon as the root imports this module. It
// does not inspect or request permission and therefore cannot trigger a prompt.
if (Platform.OS !== "web") void installForegroundHandler().catch(() => undefined);

async function ensureAndroidChannels(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("time-sensitive", {
      name: "Time-sensitive updates",
      description: "Urgent customer, payment, and schedule changes",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#fe5100",
      sound: "default",
      vibrationPattern: [0, 250, 180, 250],
      showBadge: true,
    }),
    Notifications.setNotificationChannelAsync("default", {
      name: "Job and customer updates",
      description: "Routine activity from Canes Pressure Washing",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#fe5100",
      sound: "default",
      showBadge: true,
    }),
    Notifications.setNotificationChannelAsync("summary", {
      name: "Summaries",
      description: "Quiet morning and follow-up summaries",
      importance: Notifications.AndroidImportance.LOW,
      lightColor: "#fe5100",
      sound: null,
      enableVibrate: false,
      showBadge: false,
    }),
    Notifications.setNotificationChannelAsync("quiet", {
      name: "Quiet hours",
      description: "Non-urgent updates delivered without sound or vibration",
      importance: Notifications.AndroidImportance.LOW,
      lightColor: "#fe5100",
      sound: null,
      enableVibrate: false,
      showBadge: false,
    }),
  ]);
}

function permissionState(
  status: NotificationPermissionsStatus,
  Notifications: NotificationsModule,
): PushPermission {
  if (Platform.OS === "ios" && status.ios) {
    if (
      status.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      status.ios.status === Notifications.IosAuthorizationStatus.EPHEMERAL
    ) {
      return "provisional";
    }
    if (status.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED) return "granted";
    if (status.ios.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) {
      return "not-determined";
    }
    return "denied";
  }
  if (status.granted) return "granted";
  return status.status === "undetermined" ? "not-determined" : "denied";
}

function isAllowedPermission(permission: PushPermission): boolean {
  return permission === "granted" || permission === "provisional";
}

async function installationId(create: boolean): Promise<string | null> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing || !create) return existing;

  installationIdPromise ??= (async () => {
    const doubleCheck = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
    if (doubleCheck) return doubleCheck;
    const created = Crypto.randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created);
    return created;
  })();
  try {
    return await installationIdPromise;
  } catch (error) {
    installationIdPromise = null;
    throw error;
  }
}

function registrationMetadata(
  id: string,
  expoPushToken: string,
  workspace: PushWorkspace,
): PushDeviceRegistration {
  const deviceName = compactMetadata(Device.deviceName ?? Device.modelName, 120);
  const appVersion = compactMetadata(
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version,
    40,
  );
  const buildNumber = compactMetadata(Application.nativeBuildVersion, 40);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    installationId: id,
    expoPushToken,
    platform: Platform.OS as "ios" | "android",
    workspace,
    ...(deviceName ? { deviceName } : {}),
    ...(appVersion ? { appVersion } : {}),
    ...(buildNumber ? { buildNumber } : {}),
    ...(timezone ? { timezone } : {}),
  };
}

function compactMetadata(value: string | null | undefined, max: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function workspaceFromSegments(segments: readonly string[]): PushWorkspace | null {
  if (segments.includes("(owner)")) return "owner";
  if (segments.includes("(crew)")) return "crew";
  return null;
}

function notificationData(value: unknown): NotificationData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.workspace !== "owner" && data.workspace !== "crew") return null;
  if (typeof data.href !== "string" || typeof data.eventType !== "string") return null;
  if (data.href.length > 2_048 || !data.eventType.trim() || data.eventType.length > 100) return null;
  if (data.entityId !== undefined && typeof data.entityId !== "string") return null;
  return {
    workspace: data.workspace,
    href: data.href,
    eventType: data.eventType,
    ...(typeof data.entityId === "string" ? { entityId: data.entityId } : {}),
  };
}

const OWNER_ROUTE_ROOTS = new Set([
  "catalog",
  "customer",
  "customers",
  "dashboard",
  "estimate",
  "estimates",
  "expenses",
  "inbox",
  "insights",
  "invoice",
  "invoices",
  "job",
  "jobs",
  "lead",
  "leads",
  "more",
  "payouts",
  "schedule",
  "settings",
  "thread",
]);
const CREW_ROUTE_ROOTS = new Set(["job", "settings"]);

function localNotificationHref(data: NotificationData): Href | null {
  const expectedGroup = data.workspace === "owner" ? "/(owner)" : "/(crew)";
  if (data.href === expectedGroup) return data.href as Href;
  if (
    !data.href.startsWith(`${expectedGroup}/`) ||
    data.href.startsWith("//") ||
    data.href.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(data.href)
  ) {
    return null;
  }

  const path = data.href.split(/[?#]/, 1)[0];
  const rawSegments = path.slice(expectedGroup.length + 1).split("/");
  let decodedSegments: string[];
  try {
    decodedSegments = rawSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (
    decodedSegments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[/\\\u0000-\u001f\u007f]/.test(segment),
    )
  ) {
    return null;
  }

  const allowedRoots = data.workspace === "owner" ? OWNER_ROUTE_ROOTS : CREW_ROUTE_ROOTS;
  if (!decodedSegments[0] || !allowedRoots.has(decodedSegments[0])) return null;
  return data.href as Href;
}

function responseKey(response: NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

function registrationErrorMessage(environment: PushEnvironment): string {
  if (environment === "simulator") {
    return Platform.OS === "ios"
      ? "This simulator couldn’t register. Push needs iOS 16+ with Xcode 14 or later."
      : "This emulator couldn’t register. Use an image with Google Play services.";
  }
  return "Notifications are allowed, but this device couldn’t register. Check the connection and push credentials.";
}

export function PushNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const segments = useSegments();
  const workspace = workspaceFromSegments(segments as readonly string[]);
  const workspaceRef = useRef<PushWorkspace | null>(workspace);
  const pendingResponseRef = useRef<NotificationData | null>(null);
  const handledResponsesRef = useRef(new Set<string>());
  const lastRegistrationRef = useRef<string | null>(null);
  const registrationPromiseRef = useRef<{
    generation: number;
    workspace: PushWorkspace;
    promise: Promise<boolean>;
  } | null>(null);
  const previousWorkspaceRef = useRef<PushWorkspace | null>(workspace);
  const refreshNumberRef = useRef(0);
  const [status, setStatus] = useState<PushStatus>(INITIAL_STATUS);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const register = useCallback(
    async (
      targetWorkspace: PushWorkspace,
      Notifications: NotificationsModule,
      nativeToken?: DevicePushToken,
    ): Promise<boolean> => {
      if (cleanupInProgress) return false;
      const generation = currentPushLifecycleGeneration();
      const existing = registrationPromiseRef.current;
      if (existing?.generation === generation && existing.workspace === targetWorkspace) {
        return existing.promise;
      }
      if (existing?.generation === generation) await existing.promise;
      if (cleanupInProgress || generation !== currentPushLifecycleGeneration()) return false;

      // Route groups are navigation state, not proof of identity. Checking the
      // exact workspace credential first prevents a stale screen from
      // reacquiring a native token after forced logout.
      let credential: string | null;
      try {
        credential =
          targetWorkspace === "owner" ? await getAdminToken() : await getAccessToken();
      } catch {
        return false;
      }
      if (
        !credential ||
        cleanupInProgress ||
        generation !== currentPushLifecycleGeneration()
      ) {
        return false;
      }

      const run = (async () => {
        if (!PROJECT_ID) {
          if (workspaceRef.current === targetWorkspace) {
            setStatus((current) => ({
              ...current,
              registration: "error",
              notice: "This build is missing its Expo project ID.",
            }));
          }
          return false;
        }

        if (workspaceRef.current === targetWorkspace) {
          setStatus((current) => ({ ...current, registration: "registering", notice: null }));
        }

        try {
          await ensureAndroidChannels(Notifications);
          if (cleanupInProgress || generation !== currentPushLifecycleGeneration()) return false;
          const token = await runSerializedNativePushOperation(() =>
            Notifications.getExpoPushTokenAsync({
              projectId: PROJECT_ID,
              ...(nativeToken ? { devicePushToken: nativeToken } : {}),
            }),
          );
          if (cleanupInProgress || isStalePushLifecycle(generation)) return false;

          const dedupeKey = `${generation}:${targetWorkspace}:${token.data}`;
          if (lastRegistrationRef.current !== dedupeKey) {
            const id = await installationId(true);
            if (!id) throw new Error("Installation identifier unavailable");
            if (
              cleanupInProgress ||
              isStalePushLifecycle(generation)
            ) {
              return false;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5_000);
            const upsert = pushApi.registerDevice(
              registrationMetadata(id, token.data, targetWorkspace),
              controller.signal,
            );
            activeDeviceUpserts.add(upsert);
            const result = await upsert.finally(() => {
              clearTimeout(timeout);
              activeDeviceUpserts.delete(upsert);
            });
            if (!result.ok) throw new Error(result.notice);
            if (
              cleanupInProgress ||
              isStalePushLifecycle(generation)
            ) {
              return false;
            }
            lastRegistrationRef.current = dedupeKey;
          }
          if (!recordExpoTokenGeneration(generation)) return false;
          if (workspaceRef.current === targetWorkspace) {
            handledWorkspaceExits.delete(targetWorkspace);
            setStatus((current) => ({
              ...current,
              registration: "registered",
              notice: null,
            }));
          }
          return true;
        } catch (error) {
          await cleanupFailedExpoRegistration(generation);
          if (error instanceof SessionExpiredError) router.replace("/login");
          if (
            generation === currentPushLifecycleGeneration() &&
            !cleanupInProgress &&
            workspaceRef.current === targetWorkspace
          ) {
            setStatus((current) => ({
              ...current,
              registration: "error",
              notice: registrationErrorMessage(current.environment),
            }));
          }
          return false;
        }
      })();

      registrationPromiseRef.current = { generation, workspace: targetWorkspace, promise: run };
      try {
        return await run;
      } finally {
        if (registrationPromiseRef.current?.promise === run) registrationPromiseRef.current = null;
      }
    },
    [],
  );

  const refreshForWorkspace = useCallback(
    async (targetWorkspace: PushWorkspace | null, registerIfGranted: boolean): Promise<void> => {
      const runNumber = ++refreshNumberRef.current;
      const environment = pushEnvironment();
      if (!runtimeSupportsRemotePush()) {
        setStatus({
          permission: "unavailable",
          registration: "idle",
          environment,
          canAskAgain: false,
          notice:
            environment === "web"
              ? "Push notifications are available in the iOS and Android apps."
              : "Remote notifications need an Android development or release build.",
        });
        return;
      }

      try {
        const Notifications = await getNotificationsModule();
        const permissionStatus = await Notifications.getPermissionsAsync();
        if (runNumber !== refreshNumberRef.current) return;
        const permission = permissionState(permissionStatus, Notifications);
        setStatus((current) => ({
          permission,
          registration: isAllowedPermission(permission) ? current.registration : "idle",
          environment,
          canAskAgain: permissionStatus.canAskAgain,
          notice: null,
        }));
        if (registerIfGranted && targetWorkspace && isAllowedPermission(permission)) {
          await register(targetWorkspace, Notifications);
        }
      } catch {
        if (runNumber !== refreshNumberRef.current) return;
        setStatus({
          permission: "unavailable",
          registration: "error",
          environment,
          canAskAgain: false,
          notice: "This build can’t access the notification service.",
        });
      }
    },
    [register],
  );

  const flushPendingResponse = useCallback((activeWorkspace: PushWorkspace | null): void => {
    const data = pendingResponseRef.current;
    if (!data || !activeWorkspace) return;
    pendingResponseRef.current = null;
    void getNotificationsModule()
      .then((Notifications) => Notifications.clearLastNotificationResponse())
      .catch(() => undefined);
    if (data.workspace !== activeWorkspace) return;
    const href = localNotificationHref(data);
    if (href) router.push(href);
  }, []);

  const receiveResponse = useCallback(
    (response: NotificationResponse): void => {
      const key = responseKey(response);
      if (handledResponsesRef.current.has(key)) return;
      handledResponsesRef.current.add(key);
      const data = notificationData(response.notification.request.content.data);
      if (!data) {
        void getNotificationsModule()
          .then((Notifications) => Notifications.clearLastNotificationResponse())
          .catch(() => undefined);
        return;
      }
      pendingResponseRef.current = data;
      flushPendingResponse(workspaceRef.current);
    },
    [flushPendingResponse],
  );

  useEffect(() => {
    if (!runtimeSupportsRemotePush()) return;
    let live = true;
    let responseSubscription: { remove: () => void } | null = null;
    let tokenSubscription: { remove: () => void } | null = null;

    void getNotificationsModule()
      .then(async (Notifications) => {
        if (!live) return;
        await installForegroundHandler();
        if (!live) return;

        responseSubscription = Notifications.addNotificationResponseReceivedListener(receiveResponse);
        tokenSubscription = Notifications.addPushTokenListener((nativeToken) => {
          const activeWorkspace = workspaceRef.current;
          if (activeWorkspace && !cleanupInProgress) {
            void register(activeWorkspace, Notifications, nativeToken);
          }
        });

        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse) receiveResponse(lastResponse);
      })
      .catch(() => undefined);

    return () => {
      live = false;
      responseSubscription?.remove();
      tokenSubscription?.remove();
    };
  }, [receiveResponse, register]);

  useEffect(() => {
    let live = true;
    const previousWorkspace = previousWorkspaceRef.current;
    previousWorkspaceRef.current = workspace;
    flushPendingResponse(workspace);
    const workspaceChanged = Boolean(previousWorkspace && previousWorkspace !== workspace);
    const exitWasHandled = workspaceChanged && previousWorkspace
      ? handledWorkspaceExits.delete(previousWorkspace)
      : false;

    if (!workspace) {
      lastRegistrationRef.current = null;
    }

    void (async () => {
      if (workspaceChanged && !exitWasHandled) {
        await invalidatePushAfterWorkspaceExit();
      }
      if (live && workspace) await refreshForWorkspace(workspace, true);
    })();

    return () => {
      live = false;
    };
  }, [flushPendingResponse, refreshForWorkspace, workspace]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshForWorkspace(workspaceRef.current, true);
      }
    });
    return () => subscription.remove();
  }, [refreshForWorkspace]);

  const enable = useCallback(async (): Promise<boolean> => {
    const targetWorkspace = workspaceRef.current;
    if (!targetWorkspace || !runtimeSupportsRemotePush()) return false;
    const environment = pushEnvironment();
    setStatus((current) => ({ ...current, permission: "checking", notice: null }));
    try {
      const Notifications = await getNotificationsModule();
      // Android 13 will not present the contextual permission prompt until a
      // channel exists, so channels are created inside this explicit action.
      await ensureAndroidChannels(Notifications);
      const permissionStatus = await Notifications.requestPermissionsAsync(
        Platform.OS === "ios"
          ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
          : undefined,
      );
      const permission = permissionState(permissionStatus, Notifications);
      setStatus((current) => ({
        ...current,
        permission,
        environment,
        canAskAgain: permissionStatus.canAskAgain,
        registration: isAllowedPermission(permission) ? "registering" : "idle",
        notice: isAllowedPermission(permission)
          ? null
          : "Notifications are still off for this device.",
      }));
      return isAllowedPermission(permission)
        ? await register(targetWorkspace, Notifications)
        : false;
    } catch {
      setStatus((current) => ({
        ...current,
        permission: "unavailable",
        registration: "error",
        environment,
        notice: "This device couldn’t open notification permission settings.",
      }));
      return false;
    }
  }, [register]);

  const refresh = useCallback(
    () => refreshForWorkspace(workspaceRef.current, true),
    [refreshForWorkspace],
  );

  const openSystemSettings = useCallback(async (): Promise<void> => {
    if (Platform.OS === "web") return;
    await Linking.openSettings();
  }, []);

  const value = useMemo<PushContextValue>(
    () => ({ workspace, status, enable, refresh, openSystemSettings }),
    [enable, openSystemSettings, refresh, status, workspace],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushNotifications(): PushContextValue {
  const value = useContext(PushContext);
  if (!value) throw new Error("usePushNotifications must be used inside PushNotificationsProvider");
  return value;
}

function beginPushCleanup(): number {
  cleanupDepth += 1;
  cleanupInProgress = true;
  return rotatePushLifecycle();
}

function finishPushCleanup(): void {
  cleanupDepth = Math.max(0, cleanupDepth - 1);
  cleanupInProgress = cleanupDepth > 0;
}

async function unregisterServerRows(
  workspaces: readonly PushWorkspace[],
  clearOnUnauthorized: boolean,
): Promise<boolean> {
  // A registration already posting must settle before DELETE, or a late
  // upsert can silently re-enable the device after logout. Each upsert has a
  // five-second abort ceiling, so a lost connection cannot trap sign-out.
  await Promise.allSettled([...activeDeviceUpserts]);
  const id = await installationId(false).catch(() => null);
  if (!id) return false;

  const deleted = await Promise.all(
    workspaces.map(async (workspace) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const result = await pushApi.unregisterDevice(id, workspace, {
          signal: controller.signal,
          clearOnUnauthorized,
        });
        return result.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  return deleted.every(Boolean);
}

async function cleanupPushRegistration(
  workspaces: readonly PushWorkspace[],
  clearOnUnauthorized: boolean,
): Promise<void> {
  await unregisterServerRows(workspaces, clearOnUnauthorized);
  // Disabling the row cannot recall a notification already accepted by Expo,
  // APNs, or FCM. Invalidating the native token prevents queued private alerts
  // from arriving after this account leaves the device.
  await cleanupNativePushRegistration({ invalidateToken: true });
  for (const workspace of workspaces) handledWorkspaceExits.add(workspace);
}

async function invalidatePushAfterWorkspaceExit(): Promise<void> {
  beginPushCleanup();
  try {
    await cleanupNativePushRegistration({ invalidateToken: true });
  } finally {
    finishPushCleanup();
  }
}

export async function invalidateCanesPushAfterSessionSelection(): Promise<void> {
  await invalidatePushAfterWorkspaceExit();
}

export async function signOutWithPushCleanup(workspace: PushWorkspace): Promise<void> {
  beginPushCleanup();
  try {
    await cleanupPushRegistration([workspace], true);
  } finally {
    try {
      await signOut();
    } finally {
      finishPushCleanup();
    }
  }
}

export async function clearCanesSessionsWithPushCleanup(): Promise<void> {
  beginPushCleanup();
  try {
    await cleanupPushRegistration(["owner", "crew"], false);
  } finally {
    try {
      await clearCanesSessions();
    } finally {
      finishPushCleanup();
    }
  }
}
