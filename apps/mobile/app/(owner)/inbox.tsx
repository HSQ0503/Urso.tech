import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
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
import { color, HIT, radius, space, type } from "@/theme";
import {
  Avatar,
  Chip,
  ChromeBar,
  SearchStrip,
  listRowStyle,
  searchInputStyle,
} from "@/components/ledger";

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
//
// New inbound texts arrive on their own — see POLL_MS.

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

// ── The poll ────────────────────────────────────────────────────────────────
//
// The web inbox refreshes itself every 30 seconds (InboxPoll → router.refresh()).
// Without it here, a text that lands while Sebastian is looking at this list
// stays invisible until he pulls down or leaves and comes back — on the one
// screen whose entire job is making the person waiting on him impossible to
// miss. Same 30s, so the two consoles agree on how stale "now" can be.
//
// refetchInterval is TanStack's own mechanism and would be the obvious answer,
// but it is declared on the hook, and the hooks live in src/queries.ts where
// useThreads is shared — thread/[phone] mounts it too, just to name the peer in
// its header. An interval set there would poll from every screen that happens to
// read the query. Driving refetch() from an interval owned by the screen keeps
// polling a property of the SCREEN, which is what it actually is.
const POLL_MS = 30_000;

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

// ── Search ──────────────────────────────────────────────────────────────────
//
// The whole thread list arrives in one read, so the box filters what is already
// in memory rather than asking the server on every keystroke — instant, and it
// keeps working in a driveway with one bar. Same contract as the customer book.
//
// Name matches on plain text; phone matches on digits, so "561" finds a number
// stored as +15615550123 and typing it with dashes still works. A thread with no
// saved name shows its number as its name, and the digit branch is what finds
// it — which is the common case here, since the inbox fills up with strangers.
function matchesThread(thread: Thread, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const name = thread.display_name?.trim().toLowerCase();
  if (name && name.includes(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && thread.peer_phone.includes(digits);
}

// Kind, plus the lead's stage when there is a lead. Whether the person texting
// is already booked changes what the owner does about them, and it costs no
// extra line to say so.
// ── Rows ────────────────────────────────────────────────────────────────────

type Row =
  | { kind: "label"; key: string; label: string; count: number }
  | {
      kind: "thread";
      key: string;
      phone: string;
      name: string;
      when: string;
      preview: string;
      category: ThreadKind;
      status: string | null;
      waiting: boolean;
      first: boolean;
      last: boolean;
    };

function toRow(thread: Thread, dayKeys: string[], first: boolean, last: boolean): Row {
  return {
    kind: "thread",
    key: thread.peer_phone,
    phone: thread.peer_phone,
    name: threadName(thread),
    when: relativeEt(thread.last_activity_at, dayKeys),
    preview: previewOf(thread),
    category: thread.kind,
    status: thread.lead ? STATUS_LABEL[thread.lead.status] : null,
    waiting: isWaiting(thread),
    first,
    last,
  };
}

function threadGroup(threads: Thread[], dayKeys: string[]): Row[] {
  return threads.map((thread, index) =>
    toRow(thread, dayKeys, index === 0, index === threads.length - 1),
  );
}

// `grouped` is false while a search is running — see the note beside the search
// box for why the urgency split comes off then.
function buildRows(threads: Thread[], nowMs: number, grouped: boolean): Row[] {
  const dayKeys = recentEtDayKeys(nowMs);
  // Sorted here as well as on the server so the screen's order is its own
  // guarantee rather than a borrowed one.
  const sorted = [...threads].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));

  if (!grouped) return threadGroup(sorted, dayKeys);

  const vendors = sorted.filter((thread) => thread.kind === "vendor");
  const leads = sorted.filter((thread) => thread.kind === "lead");
  const customers = sorted.filter((thread) => thread.kind === "customer");
  const rows: Row[] = [...threadGroup(vendors, dayKeys)];

  if (leads.length > 0) {
    rows.push({ kind: "label", key: "label-leads", label: "Leads", count: leads.length });
    rows.push(...threadGroup(leads, dayKeys));
  }
  if (customers.length > 0) {
    rows.push({
      kind: "label",
      key: "label-customers",
      label: "Customers",
      count: customers.length,
    });
    rows.push(...threadGroup(customers, dayKeys));
  }
  return rows;
}

