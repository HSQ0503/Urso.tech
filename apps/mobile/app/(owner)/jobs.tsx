// Work orders — the jobs list.
//
// This screen has NO web equivalent. On the console a job is only ever reached
// through the schedule or through the customer it belongs to; there is no list
// of them. Sebastian's mental model coming off Markate is a "Work Orders"
// screen he searches, so the phone gets the list the web never had, and
// GET /canes/jobs exists for it.
//
// Markate's row anatomy, followed closely because it is dense and good: the
// title and the money share the lead line, then one icon-led fact per line —
// customer, crew, schedule — with the status pill parked on the right of the
// second line and the work-order number on the right of the third. Rows that
// have no schedule simply drop those lines rather than printing placeholders,
// which is why an unscheduled job reads shorter instead of emptier.
//
// Every time is America/New_York via fmtEt. The device clock is never read.

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { ChromeBar, SearchStrip, searchInputStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useCrews, useJobs } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The filter strip. "Open" is the working set — everything not finished and not
// abandoned — because that is what someone opening this screen is looking for,
// and it is the default for the same reason.
type Filter = "open" | "unscheduled" | "scheduled" | "done" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "unscheduled", label: "Unscheduled" },
  { value: "scheduled", label: "Scheduled" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

const DONE: JobStatus[] = ["completed", "invoiced", "paid"];
const SCHEDULED: JobStatus[] = ["scheduled", "confirmed", "in_progress"];

function matchesFilter(job: Job, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return DONE.includes(job.status);
  if (filter === "scheduled") return SCHEDULED.includes(job.status);
  if (filter === "unscheduled") return job.status === "unscheduled";
  // Open: still live work. Canceled is not open, and neither is finished.
  return !DONE.includes(job.status) && job.status !== "canceled";
}

// Markate colours its pills by state: gold for scheduled work, cyan for a new
// one, muted for everything settled. Same three meanings, our tokens.
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
  right?: React.ReactNode;
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

function WorkOrderRow({
  job,
  crewName,
  onPress,
}: {
  job: Job;
  crewName: string | null;
  onPress: () => void;
}): React.ReactElement {
  const tone = pillTone(job.status);
  // An unpriced job is not a nothing job. Blank beats $0.00, which reads as one.
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  const when =
    job.scheduled_at === null
      ? null
      : `${fmtEt(job.scheduled_at, { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}, ${fmtEtTimeRange(job.scheduled_at, job.ends_at)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.job_name ?? job.customer_name ?? "Job"}, ${JOB_STATUS_LABEL[job.status]}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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

      {/* Crew and schedule only when they exist. Markate drops these lines on an
          unscheduled work order rather than printing "—", so the row shrinks to
          what is true about it. */}
      {crewName !== null ? <IconLine icon="users" text={crewName} /> : null}
      {when !== null ? <IconLine icon="calendar" text={when} /> : null}
    </Pressable>
  );
}

export default function JobsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const jobsQuery = useJobs();
  // The board joins crews the same way. Names are looked up client-side rather
  // than widened into the jobs payload, so one cached read serves every screen
  // that needs to put a name on a crew_id.
  const crewsQuery = useCrews();
  useRefetchOnFocus(jobsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([jobsQuery.refetch(), crewsQuery.refetch()]),
  );

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of (crewsQuery.data ?? []) as Crew[]) map.set(crew.id, crew.name);
    return map;
  }, [crewsQuery.data]);

  const jobs = jobsQuery.data ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => matchesFilter(job, filter))
      .filter(
        (job) =>
          needle === "" ||
          (job.job_name ?? "").toLowerCase().includes(needle) ||
          (job.customer_name ?? "").toLowerCase().includes(needle) ||
          (job.job_address ?? "").toLowerCase().includes(needle),
      );
  }, [jobs, filter, query]);

  // The total of what is on screen, so the header figure always describes the
  // rows underneath it rather than the whole book.
  const shownCents = useMemo(
    () => visible.reduce((sum, job) => sum + job.total_cents, 0),
    [visible],
  );

  const notice = noticeFrom(jobsQuery.error);

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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />
          }
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.head}>
              {notice !== null ? <Notice text={notice} /> : null}
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
              <View style={styles.filters}>
                {FILTERS.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === option.value }}
                    onPress={() => setFilter(option.value)}
                    style={({ pressed }) => [
                      styles.filter,
                      filter === option.value && styles.filterOn,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === option.value && styles.filterTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {jobs.length === 0
                ? "No work orders yet."
                : "Nothing matches that search or filter."}
            </Text>
          }
          renderItem={({ item }) => (
            <WorkOrderRow
              job={item}
              crewName={item.crew_id === null ? null : (crewNames.get(item.crew_id) ?? null)}
              onPress={() =>
                router.push({ pathname: "/(owner)/job/[id]", params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingBottom: space.xxl },
  head: { gap: space.md, paddingTop: space.md, paddingBottom: space.sm },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 16 },
  filter: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  filterOn: { borderColor: color.brandEdge, backgroundColor: color.brandSoft },
  filterText: { ...type.small, fontFamily: font.bodySemi, color: color.muted },
  filterTextOn: { color: color.brandDeep },

  // Markate's list is edge to edge with hairline separators rather than a stack
  // of floating cards — at four lines a row, cards would be all border.
  row: {
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
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
