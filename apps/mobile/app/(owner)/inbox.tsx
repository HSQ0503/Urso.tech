import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  STATUS_LABEL,
  type Thread,
  type ThreadKind,
} from "@urso/types";
import { useThreads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The shared inbox — every phone number the shop has ever texted or been called
// by, newest first.
//
// The screen has one job: make the customer who is waiting for an answer
// impossible to miss. A missed text here is a lost job, so the list is built
// around "who is waiting on me" rather than around raw recency, and everything
// else is arranged to stay out of that signal's way.
//
// Times are America/New_York, always, through fmtEt. Nothing on this screen
// reads the device calendar — see the note on recentEtDayKeys.

// ── Eastern-time day arithmetic ─────────────────────────────────────────────
//
// A conversation list needs to say "3:42 PM" / "Yesterday" / "Tue" / "Jul 12",
// which means deciding what ET calendar day an instant fell on. That decision is
// made ONLY by comparing fmtEt output to fmtEt output — never by parsing a date
// back out of a formatted string, and never by getDate()/getMonth().
//
// The parsing ban is not pedantry. src/intl-guard.ts exists because this
// platform's formatter and Node's disagree on invisible punctuation (U+202F vs
// a plain space); a separator that differs on a device we don't test on is
// exactly how that class of bug ships. String equality can't be fooled by it.

function etDayKey(iso: string): string {
  return fmtEt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
}

// The last seven ET calendar days, newest first.
//
// Stepping is 12 hours rather than 24 so the 25-hour day at the DST fall-back
// can't land twice on the same calendar day, push every later entry down a slot,
// and label yesterday's message "Sat".
function recentEtDayKeys(nowMs: number): string[] {
  const keys: string[] = [];
  for (let step = 0; step < 20 && keys.length < 7; step++) {
    const key = etDayKey(new Date(nowMs - step * 12 * 3_600_000).toISOString());
    if (key !== keys[keys.length - 1]) keys.push(key);
  }
  return keys;
}

function relativeEt(iso: string, dayKeys: string[]): string {
  const index = dayKeys.indexOf(etDayKey(iso));
  if (index === 0) return fmtEt(iso, { hour: "numeric", minute: "2-digit" });
  if (index === 1) return "Yesterday";
  if (index > 1) return fmtEt(iso, { weekday: "short" });
  // Older than a week, or dated ahead of us by a clock skew somewhere: show the
  // actual day rather than guess at a relative phrase.
  return fmtEt(iso, { month: "short", day: "numeric" });
}

// ── Thread reading ──────────────────────────────────────────────────────────

const KIND_LABEL: Record<ThreadKind, string> = {
  vendor: "Lead vendor",
  lead: "Lead",
  customer: "Customer",
};

// "Waiting on you" is the server's own unread flag — the newest event on the
// thread is an inbound message or a missed inbound call — minus the vendor feed.
//
// The vendor number is a firehose of raw leads that is inbound by definition and
// therefore permanently "unread". Counting it here would bury the one customer
// who is actually owed a reply under twenty rows of vendor traffic, which is the
// exact failure this screen exists to prevent. It stays in the list, just not in
// the count.
function isWaiting(thread: Thread): boolean {
  return thread.unread && thread.kind !== "vendor";
}

function threadName(thread: Thread): string {
  const name = thread.display_name?.trim();
  return name ? name : fmtPhone(thread.peer_phone);
}

function mediaLabel(count: number): string {
  if (count === 0) return "No text";
  return count === 1 ? "Photo" : `${count} photos`;
}

// One line describing the newest thing that happened on this thread. Messages
// and calls live in separate tables, so whichever is newer is the one that
// describes the conversation; ISO timestamps compare correctly as strings, which
// is how the server orders them too.
function previewOf(thread: Thread): string {
  const message = thread.last_message;
  const call = thread.last_call;

  if (call !== null && (message === null || call.created_at > message.created_at)) {
    if (isMissedCall(call)) return "Missed call";
    const duration = fmtCallDuration(call.duration_seconds);
    const label = call.direction === "in" ? "Incoming call" : "Outgoing call";
    return duration ? `${label} · ${duration}` : label;
  }

  if (message === null) return "No messages yet";

  const body = message.body.trim() || mediaLabel(message.media_urls.length);
  if (message.direction === "in") return body;
  // An automated send is not an answer. The hold text goes out on its own and
  // the customer is still waiting on a person — a row that read "You: …" for it
  // would quietly claim this conversation was handled.
  return `${message.automated ? "Auto" : "You"}: ${body}`;
}

// Kind, plus the lead's stage when there is a lead. Whether the person texting
// is already booked changes what the owner does about them, and it costs no
// extra line to say so.
function markerOf(thread: Thread): string {
  const kind = KIND_LABEL[thread.kind];
  const status = thread.lead ? STATUS_LABEL[thread.lead.status] : null;
  return status ? `${kind} · ${status}` : kind;
}

// ── Rows ────────────────────────────────────────────────────────────────────

type Row =
  | { kind: "label"; key: string; label: string }
  | {
      kind: "thread";
      key: string;
      name: string;
      when: string;
      preview: string;
      marker: string;
      waiting: boolean;
      vendor: boolean;
    };

function toRow(thread: Thread, dayKeys: string[]): Row {
  return {
    kind: "thread",
    key: thread.peer_phone,
    name: threadName(thread),
    when: relativeEt(thread.last_activity_at, dayKeys),
    preview: previewOf(thread),
    marker: markerOf(thread),
    waiting: isWaiting(thread),
    vendor: thread.kind === "vendor",
  };
}

function buildRows(threads: Thread[], nowMs: number): Row[] {
  const dayKeys = recentEtDayKeys(nowMs);
  // Sorted here as well as on the server so the screen's order is its own
  // guarantee rather than a borrowed one.
  const sorted = [...threads].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
  const waiting = sorted.filter(isWaiting);
  const rest = sorted.filter((thread) => !isWaiting(thread));

  // With nothing waiting there is nothing to separate, and two headings over one
  // undivided list would be noise.
  if (waiting.length === 0) return rest.map((thread) => toRow(thread, dayKeys));

  const rows: Row[] = [{ kind: "label", key: "label-waiting", label: "Waiting on you" }];
  for (const thread of waiting) rows.push(toRow(thread, dayKeys));
  if (rest.length > 0) {
    rows.push({ kind: "label", key: "label-rest", label: "Everything else" });
    for (const thread of rest) rows.push(toRow(thread, dayKeys));
  }
  return rows;
}

function ThreadRow({ row }: { row: Extract<Row, { kind: "thread" }> }) {
  // Deliberately not pressable. The conversation view is a later slice, and a
  // row that responds to a tap by doing nothing teaches the owner that the
  // screen is broken.
  return (
    <View
      style={[styles.thread, row.waiting ? styles.threadWaiting : null]}
      accessible
      accessibilityLabel={`${row.name}. ${row.preview}. ${row.when}.`}
    >
      <View style={styles.threadTop}>
        <Text style={[styles.name, row.vendor && styles.nameQuiet]} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={[styles.when, row.waiting && styles.whenWaiting]} numberOfLines={1}>
          {row.when}
        </Text>
      </View>

      <Text
        style={[
          styles.preview,
          row.waiting && styles.previewWaiting,
          row.vendor && styles.previewQuiet,
        ]}
        numberOfLines={1}
      >
        {row.preview}
      </Text>

      <Text style={[styles.marker, row.vendor && styles.markerQuiet]} numberOfLines={1}>
        {row.marker}
      </Text>
    </View>
  );
}

export default function InboxScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();

  // A refusal keeps whatever is already on screen (query.data survives an
  // error state), and the notice is the server's sentence, written for whoever
  // is reading it, shown exactly as sent. Session death routes to /login in
  // the query cache's onError, not here.
  const threadsQuery = useThreads();

  // Refetch on focus: a reply sent from anywhere else should not leave a thread
  // sitting in "Waiting on you".
  useRefetchOnFocus(threadsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(threadsQuery.refetch);

  const threads = threadsQuery.data ?? null;
  const notice = noticeFrom(threadsQuery.error);

  // Relative labels are computed against a REFERENCE INSTANT, and capturing it
  // once per fetch meant an app left open past ET midnight kept calling
  // yesterday "Today". Re-stamped whenever the app comes back to the foreground,
  // which is when a phone actually crosses midnight in someone's hand.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") setNowMs(Date.now());
    });
    return () => sub.remove();
  }, []);

  const rows = useMemo(() => (threads ? buildRows(threads, nowMs) : []), [threads, nowMs]);
  const waitingCount = useMemo(
    () => (threads ? threads.filter(isWaiting).length : 0),
    [threads],
  );

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top }]}>
      <View style={styles.chromeTop}>
        <Text style={styles.heading}>Inbox</Text>
        {threads !== null &&
          (waitingCount > 0 ? (
            <View style={styles.count}>
              <Text style={styles.countValue}>{waitingCount}</Text>
              <Text style={styles.countLabel}>Waiting</Text>
            </View>
          ) : (
            <Text style={styles.caughtUp}>All caught up</Text>
          ))}
      </View>
    </View>
  );

  if (threadsQuery.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  // Nothing loaded and a reason why: the notice is the whole screen, with a way
  // out of it.
  if (threads === null) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice ?? "The inbox isn't available."}</Text>
          </View>
          {/* In practice this tap never shows its busy state: a refetch with
              no data resets the query to pending (v5 fetchState), so the
              isPending branch above takes over with the full-screen spinner on
              the very next render — the same switch the hand-rolled version
              made via setLoading(true). The isFetching guard is a one-frame
              belt-and-braces against a double tap, as `loading` was before. */}
          <Pressable
            accessibilityRole="button"
            disabled={threadsQuery.isFetching}
            onPress={() => {
              void threadsQuery.refetch();
            }}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              threadsQuery.isFetching && styles.buttonBusy,
            ]}
          >
            <Text style={styles.buttonText}>
              {threadsQuery.isFetching ? "Trying…" : "Try again"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
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
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        ListHeaderComponent={
          notice !== null ? (
            <View style={styles.noticeSlot}>
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet.</Text>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "label" ? (
            <Text style={styles.sectionLabel}>{item.label}</Text>
          ) : (
            <ThreadRow row={item} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
  },

  chrome: { backgroundColor: color.chrome },
  chromeTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  heading: { ...type.display, fontSize: 22, color: color.chromeInk },
  count: { alignItems: "flex-end" },
  countValue: {
    fontFamily: font.bodySemi,
    fontSize: 16,
    color: color.brand,
    fontVariant: ["tabular-nums"],
  },
  countLabel: { ...type.micro, color: color.chromeMuted, marginTop: 2 },
  caughtUp: { ...type.micro, color: color.chromeFaint, paddingBottom: space.xs },

  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  listEmpty: { flexGrow: 1 },

  sectionLabel: {
    ...type.micro,
    color: color.faint,
    marginTop: space.lg,
    marginBottom: space.sm,
  },

  thread: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    // The left rule is the unread signal. It is always drawn, so a row never
    // shifts sideways as it is answered — only its colour changes.
    borderLeftWidth: 3,
    borderLeftColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  threadWaiting: { borderLeftColor: color.brand },

  threadTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  nameQuiet: { color: color.muted },
  when: { ...type.small, color: color.faint, fontVariant: ["tabular-nums"] },
  whenWaiting: { color: color.brand },

  preview: { ...type.small, color: color.muted, marginTop: 2 },
  previewWaiting: { color: color.ink },
  previewQuiet: { color: color.faint },

  marker: { ...type.micro, color: color.muted, marginTop: space.xs },
  markerQuiet: { color: color.faint },

  noticeSlot: { marginBottom: space.md },
  notice: {
    alignSelf: "stretch",
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { ...type.small, color: color.danger },

  buttonBusy: { opacity: 0.6 },
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
  pressed: { backgroundColor: color.hover },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
