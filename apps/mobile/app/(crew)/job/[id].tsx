// The technician job sheet — a port of the web crew screen
// (app/CanesPressure/crew/(portal)/jobs/[id]/job-controls.tsx), not a redesign.
// The rules travel with it: a job can only be completed when every required item
// is done and nothing is blocked, terminal jobs lose their controls entirely, and
// a refusal from the server is shown in the server's own words.
//
// Every time on this screen is America/New_York via fmtEt/fmtEtTimeRange. The
// device clock is never consulted — a crew in a different timezone reading a
// local-time arrival window is how a truck shows up three hours late.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtEt,
  fmtEtTimeRange,
  fmtPhone,
  JOB_STATUS_LABEL,
  type JobStatus,
  type TechnicianJob,
  type TechnicianJobItem,
} from "@urso/types";
import { api, SessionExpiredError, type ApiResult } from "@/api";
import { color, font, HIT, radius, space, type } from "@/theme";

// Mirrors the web TERMINAL list — these statuses mean the work is off the
// technician's hands, so check-in and complete disappear rather than fail.
const TERMINAL: JobStatus[] = ["completed", "invoiced", "paid", "canceled"];

// Runs a mutation and resolves the refusal notice, or null when it went through.
type Run = (action: () => Promise<ApiResult<unknown>>) => Promise<string | null>;

