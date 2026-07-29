// The owner's dispatch view — a day at a time.
//
// The web console renders a drag-and-drop week grid. A phone cannot, and a
// shrunken grid is worse than no grid: too small to read, too fiddly to move a
// job with a thumb. What Sebastian needs away from the desk is narrower — what
// is happening today, what is happening next, and what is still sitting in the
// tray unbooked. So this is an agenda: one day at a time, plus the unscheduled
// pile pinned at the bottom where it can't be forgotten.
//
// EVERY timestamp is America/New_York. Days are derived with fmtEt and ET wall
// times with etLocalToIso; no local calendar method is ever read, or a phone
// that has travelled shows a dispatcher the wrong day's work.

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  etLocalToIso,
  fmtEt,
  fmtEtTimeRange,
  fmtMoney,
  JOB_STATUS_LABEL,
  type Job,
  type JobStatus,
} from "@urso/types";
import { owner, SessionExpiredError } from "@/api";
import { color, HIT, radius, space, type } from "@/theme";

// Statuses where the green actually means "this is happening / happened".
const IN_FLIGHT: JobStatus[] = ["in_progress", "completed", "invoiced", "paid"];
const UNASSIGNED = "Unassigned";

const DAYS = 7;
const DAY_MS = 86_400_000;

// What the board actually returns is JobWithItems[] (lib/canes/estimates.ts
// getScheduleBoard → joinJobs): the job row joined to its item snapshot and its
// crew. The api client types it `unknown` because the domain type lives
// server-side, so this is the slice this screen reads — nothing more.
type BoardJob = {
  id: string;
  status: JobStatus;
  customer_name: string | null;
  job_address: string | null;
  scheduled_at: string | null;
  ends_at: string | null;
  crew_id: string | null;
};

type DayCell = {
  key: string; // ET calendar key, "2026-07-28"
  instant: string; // ET noon on that day, as an instant — safe to format
  weekday: string;
  day: string;
};

type Window = { days: DayCell[]; fromIso: string; toIso: string };

type Row =
  | { kind: "section"; key: string; label: string; meta: string | null }
  | { kind: "job"; key: string; job: BoardJob; crewName: string | null }
  | { kind: "tray"; key: string; job: Job }
  | { kind: "calm"; key: string; text: string };

