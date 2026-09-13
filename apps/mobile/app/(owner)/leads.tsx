// Every lead, newest first — the list Sebastian checks between jobs.
//
// A hot lead is a person who called and is waiting; a cold one came off the
// vendor feed and can keep. The whole point of this screen is that the first is
// never mistaken for the second, so hot rows carry the orange rail and the
// orange age, and the age is the loudest thing after the name.
//
// Above the rows sit the tabs Sebastian asked for (2026-09-13): WHERE the lead
// came from — All · Lead Gen · Website · Meta Ads · Door Knock · Referral — so
// he can watch a channel while his Meta ads run. The pipeline stage did not
// disappear; it became the sections inside the list, with "Call these now"
// pinned on top of every tab. All client-side over the one page of leads
// already loaded, so switching costs nothing and never invents a number.
//
// Times are America/New_York via fmtEt. The only clock arithmetic here is
// minutesSince, which is a pure epoch difference and has no timezone in it;
// anything that lands on a calendar day goes through fmtEt.

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtPhone,
  minutesSince,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Lead,
  type LeadSource,
} from "@urso/types";
import { useLeads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, radius, space, type } from "@/theme";
import {
  Avatar,
  Chevron,
  Chip,
  ChromeBar,
  EmptyState,
  SectionRule,
  listRowStyle,
} from "@/components/ledger";

