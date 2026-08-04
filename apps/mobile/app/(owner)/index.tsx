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
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney, fmtPhone, minutesSince, SOURCE_LABEL, type Lead } from "@urso/types";
import { NavigateButton } from "@/components/navigate";
import { useAgenda, useOverview } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { getAdminProfile } from "@/session";
import { color, font, HIT, radius, space, type } from "@/theme";
import {
  ActionButton,
  Chevron,
  ChromeGreeting,
  EmptyState,
  GroupLabel,
  LedgerBlock,
  MoneyStrip,
  Row,
  SectionRule,
  SectionRuleBadge,
  bodyStyle,
} from "@/components/ledger";

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
  count,
  children,
}: {
  label: string;
  meta?: string;
  // When the number IS the news, it renders as a filled badge instead of bare
  // digits — "Needs you now" earns that, "Pipeline" does not.
  count?: number;
  children: ReactNode;
}): React.ReactElement {
  return (
    <View>
      {/* The heading is a RULE: label, a hairline that eats the rest of the
          width, and the count pinned right. A free-floating label left the eye
          hunting for where one section stopped and the next began. */}
      {count === undefined ? (
        <SectionRule label={label} meta={meta ?? null} />
      ) : (
        <SectionRuleBadge label={label} count={count} />
      )}
      {children}
    </View>
  );
}

