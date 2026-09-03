// One lead, everything known about it — and everything doable to it.
//
// The job of this screen is to get a phone call started and then let Sebastian
// finish the thought: move the status, log how the call went, snooze it, text
// the lead back, fix a typo'd number, jump to the customer it became. He does
// this from the truck, so every action lives on the screen where its subject
// is, and a refusal from the server is shown in the server's own words.
//
// Every timestamp is America/New_York via fmtEt. The device clock is never
// consulted for display — a phone that has travelled would otherwise show an
// appointment at the wrong hour, which on this project already cost a missed
// visit once.

import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  ESTIMATE_STATUS_LABEL,
  ET,
  etLocalToIso,
  fmtCallDuration,
  fmtEt,
  fmtMoney,
  fmtPhone,
  isMissedCall,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Call,
  type Lead,
  type LeadStatus,
} from "@urso/types";
import {
  callActions,
  estimateActions,
  leadActions,
  type CallOutcome,
  type LeadPatch,
} from "@/api";
import { AddressInput } from "@/components/address-input";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { Avatar } from "@/components/avatar";
import { NavigateButton } from "@/components/navigate";
import { Notice } from "@/components/notice";
import { PhoneInput, toPhoneDisplay } from "@/components/phone-input";
import { keys, useEstimates, useLead, useLeadCalls, useLeadEvents } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Funnel order comes from the label map's own key order — one source of truth,
// no second copy of the status union to drift.
const STATUSES = Object.keys(STATUS_LABEL) as LeadStatus[];

// Below this, the parse is worth a second look before the name, phone, and
// service on the lead are believed. Same threshold the web list marks rows at.
const LOW_CONFIDENCE = 0.8;

const OUTCOMES: ReadonlyArray<{ outcome: CallOutcome; label: string }> = [
  { outcome: "closed", label: "Closed" },
  { outcome: "follow_up", label: "Follow up" },
  { outcome: "no_answer", label: "No answer" },
  { outcome: "lost", label: "Lost" },
];

