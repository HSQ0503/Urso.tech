// Today — the owner's home, and the screen he opens more than any other.
//
// Sebastian sells and dispatches; he does not wash. His day is catch the lead
// fast, get it on the calendar, keep people answered. So this is an ACTION
// QUEUE, not a dashboard: what needs him now is at the top with a Call button
// on it, and money is context underneath. Speed-to-lead is the metric that wins
// the job, so the call queue gets the only full-width orange control here.
//
// Every time is America/New_York via fmtEt. The device clock is never read —
// not for the greeting, not for a wait timer, not for grouping. A phone that
// has travelled must still show the same day as the office.

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
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney, fmtPhone, minutesSince, SOURCE_LABEL, type Lead } from "@urso/types";
import { useAgenda, useOverview } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { getAdminProfile } from "@/session";
import { color, font, HIT, radius, space, type } from "@/theme";

// The ET hour, as a number, without touching the device clock.
function etHour(): number {
  // Strip non-digits before parsing, the same normalisation src/intl-guard.ts
  // uses: a platform may pad or annotate the hour. A bare Number() is worse than
  // it looks — Number("") is 0, which passes Number.isFinite, so an empty result
  // read as midnight and greeted "Good morning" at 11pm.
  const raw = fmtEt(new Date().toISOString(), { hour: "numeric", hour12: false }).replace(/\D/g, "");
  if (!raw) return 12;
  // Some engines render midnight as 24.
  return Number(raw) % 24;
}