// Tapping a row opens the conversation at /(owner)/thread/[phone].
function ThreadRow({
  row,
  onPress,
}: {
  row: Extract<Row, { kind: "thread" }>;
  onPress: () => void;
}) {
  const vendor = row.category === "vendor";
  const callPreview = row.preview.toLowerCase().includes("call");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.preview}. ${row.when}.`}
      onPress={onPress}
      style={({ pressed }) => [
        ...listRowStyle(row.first, row.last),
        styles.thread,
        pressed && styles.pressed,
      ]}
    >
      {vendor ? (
        <View style={styles.vendorAvatar}>
          <Feather name="volume-2" size={17} color={color.brand} />
        </View>
      ) : (
        <Avatar name={row.name} />
      )}
      <View style={styles.threadMain}>
        <View style={styles.threadTop}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          {row.category === "lead" && row.status ? (
            <Chip label={row.status} tone="neutral" />
          ) : row.category === "customer" ? (
            <Chip label={KIND_LABEL.customer} tone="neutral" />
          ) : null}
          <Text style={styles.when} numberOfLines={1}>
            {row.when}
          </Text>
        </View>

        <View style={styles.previewRow}>
          {callPreview ? <Feather name="phone-call" size={13} color={color.muted} /> : null}
          <Text style={styles.preview} numberOfLines={1}>
            {row.preview}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function InboxScreen(): React.ReactElement {
  const router = useRouter();
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

  // The poll itself. useFocusEffect's cleanup runs on blur AND on unmount, so
  // the timer can never outlive this screen — tab away and it stops, come back
  // and a fresh one starts (after useRefetchOnFocus has already refreshed).
  //
  // Focus alone is not enough on a phone: a backgrounded app keeps its focused
  // screen focused, so a phone face-down in a truck would keep waking the radio
  // every 30 seconds for a list nobody is reading. Checking AppState at tick
  // time costs nothing and needs no second subscription — and the existing
  // "active" listener below re-stamps the day labels on return anyway, with the
  // next tick refreshing the data right behind it.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        if (AppState.currentState !== "active") return;
        void threadsQuery.refetch();
      }, POLL_MS);
      return () => clearInterval(id);
    }, [threadsQuery.refetch]),
  );

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

  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const visible = useMemo(
    () => (threads ?? []).filter((thread) => matchesThread(thread, query)),
    [threads, query],
  );

  // Searching collapses "Waiting on you" / "Everything else" into one
  // recency-ordered list.
  //
  // The split answers "who do I deal with next?". Someone typing has already
  // answered that and is hunting ONE conversation they can name, so re-imposing
  // the split spends two headings on three results and hides the hit behind
  // chrome. Nothing about urgency is lost in the process: each row keeps its
  // orange left rule and orange timestamp, which is where waiting actually lives
  // — the headings only ever grouped what the rows already said.
  const rows = useMemo(
    () => buildRows(visible, nowMs, !searching),
    [visible, nowMs, searching],
  );

  const header = <ChromeBar title="Inbox" />;

  const searchBar = (
    <SearchStrip>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or phone"
        placeholderTextColor={color.faint}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel="Search conversations"
        style={searchInputStyle}
      />
    </SearchStrip>
  );

  if (threadsQuery.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        {/* The box is live through the load, as it is on the customer book: a
            search typed while the list is arriving applies the moment it lands. */}
        {searchBar}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  // Nothing loaded and a reason why: the notice is the whole screen, with a way
  // out of it. No search box here — there is nothing loaded to search, and a
  // field that can only ever return nothing reads as a second failure.
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
      {searchBar}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
            <Text style={styles.emptyText}>
              {searching
                ? "No conversations match that."
                : "No conversations yet. They appear when someone texts or calls the shop."}
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "label" ? (
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>{item.label}</Text>
              <Text style={styles.sectionCount}>— {item.count}</Text>
            </View>
          ) : (
            <ThreadRow
              row={item}
              onPress={() =>
                router.push({ pathname: "/(owner)/thread/[phone]", params: { phone: item.phone } })
              }
            />
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

  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  listEmpty: { flexGrow: 1 },

  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    ...type.rule,
    color: color.faint,
  },
  sectionCount: { ...type.rule, color: color.faint },

  thread: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  vendorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandSoft,
  },
  threadMain: { flex: 1, minWidth: 0 },

  threadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  when: {
    ...type.small,
    color: color.faint,
    fontVariant: ["tabular-nums"],
    marginLeft: "auto",
  },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  preview: { ...type.small, color: color.muted, flexShrink: 1 },

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
