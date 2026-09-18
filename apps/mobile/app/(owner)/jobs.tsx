// Work orders — the jobs list, and now the home of the unscheduled pile.
//
// This screen has NO web equivalent. On the console a job is only ever reached
// through the schedule or through the customer it belongs to; there is no list
// of them. Sebastian's mental model coming off Markate is a "Work Orders"
// screen he searches, and (2026-09-13) "I would rather have the unscheduled
// jobs be in work orders rather than my scheduling section, just how Markate
// has it" — so the tray moved here and became the default tab.
//
// Two things a row can do without opening it: an unscheduled row carries a
// Schedule button that opens the slot picker in place, and any live row can be
// swiped left to reveal Cancel. The swipe is a real gesture this time; the old
// schedule tray printed "swipe left to remove" over rows that could not.
//
// Markate's row anatomy, followed closely because it is dense and good: the
// title and the money share the lead line, then one icon-led fact per line —
// customer, crew, schedule — with the status pill on the right of the second
// line. Rows that have no schedule simply drop those lines rather than
// printing placeholders.
//
// Every time is America/New_York via fmtEt. The device clock is never read.

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtEt,
  fmtEtTimeRange,
  fmtMoney,
  JOB_STATUS_LABEL,
  type Crew,
  type Job,
  type JobStatus,
} from "@urso/types";
import { jobActions } from "@/api";
import { BookSheet } from "@/components/book-sheet";
import { ChromeBar, SearchStrip, searchInputStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { keys, useCrews, useJobs } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The tabs, in the order he works them: what still needs a day, what has one,
// what is finished, what was called off. Unscheduled is the default because
// that pile is the thing this screen exists to shrink.
type Filter = "unscheduled" | "scheduled" | "completed" | "canceled" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "unscheduled", label: "Unscheduled" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All" },
];

// Completed includes the money states: he thinks in "done", and whether the
// bill went out or got paid is the invoice's business — the pill still says.
const DONE: JobStatus[] = ["completed", "invoiced", "paid"];
const SCHEDULED: JobStatus[] = ["scheduled", "confirmed", "in_progress"];

function matchesFilter(job: Job, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return DONE.includes(job.status);
  if (filter === "scheduled") return SCHEDULED.includes(job.status);
  if (filter === "canceled") return job.status === "canceled";
  return job.status === "unscheduled";
}

// A cancel makes sense on live work only. Finished work has an invoice behind
// it (reopen it from the job sheet instead), and canceled is already canceled.
function canCancel(job: Job): boolean {
  return !DONE.includes(job.status) && job.status !== "canceled";
}

function pillTone(status: JobStatus): { fill: string; tint: string } {
  if (DONE.includes(status)) return { fill: color.goodBg, tint: color.good };
  if (status === "canceled") return { fill: color.dangerBg, tint: color.danger };
  if (SCHEDULED.includes(status)) return { fill: color.brandSoft, tint: color.brandDeep };
  return { fill: color.hover, tint: color.muted };
}

function IconLine({
  icon,
  text,
  right,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  text: string;
  right?: ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.line}>
      <Feather name={icon} size={14} color={color.muted} />
      <Text style={styles.lineText} numberOfLines={1}>
        {text}
      </Text>
      {right}
    </View>
  );
}

// ── Swipe to reveal ──────────────────────────────────────────────────────────
//
// A horizontal pan on the row slides it left to uncover one action. Built on
// PanResponder + Animated so it costs no native module: the gesture only claims
// the touch once it is clearly horizontal (dx well ahead of dy), so the list
// underneath keeps scrolling normally, and a tap still reaches the row.
const REVEAL = 104;

