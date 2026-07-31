// The conversation — one phone number, everything said and every call, oldest
// at the top, newest at the bottom, exactly the stream the web inbox renders.
//
// The route param IS the thread key: the peer phone. Messages and calls merge
// by timestamp (ISO strings compare correctly, same as the server's ordering);
// day separators are derived ONLY by comparing fmtEt output to fmtEt output —
// the inbox.tsx parsing ban applies here too, because the platform formatter's
// invisible punctuation cannot fool string equality.
//
// The composer texts through the LEAD's sendMessage action — that action
// requires a lead id, so a thread with no lead gets a plain sentence instead
// of a composer that would dead-end. The peer phone rides in the body, the
// same way the web composer is handed it, so mobile can never text a
// different number than web does for the same thread.
//
// A2P NOTE: until the campaign clears, an outbound SMS still lands
// undelivered carrier-side. The send itself succeeds and logs to the thread —
// which is what this screen shows — and a carrier failure surfaces later as
// that message's "Not delivered" marker.

import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  STATUS_LABEL,
  type Call,
  type Message,
  type Thread,
  type ThreadKind,
} from "@urso/types";
import { leadActions } from "@/api";
import { Notice } from "@/components/notice";
import { keys, useThreadCalls, useThreadMessages, useThreads } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const KIND_LABEL: Record<ThreadKind, string> = {
  vendor: "Lead vendor",
  lead: "Lead",
  customer: "Customer",
};

// The thread readers cap what they return (500 messages / 200 calls); render
// only the newest slice so a very long thread opens at its latest activity —
// the same rationale as the web conversation's MAX_STREAM_ITEMS.
const MAX_STREAM_ITEMS = 300;

// What ET calendar day an instant fell on, decided by comparing fmtEt output
// to fmtEt output — never by parsing a formatted string back apart.
function etDayKey(iso: string): string {
  return fmtEt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function mediaLabel(count: number): string {
  if (count === 0) return "No text";
  return count === 1 ? "Photo" : `${count} photos`;
}

type StreamItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message }
  | { kind: "call"; key: string; call: Call };

