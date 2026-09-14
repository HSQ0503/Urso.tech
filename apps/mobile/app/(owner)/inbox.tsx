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
  CALL_OWNER_MISSED_STATUS,
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  type Call,
  type Thread,
} from "@urso/types";
import { useCalls, useThreads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";
import { Avatar, ChromeBar, SearchStrip, listRowStyle, searchInputStyle } from "@/components/ledger";

// The inbox — the business line, in the shape Sebastian drew (2026-09-13).
//
// One list, two tabs, one colour rule:
//
//   Texts      every text conversation, newest first.
//              ORANGE = the customer spoke last, a reply is owed.
//              GRAY   = you spoke last, waiting on them.
//   Call Logs  every call, newest first.
//              ORANGE = a missed inbound call.
//              WHITE  = a call you placed that went unanswered, or any answered
//                       call — nothing is owed, the row just says what happened.
//
// No filter chips, no "Needs reply / Leads / Customers / Lead source" bands. The
// vendor lead feed is not shown here at all: those texts are already parsed into
// Leads, and a permanently-inbound firehose in the inbox buried the one
// customer who was actually waiting.
//
// Times are America/New_York, always, through fmtEt. Nothing on this screen
// reads the device calendar — see the note on recentEtDayKeys.

// ── Eastern-time day arithmetic ─────────────────────────────────────────────
//
// "3:42 PM" / "Yesterday" / "Tue" / "Jul 12" means deciding what ET calendar
// day an instant fell on. That decision is made ONLY by comparing fmtEt output
// to fmtEt output — never by parsing a date back out of a formatted string, and
// never by getDate()/getMonth(). src/intl-guard.ts exists because this
// platform's formatter and Node's disagree on invisible punctuation; string
// equality can't be fooled by it.

function etDayKey(iso: string): string {
  return fmtEt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
}

// The last seven ET calendar days, newest first. Stepping is 12 hours rather
// than 24 so the 25-hour day at the DST fall-back can't land twice.
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
  return fmtEt(iso, { month: "short", day: "numeric" });
}

// ── The poll ────────────────────────────────────────────────────────────────
//
// Same 30 seconds as the web inbox, so the two consoles agree on how stale
// "now" can be. Owned by the screen (not the shared hook) so only this screen
// polls, and only while focused and the app is active.
const POLL_MS = 30_000;

type Tab = "texts" | "calls";

// ── Thread reading ──────────────────────────────────────────────────────────

function threadName(thread: Thread): string {
  const name = thread.display_name?.trim();
  return name ? name : fmtPhone(thread.peer_phone);
}

function mediaLabel(count: number): string {
  if (count === 0) return "No text";
  return count === 1 ? "Photo" : `${count} photos`;
}

function textPreview(thread: Thread): string {
  const message = thread.last_message;
  if (message === null) return "";
  const body = message.body.trim() || mediaLabel(message.media_urls.length);
  if (message.direction === "in") return body;
  // An automated send is not an answer from a person; say so in the preview
  // even though the row reads gray (you spoke last).
  return `${message.automated ? "Auto" : "You"}: ${body}`;
}