// The call-now queue. The whole row opens the lead; the orange bar under it
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
    <LedgerBlock rail={color.danger}>
      <Row first onPress={onOpen} accessibilityLabel={`Open ${leadTitle(lead)}`}>
        <View style={styles.openRow}>
          <View style={styles.openBody}>
            <View style={styles.rowTop}>
              <Text style={styles.queueName} numberOfLines={1}>
                {leadTitle(lead)}
              </Text>
              <Text style={[styles.wait, waitStyle(minutes)]}>{waited(minutes)}</Text>
            </View>
            <Text style={styles.leadSub} numberOfLines={1}>
              {lead.service ?? "Service not listed"} · {SOURCE_LABEL[lead.source]}
            </Text>
          </View>
          <Chevron />
        </View>
      </Row>

      {phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${leadTitle(lead)}`}
          onPress={() => onCall(phone)}
          style={({ pressed }) => [styles.callBar, pressed && styles.callBarPressed]}
        >
          <Feather name="phone" size={17} color={color.surface} />
          <Text style={styles.callBarText}>Call {fmtPhone(phone)}</Text>
        </Pressable>
      ) : (
        <Row>
          <Text style={styles.leadSub}>No phone number on this lead.</Text>
        </Row>
      )}

      {failed ? (
        <Row>
          <Notice text="This phone couldn't start that call." />
        </Row>
      ) : null}
    </LedgerBlock>
  );
}

// Every other queue row: one tap into the lead, with the one fact that explains
// why it is in this list. These live INSIDE one block per group rather than
// each carrying its own border — that was the floating-card problem.
function LeadRow({
  lead,
  sub,
  trailing,
  first,
  onOpen,
}: {
  lead: Lead;
  sub: string;
  trailing?: string;
  first?: boolean;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <Row first={first} onPress={onOpen} accessibilityLabel={`Open ${leadTitle(lead)}`}>
      <View style={styles.openRow}>
        <View style={styles.openBody}>
          <View style={styles.rowTop}>
            <Text style={styles.queueName} numberOfLines={1}>
              {leadTitle(lead)}
            </Text>
            {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
          </View>
          <Text style={styles.leadSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Chevron />
      </View>
    </Row>
  );
}

// A titled group of queue rows on one surface. The dot and the label carry the
// tone; the rail repeats it down the left edge of the block.
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
  const tint = tone === "danger" ? color.danger : tone === "brand" ? color.brand : color.muted;
  return (
    <View>
      <GroupLabel label={`${title} — ${count}`} tone={tint} />
      <LedgerBlock rail={tone ? tint : undefined}>{children}</LedgerBlock>
    </View>
  );
}

function PipelineRow({
  label,
  count,
  cents,
  tone,
  first,
}: {
  label: string;
  count: number;
  cents?: number;
  tone?: "danger";
  first?: boolean;
}): React.ReactElement {
  return (
    <Row first={first} style={styles.line}>
      <View style={styles.lineRow}>
        <Text style={styles.lineLabel}>{label}</Text>
        <View style={styles.lineRight}>
          <Text style={[styles.lineCount, tone === "danger" && styles.dangerInk]}>{count}</Text>
          {cents === undefined ? null : <Text style={styles.lineCents}>{fmtMoney(cents)}</Text>}
        </View>
      </View>
    </Row>
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
      {/* The bear carries the chrome now — ghosted off the top-right corner,
          solid at 22px in the lockup — and the orange rail sits on the bottom
          edge. Two lines, not three: the wordmark and the date share a rule so
          the greeting is the last thing before actual work. */}
      <ChromeGreeting
        date={fmtEt(new Date().toISOString(), { weekday: "short", month: "long", day: "numeric" })}
        greeting={`${greetingWord()}${name ? `, ${name}` : ""}`}
      />

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          {/* First thing under the greeting, edge to edge and flush against the
              chrome. It was four scrolls down, which is a strange place to keep
              the answer to "how did this week go". A zero renders faint — an
              amount that has not happened yet should not read as a figure. */}
          {overview !== null ? (
            <MoneyStrip
              label="Money this week"
              cells={[
                {
                  label: "Collected",
                  value: fmtMoney(overview.money.collectedThisWeekCents),
                  dim: overview.money.collectedThisWeekCents === 0,
                },
                {
                  label: "Won",
                  value: fmtMoney(overview.money.wonThisWeekCents),
                  dim: overview.money.wonThisWeekCents === 0,
                },
                {
                  label: "Booked 7d",
                  value: fmtMoney(overview.money.bookedNext7DaysCents),
                  dim: overview.money.bookedNext7DaysCents === 0,
                },
              ]}
            />
          ) : null}

          <View style={styles.body}>
            {notices.map((text) => (
              <Notice key={text} text={text} />
            ))}

            {/* Gated on notices alone: when overview succeeded but agenda refused, the
                old condition hid the button and pull-to-refresh was the only recovery,
                with nothing on screen saying so. */}
            {notices.length > 0 ? (
              <ActionButton label="Try again" onPress={onRefresh} />
            ) : null}

            {overview !== null ? (
              <Section label="Needs you now" count={needsCount > 0 ? needsCount : undefined}>
                {needsCount === 0 ? (
                  <LedgerBlock>
                    <Row first>
                      <Text style={styles.clear}>Nothing needs you right now.</Text>
                    </Row>
                  </LedgerBlock>
                ) : null}

                <View style={styles.groups}>
                  {cold.length > 0 ? (
                    <View style={styles.groups}>
                      <GroupLabel label={`Call these now — ${cold.length}`} tone={color.danger} />
                      {cold.map((lead) => (
                        <CallQueueCard
                          key={lead.id}
                          lead={lead}
                          failed={callFailedFor === lead.id}
                          onOpen={() => openLead(lead.id)}
                          onCall={(phone) => callLead(lead.id, phone)}
                        />
                      ))}
                    </View>
                  ) : null}

                  {unconfirmed.length > 0 ? (
                    <Group title="Unconfirmed visits" count={unconfirmed.length}>
                      {unconfirmed.map((lead, index) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          first={index === 0}
                          sub={fmtEt(lead.appointment_at)}
                          trailing="No yes yet"
                          onOpen={() => openLead(lead.id)}
                        />
                      ))}
                    </Group>
                  ) : null}

                  {pastDue.length > 0 ? (
                    <Group title="Past due visits" count={pastDue.length} tone="brand">
                      {pastDue.map((lead, index) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          first={index === 0}
                          sub={`${lead.service ?? "Estimate visit"} · was ${fmtEt(lead.appointment_at)}`}
                          onOpen={() => openLead(lead.id)}
                        />
                      ))}
                    </Group>
                  ) : null}

                  {followUps.length > 0 ? (
                    <Group title="Follow-ups due" count={followUps.length}>
                      {followUps.map((lead, index) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          first={index === 0}
                          sub={`${lead.service ?? SOURCE_LABEL[lead.source]} · last activity ${fmtEt(
                            lead.last_activity_at,
                            { month: "short", day: "numeric" },
                          )}`}
                          onOpen={() => openLead(lead.id)}
                        />
                      ))}
                    </Group>
                  ) : null}
                </View>
              </Section>
            ) : null}

            {/* "Next 2 days", not "Today": /canes/agenda calls getAgenda(2) to match
                the web Today page, so this list already spans tomorrow. Labelling a
                two-day window "Today" is the kind of small wrongness that makes
                someone stop trusting the whole screen. */}
            {agenda !== null ? (
              <Section
                label="Next 2 days"
                meta={String(agenda.reduce((total, group) => total + group.leads.length, 0))}
              >
                {agenda.length === 0 ? (
                  <EmptyState text="No visits on the calendar yet." size={74}>
                    <ActionButton
                      label="Book from the tray"
                      tone="brand"
                      icon="arrow-right"
                      onPress={() => router.push("/(owner)/schedule")}
                    />
                  </EmptyState>
                ) : (
                  // `day` arrives already formatted in ET by the server — it is a
                  // label, not a timestamp, so it is rendered and never parsed.
                  <View style={styles.groups}>
                    {agenda.map((group) => (
                      <View key={group.day}>
                        <GroupLabel label={group.day} tone={color.faint} />
                        <LedgerBlock>
                          {group.leads.map((lead, index) => (
                            <Row
                              key={lead.id}
                              first={index === 0}
                              onPress={() => openLead(lead.id)}
                              accessibilityLabel={`Open ${leadTitle(lead)}`}
                            >
                              <View style={styles.openRow}>
                                <Text style={styles.visitTime} numberOfLines={1}>
                                  {fmtEt(lead.appointment_at, {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </Text>
                                <View style={styles.openBody}>
                                  <Text style={styles.queueName} numberOfLines={1}>
                                    {leadTitle(lead)}
                                  </Text>
                                  <Text style={styles.leadSub} numberOfLines={1}>
                                    {lead.address ?? lead.service ?? "Address pending"}
                                  </Text>
                                </View>
                                {/* Beside the address it acts on, and its own Pressable
                                    so starting directions never also opens the lead.
                                    No notice slot on a queue row, so no onFail. */}
                                <NavigateButton address={lead.address} compact />
                                <Chevron />
                              </View>
                            </Row>
                          ))}
                        </LedgerBlock>
                      </View>
                    ))}
                  </View>
                )}
              </Section>
            ) : null}

            {overview !== null ? (
              <Section label="Pipeline">
                <LedgerBlock>
                  <PipelineRow
                    first
                    label="Quotes awaiting"
                    count={overview.pipeline.quotes.awaitingCount}
                    cents={overview.pipeline.quotes.awaitingCents}
                  />
                  <PipelineRow
                    label="Jobs to schedule"
                    count={overview.pipeline.jobs.unscheduledCount}
                    cents={overview.pipeline.jobs.unscheduledCents}
                  />
                  <PipelineRow
                    label="Invoices outstanding"
                    count={overview.pipeline.invoices.outstandingCount}
                    cents={overview.pipeline.invoices.outstandingCents}
                  />
                  {overview.pipeline.invoices.overdueCount > 0 ? (
                    <PipelineRow
                      label="Invoices overdue"
                      count={overview.pipeline.invoices.overdueCount}
                      tone="danger"
                    />
                  ) : null}
                </LedgerBlock>
              </Section>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  body: bodyStyle,
  groups: { gap: 14 },

  openRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  openBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  queueName: { ...type.titleLg, color: color.ink, flexShrink: 1 },
  leadSub: { ...type.small, lineHeight: 18, color: color.muted, marginTop: 5 },
  trailing: { ...type.ruleSm, color: color.faint },

  wait: { fontFamily: font.mono, fontSize: 13, fontVariant: ["tabular-nums"] },
  waitOk: { color: color.faint },
  waitWarn: { color: color.brand },
  waitLate: { color: color.danger },

  callBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: color.brandFill,
  },
  callBarPressed: { backgroundColor: color.brandDown },
  callBarText: { ...type.titleLg, color: color.surface },

  visitTime: {
    fontFamily: font.monoMedium,
    fontSize: 13,
    color: color.ink,
    width: 62,
    fontVariant: ["tabular-nums"],
  },

  line: { paddingVertical: 14, paddingHorizontal: 13, minHeight: HIT, justifyContent: "center" },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  lineLabel: { fontFamily: font.body, fontSize: 13.5, lineHeight: 18, color: color.muted, flexShrink: 1 },
  lineRight: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  lineCount: { ...type.figure, letterSpacing: 0, color: color.ink, fontVariant: ["tabular-nums"] },
  // Money never renders in the faint token — it was landing at roughly 2.7:1.
  lineCents: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: color.muted,
    minWidth: 78,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  dangerInk: { color: color.danger },

  clear: { ...type.body, color: color.good },

  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { ...type.small, color: color.danger },
});
