// Every lead, newest first — the list Sebastian checks between jobs.
//
// A hot lead is a person who called and is waiting; a cold one came off the
// vendor feed and can keep. The whole point of this screen is that the first is
// never mistaken for the second, so hot rows carry the orange rule and the
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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtEt,
  fmtPhone,
  minutesSince,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Lead,
} from "@urso/types";
import { useLeads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

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

// The web's empty copy, minus its "button above" — this list has no add button.
const EMPTY_COPY: Record<Filter, string> = {
  all: "No leads yet. New ones land here on their own.",
  new: "Nobody is waiting on a first call. New requests land here the moment they arrive.",
  working: "Nothing in progress. Leads move here once you have made contact.",
  won: "No won jobs on the board yet.",
  lost: "No lost leads.",
};

// Below this the vendor text was parsed badly enough that the name, phone, and
// service on the row may not be the ones in the original message. Same number
// the web marks rows at; the original text itself is on the lead screen.
const LOW_CONFIDENCE = 0.8;

function ageLabel(iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return fmtEt(iso, { month: "short", day: "numeric" });
}

// The vendor feed often has no name at all, only a number. Showing "—" there
// would lose the one identifying thing the row has.
function leadTitle(lead: Lead): string {
  if (lead.name) return lead.name;
  if (lead.phone) return fmtPhone(lead.phone);
  return "Unnamed lead";
}

function LeadRow({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const hot = lead.type === "hot";
  const reviewParse =
    lead.parse_confidence !== null && lead.parse_confidence < LOW_CONFIDENCE;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={leadTitle(lead)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, hot && styles.rowHot, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {leadTitle(lead)}
        </Text>
        <Text style={[styles.age, hot && styles.ageHot]}>{ageLabel(lead.created_at)}</Text>
      </View>

      <Text style={styles.service} numberOfLines={1}>
        {lead.service ?? "Service not stated"}
      </Text>

      <View style={styles.rowFoot}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{STATUS_LABEL[lead.status]}</Text>
        </View>
        {/* Ahead of the source, which is the one thing here allowed to shrink:
            a badly parsed row is a row whose name and number may be somebody
            else's, and that has to survive a long service line. */}
        {reviewParse ? (
          <View style={styles.reviewChip}>
            <Text style={styles.reviewChipText}>Review parse</Text>
          </View>
        ) : null}
        <Text style={styles.source}>{SOURCE_LABEL[lead.source]}</Text>
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

  // "All" is where this list has always opened, so it stays the landing tab —
  // the web defaults to Needs first call, but it also groups and sorts the rows
  // underneath, which this list does not; opening on a subset here would just
  // hide leads with no sign that it had.
  const [filter, setFilter] = useState<Filter>("all");

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
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>Leads</Text>
        <View style={styles.chromeStat}>
          <Text style={styles.chromeStatValue}>{leads?.length ?? 0}</Text>
          <Text style={styles.chromeStatLabel}>Total</Text>
        </View>
      </View>

      {/* Pinned under the chrome rather than scrolling with the rows: the tab
          he is on is a thing he needs to see while reading the list, not only
          at the top of it. Held back until the read lands, because a row of
          zeroes is a claim about leads nobody has counted yet. */}
      {leads !== null ? (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((key) => {
              const current = key === filter;
              const count = subsets[key].length;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${FILTER_LABEL[key]}, ${count}`}
                  accessibilityState={{ selected: current }}
                  onPress={() => setFilter(key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    current && styles.filterChipCurrent,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.filterText, current && styles.filterTextCurrent]}>
                    {FILTER_LABEL[key]}
                  </Text>
                  <Text style={[styles.filterCount, current && styles.filterTextCurrent]}>
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
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
            notice !== null ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            // Empty says WHICH empty — an unworked pipeline and a filter with
            // nothing under it are different pieces of news.
            leads !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{EMPTY_COPY[filter]}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <LeadRow lead={item} onPress={() => openLead(item.id)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  chrome: {
    backgroundColor: color.chrome,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chromeTitle: { ...type.display, color: color.chromeInk },
  chromeStat: { alignItems: "flex-end" },
  chromeStatValue: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    color: color.chromeInk,
    fontVariant: ["tabular-nums"],
  },
  chromeStatLabel: { ...type.micro, color: color.chromeMuted, marginTop: 2 },

  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  filterRow: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  filterChipCurrent: { borderColor: color.brand, backgroundColor: color.brandSoft },
  filterText: { ...type.micro, color: color.muted },
  filterCount: { ...type.micro, color: color.faint, fontVariant: ["tabular-nums"] },
  filterTextCurrent: { color: color.brandDeep },

  list: { padding: space.lg, gap: space.sm },
  listEmpty: { flexGrow: 1 },

  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  noticeText: { ...type.small, color: color.danger },

  row: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  // The one visual difference that matters on this screen.
  rowHot: { borderLeftWidth: 3, borderLeftColor: color.brand },
  pressed: { backgroundColor: color.hover },

  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  age: { ...type.micro, color: color.faint },
  ageHot: { color: color.brand },

  service: { ...type.small, color: color.muted },

  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xs,
  },
  chip: {
    backgroundColor: color.hover,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  chipText: { ...type.micro, color: color.muted },
  // Danger, not the accent: orange on this screen already means "hot, waiting",
  // and a bad parse is the opposite claim — do not trust what this row says.
  reviewChip: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  reviewChipText: { ...type.micro, color: color.danger },
  source: { ...type.micro, color: color.faint, flexShrink: 1 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