// The channel tabs. Each maps onto one or more stored `leads.source` values;
// `other` (organic texts and missed calls that named no channel) shows only
// under All, because a tab for "we don't know" is not a channel.
const CHANNELS = ["all", "lead_gen", "website", "meta_ads", "door_knock", "referral"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<Channel, string> = {
  all: "All",
  lead_gen: "Lead Gen",
  website: "Website",
  meta_ads: "Meta Ads",
  door_knock: "Door Knock",
  referral: "Referral",
};

const CHANNEL_SOURCES: Record<Exclude<Channel, "all">, LeadSource[]> = {
  lead_gen: ["lead_vendor"],
  website: ["website"],
  meta_ads: ["meta_ads"],
  door_knock: ["door_hanger", "yard_sign"],
  referral: ["referral"],
};

function inChannel(lead: Lead, channel: Channel): boolean {
  return channel === "all" || CHANNEL_SOURCES[channel].includes(lead.source);
}

// The stage sections inside a tab, in the order he works them. Membership is
// the web console's exactly — "working" is open-minus-new — so a count here and
// a count on the console are the same number about the same leads.
const STAGES = ["new", "working", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  new: "Call these now",
  working: "In progress",
  won: "Won",
  lost: "Lost",
};

function stageOf(lead: Lead): Stage {
  if (lead.status === "won") return "won";
  if (lead.status === "lost") return "lost";
  return lead.status === "new" ? "new" : "working";
}

const EMPTY_COPY: Record<Channel, string> = {
  all: "No leads yet. New ones land here on their own — or tap New to take one down yourself.",
  lead_gen: "Nothing from the lead vendor yet. Their texts to the business line land here parsed.",
  website: "No website requests yet. The request form on canespressurewashing.com feeds this tab.",
  meta_ads: "No Meta ad leads yet. Tag a lead's source as Meta ads and it shows up here.",
  door_knock: "No door-knock or yard-sign leads yet.",
  referral: "No referrals yet.",
};

type Row =
  | { kind: "rule"; key: string; stage: Stage; count: number }
  | { kind: "lead"; key: string; lead: Lead; first: boolean; last: boolean };

// Sections only appear when they have rows; a tab with nothing in progress
// does not show an empty "In progress" rule.
function buildRows(leads: Lead[]): Row[] {
  const rows: Row[] = [];
  for (const stage of STAGES) {
    const members = leads.filter((lead) => stageOf(lead) === stage);
    if (members.length === 0) continue;
    rows.push({ kind: "rule", key: `rule-${stage}`, stage, count: members.length });
    members.forEach((lead, index) => {
      rows.push({
        kind: "lead",
        key: lead.id,
        lead,
        first: index === 0,
        last: index === members.length - 1,
      });
    });
  }
  return rows;
}

// The pill row from the mock: the active channel in ink-on-white, the rest
// quiet. Scrolls sideways so a sixth channel never squeezes the labels.
function ChannelTabs({ current, onPick }: { current: Channel; onPick: (channel: Channel) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabs}
      keyboardShouldPersistTaps="handled"
    >
      {CHANNELS.map((channel) => {
        const on = channel === current;
        return (
          <Pressable
            key={channel}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(channel)}
            style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && styles.pressed]}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{CHANNEL_LABEL[channel]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Below this the vendor text was parsed badly enough that the name, phone, and
// service on the row may not be the ones in the original message. Same number
// the web marks rows at; the original text itself is on the lead screen.
const LOW_CONFIDENCE = 0.8;

// Name, phone and service — the three things he actually remembers about a
// person he spoke to once. Digits-only on the phone so "5615375674" finds a
// number stored and displayed as (561) 537-5674.
function ageLabel(iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m waiting`;
  return `${Math.floor(minutes / 60)}h waiting`;
}

// The vendor feed often has no name at all, only a number. Showing "—" there
// would lose the one identifying thing the row has.
function leadTitle(lead: Lead): string {
  if (lead.name) return lead.name;
  if (lead.phone) return fmtPhone(lead.phone);
  return "Unnamed lead";
}

function LeadRow({
  lead,
  first,
  last,
  onPress,
}: {
  lead: Lead;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const hot = lead.type === "hot";
  const reviewParse = lead.parse_confidence !== null && lead.parse_confidence < LOW_CONFIDENCE;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={leadTitle(lead)}
      onPress={onPress}
      style={({ pressed }) => [
        ...listRowStyle(first, last),
        styles.row,
        hot && styles.rowHot,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={leadTitle(lead)} hot={hot} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {leadTitle(lead)}
          </Text>
          <Chip label={lead.type} tone={hot ? "brand" : "neutral"} />
        </View>
        <Text style={styles.service} numberOfLines={1}>
          {SOURCE_LABEL[lead.source]}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {lead.status === "new" ? (
          <View style={styles.ageBadge}>
            <Text style={styles.age}>{ageLabel(lead.created_at)}</Text>
          </View>
        ) : (
          <Chip label={STATUS_LABEL[lead.status]} tone="neutral" />
        )}
        {/* Ahead of the source, which is the one thing here allowed to shrink:
            a badly parsed row is a row whose name and number may be somebody
            else's, and that has to survive a long service line. */}
        {reviewParse ? <Chip label="Review" tone="danger" /> : null}
        <Chevron />
      </View>
    </Pressable>
  );
}

export default function LeadsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A refusal leaves the list that is already on screen alone — a stale lead
  // list still beats a blank one when the signal drops (leadsQuery.data
  // survives an error state). Session death routes to /login in the query
  // cache's onError, not here.
  const leadsQuery = useLeads();
  // Refetch on focus so a status changed on the detail screen shows here.
  useRefetchOnFocus(leadsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(leadsQuery.refetch);

  const leads = leadsQuery.data ?? null;
  const notice = noticeFrom(leadsQuery.error);

  const [channel, setChannel] = useState<Channel>("all");

  // Rows come off the one page of leads already loaded — no second read, and
  // no count that claims to know about rows this screen has not seen.
  const rows = useMemo<Row[]>(
    () => buildRows((leads ?? []).filter((lead) => inChannel(lead, channel))),
    [leads, channel],
  );

  const openLead = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/lead/[id]", params: { id } });
    },
    [router],
  );

  const showSpinner = leadsQuery.isPending;

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Leads"
        sub="Vendor texts, website requests, and referrals."
        action="New"
        /* The leak this closes: a neighbour who walks up while a crew is
           working had nowhere to go except Sebastian's memory. */
        onAction={() => router.push("/(owner)/lead/new")}
      />

      {leads !== null ? <ChannelTabs current={channel} onPick={setChannel} /> : null}

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
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
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            // Empty says WHICH empty — no leads at all and a channel with
            // nothing under it are different pieces of news.
            leads !== null ? <EmptyState text={EMPTY_COPY[channel]} /> : null
          }
          renderItem={({ item }) =>
            item.kind === "rule" ? (
              <View style={styles.rule}>
                <SectionRule
                  label={STAGE_LABEL[item.stage]}
                  meta={item.count}
                  tone={item.stage === "new" ? "danger" : "muted"}
                />
              </View>
            ) : (
              <LeadRow
                lead={item.lead}
                first={item.first}
                last={item.last}
                onPress={() => openLead(item.lead.id)}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  list: { paddingHorizontal: 14, paddingTop: 4 },
  listEmpty: { flexGrow: 1 },

  tabScroll: { flexGrow: 0 },
  tabs: { paddingHorizontal: 14, paddingVertical: 8, gap: 6, flexDirection: "row" },
  tab: {
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.hover,
  },
  tabOn: { backgroundColor: color.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong },
  tabText: { fontFamily: font.bodyMedium, fontSize: 14.5, color: color.muted },
  tabTextOn: { fontFamily: font.bodySemi, color: color.ink },
  // A stage rule sits a little clear of the block above it.
  rule: { marginTop: 14 },

  // The one accent on this screen: a hot lead is a person waiting on a call.
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11 },
  rowHot: { borderLeftColor: color.brand },
  pressed: { backgroundColor: color.hover },

  rowBody: { flex: 1, minWidth: 0 },

  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: { fontFamily: font.bodySemi, fontSize: 16.5, lineHeight: 20, color: color.ink, flexShrink: 1 },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 8 },
  ageBadge: {
    borderRadius: 6,
    backgroundColor: color.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  age: { ...type.ruleSm, letterSpacing: 1.2, color: color.danger },

  service: { ...type.small, lineHeight: 18, color: color.muted, marginTop: 3 },

  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: 5,
    padding: space.md,
    marginBottom: space.md,
  },
  noticeText: { ...type.small, color: color.danger },
});