function greetingWord(): string {
  const hour = etHour();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(full: string | null): string | null {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

// How long a lead has sat unworked. Speed-to-lead is measured in minutes, so
// minutes stay visible for the first hour before the unit changes.
function waited(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

// Same escalation as the web speed-to-lead chip: fine under 5 minutes, warming
// under 15, late after that. Colour only — nothing moves or flashes.
function waitStyle(minutes: number) {
  if (minutes < 5) return styles.waitOk;
  if (minutes < 15) return styles.waitWarn;
  return styles.waitLate;
}

function leadTitle(lead: Lead): string {
  return lead.name ?? fmtPhone(lead.phone);
}

function Notice({ text }: { text: string }): React.ReactElement {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Group({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: "danger" | "brand";
  children: ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.group}>
      <Text
        style={[
          styles.groupTitle,
          tone === "danger" && styles.dangerInk,
          tone === "brand" && styles.brandInk,
        ]}
      >
        {title} — {count}
      </Text>
      {children}
    </View>
  );
}

// The call-now queue. The whole card opens the lead; the orange bar under it
// dials. Nothing else on this screen gets a control this loud.
function CallQueueCard({
  lead,
  failed,
  onOpen,
  onCall,
}: {
  lead: Lead;
  failed: boolean;
  onOpen: () => void;
  onCall: (phone: string) => void;
}): React.ReactElement {
  const minutes = minutesSince(lead.created_at);
  const phone = lead.phone;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${leadTitle(lead)}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <View style={styles.rowTop}>
          <Text style={styles.leadName} numberOfLines={1}>
            {leadTitle(lead)}
          </Text>
          <Text style={[styles.wait, waitStyle(minutes)]}>{waited(minutes)}</Text>
        </View>
        <Text style={styles.leadSub} numberOfLines={1}>
          {lead.service ?? "Service not listed"} · {SOURCE_LABEL[lead.source]}
        </Text>
      </Pressable>

      {phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${leadTitle(lead)}`}
          onPress={() => onCall(phone)}
          style={({ pressed }) => [styles.callBar, pressed && styles.callBarPressed]}
        >
          <Text style={styles.callBarText}>Call {fmtPhone(phone)}</Text>
        </Pressable>
      ) : (
        <View style={[styles.cardBody, styles.divided]}>
          <Text style={styles.faint}>No phone number on this lead.</Text>
        </View>
      )}

      {failed ? (
        <View style={[styles.cardBody, styles.divided]}>
          <Notice text="This phone couldn't start that call." />
        </View>
      ) : null}
    </View>
  );
}

// Every other queue row: one tap into the lead, with the one fact that explains
// why it is in this list.
function LeadRow({
  lead,
  sub,
  trailing,
  onOpen,
}: {
  lead: Lead;
  sub: string;
  trailing?: string;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${leadTitle(lead)}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, styles.cardBody, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.leadName} numberOfLines={1}>
          {leadTitle(lead)}
        </Text>
        {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
      </View>
      <Text style={styles.leadSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

// `divided` rather than a border on every row: a hairline under the last row
// would double up against the card's own edge.
function MoneyRow({
  label,
  cents,
  divided,
}: {
  label: string;
  cents: number;
  divided?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.line, divided && styles.divided]}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineMoney}>{fmtMoney(cents)}</Text>
    </View>
  );
}

function PipelineRow({
  label,
  count,
  cents,
  tone,
  divided,
}: {
  label: string;
  count: number;
  cents?: number;
  tone?: "danger";
  divided?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.line, divided && styles.divided]}>
      <Text style={styles.lineLabel}>{label}</Text>
      <View style={styles.lineRight}>
        <Text style={[styles.lineCount, tone === "danger" && styles.dangerInk]}>{count}</Text>
        {cents === undefined ? null : <Text style={styles.lineCents}>{fmtMoney(cents)}</Text>}
      </View>
    </View>
  );
}

export default function TodayScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState<string | null>(null);
  const [callFailedFor, setCallFailedFor] = useState<string | null>(null);
  // Bumped on a timer purely to re-render the waiting counters; value unused.
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    let live = true;
    void getAdminProfile().then((profile) => {
      if (live) setName(firstNameOf(profile?.name ?? null));
    });
    return () => {
      live = false;
    };
  }, []);

  // Refetch on focus: a lead worked on the detail screen should leave the queue
  // the moment he comes back here. Session death routes to /login in the query
  // cache's onError, not here.
  const overviewQuery = useOverview();
  const agendaQuery = useAgenda();
  useRefetchOnFocus(overviewQuery.refetch);
  useRefetchOnFocus(agendaQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([overviewQuery.refetch(), agendaQuery.refetch()]),
  );

  const overview = overviewQuery.data ?? null;
  const agenda = agendaQuery.data ?? null;

  // A refusal for one read must not blank the other. Whatever still
  // answered stays on screen, and the server's own sentence explains the
  // gap — those sentences are written for the reader, so they ship as-is.
  const notices: string[] = [];
  const overviewNotice = noticeFrom(overviewQuery.error);
  if (overviewNotice !== null) notices.push(overviewNotice);
  const agendaNotice = noticeFrom(agendaQuery.error);
  if (agendaNotice !== null && !notices.includes(agendaNotice)) notices.push(agendaNotice);

  // The interval is not a fetch — it re-renders so the speed-to-lead
  // timers advance. This screen's whole premise is the 5/15-minute escalation,
  // and computing minutesSince() only at render meant a Today screen left open
  // kept showing a lead's original minute count in its original colour: one that
  // had crossed fifteen minutes still read calm. Ticking locally costs nothing
  // and is the difference between a live queue and a screenshot of one.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setTick((n) => n + 1), 30_000);
      return () => clearInterval(id);
    }, []),
  );

  const openLead = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/lead/[id]", params: { id } });
    },
    [router],
  );

  const callLead = useCallback((leadId: string, phone: string) => {
    setCallFailedFor(null);
    Linking.openURL(`tel:${phone}`).catch(() => setCallFailedFor(leadId));
  }, []);

  // Hold the full-screen spinner until BOTH cold-start loads settle — the
  // hand-rolled Promise.all revealed the whole screen atomically, and dropping
  // the spinner on the first answer painted a Today missing its "Needs you
  // now" half for the slower read's whole round trip. errorUpdateCount keeps
  // this a COLD-START gate only: a no-data refetch resets status to pending
  // (v5 fetchState), so without it a permission-refused overview would throw
  // this spinner over a perfectly usable agenda on every tab focus.
  const coldStart = (q: { isPending: boolean; errorUpdateCount: number }) =>
    q.isPending && q.errorUpdateCount === 0;
  const showSpinner = coldStart(overviewQuery) || coldStart(agendaQuery);

  const cold = overview?.coldNeedingCall ?? [];
  const unconfirmed = overview?.unconfirmedToday ?? [];
  const pastDue = overview?.pastDueVisits ?? [];
  const followUps = overview?.followUpsDue ?? [];
  const needsCount = cold.length + unconfirmed.length + pastDue.length + followUps.length;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.wordmark}>
          Canes<Text style={styles.wordmarkStop}>.</Text>
        </Text>
        <Text style={styles.date}>
          {fmtEt(new Date().toISOString(), { weekday: "long", month: "long", day: "numeric" })}
        </Text>
        <Text style={styles.greeting}>
          {greetingWord()}
          {name ? `, ${name}` : ""}
          <Text style={styles.wordmarkStop}>.</Text>
        </Text>
      </View>

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          {notices.map((text) => (
            <Notice key={text} text={text} />
          ))}

          {/* Gated on notices alone: when overview succeeded but agenda refused, the
    old condition hid the button and pull-to-refresh was the only recovery,
    with nothing on screen saying so. */}
          {notices.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRefresh}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          ) : null}

          {overview !== null ? (
            <Section label="Needs you now" meta={needsCount > 0 ? String(needsCount) : undefined}>
              {needsCount === 0 ? (
                <View style={[styles.card, styles.cardBody]}>
                  <Text style={styles.clear}>Nothing needs you right now.</Text>
                </View>
              ) : null}

              {cold.length > 0 ? (
                <Group title="Call these now" count={cold.length} tone="danger">
                  {cold.map((lead) => (
                    <CallQueueCard
                      key={lead.id}
                      lead={lead}
                      failed={callFailedFor === lead.id}
                      onOpen={() => openLead(lead.id)}
                      onCall={(phone) => callLead(lead.id, phone)}
                    />
                  ))}
                </Group>
              ) : null}

              {unconfirmed.length > 0 ? (
                <Group title="Unconfirmed visits" count={unconfirmed.length}>
                  {unconfirmed.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      sub={fmtEt(lead.appointment_at)}
                      trailing="No yes yet"
                      onOpen={() => openLead(lead.id)}
                    />
                  ))}
                </Group>
              ) : null}

              {pastDue.length > 0 ? (
                <Group title="Past due visits" count={pastDue.length} tone="brand">
                  {pastDue.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      sub={`${lead.service ?? "Estimate visit"} · was ${fmtEt(lead.appointment_at)}`}
                      onOpen={() => openLead(lead.id)}
                    />
                  ))}
                </Group>
              ) : null}

              {followUps.length > 0 ? (
                <Group title="Follow-ups due" count={followUps.length}>
                  {followUps.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      sub={`${lead.service ?? SOURCE_LABEL[lead.source]} · last activity ${fmtEt(
                        lead.last_activity_at,
                        { month: "short", day: "numeric" },
                      )}`}
                      onOpen={() => openLead(lead.id)}
                    />
                  ))}
                </Group>
              ) : null}
            </Section>
          ) : null}

          {/* "Next 2 days", not "Today": /canes/agenda calls getAgenda(2) to match
              the web Today page, so this list already spans tomorrow. Labelling a
              two-day window "Today" is the kind of small wrongness that makes
              someone stop trusting the whole screen. */}
          {agenda !== null ? (
            <Section label="Next 2 days">
              {agenda.length === 0 ? (
                <View style={[styles.card, styles.cardBody]}>
                  <Text style={styles.muted}>No visits on the calendar yet.</Text>
                </View>
              ) : (
                // `day` arrives already formatted in ET by the server — it is a
                // label, not a timestamp, so it is rendered and never parsed.
                agenda.map((group) => (
                  <View key={group.day} style={styles.group}>
                    <Text style={styles.day}>{group.day}</Text>
                    {group.leads.map((lead) => (
                      <Pressable
                        key={lead.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${leadTitle(lead)}`}
                        onPress={() => openLead(lead.id)}
                        style={({ pressed }) => [
                          styles.card,
                          styles.visit,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.visitTime} numberOfLines={1}>
                          {fmtEt(lead.appointment_at, { hour: "numeric", minute: "2-digit" })}
                        </Text>
                        <View style={styles.visitBody}>
                          <Text style={styles.leadName} numberOfLines={1}>
                            {leadTitle(lead)}
                          </Text>
                          <Text style={styles.leadSub} numberOfLines={1}>
                            {lead.address ?? lead.service ?? "Address pending"}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </Section>
          ) : null}

          {overview !== null ? (
            <Section label="Money this week">
              <View style={styles.card}>
                <MoneyRow label="Collected" cents={overview.money.collectedThisWeekCents} />
                <MoneyRow label="Won" cents={overview.money.wonThisWeekCents} divided />
                <MoneyRow
                  label="Booked next 7 days"
                  cents={overview.money.bookedNext7DaysCents}
                  divided
                />
              </View>
            </Section>
          ) : null}

          {overview !== null ? (
            <Section label="Pipeline">
              <View style={styles.card}>
                <PipelineRow
                  label="Quotes awaiting"
                  count={overview.pipeline.quotes.awaitingCount}
                  cents={overview.pipeline.quotes.awaitingCents}
                />
                <PipelineRow
                  label="Jobs to schedule"
                  count={overview.pipeline.jobs.unscheduledCount}
                  cents={overview.pipeline.jobs.unscheduledCents}
                  divided
                />
                <PipelineRow
                  label="Invoices outstanding"
                  count={overview.pipeline.invoices.outstandingCount}
                  cents={overview.pipeline.invoices.outstandingCents}
                  divided
                />
                {overview.pipeline.invoices.overdueCount > 0 ? (
                  <PipelineRow
                    label="Invoices overdue"
                    count={overview.pipeline.invoices.overdueCount}
                    tone="danger"
                    divided
                  />
                ) : null}
              </View>
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  wordmark: { ...type.display, fontSize: 20, color: color.chromeInk },
  wordmarkStop: { color: color.brand },
  // chromeMuted, not chromeFaint: this is the date, read outdoors. The crew
  // screen uses chromeMuted for its equivalent chrome sub-label.
  date: { ...type.micro, color: color.chromeMuted, marginTop: space.md },
  greeting: { ...type.display, color: color.chromeInk, marginTop: space.xs },

  body: { padding: space.lg, gap: space.xl },

  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { ...type.micro, color: color.faint },
  sectionMeta: { ...type.micro, color: color.ink, fontVariant: ["tabular-nums"] },

  group: { gap: space.sm, marginTop: space.sm },
  groupTitle: { ...type.small, fontFamily: font.bodySemi, color: color.ink },
  day: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  cardBody: { padding: space.md, gap: space.xs, minHeight: HIT, justifyContent: "center" },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  pressed: { backgroundColor: color.hover },

  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  leadName: { ...type.title, color: color.ink, flexShrink: 1 },
  leadSub: { ...type.small, color: color.muted },
  trailing: { ...type.micro, color: color.muted },

  wait: { ...type.small, fontFamily: font.mono, fontVariant: ["tabular-nums"] },
  waitOk: { color: color.faint },
  waitWarn: { color: color.brand },
  waitLate: { color: color.danger },

  callBar: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandFill,
  },
  callBarPressed: { backgroundColor: color.brandDown },
  callBarText: { ...type.title, color: color.chromeInk },

  visit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    minHeight: HIT,
  },
  visitTime: {
    ...type.small,
    fontFamily: font.bodySemi,
    color: color.ink,
    width: 62,
    fontVariant: ["tabular-nums"],
  },
  visitBody: { flex: 1, gap: 2 },

  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: HIT,
  },
  lineLabel: { ...type.small, color: color.muted, flexShrink: 1 },
  lineRight: { alignItems: "flex-end" },
  lineMoney: {
    ...type.body,
    fontFamily: font.bodySemi,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  lineCount: {
    ...type.body,
    fontFamily: font.bodySemi,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  // Money never renders in the faint token — it was landing at roughly 2.7:1.
  lineCents: { ...type.small, color: color.muted, fontVariant: ["tabular-nums"] },

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

  clear: { ...type.body, color: color.good },
  muted: { ...type.small, color: color.muted },
  // Explains why a call-queue card has no Call button; it has to be readable.
  faint: { ...type.small, color: color.muted },
  dangerInk: { color: color.danger },
  brandInk: { color: color.brand },

  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { ...type.small, color: color.danger },
});
