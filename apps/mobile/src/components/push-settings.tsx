import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Device from "expo-device";
import {
  SessionExpiredError,
  pushApi,
  type PushPreferences,
  type PushPreferencesPatch,
  type PushWorkspace,
} from "@/api";
import { LedgerBlock, SectionRule } from "@/components/ledger";
import { usePushNotifications, type PushStatus } from "@/push-notifications";
import { color, font, HIT, radius, space, type } from "@/theme";

type EventPreference = {
  key: string;
  label: string;
  detail: string;
};

const EVENT_PREFERENCES: EventPreference[] = [
  {
    key: "new_lead",
    label: "New leads & missed calls",
    detail: "Someone new needs a response.",
  },
  {
    key: "customer_message",
    label: "Customer texts & reschedules",
    detail: "New messages and appointment changes.",
  },
  {
    key: "lead_uncontacted",
    label: "Uncontacted lead reminders",
    detail: "A new lead is still waiting for outreach.",
  },
  {
    key: "estimate_approved",
    label: "Estimate approvals",
    detail: "A customer accepts an estimate.",
  },
  { key: "deposit_received", label: "Deposits", detail: "A deposit is recorded." },
  { key: "invoice_paid", label: "Paid invoices", detail: "An invoice is paid." },
  {
    key: "payment_issue",
    label: "Payment problems",
    detail: "A payment needs attention.",
  },
  {
    key: "job_changed",
    label: "Job changes & cancellations",
    detail: "Timing, assignment, or status changes.",
  },
  {
    key: "checklist_blocked",
    label: "Blocked checklist steps",
    detail: "A crew member reports a blocker.",
  },
  {
    key: "crew_late",
    label: "Late crew check-ins",
    detail: "A scheduled crew has not checked in.",
  },
  {
    key: "morning_summary",
    label: "Morning run sheet",
    detail: "A quiet overview of the day ahead.",
  },
  {
    key: "daily_followups",
    label: "Overdue & dormant summary",
    detail: "A quiet list of follow-ups to recover.",
  },
  {
    key: "owner_alert",
    label: "Other alerts",
    detail: "Escalations, failed sends, and Square warnings that used to arrive by text.",
  },
];

const CREW_EVENT_KEYS = new Set(["job_changed"]);

function environmentLabel(status: PushStatus): string {
  if (status.environment === "web") return "Web browser";
  if (status.environment === "expo-go") return "Expo Go";
  if (status.environment === "simulator") {
    return Platform.OS === "ios" ? "iOS simulator" : "Android emulator";
  }
  return Device.deviceName ?? Device.modelName ?? "This phone";
}

function deliveryLabel(status: PushStatus): string {
  if (status.permission === "checking") return "Checking…";
  if (status.permission === "unavailable") return "Unavailable";
  if (status.permission === "not-determined") return "Not enabled";
  if (status.permission === "denied") return "Blocked by device settings";
  if (status.registration === "registering") return "Connecting…";
  if (status.registration === "registered") {
    return status.permission === "provisional" ? "Quietly enabled" : "Enabled";
  }
  if (status.registration === "error") return "Needs attention";
  return "Allowed on this device";
}

function fallbackEventPreference(key: string): EventPreference {
  const label = key
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return { key, label: label || key, detail: "Canes activity update." };
}

function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  return normalized > 12 ? `${normalized - 12} PM` : `${normalized} AM`;
}

function visiblePreferences(
  workspace: PushWorkspace,
  eventTypes: Record<string, boolean>,
): EventPreference[] {
  const known = EVENT_PREFERENCES.filter(
    (event) => workspace === "owner" || CREW_EVENT_KEYS.has(event.key),
  );
  if (workspace === "crew") return known;
  const knownKeys = new Set(known.map((event) => event.key));
  const extra = Object.keys(eventTypes)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map(fallbackEventPreference);
  return [...known, ...extra];
}

