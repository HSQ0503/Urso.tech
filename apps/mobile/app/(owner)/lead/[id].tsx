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

import { useState, type ReactNode } from "react";
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
  ET,
  etLocalToIso,
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Call,
  type Lead,
  type LeadStatus,
} from "@urso/types";
import { leadActions, type CallOutcome, type LeadPatch } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Avatar } from "@/components/avatar";
import { Notice } from "@/components/notice";
import { PhoneInput, toPhoneDisplay } from "@/components/phone-input";
import { keys, useLead, useLeadCalls, useLeadEvents } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Funnel order comes from the label map's own key order — one source of truth,
// no second copy of the status union to drift.
const STATUSES = Object.keys(STATUS_LABEL) as LeadStatus[];

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
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([leadQuery.refetch(), eventsQuery.refetch(), callsQuery.refetch()]),
  );

  const lead = leadQuery.data ?? null;
  const events = eventsQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const notice = noticeFrom(leadQuery.error);
  const eventsNotice = noticeFrom(eventsQuery.error);
  const callsNotice = noticeFrom(callsQuery.error);

  // One notice per affordance, shown beside the control that was tapped —
  // a refusal read next to its cause, not at the top of a scrolled-away page.
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [snoozeNotice, setSnoozeNotice] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

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

  const loading = leadQuery.isPending || eventsQuery.isPending || callsQuery.isPending;

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setActionNotice("This phone couldn't open that."));
  };

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
      <Text style={styles.chromeName} numberOfLines={1}>
        {leadTitle(lead)}
      </Text>
      {lead ? (
        <Text style={[styles.chromeMeta, lead.type === "hot" && styles.chromeMetaHot]}>
          {lead.type === "hot" ? "Hot" : "Cold"} · {STATUS_LABEL[lead.status]}
        </Text>
      ) : null}
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
  const snoozedUntil =
    lead.snoozed_until !== null && new Date(lead.snoozed_until).getTime() > Date.now()
      ? lead.snoozed_until
      : null;

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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${leadTitle(lead)}`}
                  onPress={() => open(`tel:${phone}`)}
                  style={({ pressed }) => [styles.call, pressed && styles.callPressed]}
                >
                  <Text style={styles.callText}>Call</Text>
                </Pressable>
              </>
            ) : null}

            <View style={[styles.pad, phone !== null && styles.divided]}>
              <Text style={styles.fieldLabel}>Address</Text>
              <Text style={styles.body}>{lead.address ?? "No address on file."}</Text>
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

              {/* setAppointment waits for the next slice — booking needs a real
                  slot picker, not a text field. */}
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
              <Field label="Arrived" value={fmtEt(lead.created_at)} />
            </View>

            {lead.notes !== null ? (
              <View style={[styles.pad, styles.divided]}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <Text style={styles.body}>{lead.notes}</Text>
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
    backgroundColor: color.chrome,
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
  backText: { ...type.body, color: color.chromeMuted },
  editText: { ...type.body, color: color.brand },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeMeta: { ...type.micro, color: color.chromeMuted },
  chromeMetaHot: { color: color.brand },

  scrollBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

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

  big: { ...type.title, color: color.ink },
  muted: { ...type.small, color: color.muted },
  dangerInk: { color: color.danger },
  missed: { ...type.micro, color: color.danger },

  call: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandFill,
  },
  callPressed: { backgroundColor: color.brandDown },
  callText: { ...type.title, color: color.chromeInk },

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