// Name matches on plain text; phone matches on digits, so "561" finds a number
// stored as +15615550123 and typing it with dashes still works.
function matchesQuery(name: string | null | undefined, phone: string, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const trimmed = name?.trim().toLowerCase();
  if (trimmed && trimmed.includes(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && phone.includes(digits);
}

// ── Rows ────────────────────────────────────────────────────────────────────

type TextRow = {
  kind: "text";
  key: string;
  phone: string;
  name: string;
  when: string;
  preview: string;
  photo: boolean;
  // The customer spoke last — a reply is owed. This is the orange.
  waiting: boolean;
  first: boolean;
  last: boolean;
};

type CallTone = "missed" | "unanswered" | "answered";

type CallRow = {
  kind: "call";
  key: string;
  phone: string;
  name: string;
  when: string;
  line: string;
  tone: CallTone;
  first: boolean;
  last: boolean;
};

// Texts = threads that actually have a text on them (call-only peers belong to
// Call Logs), minus the vendor feed. Ordered by the last TEXT, not the last
// event, so a missed call does not float a quiet conversation to the top of
// the Texts tab.
function textRows(threads: Thread[], query: string, dayKeys: string[]): TextRow[] {
  const visible = threads
    .filter((thread) => thread.kind !== "vendor" && thread.last_message !== null)
    .filter((thread) => matchesQuery(thread.display_name, thread.peer_phone, query))
    .sort((a, b) =>
      (b.last_message as NonNullable<Thread["last_message"]>).created_at.localeCompare(
        (a.last_message as NonNullable<Thread["last_message"]>).created_at,
      ),
    );
  return visible.map((thread, index) => {
    const message = thread.last_message as NonNullable<Thread["last_message"]>;
    const preview = textPreview(thread);
    return {
      kind: "text",
      key: thread.peer_phone,
      phone: thread.peer_phone,
      name: threadName(thread),
      when: relativeEt(message.created_at, dayKeys),
      preview,
      photo: message.body.trim().length === 0 && message.media_urls.length > 0,
      waiting: message.direction === "in",
      first: index === 0,
      last: index === visible.length - 1,
    };
  });
}

// What one call was, in the owner's words. A bridged click-to-call is written
// as "initiated" while Twilio is still ringing (reads "Connecting…"), then the
// bridge records the customer leg's outcome. An owner leg that was never
// answered gets its own line — Sebastian's iPhone shows that case as a missed
// call from his own business number, which is unreadable.
function callLine(call: Call): { line: string; tone: CallTone } {
  const duration = fmtCallDuration(call.duration_seconds);
  if (call.direction === "in") {
    if (isMissedCall(call)) {
      const voicemail = Boolean(call.recording_url || call.transcript);
      return { line: voicemail ? "Missed call · Voicemail" : "Missed call", tone: "missed" };
    }
    return { line: duration ? `Incoming call · ${duration}` : "Incoming call", tone: "answered" };
  }
  if (call.status === CALL_OWNER_MISSED_STATUS) {
    return { line: "Callback missed · you didn't pick up", tone: "missed" };
  }
  if (call.status === "initiated") {
    return { line: "Connecting your phone…", tone: "unanswered" };
  }
  if (call.status === "completed" && duration) {
    return { line: `You called · ${duration}`, tone: "answered" };
  }
  if (call.status === "completed") return { line: "You called", tone: "answered" };
  if (call.status === "no-answer" || call.status === "busy") {
    return { line: "You called · No answer", tone: "unanswered" };
  }
  if (call.status === "failed" || call.status === "canceled") {
    return { line: "You called · Didn't connect", tone: "unanswered" };
  }
  return { line: "You called", tone: "unanswered" };
}

function callRows(
  calls: Call[],
  nameByPhone: Map<string, string>,
  query: string,
  dayKeys: string[],
): CallRow[] {
  const visible = calls
    .filter((call) => matchesQuery(nameByPhone.get(call.peer_phone) ?? null, call.peer_phone, query))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return visible.map((call, index) => {
    const { line, tone } = callLine(call);
    return {
      kind: "call",
      key: call.id,
      phone: call.peer_phone,
      name: nameByPhone.get(call.peer_phone) ?? fmtPhone(call.peer_phone),
      when: relativeEt(call.created_at, dayKeys),
      line,
      tone,
      first: index === 0,
      last: index === visible.length - 1,
    };
  });
}

// ── Row views ───────────────────────────────────────────────────────────────

function TextThreadRow({ row, onPress }: { row: TextRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.waiting ? "Waiting on your reply. " : ""}${row.preview}. ${row.when}.`}
      onPress={onPress}
      style={({ pressed }) => [
        ...listRowStyle(row.first, row.last),
        styles.row,
        row.waiting && styles.rowWaiting,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={row.name} />
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          {row.waiting ? <View style={styles.waitingDot} /> : null}
          <Text style={[styles.name, row.waiting && styles.nameWaiting]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={[styles.when, row.waiting && styles.whenWaiting]} numberOfLines={1}>
            {row.when}
          </Text>
        </View>
        <View style={styles.previewRow}>
          {row.photo ? <Feather name="image" size={13} color={color.muted} /> : null}
          <Text style={styles.preview} numberOfLines={1}>
            {row.preview}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const CALL_ICON: Record<CallTone, { name: "phone-missed" | "phone-outgoing" | "phone-incoming"; tint: string }> = {
  missed: { name: "phone-missed", tint: color.brandDeep },
  unanswered: { name: "phone-outgoing", tint: color.muted },
  answered: { name: "phone-incoming", tint: color.good },
};

function CallLogRow({ row, onPress }: { row: CallRow; onPress: () => void }) {
  const icon = CALL_ICON[row.tone];
  const missed = row.tone === "missed";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.line}. ${row.when}.`}
      onPress={onPress}
      style={({ pressed }) => [
        ...listRowStyle(row.first, row.last),
        styles.row,
        missed && styles.rowWaiting,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={row.name} />
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          {missed ? <View style={styles.waitingDot} /> : null}
          <Text style={[styles.name, missed && styles.nameWaiting]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={[styles.when, missed && styles.whenWaiting]} numberOfLines={1}>
            {row.when}
          </Text>
        </View>
        <View style={styles.previewRow}>
          <Feather name={icon.name} size={13} color={icon.tint} />
          <Text style={[styles.preview, missed && styles.previewMissed]} numberOfLines={1}>
            {row.line}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// The two-way switch under the search box. Brand fill on the active side is
// exactly the mock; it is the only place on the screen the brand appears as a
// fill, so it reads as "which list am I on" and nothing else.
function TabSwitch({ current, onPick }: { current: Tab; onPick: (tab: Tab) => void }) {
  return (
    <View style={styles.tabs}>
      {(["texts", "calls"] as const).map((tab) => {
        const on = tab === current;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(tab)}
            style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && styles.pressed]}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>
              {tab === "texts" ? "Texts" : "Call Logs"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function InboxScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A refusal keeps whatever is already on screen (query.data survives an
  // error state), and the notice is the server's sentence, shown verbatim.
  const threadsQuery = useThreads();
  const callsQuery = useCalls();

  const refetchAll = useCallback(
    () => Promise.all([threadsQuery.refetch(), callsQuery.refetch()]),
    [threadsQuery.refetch, callsQuery.refetch],
  );
  useRefetchOnFocus(refetchAll);
  const { refreshing, onRefresh } = usePullToRefresh(refetchAll);

  // useFocusEffect's cleanup runs on blur AND on unmount, so the timer can
  // never outlive this screen. AppState is checked at tick time so a phone
  // face-down in a truck does not wake the radio for a list nobody is reading.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        if (AppState.currentState !== "active") return;
        void refetchAll();
      }, POLL_MS);
      return () => clearInterval(id);
    }, [refetchAll]),
  );

  const threads = threadsQuery.data ?? null;
  const calls = callsQuery.data ?? null;
  const notice = noticeFrom(threadsQuery.error) ?? noticeFrom(callsQuery.error);

  // Relative labels are computed against a reference instant, re-stamped when
  // the app comes back to the foreground — which is when a phone actually
  // crosses ET midnight in someone's hand.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") setNowMs(Date.now());
    });
    return () => sub.remove();
  }, []);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("texts");
  const searching = query.trim().length > 0;

  const dayKeys = useMemo(() => recentEtDayKeys(nowMs), [nowMs]);

  // Names for the call log come from the thread list (contact name wins over
  // lead name there already); the call table itself only knows the number.
  const nameByPhone = useMemo(() => {
    const map = new Map<string, string>();
    for (const thread of threads ?? []) {
      const name = thread.display_name?.trim();
      if (name) map.set(thread.peer_phone, name);
    }
    return map;
  }, [threads]);

  const texts = useMemo(() => textRows(threads ?? [], query, dayKeys), [threads, query, dayKeys]);
  const callLog = useMemo(
    () => callRows(calls ?? [], nameByPhone, query, dayKeys),
    [calls, nameByPhone, query, dayKeys],
  );

  const waitingCount = useMemo(
    () => textRows(threads ?? [], "", dayKeys).filter((row) => row.waiting).length,
    [threads, dayKeys],
  );
  const missedCount = useMemo(
    () => (calls ?? []).filter((call) => isMissedCall(call)).length,
    [calls],
  );

  const header = (
    <ChromeBar
      title="Inbox"
      action="New chat"
      onAction={() => router.push("/(owner)/thread/new")}
      sub={
        waitingCount > 0
          ? `${waitingCount} ${waitingCount === 1 ? "conversation needs" : "conversations need"} a reply.`
          : "You're caught up on texts."
      }
    />
  );

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

  const loading = tab === "texts" ? threadsQuery.isPending : callsQuery.isPending;
  const dead = tab === "texts" ? threads === null : calls === null;

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        {searchBar}
        <TabSwitch current={tab} onPick={setTab} />
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
        <TabSwitch current={tab} onPick={setTab} />
        <View style={styles.centre}>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice ?? "The inbox isn't available."}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={threadsQuery.isFetching || callsQuery.isFetching}
            onPress={() => void refetchAll()}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              (threadsQuery.isFetching || callsQuery.isFetching) && styles.buttonBusy,
            ]}
          >
            <Text style={styles.buttonText}>
              {threadsQuery.isFetching || callsQuery.isFetching ? "Trying…" : "Try again"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const openThread = (phone: string) =>
    router.push({ pathname: "/(owner)/thread/[phone]", params: { phone } });

  const emptyText = searching
    ? tab === "texts"
      ? "No conversations match that."
      : "No calls match that."
    : tab === "texts"
      ? "No text conversations yet. They appear when someone texts the business line, or when you start a chat."
      : "No calls yet. Missed calls, calls you placed, and calls you answered all land here.";

  return (
    <View style={styles.screen}>
      {header}
      {searchBar}
      <TabSwitch current={tab} onPick={setTab} />
      {tab === "calls" && missedCount > 0 && !searching ? (
        <Text style={styles.tabHint}>
          {missedCount} missed {missedCount === 1 ? "call" : "calls"} in orange. Tap one to text or call back.
        </Text>
      ) : null}
      {tab === "texts" ? (
        <FlatList
          data={texts}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + space.xxl },
            texts.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
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
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => <TextThreadRow row={item} onPress={() => openThread(item.phone)} />}
        />
      ) : (
        <FlatList
          data={callLog}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + space.xxl },
            callLog.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
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
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => <CallLogRow row={item} onPress={() => openThread(item.phone)} />}
        />
      )}
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

  tabs: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.hover,
  },
  tabOn: { backgroundColor: color.brandFill },
  tabText: { fontFamily: font.bodySemi, fontSize: 15, color: color.ink },
  tabTextOn: { color: color.surface },
  tabHint: { ...type.small, color: color.muted, marginHorizontal: 20, marginTop: 8 },

  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  listEmpty: { flexGrow: 1 },

  row: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  // The orange: a left rule, a wash, and a dot before the name.
  rowWaiting: {
    borderLeftWidth: 2,
    borderLeftColor: color.brand,
    backgroundColor: color.brandWash,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  waitingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.brand },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  nameWaiting: { color: color.ink },
  when: {
    ...type.small,
    color: color.faint,
    fontVariant: ["tabular-nums"],
    marginLeft: "auto",
  },
  whenWaiting: { color: color.brandDeep, fontFamily: font.bodyMedium },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  preview: { ...type.small, color: color.muted, flexShrink: 1 },
  previewMissed: { color: color.brandDeep },

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
