// The conversation — one phone number, everything said and every call, oldest
// at the top, newest at the bottom, exactly the stream the web inbox renders.
//
// The route param IS the thread key: the peer phone. Messages and calls merge
// by timestamp (ISO strings compare correctly, same as the server's ordering);
// day separators are derived ONLY by comparing fmtEt output to fmtEt output —
// the inbox.tsx parsing ban applies here too, because the platform formatter's
// invisible punctuation cannot fool string equality.
//
// The composer sends on EVERY thread, the way the web one does. Both paths end
// in the same sendMessage action; they differ only in where the peer phone
// rides and what bookkeeping the send implies:
//
//   with a lead → POST /canes/leads/:id/actions, phone in the body (exactly
//     how the web composer is handed it, so mobile can never text a different
//     number than web does for the same thread). A send can flip a "new" lead
//     to "contacted" and writes a lead event, so the lead's surfaces refresh.
//   without a lead → POST /canes/threads/:phone/messages, phone in the path.
//     Nothing lead-shaped to invalidate because nothing lead-shaped moved.
//
// A thread with no lead — a contact created outside the lead flow, or one whose
// lead was deleted — used to get a muted sentence where the input belongs. That
// was a phone refusing to text a number the console texts fine.
//
// A2P NOTE: until the campaign clears, an outbound SMS still lands
// undelivered carrier-side. The send itself succeeds and logs to the thread —
// which is what this screen shows — and a carrier failure surfaces later as
// that message's "Not delivered" marker.

import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import { callActions, leadActions, threadActions } from "@/api";
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

// Same cadence as the inbox list and as the web (InboxPoll's 30s) — see the
// poll's own note inside the screen for why the interval lives here rather than
// as a refetchInterval on the shared hooks.
const POLL_MS = 30_000;

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

// A success payload can carry a sentence of its own — the bridge's does, and it
// is the sentence that matters most here ("Calling your phone now — answer to
// connect"). Read it without claiming a shape the action types don't promise.
function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

