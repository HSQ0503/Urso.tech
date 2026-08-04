// Every lead, newest first — the list Sebastian checks between jobs.
//
// A hot lead is a person who called and is waiting; a cold one came off the
// vendor feed and can keep. The whole point of this screen is that the first is
// never mistaken for the second, so hot rows carry the orange rail and the
// orange age, and the age is the loudest thing after the name.
//
// Above the rows sit the same five pipeline tabs the web console has, with the
// same membership and the same counts — all client-side over the one page of
// leads already loaded, so switching costs nothing and never invents a number.
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
} from "@urso/types";
import { useLeads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, space, type } from "@/theme";
import {
  Avatar,
  Chevron,
  Chip,
  ChromeBar,
  EmptyState,
  FilterChips,
  SectionRule,
  listRowStyle,
} from "@/components/ledger";

// The pipeline tabs, copied from the web list (app/CanesPressure/(app)/leads)
// key for key. The membership rules are the web's exactly — "open" is anything
// not yet won or lost, and working is open-minus-new — so a count read here and
// a count read on the console are the same number about the same leads.
const FILTERS = ["all", "new", "working", "won", "lost"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  new: "Needs first call",
  working: "Working",
  won: "Won",
  lost: "Lost",
};

// The web's empty copy. "New ones land here on their own" was true when this
// list had no add button; it now has one, and a lead he takes in a driveway is
// the whole reason it exists.
const EMPTY_COPY: Record<Filter, string> = {
  all: "No leads yet. New ones land here on their own — or tap New to take one down yourself.",
  new: "Nobody is waiting on a first call. New requests land here the moment they arrive.",
  working: "Nothing in progress. Leads move here once you have made contact.",
  won: "No won jobs on the board yet.",
  lost: "No lost leads.",
};

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

  const [filter, setFilter] = useState<Filter>("new");

  // Every count comes off the one page of leads already loaded — no second
  // read, and no count that claims to know about rows this screen has not seen.
  const subsets = useMemo<Record<Filter, Lead[]>>(() => {
    const rows = leads ?? [];
    const open = rows.filter((lead) => lead.status !== "won" && lead.status !== "lost");
    return {
      all: rows,
      new: open.filter((lead) => lead.status === "new"),
      working: open.filter((lead) => lead.status !== "new"),
      won: rows.filter((lead) => lead.status === "won"),
      lost: rows.filter((lead) => lead.status === "lost"),
    };
  }, [leads]);

  const rows = subsets[filter];

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

      {leads !== null ? (
        <FilterChips
          current={filter}
          onPick={setFilter}
          filters={FILTERS.map((key) => ({
            key,
            label: FILTER_LABEL[key],
            count: subsets[key].length,
            weight:
              key === "new"
                ? 1.85
                : key === "working"
                  ? 1.3
                  : key === "won"
                    ? 0.98
                    : key === "lost"
                      ? 0.97
                      : 0.85,
          }))}
        />
      ) : null}

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(lead) => lead.id}
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
            <View>
              {notice !== null ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              ) : null}
              <SectionRule
                label={filter === "new" ? "Call these now" : FILTER_LABEL[filter]}
                meta={rows.length}
                tone={filter === "new" ? "danger" : "muted"}
              />
            </View>
          }
          ListEmptyComponent={
            // Empty says WHICH empty — an unworked pipeline and a filter with
            // nothing under it are different pieces of news.
            leads !== null ? (
              // A search that found nothing is not an empty pipeline, and
              // saying "No leads yet" to someone holding 40 leads reads as
              // data loss.
              <EmptyState
                text={EMPTY_COPY[filter]}
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <LeadRow
              lead={item}
              first={index === 0}
              last={index === rows.length - 1}
              onPress={() => openLead(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  list: { paddingHorizontal: 14, paddingTop: 14 },
  listEmpty: { flexGrow: 1 },

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