export function PushNotificationSettings({
  workspace,
}: {
  workspace: PushWorkspace;
}): React.ReactElement {
  const push = usePushNotifications();
  const router = useRouter();
  const refreshPushStatus = push.refresh;
  const loadNumber = useRef(0);
  const saveInFlightRef = useRef(false);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const runNumber = ++loadNumber.current;
    setLoading(true);
    try {
      const result = await pushApi.preferences(workspace);
      if (runNumber !== loadNumber.current) return;
      if (result.ok) {
        setPreferences(result.data);
        setNotice(null);
      } else {
        setNotice(result.notice);
      }
    } catch (error) {
      if (runNumber === loadNumber.current) {
        if (error instanceof SessionExpiredError) router.replace("/login");
        else setNotice("Notification preferences couldn’t be loaded.");
      }
    } finally {
      if (runNumber === loadNumber.current) setLoading(false);
    }
  }, [router, workspace]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([load(), refreshPushStatus()]);
      return () => {
        loadNumber.current += 1;
      };
    }, [load, refreshPushStatus]),
  );

  const save = useCallback(
    async (
      next: PushPreferences,
      patch: PushPreferencesPatch,
      key: string,
    ): Promise<void> => {
      if (saveInFlightRef.current || !preferences) return;
      saveInFlightRef.current = true;
      const previous = preferences;
      setBusyKey(key);
      setPreferences(next);
      setNotice(null);
      try {
        const result = await pushApi.savePreferences(workspace, patch);
        if (result.ok) setPreferences(result.data ?? next);
        else {
          setPreferences(previous);
          setNotice(result.notice);
        }
      } catch (error) {
        setPreferences(previous);
        if (error instanceof SessionExpiredError) router.replace("/login");
        else setNotice("That preference couldn’t be saved. Try again.");
      } finally {
        saveInFlightRef.current = false;
        setBusyKey(null);
      }
    },
    [preferences, router, workspace],
  );

  const handlePermissionAction = useCallback(async (): Promise<void> => {
    if (push.status.permission === "denied" && !push.status.canAskAgain) {
      await push.openSystemSettings();
      return;
    }
    if (
      push.status.permission === "granted" ||
      push.status.permission === "provisional" ||
      push.status.registration === "error"
    ) {
      await push.refresh();
      return;
    }
    await push.enable();
  }, [push]);

  const permissionAction =
    push.status.permission === "denied" && !push.status.canAskAgain
      ? "Open device settings"
      : push.status.permission === "granted" || push.status.permission === "provisional"
        ? push.status.registration === "registered"
          ? "Device settings"
          : "Try again"
        : "Turn on notifications";
  const permissionActionOpensSettings =
    (push.status.permission === "denied" && !push.status.canAskAgain) ||
    ((push.status.permission === "granted" || push.status.permission === "provisional") &&
      push.status.registration === "registered");

  const events = visiblePreferences(workspace, preferences?.eventTypes ?? {});
  const permissionBusy =
    push.status.permission === "checking" || push.status.registration === "registering";
  const permissionUnavailable = push.status.permission === "unavailable";

  return (
    <View style={styles.container}>
      <View>
        <SectionRule label="On this device" />
        <LedgerBlock>
          <View style={styles.deviceRow}>
            <View style={styles.deviceIcon}>
              <Feather name="bell" size={18} color={color.brandDeep} />
            </View>
            <View style={styles.deviceBody}>
              <Text style={styles.deviceTitle}>{deliveryLabel(push.status)}</Text>
              <Text style={styles.deviceMeta}>{environmentLabel(push.status)}</Text>
            </View>
            {permissionBusy ? <ActivityIndicator color={color.brand} /> : null}
          </View>
          {push.status.notice ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.inlineNotice}
            >
              {push.status.notice}
            </Text>
          ) : null}
          {!permissionUnavailable && !permissionBusy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={permissionAction}
              hitSlop={8}
              onPress={() => {
                if (permissionActionOpensSettings) void push.openSystemSettings();
                else void handlePermissionAction();
              }}
              style={({ pressed }) => [
                styles.permissionButton,
                pressed && styles.permissionButtonPressed,
              ]}
            >
              <Text style={styles.permissionButtonText}>{permissionAction}</Text>
            </Pressable>
          ) : null}
        </LedgerBlock>
        <Text style={styles.contextCopy}>
          Permission is only requested after you choose Turn on notifications. Canes never prompts
          on launch.
        </Text>
      </View>

      <View>
        <SectionRule label={workspace === "owner" ? "What you get" : "Job updates"} />
        <LedgerBlock>
          {loading && !preferences ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={color.brand} />
              <Text style={styles.loadingText}>Loading preferences…</Text>
            </View>
          ) : preferences ? (
            <>
              <PreferenceRow
                label="Notifications"
                detail="Pause or resume every Canes alert for your account."
                value={preferences.enabled}
                first
                disabled={busyKey !== null}
                busy={busyKey === "enabled"}
                onChange={(enabled) => {
                  void save({ ...preferences, enabled }, { enabled }, "enabled");
                }}
              />
              {preferences.quietHours ? (
                <PreferenceRow
                  label="Quiet hours"
                  detail={`${formatHour(preferences.quietHours.startHour)}–${formatHour(preferences.quietHours.endHour)} · ${preferences.quietHours.timezone}. Urgent lead, payment, and schedule alerts still break through.`}
                  value={preferences.quietHours.enabled}
                  disabled={!preferences.enabled || busyKey !== null}
                  busy={busyKey === "quiet-hours"}
                  onChange={(enabled) => {
                    void save(
                      {
                        ...preferences,
                        quietHours: { ...preferences.quietHours!, enabled },
                      },
                      { quietHours: { enabled } },
                      "quiet-hours",
                    );
                  }}
                />
              ) : null}
              {events.map((event) => (
                <PreferenceRow
                  key={event.key}
                  label={event.label}
                  detail={event.detail}
                  value={preferences.eventTypes[event.key] ?? false}
                  disabled={!preferences.enabled || busyKey !== null}
                  busy={busyKey === event.key}
                  onChange={(value) => {
                    void save(
                      {
                        ...preferences,
                        eventTypes: { ...preferences.eventTypes, [event.key]: value },
                      },
                      { eventTypes: { [event.key]: value } },
                      event.key,
                    );
                  }}
                />
              ))}
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading notification preferences"
              hitSlop={8}
              onPress={() => void load()}
              style={({ pressed }) => [styles.retryRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.retryText}>Try loading preferences again</Text>
              <Feather name="refresh-cw" size={17} color={color.brandDeep} />
            </Pressable>
          )}
        </LedgerBlock>
        {notice ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PreferenceRow({
  label,
  detail,
  value,
  first,
  disabled,
  busy,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  first?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled: unavailable }}
      disabled={unavailable}
      hitSlop={4}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.preferenceRow,
        !first && styles.divider,
        disabled && styles.disabled,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.preferenceBody}>
        <Text style={styles.preferenceLabel}>{label}</Text>
        <Text style={styles.preferenceDetail}>{detail}</Text>
      </View>
      {busy ? (
        <View style={styles.switchLoading}>
          <ActivityIndicator size="small" color={color.brand} />
        </View>
      ) : (
        <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
          <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg },
  deviceRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  deviceIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: color.brandSoft,
  },
  deviceBody: { flex: 1, minWidth: 0 },
  deviceTitle: { ...type.title, color: color.ink },
  deviceMeta: { ...type.small, color: color.muted, marginTop: 3 },
  inlineNotice: {
    ...type.small,
    color: color.danger,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  permissionButton: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.brandWash,
  },
  permissionButtonPressed: { backgroundColor: color.brandPressed },
  permissionButtonText: { fontFamily: font.bodySemi, fontSize: 14, color: color.brandDeep },
  contextCopy: { ...type.smaller, color: color.muted, marginTop: space.sm, paddingHorizontal: 2 },
  loadingRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  loadingText: { ...type.small, color: color.muted },
  preferenceRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  preferenceBody: { flex: 1, minWidth: 0 },
  preferenceLabel: { ...type.body, fontFamily: font.bodyMedium, color: color.ink },
  preferenceDetail: { ...type.smaller, color: color.muted, marginTop: 3 },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 3,
    backgroundColor: color.lineStrong,
  },
  switchTrackOn: { backgroundColor: color.brandFill },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.surface,
  },
  switchThumbOn: { alignSelf: "flex-end" },
  switchLoading: { width: 46, height: 28, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.46 },
  rowPressed: { backgroundColor: color.hover },
  retryRow: {
    minHeight: HIT + 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
  },
  retryText: { ...type.body, color: color.brandDeep },
  notice: { ...type.small, color: color.danger, marginTop: space.sm, paddingHorizontal: 2 },
});