// fmtEt formats en-US, so 2-digit parts arrive as MM/DD/YYYY. Reordered here
// into the ET calendar key that etLocalToIso takes and that days are grouped by.
function etDateKey(iso: string): string {
  const [month, day, year] = fmtEt(iso, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/");
  return `${year}-${month}-${day}`;
}

// Seven days starting today, plus the instants the board is asked for.
//
// Epoch arithmetic is timezone-neutral, so days are stepped from ET NOON: a DST
// change shifts the wall clock by an hour, which lands at 11am or 1pm and still
// inside the intended calendar day. Stepping from midnight would slide onto the
// day before. The window itself is ET midnight to ET midnight seven days on.
function buildWindow(): Window {
  const todayKey = etDateKey(new Date().toISOString());
  const noon = Date.parse(etLocalToIso(`${todayKey}T12:00`));

  const days: DayCell[] = [];
  for (let i = 0; i < DAYS; i++) {
    const instant = new Date(noon + i * DAY_MS).toISOString();
    days.push({
      key: etDateKey(instant),
      instant,
      weekday: fmtEt(instant, { weekday: "short" }),
      day: fmtEt(instant, { day: "numeric" }),
    });
  }

  const endKey = etDateKey(new Date(noon + DAYS * DAY_MS).toISOString());
  return {
    days,
    fromIso: etLocalToIso(`${todayKey}T00:00`),
    toIso: etLocalToIso(`${endKey}T00:00`),
  };
}

function toBoardJobs(value: unknown): BoardJob[] {
  return Array.isArray(value) ? (value as BoardJob[]) : [];
}

function Notices({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.noticeStack}>
      {items.map((text) => (
        // Server refusals are shown in the server's own words — they are written
        // for the reader and often name the exact permission that is missing.
        <View key={text} style={styles.notice}>
          <Text style={styles.noticeText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

// Job rows are inert for now: tapping one should open /(owner)/job/[id], which
// lands in a later slice, and pushing to a route that does not exist crashes
// the app. No onPress until the detail screen is real.
function JobRow({ job, crewName }: { job: BoardJob; crewName: string | null }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.time}>{fmtEtTimeRange(job.scheduled_at, job.ends_at)}</Text>
        {/* Green only where green MEANS something. Rendering every status in the
            sold-job colour made the chip pure decoration: a job in progress and
            one merely scheduled looked identical, which is the one distinction
            an owner glancing at the day actually needs. */}
        <Text style={IN_FLIGHT.includes(job.status) ? styles.statusLive : styles.status}>
          {JOB_STATUS_LABEL[job.status]}
        </Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {job.customer_name ?? "Customer"}
      </Text>
      <Text style={styles.address} numberOfLines={1}>
        {job.job_address ?? "Address pending"}
      </Text>
      {/* Unassigned is the highest-signal item on this screen — a job nobody is
          going to — and it was rendering in the faintest, smallest token in the
          system, visually identical to a named crew. */}
      {crewName !== null && (
        <Text style={crewName === UNASSIGNED ? styles.crewUnassigned : styles.crew}>
          {crewName}
        </Text>
      )}
    </View>
  );
}

function TrayRow({ job }: { job: Job }) {
  // The name leads, not the amount. Every row in this section is by definition
  // unscheduled, so repeating "UNSCHEDULED" on each one said nothing the section
  // header had not already said, while the customer — the thing being scanned
  // for — sat second. A zero total is left blank rather than shown as $0.00:
  // an unpriced job is not a nothing job, and rendering it as money reads as one.
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.customerLead} numberOfLines={1}>
          {job.customer_name ?? "Customer"}
        </Text>
        {total !== null && <Text style={styles.money}>{total}</Text>}
      </View>
      <Text style={styles.address} numberOfLines={1}>
        {job.job_address ?? "Address pending"}
      </Text>
    </View>
  );
}

export default function ScheduleScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [win, setWin] = useState<Window>(buildWindow);
  const [selectedKey, setSelectedKey] = useState<string>(() => win.days[0].key);

  const [board, setBoard] = useState<BoardJob[] | null>(null);
  const [tray, setTray] = useState<Job[] | null>(null);
  const [crewNames, setCrewNames] = useState<Map<string, string>>(() => new Map());
  const [notices, setNotices] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      // Recomputed every load so an app left open overnight rolls onto the new
      // day the moment it is pulled to refresh.
      const next = buildWindow();
      setWin(next);
      setSelectedKey((key) => (next.days.some((d) => d.key === key) ? key : next.days[0].key));

      try {
        // One trip each, in parallel: the board covers the whole week, so
        // switching days afterwards is instant and offline-friendly.
        //
        // The board route takes (from, days) and defaults days to 7 — `to` is
        // part of the client signature but the server derives the end itself.
        // DAYS is 7 for exactly that reason: the strip and the fetched window
        // are the same seven days, not two windows that drift apart.
        const [boardRes, trayRes, crewRes] = await Promise.all([
          owner.scheduleBoard(next.fromIso, next.toIso),
          owner.unscheduled(),
          owner.crews(),
        ]);

        // Each read is permission-gated on its own, so one refusal must not
        // discard the other two answers. Whatever came back is kept; every
        // refusal is collected and shown verbatim.
        const failures: string[] = [];
        if (boardRes.ok) setBoard(toBoardJobs(boardRes.data));
        else failures.push(boardRes.notice);

        if (trayRes.ok) setTray(trayRes.data);
        else failures.push(trayRes.notice);

        if (crewRes.ok) setCrewNames(new Map(crewRes.data.map((c) => [c.id, c.name])));
        else failures.push(crewRes.notice);

        setNotices([...new Set(failures)]);
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          router.replace("/login");
          return;
        }
        setNotices(["Something went wrong. Pull down to try again."]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const countsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of board ?? []) {
      if (!job.scheduled_at) continue;
      const key = etDateKey(job.scheduled_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [board]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    const dayJobs = (board ?? [])
      .filter((job) => job.scheduled_at !== null && etDateKey(job.scheduled_at) === selectedKey)
      .sort((a, b) => Date.parse(a.scheduled_at ?? "") - Date.parse(b.scheduled_at ?? ""));

    if (board !== null) {
      out.push({
        kind: "section",
        key: "section-day",
        label: "On the calendar",
        meta: dayJobs.length > 0 ? String(dayJobs.length) : null,
      });
      if (dayJobs.length === 0) {
        out.push({ kind: "calm", key: "calm-day", text: "Nothing booked for this day." });
      }
      for (const job of dayJobs) {
        out.push({
          kind: "job",
          key: job.id,
          job,
          // A scheduled job with nobody on it is the thing a dispatcher is
          // hunting for, so it is stated rather than left blank. A crew we
          // cannot name (the crews read was refused) says nothing instead.
          crewName: job.crew_id === null ? UNASSIGNED : crewNames.get(job.crew_id) ?? null,
        });
      }
    }

    if (tray !== null) {
      out.push({
        kind: "section",
        key: "section-tray",
        label: "Unscheduled",
        meta: String(tray.length),
      });
      if (tray.length === 0) {
        out.push({ kind: "calm", key: "calm-tray", text: "Every sold job has a slot." });
      }
      for (const job of tray) out.push({ kind: "tray", key: `tray-${job.id}`, job });
    }

    return out;
  }, [board, tray, selectedKey, crewNames]);

  const selected = win.days.find((d) => d.key === selectedKey) ?? win.days[0];
  const showSpinner = loading && board === null && tray === null;
  const dead = !loading && board === null && tray === null;

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
      <Text style={styles.title}>Schedule</Text>
      <Text style={styles.subtitle}>
        {fmtEt(selected.instant, { weekday: "long", month: "long", day: "numeric" })}
      </Text>
    </View>
  );

  // Seven cells have to fit one screen width — a strip you scroll to see Sunday
  // defeats the point. Cells run taller than HIT so the touch area stays well
  // past the 48pt floor even on a 375pt phone, where seven columns leave ~47pt
  // of width each.
  const strip = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {win.days.map((cell) => {
        const on = cell.key === selectedKey;
        const count = countsByDay.get(cell.key) ?? 0;
        return (
          <Pressable
            key={cell.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={fmtEt(cell.instant, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            onPress={() => setSelectedKey(cell.key)}
            style={({ pressed }) => [
              styles.cell,
              on && styles.cellOn,
              pressed && !on && styles.pressedSurface,
            ]}
          >
            <Text style={[styles.cellWeekday, on && styles.cellInkOn]}>{cell.weekday}</Text>
            <Text style={[styles.cellDay, on && styles.cellInkOn]}>{cell.day}</Text>
            <Text style={[styles.cellCount, on && styles.cellInkOn]}>{count > 0 ? count : ""}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (showSpinner) {
    return (
      <View style={styles.screen}>
        {header}
        {strip}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (dead) {
    return (
      <View style={styles.screen}>
        {header}
        {strip}
        <View style={styles.centre}>
          <Notices items={notices.length > 0 ? notices : ["The schedule isn't available."]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void load("initial");
            }}
            style={({ pressed }) => [styles.button, pressed && styles.pressedSurface]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {strip}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
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
        ListHeaderComponent={<Notices items={notices} />}
        renderItem={({ item }) => {
          if (item.kind === "section") {
            return (
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>{item.label}</Text>
                {item.meta !== null && <Text style={styles.sectionMeta}>{item.meta}</Text>}
              </View>
            );
          }
          if (item.kind === "calm") return <Text style={styles.calm}>{item.text}</Text>;
          if (item.kind === "tray") return <TrayRow job={item.job} />;
          return <JobRow job={item.job} crewName={item.crewName} />;
        }}
      />
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
  title: { ...type.display, color: color.chromeInk },
  subtitle: { ...type.micro, color: color.chromeMuted },

  strip: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  cell: {
    // FIXED width, not flex. Seven flex cells across a 375pt phone (iPhone SE,
    // 13 mini) compute to 46.7pt each — under the HIT floor, in a control used
    // one-handed outdoors. No arrangement of seven fixed columns clears 48pt on
    // a narrow phone, so the axis scrolls instead of the cell shrinking.
    width: 56,
    minHeight: HIT + space.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  cellOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  pressedSurface: { backgroundColor: color.hover },
  cellWeekday: { ...type.micro, color: color.faint },
  cellDay: {
    ...type.title,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  cellCount: { ...type.micro, color: color.brand, fontVariant: ["tabular-nums"] },
  cellInkOn: { color: color.chromeInk },

  list: { paddingHorizontal: space.lg, paddingTop: space.sm },

  noticeStack: { gap: space.sm, marginBottom: space.md },
  notice: { backgroundColor: color.dangerBg, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.small, color: color.danger },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  sectionLabel: { ...type.micro, color: color.faint },
  sectionMeta: { ...type.micro, color: color.ink, fontVariant: ["tabular-nums"] },

  row: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  time: { ...type.small, color: color.muted, flexShrink: 1, fontVariant: ["tabular-nums"] },
  money: { ...type.small, color: color.ink, flexShrink: 1, fontVariant: ["tabular-nums"] },
  status: { ...type.micro, color: color.muted },
  statusLive: { ...type.micro, color: color.job },
  customer: { ...type.title, color: color.ink, marginTop: space.sm },
  // TrayRow puts the name IN the top row beside the amount, so it must not
  // carry the stacked variant's top margin.
  customerLead: { ...type.title, color: color.ink, flexShrink: 1 },
  address: { ...type.small, color: color.muted, marginTop: space.xs },
  crew: { ...type.micro, color: color.faint, marginTop: space.sm },
  crewUnassigned: { ...type.small, color: color.danger, marginTop: space.sm },

  calm: { ...type.body, color: color.muted, paddingVertical: space.md },

  button: {
    minHeight: HIT,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
});