function SwipeRow({
  enabled,
  actionLabel,
  onAction,
  children,
}: {
  enabled: boolean;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}): React.ReactElement {
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const settle = (to: number) => {
    open.current = to !== 0;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 24 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        enabledRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => {
        const base = open.current ? -REVEAL : 0;
        x.setValue(Math.min(0, Math.max(-REVEAL, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = open.current ? -REVEAL : 0;
        settle(base + g.dx < -REVEAL / 2 ? -REVEAL : 0);
      },
      onPanResponderTerminate: () => settle(open.current ? -REVEAL : 0),
    }),
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeUnder} pointerEvents={enabled ? "auto" : "none"}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            settle(0);
            onAction();
          }}
          style={({ pressed }) => [styles.swipeAction, pressed && styles.swipeActionPressed]}
        >
          <Feather name="slash" size={18} color={color.surface} />
          <Text style={styles.swipeActionText}>{actionLabel}</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function WorkOrderRow({
  job,
  crewName,
  onPress,
  onSchedule,
}: {
  job: Job;
  crewName: string | null;
  onPress: () => void;
  onSchedule: () => void;
}): React.ReactElement {
  const tone = pillTone(job.status);
  // An unpriced job is not a nothing job. Blank beats $0.00, which reads as one.
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  const when =
    job.scheduled_at === null
      ? null
      : `${fmtEt(job.scheduled_at, { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}, ${fmtEtTimeRange(job.scheduled_at, job.ends_at)}`;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${job.job_name ?? job.customer_name ?? "Job"}, ${JOB_STATUS_LABEL[job.status]}`}
        onPress={onPress}
        style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
      >
        <View style={styles.rowTop}>
          <Text style={styles.title} numberOfLines={1}>
            {job.job_name ?? job.customer_name ?? "Job"}
          </Text>
          {total !== null && <Text style={styles.money}>{total}</Text>}
        </View>

        <IconLine
          icon="user"
          text={job.customer_name ?? "No customer on this job"}
          right={
            <View style={[styles.pill, { backgroundColor: tone.fill, borderColor: tone.tint }]}>
              <Text style={[styles.pillText, { color: tone.tint }]} numberOfLines={1}>
                {JOB_STATUS_LABEL[job.status]}
              </Text>
            </View>
          }
        />

        {crewName !== null ? <IconLine icon="users" text={crewName} /> : null}
        {when !== null ? <IconLine icon="calendar" text={when} /> : null}
        {job.scheduling_conflict?<Text style={{color:color.danger}}>Crew overlap — review scheduled time</Text>:null}
        {job.status === "canceled" && job.canceled_reason ? (
          <IconLine icon="slash" text={job.canceled_reason} />
        ) : null}
      </Pressable>

      {/* The Schedule button is a SIBLING of the card body, not a child. Nested
          inside the row's Pressable it looks tidier and loses the tap to the
          outer one — pressing Schedule would open the job sheet, which is the
          screen this button exists to save him from. */}
      {job.status === "unscheduled" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Schedule ${job.customer_name ?? "this job"}`}
          onPress={onSchedule}
          style={({ pressed }) => [styles.scheduleButton, pressed && styles.scheduleButtonPressed]}
        >
          <Feather name="calendar" size={16} color={color.surface} />
          <Text style={styles.scheduleButtonText}>Schedule</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function JobsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const jobsQuery = useJobs();
  const crewsQuery = useCrews();
  useRefetchOnFocus(jobsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([jobsQuery.refetch(), crewsQuery.refetch()]),
  );

  const [query, setQuery] = useState("");
  const filter: Filter = "all";
  // Held by value: the row it came from re-reads the moment the booking lands.
  const [bookJob, setBookJob] = useState<Job | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const cancel = useAction(
    (vars: { id: string }) => jobActions.delete(vars.id),
    {
      invalidates: [...keys.workflow()],
    },
  );

  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of (crewsQuery.data ?? []) as Crew[]) map.set(crew.id, crew.name);
    return map;
  }, [crewsQuery.data]);

  const jobs = jobsQuery.data ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => !job.archived_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter(
        (job) =>
          needle === "" ||
          (job.job_name ?? "").toLowerCase().includes(needle) ||
          (job.customer_name ?? "").toLowerCase().includes(needle) ||
          (job.job_address ?? "").toLowerCase().includes(needle),
      );
  }, [jobs, filter, query]);

  const shownCents = useMemo(() => visible.reduce((sum, job) => sum + job.total_cents, 0), [visible]);

  const notice = noticeFrom(jobsQuery.error);

  const confirmCancel = (job: Job) => {
    Alert.alert(
      "Delete this work order?",
      `${job.customer_name ?? "This job"} will leave the list and calendar. Unused drafts are deleted; document and payment history is retained. Unpaid payment links are disabled.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete work order",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setActionNotice(null);
              const r = await cancel.mutateAsync({ id: job.id });
              if (!r.ok) {
                setActionNotice(r.notice);
                return;
              }
              toast.show("Work order removed. Any business history was preserved.");
            })();
          },
        },
      ],
    );
  };

  const emptyCopy: Record<Filter, string> = {
    unscheduled: "Nothing waiting to be scheduled. Accepted estimates land here until you put them on a day.",
    scheduled: "Nothing on the calendar. Schedule a work order from the Unscheduled tab.",
    completed: "No completed work orders yet.",
    canceled: "No canceled work orders.",
    all: "No work orders yet. Accept an estimate, or tap New work order.",
  };

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Work orders"
        sub={`${visible.length} shown · ${fmtMoney(shownCents)}`}
        onBack={() => router.back()}
        action="New work order"
        onAction={() => router.push("/(owner)/job/new")}
      />

      {jobsQuery.isPending ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(job) => job.id}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.head}>
              {notice !== null ? <Notice text={notice} /> : null}
              {actionNotice !== null ? <Notice text={actionNotice} /> : null}
              <SearchStrip>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search work orders"
                  placeholderTextColor={color.muted}
                  style={searchInputStyle}
                  returnKeyType="search"
                  accessibilityLabel="Search work orders"
                />
              </SearchStrip>

              {visible.length > 0 ? (
                <Text style={styles.hint}>Tap Schedule to pick a day. Swipe left to delete or archive.</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{query.trim() ? "Nothing matches that search." : emptyCopy[filter]}</Text>
          }
          renderItem={({ item }) => (
            <SwipeRow enabled={true} actionLabel="Delete" onAction={() => confirmCancel(item)}>
              <WorkOrderRow
                job={item}
                crewName={item.crew_id === null ? null : (crewNames.get(item.crew_id) ?? null)}
                onPress={() => router.push({ pathname: "/(owner)/job/[id]", params: { id: item.id } })}
                onSchedule={() => setBookJob(item)}
              />
            </SwipeRow>
          )}
        />
      )}

      {bookJob !== null ? (
        <BookSheet
          job={bookJob}
          onClose={() => setBookJob(null)}
          onBooked={(job, notice) => toast.show(notice ?? `${job.customer_name ?? "Job"} is on the calendar.`)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingBottom: space.xxl },
  head: { gap: space.md, paddingTop: space.md, paddingBottom: space.sm },
  hint: { ...type.small, color: color.muted, paddingHorizontal: 16 },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 16 },
  filter: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  filterOn: { borderColor: color.brandEdge, backgroundColor: color.brandSoft },
  filterText: { ...type.small, fontFamily: font.bodySemi, color: color.muted },
  filterCount: { fontFamily: font.monoMedium, fontSize: 12, color: color.faint },
  filterTextOn: { color: color.brandDeep },

  swipeWrap: { backgroundColor: color.danger },
  swipeUnder: { position: "absolute", top: 0, bottom: 0, right: 0, width: REVEAL },
  swipeAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: color.danger,
  },
  swipeActionPressed: { opacity: 0.85 },
  swipeActionText: { ...type.small, fontFamily: font.bodySemi, color: color.surface },

  // Markate's list is edge to edge with hairline separators rather than a stack
  // of floating cards — at four lines a row, cards would be all border.
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: color.surface,
  },
  rowPressed: { backgroundColor: color.hover },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
  },
  title: { ...type.titleLg, color: color.ink, flexShrink: 1 },
  money: {
    fontFamily: font.monoMedium,
    fontSize: 15,
    color: color.ink,
    flexShrink: 0,
    fontVariant: ["tabular-nums"],
  },

  scheduleButton: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 78,
    minHeight: HIT + 8,
    marginRight: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
  },
  scheduleButtonPressed: { backgroundColor: color.brandDown },
  scheduleButtonText: { ...type.smaller, fontFamily: font.bodySemi, color: color.surface },

  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineText: { ...type.small, color: color.muted, flex: 1, minWidth: 0 },

  pill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 3,
    flexShrink: 0,
  },
  pillText: { ...type.ruleSm },

  empty: { ...type.body, color: color.muted, padding: space.lg },
});
