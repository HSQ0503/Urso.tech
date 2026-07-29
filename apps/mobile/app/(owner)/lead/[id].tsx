// One lead, everything known about it.
//
// The job of this screen is to get a phone call started. Sebastian opens it
// while walking to the truck, so the number and the Call button sit above every
// other detail, and the activity trail underneath answers "has anyone already
// dealt with this?" without him having to ask the office.
//
// Every timestamp is America/New_York via fmtEt. The device clock is never
// consulted — a phone that has travelled would otherwise show an appointment at
// the wrong hour, which on this project already cost a missed visit once.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Call,
  type Lead,
  type LeadEvent,
} from "@urso/types";
import { owner, SessionExpiredError, type ApiResult } from "@/api";
import { color, HIT, radius, space, type } from "@/theme";

// A 401 anywhere means the session is gone; the api layer has already cleared
// it, so the only thing left is to get out of the authenticated stack.
async function guard<T>(action: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      router.replace("/login");
      return { ok: false, notice: "Sign in again." };
    }
    return { ok: false, notice: "That didn't go through — try again." };
  }
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
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

export default function LeadScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventsNotice, setEventsNotice] = useState<string | null>(null);
  const [callsNotice, setCallsNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Three reads, one round trip's worth of waiting. The lead is the only one
  // whose refusal blocks the screen — a missing activity trail is a thinner
  // page, not a broken one. Each refusal still gets said, in the section it
  // belongs to and in the server's own words.
  const load = useCallback(async () => {
    const [leadRes, eventsRes, callsRes] = await Promise.all([
      guard(() => owner.lead(id)),
      guard(() => owner.leadEvents(id)),
      guard(() => owner.leadCalls(id)),
    ]);

    if (leadRes.ok) {
      setLead(leadRes.data ?? null);
      setNotice(null);
    } else {
      setNotice(leadRes.notice);
    }

    if (eventsRes.ok) {
      setEvents(eventsRes.data ?? []);
      setEventsNotice(null);
    } else {
      setEventsNotice(eventsRes.notice);
    }

    if (callsRes.ok) {
      setCalls(callsRes.data ?? []);
      setCallsNotice(null);
    } else {
      setCallsNotice(callsRes.notice);
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void load().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setActionNotice("This phone couldn't open that."));
  };

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
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

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
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

        <Section label="Detail">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Field label="Service" value={lead.service ?? "Not stated"} />
              <Field label="Source" value={SOURCE_LABEL[lead.source]} />
              <Field label="Status" value={STATUS_LABEL[lead.status]} />
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
      </ScrollView>
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
  back: { minHeight: HIT, justifyContent: "center" },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
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
  wide: { alignSelf: "stretch" },
  pressed: { backgroundColor: color.hover },

  notice: { backgroundColor: color.dangerBg, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.small, color: color.danger },
});