function buildStream(messages: Message[], calls: Call[]): StreamItem[] {
  const merged = [
    ...messages.map((m) => ({
      at: m.created_at,
      item: { kind: "message", key: `m-${m.id}`, message: m } as const,
    })),
    ...calls.map((c) => ({
      at: c.created_at,
      item: { kind: "call", key: `c-${c.id}`, call: c } as const,
    })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_STREAM_ITEMS);

  const out: StreamItem[] = [];
  let day = "";
  for (const { at, item } of merged) {
    const key = etDayKey(at);
    if (key !== day) {
      day = key;
      out.push({
        kind: "day",
        key: `d-${key}`,
        label: fmtEt(at, { weekday: "short", month: "short", day: "numeric" }),
      });
    }
    out.push(item);
  }
  return out;
}

// A bubble carries only the time; its day lives in the separator above it —
// which is how the web thread reads (today's messages stamp as bare times).
function stampTime(iso: string): string {
  return fmtEt(iso, { hour: "numeric", minute: "2-digit" });
}

function MessageBubble({ message }: { message: Message }) {
  const out = message.direction === "out";
  const body = message.body.trim() || mediaLabel(message.media_urls.length);
  const failed =
    message.delivery_status === "failed" || message.delivery_status === "undelivered";
  return (
    <View style={[styles.itemWrap, out ? styles.wrapOut : styles.wrapIn]}>
      {/* An automated send is not an answer — the marker keeps the hold text
          from reading as a reply Sebastian wrote. */}
      {out && message.automated ? <Text style={styles.autoMark}>Auto</Text> : null}
      <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
        <Text style={styles.bubbleText}>{body}</Text>
      </View>
      <Text style={styles.stamp}>{stampTime(message.created_at)}</Text>
      {failed ? <Text style={styles.failed}>Not delivered</Text> : null}
    </View>
  );
}

function CallRow({ call }: { call: Call }) {
  const out = call.direction === "out";
  const missed = isMissedCall(call);
  const duration = fmtCallDuration(call.duration_seconds);
  const label = missed ? "Missed call" : out ? "Outgoing call" : "Incoming call";
  const line = !missed && duration ? `${label} · ${duration}` : label;
  return (
    <View style={[styles.itemWrap, styles.callRow, out ? styles.wrapOut : styles.wrapIn]}>
      <Feather
        name={missed ? "phone-missed" : out ? "phone-outgoing" : "phone-incoming"}
        size={13}
        color={missed ? color.danger : color.muted}
      />
      <Text style={[styles.callLine, missed && styles.callMissed]} numberOfLines={1}>
        {line}
      </Text>
      <Text style={styles.stamp}>{stampTime(call.created_at)}</Text>
    </View>
  );
}

function threadTitle(thread: Thread | null, phone: string): string {
  const name = thread?.display_name?.trim();
  return name ? name : fmtPhone(phone);
}

// Kind, plus the lead's stage when there is a lead — the inbox row's marker,
// carried into the header so the context survives the tap.
function threadMeta(thread: Thread | null, phone: string): string | null {
  if (thread === null) return null;
  const kind = KIND_LABEL[thread.kind];
  const marker = thread.lead ? `${kind} · ${STATUS_LABEL[thread.lead.status]}` : kind;
  return thread.display_name?.trim() ? `${fmtPhone(phone)} · ${marker}` : marker;
}

export default function ThreadScreen(): React.ReactElement {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const insets = useSafeAreaInsets();

  // Three reads: the stream's two halves, plus the threads list — already
  // cached by the inbox this screen was pushed from — to name the peer and
  // find its lead / customer. Like the other pushed detail screens, no focus
  // refetch: pull-to-refresh is the reader's explicit refresh.
  const messagesQuery = useThreadMessages(phone);
  const callsQuery = useThreadCalls(phone);
  const threadsQuery = useThreads();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([messagesQuery.refetch(), callsQuery.refetch(), threadsQuery.refetch()]),
  );

  const thread = (threadsQuery.data ?? []).find((t) => t.peer_phone === phone) ?? null;
  const lead = thread?.lead ?? null;
  const contactId = thread?.contact_id ?? null;

  const [draft, setDraft] = useState("");
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  // A sent text lands in this stream and reorders the inbox; it also writes a
  // lead event when the thread has a lead.
  const sendRun = useAction(
    (vars: { leadId: string; message: string }) =>
      leadActions.sendMessage(vars.leadId, phone, vars.message),
    {
      // A successful send can flip a "new" lead to "contacted" server-side, so
      // the lead's own record and every attention surface refresh with the
      // thread — the same set the lead-detail composer invalidates.
      invalidates:
        lead !== null
          ? [
              keys.threads.messages(phone),
              keys.threads.all(),
              keys.leads.events(lead.id),
              keys.leads.one(lead.id),
              keys.leads.all(),
              keys.overview(),
              keys.agenda(),
            ]
          : [keys.threads.messages(phone), keys.threads.all()],
    },
  );

  const messages = messagesQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const messagesNotice = noticeFrom(messagesQuery.error);
  const callsNotice = noticeFrom(callsQuery.error);
  const threadsNotice = noticeFrom(threadsQuery.error);

  const stream = buildStream(messages, calls);

  // Scroll to the newest item when the newest item CHANGES — first load and
  // new activity, but not a refetch that added nothing. A reader scrolled up
  // in history WILL be pulled to the end when something new lands; there is
  // no scroll-position tracking here, and for a live conversation jumping to
  // the newest message is the behaviour a texting screen teaches anyway.
  // onContentSizeChange rather than an effect because scrollToEnd needs the
  // native layout to exist first.
  const scrollRef = useRef<ScrollView>(null);
  const lastKey = stream.length > 0 ? stream[stream.length - 1].key : null;
  const lastKeyRef = useRef<string | null>(null);
  const onContentSizeChange = () => {
    if (lastKey !== null && lastKey !== lastKeyRef.current) {
      lastKeyRef.current = lastKey;
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  };

  const goPeer = () => {
    // Names navigate: the customer profile when the phone resolves to one,
    // otherwise the lead. A thread with neither has nowhere to go yet.
    if (contactId !== null) {
      router.push({ pathname: "/(owner)/customer/[id]", params: { id: contactId } });
    } else if (lead !== null) {
      router.push({ pathname: "/(owner)/lead/[id]", params: { id: lead.id } });
    }
  };
  const navigable = contactId !== null || lead !== null;

  const send = async () => {
    if (lead === null) return; // the composer never renders without one
    const r = await sendRun.mutateAsync({ leadId: lead.id, message: draft.trim() });
    if (r.ok) {
      setDraft(""); // cleared ONLY on ok — a refused message stays put for a retry
      setSendNotice(null);
    } else {
      setSendNotice(r.notice);
    }
  };

  const meta = threadMeta(thread, phone);

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Feather name="chevron-left" size={20} color={color.chromeMuted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Pressable
        accessibilityRole={navigable ? "button" : undefined}
        accessibilityLabel={
          navigable
            ? `Open ${contactId !== null ? "customer" : "lead"} ${threadTitle(thread, phone)}`
            : undefined
        }
        disabled={!navigable}
        onPress={goPeer}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.peer, pressed && navigable && styles.backPressed]}
      >
        <Text style={styles.chromeName} numberOfLines={1}>
          {threadTitle(thread, phone)}
        </Text>
        {navigable ? (
          <Feather name="chevron-right" size={18} color={color.chromeFaint} />
        ) : null}
      </Pressable>
      {meta !== null ? <Text style={styles.chromeMeta}>{meta}</Text> : null}
    </View>
  );

  if (messagesQuery.isPending || callsQuery.isPending || threadsQuery.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={styles.streamBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          <Notice text={messagesNotice} />
          <Notice text={callsNotice} />
          <Notice text={threadsNotice} />

          {stream.length === 0 &&
          messagesQuery.data !== undefined &&
          callsQuery.data !== undefined ? (
            <Text style={styles.empty}>No messages in this thread yet.</Text>
          ) : null}

          {stream.map((item) => {
            if (item.kind === "day") {
              return (
                <Text key={item.key} style={styles.daySep}>
                  {item.label}
                </Text>
              );
            }
            if (item.kind === "message") {
              return <MessageBubble key={item.key} message={item.message} />;
            }
            return <CallRow key={item.key} call={item.call} />;
          })}
        </ScrollView>

        <View style={[styles.composerBar, { paddingBottom: insets.bottom + space.sm }]}>
          {lead !== null ? (
            <View style={styles.composerRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                editable={!sendRun.isPending}
                multiline
                placeholder="Type a message"
                placeholderTextColor={color.faint}
                accessibilityLabel={`Message ${threadTitle(thread, phone)}`}
                onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                style={styles.composerInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={sendRun.isPending || draft.trim().length === 0}
                onPress={() => void send()}
                style={({ pressed }) => [
                  styles.send,
                  pressed && styles.sendPressed,
                  (sendRun.isPending || draft.trim().length === 0) && styles.disabled,
                ]}
              >
                <Text style={styles.sendText}>{sendRun.isPending ? "Sending…" : "Send"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.noLead}>
              This number has no lead yet — texting starts from a lead.
            </Text>
          )}
          <Notice text={sendNotice} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
  },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
  peer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    maxWidth: "100%",
  },
  chromeName: { ...type.display, color: color.chromeInk, flexShrink: 1 },
  chromeMeta: { ...type.micro, color: color.chromeMuted },

  streamBody: { padding: space.lg, gap: space.sm },
  empty: { ...type.small, color: color.muted, textAlign: "center", marginTop: space.xl },

  daySep: {
    ...type.micro,
    color: color.faint,
    alignSelf: "center",
    marginTop: space.md,
    marginBottom: space.xs,
  },

  itemWrap: { maxWidth: "78%", gap: 2 },
  wrapIn: { alignSelf: "flex-start", alignItems: "flex-start" },
  wrapOut: { alignSelf: "flex-end", alignItems: "flex-end" },

  bubble: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bubbleIn: { backgroundColor: color.surface },
  bubbleOut: { backgroundColor: color.brandSoft },
  bubbleText: { ...type.body, color: color.ink },
  autoMark: { ...type.micro, color: color.faint },
  stamp: { ...type.micro, color: color.faint, fontVariant: ["tabular-nums"] },
  failed: { ...type.micro, color: color.danger },

  callRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
  },
  callLine: { ...type.small, color: color.muted, flexShrink: 1 },
  callMissed: { color: color.danger },

  composerBar: {
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  composerInput: {
    // No lineHeight — iOS renders a TextInput placeholder with visibly wrong
    // tracking when lineHeight rides a custom font (see customers.tsx search).
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    flex: 1,
    minHeight: HIT,
    maxHeight: 120,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
    textAlignVertical: "top",
  },
  send: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  sendPressed: { backgroundColor: color.brandDown },
  sendText: { ...type.title, color: color.chromeInk },
  disabled: { opacity: 0.5 },

  noLead: { ...type.small, color: color.muted, textAlign: "center", paddingVertical: space.sm },
});