// The ET calendar date one day from now, at 09:00 ET, as an ISO instant.
// "Tomorrow" is computed from the ET clock, never the device's: at 11pm in a
// Denver airport, tomorrow has already started in Palm Beach.
function tomorrowNineAmEt(): string {
  const etToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${etToday}T12:00:00Z`); // noon UTC is immune to date rollover
  d.setUTCDate(d.getUTCDate() + 1);
  return etLocalToIso(`${d.toISOString().slice(0, 10)}T09:00`);
}

const SNOOZE_PRESETS: ReadonlyArray<{ label: string; until: () => string }> = [
  // A wall-clock target goes through etLocalToIso; relative offsets are plain
  // instants, where Date.now() arithmetic is correct in any timezone.
  { label: "Tomorrow 9am", until: tomorrowNineAmEt },
  { label: "In 3 days", until: () => new Date(Date.now() + 3 * 86_400_000).toISOString() },
  { label: "Next week", until: () => new Date(Date.now() + 7 * 86_400_000).toISOString() },
];

// Alert.prompt is iOS-only, which is fine here — this app is iOS-first.
// The reason is optional: Cancel keeps the lead as it was, an empty entry
// sends no detail at all.
function promptLostDetail(onConfirm: (detail?: string) => void): void {
  Alert.prompt("Mark lost", "Add a reason if you have one.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Mark lost",
      style: "destructive",
      onPress: (text?: string) => {
        const detail = text?.trim();
        onConfirm(detail ? detail : undefined);
      },
    },
  ]);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// A success payload can carry a sentence of its own (apiResult keeps ok:true
// notices, several of which are qualified successes rather than confirmations).
// Read it without claiming a shape the action types don't promise.
function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

// The green sibling of Notice — same shape, good colours — for the ok:true
// sentences. Local to the screen, same as estimate/[id] and invoice/[id].
function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.goodNotice}>
      <Text style={styles.goodNoticeText}>{text}</Text>
    </View>
  );
}

function leadTitle(lead: Lead | null): string {
  if (!lead) return "Lead";
  if (lead.name) return lead.name;
  if (lead.phone) return fmtPhone(lead.phone);
  return "Unnamed lead";
}

function callLine(call: Call): string {
  const direction = call.direction === "in" ? "Incoming" : "Outgoing";
  const duration = fmtCallDuration(call.duration_seconds);
  return duration ? `${direction} · ${duration}` : direction;
}

// The edit sheet. Mounted fresh each time it opens, so the drafts always seed
// from the lead as it stands; the diff at save time decides what is sent.
function EditSheet({
  lead,
  saving,
  notice,
  onSave,
  onClose,
}: {
  lead: Lead;
  saving: boolean;
  notice: string | null;
  onSave: (patch: LeadPatch) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(lead.name ?? "");
  const [phone, setPhone] = useState(toPhoneDisplay(lead.phone ?? ""));
  const [email, setEmail] = useState(lead.email ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");

  const save = () => {
    // Only CHANGED keys travel. On this route absent is different from empty:
    // a missing key leaves the column alone while "" clears it, so sending
    // every field would turn "didn't touch it" into "wipe it".
    const patch: LeadPatch = {};
    if (name !== (lead.name ?? "")) patch.name = name;
    if (phone !== toPhoneDisplay(lead.phone ?? "")) patch.phone = phone;
    if (email !== (lead.email ?? "")) patch.email = email;
    if (address !== (lead.address ?? "")) patch.address = address;
    if (notes !== (lead.notes ?? "")) patch.notes = notes;
    onSave(patch);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
            disabled={saving}
            onPress={onClose}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.sheetControl, pressed && styles.backPressed]}
          >
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Edit lead</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save lead"
            disabled={saving}
            onPress={save}
            hitSlop={space.sm}
            style={({ pressed }) => [
              styles.sheetControl,
              saving && styles.disabled,
              pressed && styles.backPressed,
            ]}
          >
            <Text style={styles.sheetSave}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.sheetFill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Notice text={notice} />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                editable={!saving}
                placeholder="Full name"
                placeholderTextColor={color.faint}
                autoCapitalize="words"
                accessibilityLabel="Name"
                style={styles.formInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <PhoneInput value={phone} onChange={setPhone} editable={!saving} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                editable={!saving}
                placeholder="name@example.com"
                placeholderTextColor={color.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email"
                style={styles.formInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Address</Text>
              <AddressInput value={address} onChange={setAddress} editable={!saving} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                editable={!saving}
                multiline
                placeholder="Anything worth remembering"
                placeholderTextColor={color.faint}
                accessibilityLabel="Notes"
                style={[styles.formInput, styles.formMultiline]}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function LeadScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // Three reads, one round trip's worth of waiting. The lead is the only one
  // whose refusal blocks the screen — a missing activity trail is a thinner
  // page, not a broken one. Each refusal still gets said, in the section it
  // belongs to and in the server's own words, while whatever loaded before
  // stays up (query.data survives an error state). Session death routes to
  // /login in the query cache's onError, not here.
  // No focus refetch here, deliberately: the original loaded on mount/id-change
  // only, and this is a kept-mounted hidden tab — adding useRefetchOnFocus made
  // every return to the screen fire three requests and let the lead mutate in
  // place, which the hand-rolled version never did. Pull-to-refresh is the
  // reader's explicit refresh, same as before.
  const leadQuery = useLead(id);
  const eventsQuery = useLeadEvents(id);
  const callsQuery = useLeadCalls(id);
  // There is NO per-lead estimates read on the API, so the quote book is
  // fetched whole and narrowed here on lead_id. It shares the key the estimates
  // tab already fetched under, so on a warm cache this costs nothing, and it
  // deliberately stays out of the loading gate below — a lead's contact details
  // must not wait on the quote book to render.
  const estimatesQuery = useEstimates();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([
      leadQuery.refetch(),
      eventsQuery.refetch(),
      callsQuery.refetch(),
      estimatesQuery.refetch(),
    ]),
  );

  const lead = leadQuery.data ?? null;
  const events = eventsQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const notice = noticeFrom(leadQuery.error);
  const eventsNotice = noticeFrom(eventsQuery.error);
  const callsNotice = noticeFrom(callsQuery.error);
  const estimatesNotice = noticeFrom(estimatesQuery.error);

  // The route param IS this lead's id, so it is what the rows are filtered by.
  const leadEstimates = useMemo(
    () => (estimatesQuery.data ?? []).filter((estimate) => estimate.lead_id === id),
    [estimatesQuery.data, id],
  );

  // One notice per affordance, shown beside the control that was tapped —
  // a refusal read next to its cause, not at the top of a scrolled-away page.
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [snoozeNotice, setSnoozeNotice] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  // The two dial affordances answer separately: the bridge can be refused by
  // the server (no credentials, no owner phone, no number) and can succeed WITH
  // a sentence, while the tel: link can only fail on this handset.
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null);
  const [bridgeGood, setBridgeGood] = useState<string | null>(null);
  const [dialNotice, setDialNotice] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [estimateNotice, setEstimateNotice] = useState<string | null>(null);
  const [estimateGood, setEstimateGood] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendGood, setResendGood] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [outcomesOpen, setOutcomesOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitValue, setVisitValue] = useState("");
  const [visitNotice, setVisitNotice] = useState<string | null>(null);
  const [visitResult, setVisitResult] = useState<{ leadId: string; text: string } | null>(null);

  const setStatusRun = useAction(
    (vars: { status: LeadStatus; lostReason?: string }) =>
      leadActions.setStatus(id, vars.status, vars.lostReason),
    {
      invalidates: [
        keys.leads.one(id),
        keys.leads.all(),
        keys.leads.events(id),
        keys.overview(),
        keys.agenda(),
      ],
    },
  );
  // Booking confirms the visit and sends a notice, so the schedule and inbox
  // refresh alongside the lead.
  const bookVisitRun = useAction(
    (appointmentIso: string) => leadActions.setAppointment(id, appointmentIso),
    {
      invalidates: [
        keys.leads.one(id),
        keys.leads.all(),
        keys.leads.events(id),
        keys.overview(),
        keys.agenda(),
        keys.schedule.all(),
        keys.threads.all(),
      ],
    },
  );
  // A snooze moves the lead out of the attention queues, so overview and
  // agenda refresh with it.
  const snoozeRun = useAction((untilIso: string) => leadActions.snooze(id, untilIso), {
    invalidates: [
      keys.leads.one(id),
      keys.leads.all(),
      keys.leads.events(id),
      keys.overview(),
      keys.agenda(),
    ],
  });
  // Click-to-call through the Twilio bridge. The number is a VARIABLE rather
  // than a closure over lead.phone because this hook runs above the loading
  // gate, where the lead may not have landed yet — the call sites below only
  // exist once it has. The action writes a call row and a lead event before it
  // returns, which is exactly what the tel: link cannot do.
  const bridgeRun = useAction((peerPhone: string) => callActions.bridge(peerPhone, id), {
    invalidates: [keys.leads.calls(id), keys.leads.events(id), keys.leads.one(id)],
  });
  // An outcome writes a call row and can move the status, so both the call
  // surfaces (thread + this lead's list) and the status surfaces refresh.
  const logCallRun = useAction(
    (vars: { outcome: CallOutcome; detail?: string }) =>
      leadActions.logCallOutcome(id, vars.outcome, vars.detail),
    {
      invalidates: [
        keys.leads.one(id),
        keys.leads.all(),
        keys.leads.events(id),
        keys.leads.calls(id),
        keys.threads.all(),
        keys.overview(),
        keys.agenda(),
      ],
    },
  );
  // A sent text appears in the inbox thread, and sending moves a "new" lead
  // to "contacted" server-side — status surfaces refresh too.
  const sendRun = useAction(
    (vars: { phone: string; message: string }) =>
      leadActions.sendMessage(id, vars.phone, vars.message),
    {
      invalidates: [
        keys.leads.one(id),
        keys.leads.all(),
        keys.leads.events(id),
        keys.threads.all(),
        keys.overview(),
        keys.agenda(),
      ],
    },
  );
  const updateRun = useAction((fields: LeadPatch) => leadActions.update(id, fields), {
    invalidates: [keys.leads.one(id), keys.leads.all(), keys.leads.events(id)],
  });
  const deleteRun = useAction((_: void) => leadActions.delete(id), {
    invalidates: [keys.leads.all(), keys.overview(), keys.agenda()],
  });
  // createEstimateFromLead prefills from this lead, files the quote under its
  // contact, and logs an event on the lead — so the quote book and the lead's
  // own reads both refresh.
  const buildEstimateRun = useAction((_: void) => estimateActions.createFromLead(id), {
    invalidates: [keys.estimates(), keys.leads.one(id), keys.leads.events(id)],
  });
  // The server chooses a confirmation request or booking notice from current status.
  const resendRun = useAction((_: void) => leadActions.sendConfirmationNow(id), {
    invalidates: [keys.leads.one(id), keys.leads.events(id), keys.threads.all()],
  });

  const loading = leadQuery.isPending || eventsQuery.isPending || callsQuery.isPending;

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.chromeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        {lead ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit lead"
            onPress={() => setEditing(true)}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
      {lead ? (
        <>
          <View style={styles.titleLine}>
            <Text style={styles.chromeName} numberOfLines={1}>{leadTitle(lead)}</Text>
            <View style={styles.headerChips}>
              <View style={styles.headerChip}>
                <Text style={styles.headerChipText}>{lead.type.toUpperCase()}</Text>
              </View>
              <View style={styles.headerChip}>
                <Text style={styles.headerChipText}>{STATUS_LABEL[lead.status].toUpperCase()}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.chromeMeta}>
            <Text style={styles.chromePhone}>{fmtPhone(lead.phone)}</Text> · {SOURCE_LABEL[lead.source]}
          </Text>
        </>
      ) : <Text style={styles.chromeName}>{leadTitle(lead)}</Text>}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          {notice !== null ? (
            <Notice text={notice} />
          ) : (
            <Text style={styles.muted}>Not found.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.button, styles.wide, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Back to leads</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const phone = lead.phone;
  // Hoisted out of the JSX so the narrowing survives into the render — and so
  // the threshold is read once, next to the value it judges.
  const parseConfidence = lead.parse_confidence;
  const lowConfidence = parseConfidence !== null && parseConfidence < LOW_CONFIDENCE;
  const snoozedUntil =
    lead.snoozed_until !== null && new Date(lead.snoozed_until).getTime() > Date.now()
      ? lead.snoozed_until
      : null;
  const urgent = lead.type === "cold" && lead.status === "new";
  const waitingHours = Math.max(
    1,
    Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 3_600_000),
  );

  const applyStatus = async (status: LeadStatus, lostReason?: string) => {
    const r = await setStatusRun.mutateAsync({ status, lostReason });
    setStatusNotice(r.ok ? null : r.notice);
  };

  const changeStatus = (status: LeadStatus) => {
    if (status === "lost") {
      promptLostDetail((detail) => void applyStatus("lost", detail));
      return;
    }
    void applyStatus(status);
  };

  const snoozeTo = async (untilIso: string) => {
    const r = await snoozeRun.mutateAsync(untilIso);
    setSnoozeNotice(r.ok ? null : r.notice);
  };

  // The bridge returns once Twilio has ACCEPTED the call, which is before any
  // phone has rung — the server's own sentence says so ("Calling your phone now
  // — answer to connect"), and it is shown verbatim. The fallback below is this
  // screen's words, used only if a success arrives with nothing said, and it
  // makes the same promise: his handset rings next, not the customer's.
  const startBridge = async (peerPhone: string) => {
    setBridgeNotice(null);
    setBridgeGood(null);
    const r = await bridgeRun.mutateAsync(peerPhone);
    if (r.ok) {
      setBridgeGood(
        successNotice(r.data) ?? "Your phone should ring in a moment — answer to connect.",
      );
    } else {
      setBridgeNotice(r.notice);
    }
  };

  const directDial = (peerPhone: string) => {
    setDialNotice(null);
    Linking.openURL(`tel:${peerPhone}`).catch(() =>
      setDialNotice("This phone couldn't start a call."),
    );
  };

  const applyOutcome = async (outcome: CallOutcome, detail?: string) => {
    const r = await logCallRun.mutateAsync({ outcome, detail });
    setCallNotice(r.ok ? null : r.notice);
  };

  const logCall = (outcome: CallOutcome) => {
    if (outcome === "lost") {
      promptLostDetail((detail) => void applyOutcome("lost", detail));
      return;
    }
    void applyOutcome(outcome);
  };

  const send = async () => {
    if (phone === null) return; // the composer never renders without one
    const r = await sendRun.mutateAsync({ phone, message: draft });
    if (r.ok) {
      setDraft(""); // cleared ONLY on ok — a refused message stays put for a retry
      setSendNotice(null);
    } else {
      setSendNotice(r.notice);
    }
  };

  const saveEdit = async (patch: LeadPatch) => {
    // Nothing changed: the server would refuse an empty patch on shape, and
    // that sentence isn't for the reader. Closing quietly IS the honest result.
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    const r = await updateRun.mutateAsync(patch);
    if (r.ok) {
      setEditing(false);
      setSheetNotice(null);
    } else {
      setSheetNotice(r.notice);
    }
  };

  // The money path starts here. The quote is created EMPTY, so leaving him on
  // a list would hand him a blank draft to go and find; the only useful ending
  // is the builder itself, opened on the new id.
  const buildEstimate = async () => {
    setEstimateNotice(null);
    setEstimateGood(null);
    const r = await buildEstimateRun.mutateAsync();
    if (!r.ok) {
      setEstimateNotice(r.notice);
      return;
    }
    // ok:true can still carry a sentence. This screen stays mounted behind the
    // push, so setting it means nothing the server said is thrown away.
    setEstimateGood(successNotice(r.data));
    const estimateId = r.data.estimateId;
    if (estimateId === undefined) {
      // The draft exists but this payload never named it. Saying so and landing
      // in the book is the honest ending — going nowhere would leave a real
      // quote nobody knows was made.
      setEstimateNotice(
        "The quote was created, but this phone didn't get its id. Find it in Estimates.",
      );
      router.push({ pathname: "/(owner)/estimates" });
      return;
    }
    router.push({ pathname: "/(owner)/estimate/new", params: { id: estimateId } });
  };

  // Not one precondition is tested here. The action owns all of them — no
  // number, opted out, no appointment on the lead — and each one comes back as
  // a sentence the reader gets to read; a hidden or greyed-out button would
  // replace that sentence with a guess.
  const resendConfirmation = async () => {
    setResendNotice(null);
    setResendGood(null);
    const r = await resendRun.mutateAsync();
    if (r.ok) setResendGood(successNotice(r.data) ?? (lead.status === "confirmed" ? "Booking notice sent." : "Confirmation text sent."));
    else setResendNotice(r.notice);
  };

  const confirmDelete = () => {
    Alert.alert("Delete lead?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void performDelete() },
    ]);
  };

  const performDelete = async () => {
    const r = await deleteRun.mutateAsync();
    if (r.ok) {
      router.back();
      return;
    }
    // Opted-out leads and leads with active work refuse — in the server's words.
    setDeleteNotice(r.notice);
  };

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
      >
        <Notice text={notice} />
        <Notice text={actionNotice} />

        <View style={styles.quickRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${leadTitle(lead)} on the business line`}
            disabled={phone === null || bridgeRun.isPending}
            onPress={() => {
              if (phone !== null) void startBridge(phone);
            }}
            style={({ pressed }) => [
              styles.quick,
              phone === null && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="phone" size={21} color={color.brand} />
            <Text style={styles.quickText}>Call</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Text ${leadTitle(lead)}`}
            disabled={phone === null}
            onPress={() => {
              if (phone !== null) {
                router.push({
                  pathname: "/(owner)/thread/[phone]",
                  params: {
                    phone,
                    name: lead.name ?? "",
                    leadId: lead.id,
                    ...(lead.contact_id ? { contactId: lead.contact_id } : {}),
                  },
                });
              }
            }}
            style={({ pressed }) => [
              styles.quick,
              phone === null && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="message-square" size={21} color={color.brand} />
            <Text style={styles.quickText}>Text</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Directions"
            disabled={lead.address === null}
            onPress={() => {
              if (lead.address !== null) {
                Linking.openURL(
                  `https://maps.apple.com/?q=${encodeURIComponent(lead.address)}`,
                ).catch(() => setActionNotice("This phone couldn't open Maps."));
              }
            }}
            style={({ pressed }) => [
              styles.quick,
              lead.address === null && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="navigation" size={21} color={color.brand} />
            <Text style={styles.quickText}>Directions</Text>
          </Pressable>
        </View>

        {urgent ? <Text style={styles.urgentLabel}>Call this now</Text> : null}
        <View style={[styles.card, styles.nextCard]}>
          <Text style={styles.cardTitle}>Next step</Text>
          <View style={styles.nextLine}>
            {urgent ? (
              <View style={styles.waitChip}>
                <Text style={styles.waitChipText}>{waitingHours}h waiting</Text>
              </View>
            ) : null}
            <Text style={styles.nextCopy}>
              {lead.status === "new"
                ? "They asked for a quote — call while it’s warm."
                : lead.status === "appointment_set"
                  ? "Confirm the upcoming visit with the customer."
                  : lead.status === "confirmed"
                    ? "The visit is confirmed and ready to work."
                    : "Keep this lead moving toward a booked job."}
            </Text>
          </View>
          {phone !== null ? (
            <Pressable
              accessibilityRole="button"
              disabled={bridgeRun.isPending}
              onPress={() => void startBridge(phone)}
              style={({ pressed }) => [
                styles.primary,
                styles.nextPrimary,
                bridgeRun.isPending && styles.disabled,
                pressed && styles.primaryPressed,
              ]}
            >
              <Feather name="phone" size={18} color={color.chromeInk} />
              <Text style={styles.primaryText}>
                {bridgeRun.isPending ? "Starting the call…" : "Call now"}
              </Text>
            </Pressable>
          ) : null}
          <Notice text={bridgeNotice} />
          <GoodNotice text={bridgeGood} />
          <Pressable
            accessibilityRole="button"
            onPress={() => setOutcomesOpen((value) => !value)}
            style={({ pressed }) => [styles.outcomeToggle, pressed && styles.backPressed]}
          >
            <Text style={styles.outcomeToggleText}>
              {outcomesOpen ? "Hide call outcomes" : "Already called? Log the outcome"}
            </Text>
          </Pressable>
          {outcomesOpen ? (
            <View style={styles.outcomeGrid}>
              {OUTCOMES.map(({ outcome, label }) => (
                <Pressable
                  key={outcome}
                  accessibilityRole="button"
                  disabled={logCallRun.isPending}
                  onPress={() => logCall(outcome)}
                  style={({ pressed }) => [
                    styles.button,
                    styles.outcomeButton,
                    logCallRun.isPending && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.buttonText}>{label}</Text>
                </Pressable>
              ))}
              <Notice text={callNotice} />
            </View>
          ) : null}
        </View>

        {/* The lead → estimate → job → invoice path begins here. */}
        <Section label="Estimates">
          <Notice text={estimatesNotice} />
          <View style={styles.card}>
            {leadEstimates.length > 0 ? (
              leadEstimates.map((estimate, index) => (
                <Pressable
                  key={estimate.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open estimate ${estimate.number}`}
                  onPress={() =>
                    router.push({ pathname: "/(owner)/estimate/[id]", params: { id: estimate.id } })
                  }
                  style={({ pressed }) => [
                    styles.pad,
                    styles.linkedRow,
                    index > 0 && styles.divided,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.linkedRowBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.body}>{estimate.number}</Text>
                      <Text style={styles.money}>{fmtMoney(estimate.total_cents)}</Text>
                    </View>
                    <Text style={styles.fieldLabel}>{ESTIMATE_STATUS_LABEL[estimate.status]}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={color.faint} />
                </Pressable>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>
                  {estimatesQuery.isPending
                    ? "Looking for estimates on this lead…"
                    : estimatesNotice !== null
                      ? "Couldn't load this lead's estimates."
                      : "No estimates yet for this lead."}
                </Text>
              </View>
            )}
            <View style={[styles.pad, styles.divided]}>
              <Notice text={estimateNotice} />
              <GoodNotice text={estimateGood} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create estimate"
                disabled={buildEstimateRun.isPending}
                onPress={() => void buildEstimate()}
                style={({ pressed }) => [
                  styles.primary,
                  buildEstimateRun.isPending && styles.disabled,
                  pressed && styles.primaryPressed,
                ]}
              >
                <Feather name="file-text" size={17} color={color.chromeInk} />
                <Text style={styles.primaryText}>
                  {buildEstimateRun.isPending ? "Starting…" : "Create estimate"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Section>

        <View style={styles.moreOptions}>
          <Text style={styles.cardTitle}>More options</Text>
          <Feather name="chevron-down" size={18} color={color.muted} />
        </View>

        <Section label="Contact">
          <View style={styles.card}>
            {/* No phone means there is nothing to dial — the block goes rather
                than rendering a dead button. */}
            {phone !== null ? (
              <>
                <View style={styles.pad}>
                  <Text style={styles.fieldLabel}>Phone</Text>
                  <Text style={styles.big}>{fmtPhone(phone)}</Text>
                </View>
                {/* Two ways to dial, and they are NOT the same call. The bridge
                    keeps the prominence the single "Call" button had because it
                    is the one that leaves a record: Twilio rings this phone,
                    then dials the lead from the business line, and the shop
                    ends up with a call row, a lead event and a duration. The
                    tel: link below is the fast path for when none of that
                    matters — it dials from Sebastian's personal number and the
                    shop learns nothing, which is why it says so. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${leadTitle(lead)} on the business line`}
                  accessibilityHint="Rings this phone first, then dials the lead"
                  disabled={bridgeRun.isPending}
                  onPress={() => void startBridge(phone)}
                  style={({ pressed }) => [
                    styles.call,
                    bridgeRun.isPending && styles.disabled,
                    pressed && styles.callPressed,
                  ]}
                >
                  <Text style={styles.callText}>
                    {bridgeRun.isPending ? "Starting the call…" : "Call via business line"}
                  </Text>
                  <Text style={styles.callSub}>
                    Rings your phone first. They see the shop’s number, and it’s recorded.
                  </Text>
                </Pressable>

                <View style={[styles.pad, styles.divided]}>
                  <Notice text={bridgeNotice} />
                  <GoodNotice text={bridgeGood} />
                  <View style={styles.dialGroup}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Dial ${leadTitle(lead)} from this phone`}
                      onPress={() => directDial(phone)}
                      style={({ pressed }) => [
                        styles.button,
                        styles.wide,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.buttonText}>Dial from this phone</Text>
                    </Pressable>
                    <Text style={styles.muted}>
                      Goes out from your own number. Nothing is recorded.
                    </Text>
                  </View>
                  <Notice text={dialNotice} />
                </View>
              </>
            ) : null}

            <View style={[styles.pad, phone !== null && styles.divided]}>
              <Text style={styles.fieldLabel}>Address</Text>
              <Text style={styles.body}>{lead.address ?? "No address on file."}</Text>
              {/* Directly under the address it acts on. Gone entirely when
                  there is no address — an empty wrapper would still eat the
                  card's gap. A failure says so in the screen's link notice. */}
              {lead.address !== null ? (
                <View style={styles.navigate}>
                  <NavigateButton address={lead.address} onFail={setActionNotice} />
                </View>
              ) : null}
            </View>
          </View>
        </Section>

        {/* The lead-to-customer bridge: once a lead has become a customer, the
            person's full record is one tap away. */}
        {lead.contact_id !== null ? (
          <Section label="Customer">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open customer ${lead.name ?? ""}`}
              onPress={() =>
                // The customer screen is a sibling slice; expo's generated
                // route types only refresh when the dev server runs, so the
                // href is asserted rather than typed.
                router.push(`/(owner)/customer/${lead.contact_id}` as Href)
              }
              style={({ pressed }) => [styles.card, styles.customerRow, pressed && styles.pressed]}
            >
              <Avatar name={lead.name} />
              <View style={styles.customerBody}>
                <Text style={styles.body}>{lead.name ?? "Customer"}</Text>
                <Text style={styles.muted}>View customer</Text>
              </View>
              <Feather name="chevron-right" size={20} color={color.faint} />
            </Pressable>
          </Section>
        ) : null}

        <Section label="Detail">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Field label="Service" value={lead.service ?? "Not stated"} />
              <Field label="Source" value={SOURCE_LABEL[lead.source]} />

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Status</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {STATUSES.map((status) => {
                    const current = status === lead.status;
                    return (
                      <Pressable
                        key={status}
                        accessibilityRole="button"
                        accessibilityLabel={`Set status ${STATUS_LABEL[status]}`}
                        accessibilityState={{
                          selected: current,
                          disabled: current || setStatusRun.isPending,
                        }}
                        disabled={current || setStatusRun.isPending}
                        onPress={() => changeStatus(status)}
                        style={({ pressed }) => [
                          styles.chip,
                          current && styles.chipCurrent,
                          setStatusRun.isPending && !current && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.chipText, current && styles.chipTextCurrent]}>
                          {STATUS_LABEL[status]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Notice text={statusNotice} />
              </View>

              {lead.appointment_at !== null ? (
                <Field
                  label="Appointment"
                  value={fmtEt(lead.appointment_at, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                />
              ) : null}
              {/* Not "Arrived": on a screen that also carries an appointment
                  and a crew, that reads as the crew arriving on site. This is
                  when the lead reached us. */}
              <Field label="Came in" value={fmtEt(lead.created_at)} />

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setVisitValue("");
                  setVisitNotice(null);
                  setVisitOpen((v) => !v);
                }}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>
                  {lead.appointment_at !== null ? "Rebook visit" : "Book a visit"}
                </Text>
              </Pressable>

              <GoodNotice text={visitResult?.leadId === id ? visitResult.text : null} />
              {visitOpen ? (
                <View style={styles.visitCard}>
                  {/* Future-only, same as the web lead-appointment flow — a
                      quote visit in the past books a confirmation text for a
                      moment that already happened. */}
                  <SlotPicker value={visitValue} onChange={setVisitValue} />
                  <Notice text={visitNotice} />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      void (async () => {
                        setVisitNotice(null);
                        setVisitResult(null);
                        const r = await bookVisitRun.mutateAsync(etLocalToIso(visitValue));
                        if (!r.ok) setVisitNotice(r.notice);
                        else {
                          setVisitResult({ leadId: id, text: successNotice(r.data) ?? "Appointment confirmed." });
                          setVisitOpen(false);
                          setVisitValue("");
                        }
                      })();
                    }}
                    disabled={!isCompleteWhen(visitValue) || bookVisitRun.isPending}
                    style={({ pressed }) => [
                      styles.primary,
                      pressed && styles.primaryPressed,
                      (!isCompleteWhen(visitValue) || bookVisitRun.isPending) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryText}>
                      {bookVisitRun.isPending ? "Booking…" : "Book this visit"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Confirmed visits resend a notice; vendor bookings still ask for a reply. */}
              {lead.status === "appointment_set" || lead.status === "confirmed" ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={lead.status === "confirmed" ? "Resend booking notice" : "Resend the appointment confirmation text"}
                    disabled={resendRun.isPending}
                    onPress={() => void resendConfirmation()}
                    style={({ pressed }) => [
                      styles.button,
                      resendRun.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>
                      {resendRun.isPending ? "Sending…" : lead.status === "confirmed" ? "Resend booking notice" : "Resend confirmation"}
                    </Text>
                  </Pressable>
                  <Notice text={resendNotice} />
                  <GoodNotice text={resendGood} />
                </>
              ) : null}
            </View>

            {lead.notes !== null ? (
              <View style={[styles.pad, styles.divided]}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <Text style={styles.body}>{lead.notes}</Text>
              </View>
            ) : null}

            {/* The source of every parsed field above it. A vendor text is
                parsed into name/phone/service by a machine, and when that
                parse is wrong the lead is quietly wrong — this is the only
                place the original survives, so it sits in the same card as
                the fields it produced, not in the activity trail. */}
            {lead.raw_message !== null ? (
              <View style={[styles.pad, styles.divided]}>
                <Text style={styles.fieldLabel}>Original vendor text</Text>
                <View style={styles.quote}>
                  <Text style={styles.quoteText}>{lead.raw_message}</Text>
                </View>
                {parseConfidence !== null ? (
                  <Text style={[styles.muted, lowConfidence && styles.dangerInk]}>
                    {`Parsed at ${Math.round(parseConfidence * 100)}% confidence`}
                    {lowConfidence ? " — check the name, phone, and service above." : null}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Section>

        <Section label="Snooze">
          <View style={styles.card}>
            <View style={styles.pad}>
              <View style={styles.buttonRow}>
                {SNOOZE_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Snooze until ${preset.label}`}
                    disabled={snoozeRun.isPending}
                    onPress={() => void snoozeTo(preset.until())}
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonFlex,
                      snoozeRun.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>
              {snoozedUntil !== null ? (
                <Text style={styles.muted}>Snoozed until {fmtEt(snoozedUntil)}</Text>
              ) : null}
              <Notice text={snoozeNotice} />
            </View>
          </View>
        </Section>

        <Section label="Log a call">
          <View style={styles.card}>
            <View style={styles.pad}>
              <View style={styles.grid}>
                {OUTCOMES.map(({ outcome, label }) => (
                  <Pressable
                    key={outcome}
                    accessibilityRole="button"
                    accessibilityLabel={`Log call: ${label}`}
                    disabled={logCallRun.isPending}
                    onPress={() => logCall(outcome)}
                    style={({ pressed }) => [
                      styles.button,
                      styles.gridItem,
                      logCallRun.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Notice text={callNotice} />
            </View>
          </View>
        </Section>

        <Section label="Activity">
          <Notice text={eventsNotice} />
          <View style={styles.card}>
            {events.length > 0 ? (
              events.map((event, index) => (
                <View key={event.id} style={[styles.pad, index > 0 && styles.divided]}>
                  <Text style={styles.fieldLabel}>{fmtEt(event.created_at)}</Text>
                  <Text style={styles.body}>{event.kind}</Text>
                  {event.detail !== null ? (
                    <Text style={styles.muted}>{event.detail}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>Nothing has happened on this lead yet.</Text>
              </View>
            )}
          </View>

          {/* The composer only exists when there is a number to text. An
              opted-out lead still gets the composer: the send action owns that
              rule, and its refusal sentence shows here verbatim. */}
          {phone !== null ? (
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.fieldLabel}>Text {fmtPhone(phone)}</Text>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  editable={!sendRun.isPending}
                  multiline
                  placeholder="Type a message…"
                  placeholderTextColor={color.faint}
                  accessibilityLabel="Message to the lead"
                  style={styles.composer}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  disabled={sendRun.isPending}
                  onPress={() => void send()}
                  style={({ pressed }) => [
                    styles.primary,
                    sendRun.isPending && styles.disabled,
                    pressed && styles.primaryPressed,
                  ]}
                >
                  <Text style={styles.primaryText}>
                    {sendRun.isPending ? "Sending…" : "Send"}
                  </Text>
                </Pressable>
                <Notice text={sendNotice} />
              </View>
            </View>
          ) : null}
        </Section>

        <Section label="Calls">
          <Notice text={callsNotice} />
          <View style={styles.card}>
            {calls.length > 0 ? (
              calls.map((call, index) => {
                const missed = isMissedCall(call);
                return (
                  <View key={call.id} style={[styles.pad, index > 0 && styles.divided]}>
                    <Text style={styles.fieldLabel}>{fmtEt(call.created_at)}</Text>
                    <Text style={[styles.body, missed && styles.dangerInk]}>
                      {callLine(call)}
                    </Text>
                    {missed ? <Text style={styles.missed}>Missed</Text> : null}
                  </View>
                );
              })
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>No calls with this number.</Text>
              </View>
            )}
          </View>
        </Section>

        <View style={styles.deleteArea}>
          <Notice text={deleteNotice} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete lead"
            disabled={deleteRun.isPending}
            onPress={confirmDelete}
            style={({ pressed }) => [
              styles.button,
              styles.wide,
              styles.buttonDanger,
              deleteRun.isPending && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonText, styles.dangerInk]}>Delete lead</Text>
          </Pressable>
        </View>
      </ScrollView>

      {editing ? (
        <EditSheet
          lead={lead}
          saving={updateRun.isPending}
          notice={sheetNotice}
          onSave={(patch) => void saveEdit(patch)}
          onClose={() => {
            setEditing(false);
            setSheetNotice(null);
          }}
        />
      ) : null}
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

  chrome: {
    backgroundColor: color.bg,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { minHeight: HIT, justifyContent: "center" },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.muted },
  editText: { ...type.body, color: color.brand },
  titleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  chromeName: { ...type.chromeTitle, color: color.ink, flexShrink: 1 },
  headerChips: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerChip: {
    minHeight: 25,
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: color.hover,
    paddingHorizontal: 9,
  },
  headerChipText: { ...type.micro, color: color.muted },
  chromeMeta: { ...type.body, color: color.muted },
  chromePhone: { color: color.brand },
  chromeMetaHot: { color: color.brand },

  scrollBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  quickRow: { flexDirection: "row", gap: 10 },
  quick: {
    flex: 1,
    minHeight: 98,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  quickText: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  urgentLabel: { ...type.micro, color: color.danger, marginBottom: -8 },
  nextCard: { padding: space.lg, gap: 14 },
  cardTitle: { ...type.title, color: color.ink },
  nextLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  waitChip: {
    borderRadius: radius.sm,
    backgroundColor: color.dangerBg,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  waitChipText: { ...type.micro, color: color.danger },
  nextCopy: { ...type.body, color: color.muted, flex: 1, minWidth: 180 },
  nextPrimary: { flexDirection: "row", gap: 8, minHeight: 54 },
  outcomeToggle: { minHeight: HIT, alignItems: "center", justifyContent: "center" },
  outcomeToggleText: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outcomeButton: { flexBasis: "47%", flexGrow: 1 },
  moreOptions: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },

  field: { gap: 2 },
  fieldLabel: { ...type.micro, color: color.faint },
  fieldValue: { ...type.body, color: color.ink },

  navigate: { alignSelf: "flex-start" },

  big: { ...type.title, color: color.ink },
  muted: { ...type.small, color: color.muted },
  dangerInk: { color: color.danger },
  missed: { ...type.micro, color: color.danger },
  money: { ...type.small, color: color.ink, fontVariant: ["tabular-nums"] },

  linkedRow: { flexDirection: "row", alignItems: "center", minHeight: HIT },
  linkedRowBody: { flex: 1, gap: space.xs },
  rowBetween: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },

  // The blockquote for the untouched vendor text: inset, hairline, on the page
  // ground rather than the card's white, so it reads as quoted material and
  // never as another editable field.
  quote: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
  quoteText: { ...type.small, color: color.muted },

  goodNotice: {
    backgroundColor: color.goodBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  goodNoticeText: { ...type.small, color: color.good },

  call: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.brandFill,
  },
  callPressed: { backgroundColor: color.brandDown },
  callText: { ...type.title, color: color.chromeInk },
  // Light-on-orange, the same muted step the dark chrome uses for second-rank
  // text — the caption has to be readable in sunlight, not decorative.
  callSub: { ...type.small, color: color.chromeMuted, textAlign: "center" },
  dialGroup: { gap: space.xs },

  chipRow: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  chipCurrent: { borderColor: color.brand, backgroundColor: color.brandSoft },
  visitCard: {
    gap: space.sm,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.bg,
  },
  chipText: { ...type.micro, color: color.muted },
  chipTextCurrent: { color: color.brandDeep },

  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    minHeight: HIT,
  },
  customerBody: { flex: 1, gap: 2 },

  buttonRow: { flexDirection: "row", gap: space.sm },
  buttonFlex: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gridItem: { flexBasis: "48%", flexGrow: 1 },

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
  buttonText: { ...type.body, color: color.ink, textAlign: "center" },
  buttonDanger: { borderColor: color.danger, backgroundColor: color.dangerBg },
  wide: { alignSelf: "stretch" },
  pressed: { backgroundColor: color.hover },
  disabled: { opacity: 0.4 },

  deleteArea: { gap: space.sm },

  composer: {
    // No lineHeight — iOS renders a TextInput placeholder with visibly wrong
    // tracking when lineHeight rides a custom font (see customers.tsx search).
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

  sheet: { flex: 1, backgroundColor: color.bg, paddingTop: space.sm },
  sheetFill: { flex: 1 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: space.lg,
  },
  sheetControl: { minHeight: HIT, justifyContent: "center" },
  sheetTitle: { ...type.title, color: color.ink },
  sheetCancel: { ...type.body, color: color.muted },
  sheetSave: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  sheetBody: { padding: space.lg, gap: space.lg },
  fieldGroup: { gap: space.sm },
  formInput: {
    // No lineHeight — same iOS placeholder-tracking gotcha as every TextInput.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  formMultiline: { minHeight: 96, paddingVertical: space.md, textAlignVertical: "top" },
});