// The green sibling of Notice — same shape, good colours — for the ok:true
// sentences. Local to the screen, same as lead/[id] and invoice/[id].
function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.goodNotice}>
      <Text style={styles.goodNoticeText}>{text}</Text>
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
  // refetch: pull-to-refresh is the reader's explicit refresh, and the poll
  // below is what arrives while he is still reading.
  const messagesQuery = useThreadMessages(phone);
  const callsQuery = useThreadCalls(phone);
  const threadsQuery = useThreads();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([messagesQuery.refetch(), callsQuery.refetch(), threadsQuery.refetch()]),
  );

  // A reply that lands while this conversation is OPEN has to appear on its
  // own — the web page polls every 30 seconds and this is the same poll, since
  // the alternative is Sebastian staring at a thread pulling down to find out
  // whether anyone answered him.
  //
  // Only the stream's two halves: a new message or a new call is the whole of
  // what can change here. The threads list is left out on purpose — it is read
  // for the header's name and stage, which do not move mid-conversation, and
  // the inbox refetches it on its own focus the moment this screen is popped.
  //
  // useFocusEffect's cleanup fires on blur and on unmount, so the timer cannot
  // outlive the screen; the AppState check stops a backgrounded app from
  // polling from a pocket, which is the battery this is meant to protect. See
  // inbox.tsx's POLL_MS note for why the interval lives in the screen rather
  // than as a refetchInterval on the shared hook.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        if (AppState.currentState !== "active") return;
        void messagesQuery.refetch();
        void callsQuery.refetch();
      }, POLL_MS);
      return () => clearInterval(id);
    }, [messagesQuery.refetch, callsQuery.refetch]),
  );

  const thread = (threadsQuery.data ?? []).find((t) => t.peer_phone === phone) ?? null;
  const lead = thread?.lead ?? null;
  const contactId = thread?.contact_id ?? null;

  const [draft, setDraft] = useState("");
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  // The bridge answers in two directions: a refusal (no Twilio credentials, no
  // owner phone, no number) and a success that still has something to say.
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callGood, setCallGood] = useState<string | null>(null);

  // Click-to-call through the Twilio bridge — what the web conversation header
  // has offered all along. NOT a tel: link: this rings Sebastian's handset
  // first, then dials the peer with the BUSINESS number as caller ID, and
  // writes a call row against the phone (and a lead event when there is a
  // lead). The thread key IS the peer phone, so that is what gets dialled; the
  // lead id rides along only when the thread has one, exactly like the composer
  // above it.
  const bridgeRun = useAction((leadId: string | undefined) => callActions.bridge(phone, leadId), {
    // The call lands in this stream and moves the thread's last activity, so
    // the inbox refreshes with it; a lead-bound call also writes the event and
    // the lead's own call list.
    invalidates:
      lead !== null
        ? [
            keys.threads.calls(phone),
            keys.threads.all(),
            keys.leads.calls(lead.id),
            keys.leads.events(lead.id),
            keys.leads.one(lead.id),
          ]
        : [keys.threads.calls(phone), keys.threads.all()],
  });

  // A sent text lands in this stream and reorders the inbox; it also writes a
  // lead event when the thread has a lead. The lead-free path is the thread
  // route, which the same action backs — never a client-side refusal.
  const sendRun = useAction(
    (vars: { leadId: string | null; message: string }) =>
      vars.leadId === null
        ? threadActions.sendMessage(phone, vars.message)
        : leadActions.sendMessage(vars.leadId, phone, vars.message),
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

  // The action returns once Twilio has ACCEPTED the call — before any phone has
  // rung. The server's sentence says exactly that and is shown verbatim; the
  // fallback is this screen's own words for the same fact, used only if a
  // success arrives with nothing said. Neither implies the peer is connected.
  const startBridge = async () => {
    setCallNotice(null);
    setCallGood(null);
    const r = await bridgeRun.mutateAsync(lead?.id);
    if (r.ok) {
      setCallGood(
        successNotice(r.data) ?? "Your phone should ring in a moment — answer to connect.",
      );
    } else {
      setCallNotice(r.notice);
    }
  };

  const send = async () => {
    const r = await sendRun.mutateAsync({ leadId: lead?.id ?? null, message: draft.trim() });
    if (r.ok) {
      setDraft(""); // cleared ONLY on ok — a refused message stays put for a retry
      setSendNotice(null);
    } else {
      setSendNotice(r.notice);
    }
  };

  const meta = threadMeta(thread, phone);

  const header = (
    <>
      <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.chromeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Feather name="chevron-left" size={20} color={color.brand} />
            <Text style={styles.backText}>Inbox</Text>
          </Pressable>
          {/* The conversation's call affordance, where the web puts it. The
              peer phone is the route param, so this works before the threads
              list has landed — there is nothing else it needs to know. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${threadTitle(thread, phone)} on the business line`}
            accessibilityHint="Rings this phone first, then dials them from the shop’s number"
            disabled={bridgeRun.isPending}
            onPress={() => void startBridge()}
            style={({ pressed }) => [
              styles.callChip,
              bridgeRun.isPending && styles.disabled,
              pressed && styles.backPressed,
            ]}
          >
            <Feather name="phone-call" size={15} color={color.brand} />
            <Text style={styles.callChipText} numberOfLines={1}>
              {bridgeRun.isPending ? "Starting…" : "Call"}
            </Text>
          </Pressable>
        </View>
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

      {/* What the bridge said, directly under the control that said it, and
          OUTSIDE the stream — the stream is pinned to its newest message, so a
          notice placed in it would scroll away the moment it appeared. It sits
          in the header so it also shows while the thread is still loading; the
          call button does not wait for the reads. */}
      {callNotice !== null || callGood !== null ? (
        <View style={styles.callBand}>
          <Notice text={callNotice} />
          <GoodNotice text={callGood} />
        </View>
      ) : null}
    </>
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
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.brand },
  // On the black chrome: raised fill, hairline, orange ink — the accent marks
  // it as the one action in the bar without becoming a second brand colour.
  callChip: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  callChipText: { ...type.body, color: color.ink, flexShrink: 1 },
  callBand: {
    backgroundColor: color.bg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  goodNotice: {
    backgroundColor: color.goodBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  goodNoticeText: { ...type.small, color: color.good },
  peer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    maxWidth: "100%",
  },
  chromeName: { ...type.titleLg, color: color.ink, flexShrink: 1 },
  chromeMeta: { ...type.small, color: color.muted },

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
});