// A 401 anywhere means the Supabase session is gone; the api layer has already
// cleared it, so the only thing left is to get out of the authenticated stack.
async function guard<T>(action: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      router.replace("/login");
      return { ok: false, notice: "Sign in again." };
    }
    return { ok: false, notice: "That didn't go through — try again." };
  }
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} hr ${rest} min` : `${rest} min`;
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ChecklistRow({
  item,
  busy,
  run,
}: {
  item: TechnicianJobItem;
  busy: boolean;
  run: Run;
}) {
  const saved = item.technicianNote ?? "";
  const [draft, setDraft] = useState(saved);
  const [notice, setNotice] = useState<string | null>(null);

  const act = (action: () => Promise<ApiResult<unknown>>) => {
    setNotice(null);
    void run(action).then(setNotice);
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: busy }}
        accessibilityLabel={item.name}
        disabled={busy}
        onPress={() => act(() => api.setItemDone(item.id, !item.done))}
        style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.box,
            item.done && styles.boxDone,
            item.blocked && styles.boxBlocked,
          ]}
        >
          <Text
            style={[
              styles.boxMark,
              item.blocked && styles.boxMarkBlocked,
            ]}
          >
            {item.blocked ? "!" : item.done ? "✓" : ""}
          </Text>
        </View>
        <View style={styles.itemBody}>
          <Text style={[styles.itemName, item.blocked && styles.dangerInk]}>{item.name}</Text>
          {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
          <Text style={item.required ? styles.itemRequired : styles.itemOptional}>
            {item.required ? "Required" : "Optional"}
          </Text>
        </View>
      </Pressable>

      <View style={styles.itemFoot}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => act(() => api.setItemBlocked(item.id, !item.blocked))}
          style={({ pressed }) => [
            styles.button,
            item.blocked && styles.buttonDanger,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, item.blocked && styles.dangerInk]}>
            {item.blocked ? "Clear issue" : "Blocked"}
          </Text>
        </Pressable>

        <Text style={styles.label}>Technician note</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          multiline
          maxLength={1000}
          placeholder="Add a site note or explain an issue…"
          placeholderTextColor={color.faint}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || draft === saved}
          onPress={() => act(() => api.setItemNote(item.id, draft))}
          style={({ pressed }) => [
            styles.button,
            (busy || draft === saved) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.buttonText}>Save note</Text>
        </Pressable>
        <Notice text={notice} />
      </View>
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [job, setJob] = useState<TechnicianJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const res = await guard(() => api.job(id));
    if (res.ok) {
      setJob(res.data);
      setLoadNotice(null);
    } else {
      setLoadNotice(res.notice);
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void load().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  // Server truth wins: after a mutation lands the job is re-fetched rather than
  // patched locally, so the screen can never disagree with the office.
  const run = useCallback<Run>(
    async (action) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      try {
        const res = await guard(action);
        if (!res.ok) return res.notice;
        const fresh = await guard(() => api.job(id));
        if (!fresh.ok) return fresh.notice;
        setJob(fresh.data);
        return null;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [id],
  );

  const act = (action: () => Promise<ApiResult<unknown>>) => {
    setActionNotice(null);
    void run(action).then(setActionNotice);
  };

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setActionNotice("This phone couldn't open that."));
  };

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.chromeName} numberOfLines={1}>
        {job?.customerName ?? "Job"}
      </Text>
      <Text style={styles.chromeStatus}>
        {job ? JOB_STATUS_LABEL[job.status] : ""}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.centre}>
          <Notice text={loadNotice ?? "That job isn't available."} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.button, styles.wide, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Back to my week</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const required = job.items.filter((item) => item.required);
  const doneRequired = required.filter((item) => item.done).length;
  const canComplete = required.every((item) => item.done && !item.blocked);
  const terminal = TERMINAL.includes(job.status);
  const mapsUrl = job.jobAddress
    ? `http://maps.apple.com/?daddr=${encodeURIComponent(job.jobAddress)}`
    : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />
        }
      >
        <Text style={styles.jobName}>{job.jobName ?? "Scheduled service"}</Text>

        <Section label="When">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Text style={styles.big}>
                {job.scheduledAt ? fmtEtTimeRange(job.scheduledAt, job.endsAt) : "Schedule pending"}
              </Text>
              {job.scheduledAt ? (
                <Text style={styles.body}>
                  {fmtEt(job.scheduledAt, { weekday: "long", month: "long", day: "numeric" })}
                </Text>
              ) : null}
              {job.arrivalWindowMinutes > 0 ? (
                <Text style={styles.muted}>
                  Arrival window: {job.arrivalWindowMinutes} minutes.
                </Text>
              ) : null}
              <Text style={styles.muted}>
                {formatMinutes(job.durationMinutes)} scheduled ·{" "}
                {formatMinutes(job.minutesWorked)} tracked
              </Text>
            </View>
          </View>
        </Section>

        <Section label="Where">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Text style={styles.body}>{job.jobAddress ?? "Address pending"}</Text>
            </View>
            {mapsUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Navigate to the job address"
                onPress={() => open(mapsUrl)}
                style={({ pressed }) => [styles.navigate, pressed && styles.primaryPressed]}
              >
                <Text style={styles.navigateText}>Navigate</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        {job.gateCode || job.siteNotes ? (
          <Section label="Site details">
            <View style={styles.card}>
              {job.gateCode ? (
                <View style={styles.pad}>
                  <Text style={styles.label}>Gate or access code</Text>
                  <Text style={styles.gate}>{job.gateCode}</Text>
                </View>
              ) : null}
              {job.siteNotes ? (
                <View style={[styles.pad, job.gateCode ? styles.divided : null]}>
                  <Text style={styles.label}>Site notes</Text>
                  <Text style={styles.body}>{job.siteNotes}</Text>
                </View>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* The server strips customerPhone when the technician has no `calls`
            permission — a null phone means "not allowed", so the whole section
            goes rather than rendering a dead button. */}
        {job.customerPhone ? (
          <Section label="Contact">
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.label}>{job.customerName ?? "Customer"}</Text>
                <Text style={styles.big}>{fmtPhone(job.customerPhone)}</Text>
              </View>
              <View style={[styles.pad, styles.divided]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => open(`tel:${job.customerPhone}`)}
                  style={({ pressed }) => [styles.button, styles.wide, pressed && styles.pressed]}
                >
                  <Text style={styles.buttonText}>Call</Text>
                </Pressable>
              </View>
            </View>
          </Section>
        ) : null}

        <Section label="Checklist" meta={`${doneRequired}/${required.length} complete`}>
          {job.items.length ? (
            job.items.map((item) => (
              <ChecklistRow key={item.id} item={item} busy={busy} run={run} />
            ))
          ) : (
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.muted}>No checklist items were added to this job.</Text>
              </View>
            </View>
          )}
        </Section>

        {!terminal ? (
          <Section label="Actions">
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.body}>
                  {job.checkedInAt
                    ? "You are checked in. Your hours are being tracked."
                    : "Check in when you arrive at the property."}
                </Text>
                {job.checkedInAt ? (
                  <Text style={styles.muted}>
                    Checked in {fmtEt(job.checkedInAt, { hour: "numeric", minute: "2-digit" })}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() =>
                    act(() => (job.checkedInAt ? api.checkOut(job.id) : api.checkIn(job.id)))
                  }
                  style={({ pressed }) => [
                    job.checkedInAt ? styles.button : styles.primary,
                    styles.wide,
                    busy && styles.disabled,
                    pressed && (job.checkedInAt ? styles.pressed : styles.primaryPressed),
                  ]}
                >
                  <Text style={job.checkedInAt ? styles.buttonText : styles.primaryText}>
                    {job.checkedInAt ? "Check out" : "Check in"}
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.pad, styles.divided]}>
                <Text style={styles.body}>
                  Every required item must be complete and have no blocked issue before the job can
                  be finished.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !canComplete}
                  onPress={() => act(() => api.complete(job.id))}
                  style={({ pressed }) => [
                    styles.primary,
                    styles.wide,
                    (busy || !canComplete) && styles.disabled,
                    pressed && styles.primaryPressed,
                  ]}
                >
                  <Text style={styles.primaryText}>Mark job complete</Text>
                </Pressable>
                {!canComplete ? (
                  <Text style={styles.faint}>Complete or resolve every required item first.</Text>
                ) : null}
              </View>

              <View style={styles.noticeSlot}>
                <Notice text={actionNotice} />
              </View>
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: space.md },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: { minHeight: HIT, justifyContent: "center" },
  backText: { ...type.body, color: color.chromeMuted },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeStatus: { ...type.micro, color: color.brand },

  scrollBody: { padding: space.lg, gap: space.lg },

  jobName: { ...type.title, color: color.ink },

  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { ...type.micro, color: color.faint },
  sectionMeta: { ...type.micro, color: color.ink },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },

  label: { ...type.micro, color: color.faint },
  body: { ...type.body, color: color.ink },
  big: { ...type.title, color: color.ink },
  muted: { ...type.small, color: color.muted },
  faint: { ...type.small, color: color.faint },
  dangerInk: { color: color.danger },

  gate: { fontFamily: type.micro.fontFamily, fontSize: 24, letterSpacing: 1, color: color.ink },

  navigate: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandFill,
  },
  navigateText: { ...type.title, color: color.chromeInk },

  primary: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryText: { ...type.body, color: color.chromeInk },
  primaryPressed: { backgroundColor: color.brandDown },

  button: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
  buttonDanger: { borderColor: color.danger, backgroundColor: color.dangerBg },
  wide: { alignSelf: "stretch" },
  pressed: { backgroundColor: color.hover },
  disabled: { opacity: 0.4 },

  itemRow: { flexDirection: "row", gap: space.md, padding: space.lg, minHeight: HIT },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxDone: { backgroundColor: color.goodBg, borderColor: color.good },
  boxBlocked: { backgroundColor: color.dangerBg, borderColor: color.danger },
  boxMark: { ...type.body, color: color.good },
  boxMarkBlocked: { color: color.danger },
  itemBody: { flex: 1, gap: space.xs },
  itemName: { ...type.body, color: color.ink },
  itemDesc: { ...type.small, color: color.muted },
  itemRequired: { ...type.micro, color: color.ink },
  itemOptional: { ...type.micro, color: color.faint },
  itemFoot: {
    padding: space.lg,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },

  input: {
    // Not ...type.body: the spread carries lineHeight, and iOS renders a
    // TextInput's placeholder with visibly wrong tracking when lineHeight is
    // combined with a custom font. Same fix as the customers search field.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: 80,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
    textAlignVertical: "top",
  },

  noticeSlot: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { ...type.small, color: color.danger },
});
