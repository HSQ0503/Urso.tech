import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  fmtEt,
  fmtEtTimeRange,
  JOB_STATUS_LABEL,
  type JobStatus,
  type TechnicianJob,
  type TechnicianWeek,
} from "@urso/types";
import { api, SessionExpiredError } from "@/api";
import { signOutWithPushCleanup } from "@/push-notifications";
import { color, font, HIT, radius, space, type } from "@/theme";

// The technician's week — the first screen of every workday.
//
// EVERY timestamp in this system is America/New_York. Formatting and day
// grouping go through fmtEt/fmtEtTimeRange from @urso/types; nothing here may
// touch a local-timezone method, or a phone that has travelled renders the
// wrong arrival times.

// week.startDate / endDate are ET calendar date keys ("2026-07-27"), not
// instants. Parsed raw they land on UTC midnight, which is the previous evening
// in ET; anchoring at noon UTC keeps fmtEt on the intended calendar day.
function dateKeyToInstant(dateKey: string): string {
  return `${dateKey}T12:00:00Z`;
}

function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

// Sold work in progress or behind it reads green; everything else stays
// neutral so the eye only lands on what has actually moved today.
const GREEN_STATUSES: JobStatus[] = ["in_progress", "completed", "invoiced", "paid"];

function isGreen(status: JobStatus): boolean {
  return GREEN_STATUSES.includes(status);
}

type ScheduledJob = TechnicianJob & { scheduledAt: string };

function isScheduled(job: TechnicianJob): job is ScheduledJob {
  return job.scheduledAt !== null;
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "job"; key: string; job: TechnicianJob };

function dayKey(iso: string): string {
  return fmtEt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dayLabel(iso: string): string {
  return `${fmtEt(iso, { weekday: "short" })} · ${fmtEt(iso, { month: "short", day: "numeric" })}`;
}

function buildRows(jobs: TechnicianJob[]): Row[] {
  const scheduled = jobs
    .filter(isScheduled)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const unscheduled = jobs.filter((job) => !isScheduled(job));

  const rows: Row[] = [];
  let openDay: string | null = null;
  for (const job of scheduled) {
    const key = dayKey(job.scheduledAt);
    if (key !== openDay) {
      openDay = key;
      rows.push({ kind: "day", key: `day-${key}`, label: dayLabel(job.scheduledAt) });
    }
    rows.push({ kind: "job", key: job.id, job });
  }

  if (unscheduled.length > 0) {
    rows.push({ kind: "day", key: "day-unscheduled", label: "Unscheduled" });
    for (const job of unscheduled) rows.push({ kind: "job", key: job.id, job });
  }

  return rows;
}

function JobRow({ job, onPress }: { job: TechnicianJob; onPress: () => void }) {
  const green = isGreen(job.status);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.job, pressed && styles.jobPressed]}
    >
      <View style={styles.jobTop}>
        <Text style={styles.jobTime}>
          {job.scheduledAt ? fmtEtTimeRange(job.scheduledAt, job.endsAt) : "Unscheduled"}
        </Text>
        <View style={[styles.chip, green && styles.chipGreen]}>
          <Text style={[styles.chipText, green && styles.chipTextGreen]}>
            {JOB_STATUS_LABEL[job.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.jobCustomer} numberOfLines={1}>
        {job.customerName ?? "Customer"}
      </Text>
      <Text style={styles.jobAddress} numberOfLines={1}>
        {job.jobAddress ?? "Address pending"}
      </Text>

      {job.checkedInAt !== null && <Text style={styles.onSite}>On site</Text>}
    </Pressable>
  );
}

export default function WeekScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [week, setWeek] = useState<TechnicianWeek | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const result = await api.week();
        if (result.ok) {
          setWeek(result.data);
          setNotice(null);
        } else {
          // A refusal keeps whatever week is already on screen — a crew out of
          // signal still needs to read this morning's jobs.
          setNotice(result.notice);
        }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          router.replace("/login");
          return;
        }
        setNotice("Something went wrong. Pull down to try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  // Refetch on focus so a check-in made on the job screen is reflected here.
  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const rows = useMemo(() => (week ? buildRows(week.jobs) : []), [week]);

  const openJob = useCallback(
    (id: string) => {
      router.push({ pathname: "/(crew)/job/[id]", params: { id } });
    },
    [router],
  );

  const handleSignOut = useCallback(async () => {
    await signOutWithPushCleanup("crew");
    router.replace("/login");
  }, [router]);

  const showSpinner = loading && week === null;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top }]}>
        <View style={styles.chromeTop}>
          <Text style={styles.wordmark}>
            Canes<Text style={styles.wordmarkStop}>.</Text>
          </Text>
          <View style={styles.hours}>
            <Text style={styles.hoursValue}>{formatMinutes(week?.minutesWorked ?? 0)}</Text>
            <Text style={styles.hoursLabel}>This week</Text>
          </View>
        </View>
        <View style={styles.chromeBottom}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            hitSlop={8}
            onPress={() => router.push("/(crew)/settings")}
            style={({ pressed }) => [styles.chromeButton, pressed && styles.signOutPressed]}
          >
            <Feather name="bell" size={15} color={color.chromeMuted} />
            <Text style={styles.signOutText}>Notifications</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={8}
            onPress={() => {
              void handleSignOut();
            }}
            style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {showSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + space.xxl },
            rows.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("refresh");
              }}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
          ListHeaderComponent={
            <View>
              {week !== null && (
                <Text style={styles.range}>
                  {fmtEt(dateKeyToInstant(week.startDate), { month: "short", day: "numeric" })}
                  {" – "}
                  {fmtEt(dateKeyToInstant(week.endDate), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              )}
              {notice !== null && <Text style={styles.notice}>{notice}</Text>}
            </View>
          }
          ListEmptyComponent={
            week !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No jobs scheduled this week.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === "day" ? (
              <Text style={styles.day}>{item.label}</Text>
            ) : (
              <JobRow job={item.job} onPress={() => openJob(item.job.id)} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },

  chrome: { backgroundColor: color.chrome },
  chromeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  wordmark: { ...type.display, fontSize: 22, color: color.chromeInk },
  wordmarkStop: { color: color.brand },
  hours: { alignItems: "flex-end" },
  hoursValue: { fontFamily: font.bodySemi, fontSize: 16, color: color.chromeInk },
  hoursLabel: { ...type.micro, color: color.chromeMuted, marginTop: 2 },

  chromeBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.chromeLine,
    paddingHorizontal: space.sm,
  },
  chromeButton: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  signOut: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  signOutPressed: { backgroundColor: color.chromeRaise },
  signOutText: { ...type.micro, color: color.chromeMuted },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  listEmpty: { flexGrow: 1 },

  range: { ...type.micro, color: color.muted, marginBottom: space.md },
  notice: { ...type.small, color: color.danger, marginBottom: space.md },

  day: { ...type.micro, color: color.faint, marginTop: space.lg, marginBottom: space.sm },

  job: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  jobPressed: { backgroundColor: color.hover },
  jobTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  jobTime: { ...type.small, color: color.muted, flexShrink: 1 },
  jobCustomer: { ...type.title, color: color.ink, marginTop: space.sm },
  jobAddress: { ...type.small, color: color.muted, marginTop: 2 },

  chip: {
    backgroundColor: color.hover,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  chipGreen: { backgroundColor: color.goodBg },
  chipText: { ...type.micro, color: color.muted },
  chipTextGreen: { color: color.job },

  onSite: { ...type.micro, color: color.brand, marginTop: space.sm },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
