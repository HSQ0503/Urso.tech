// Every lead, newest first — the list Sebastian checks between jobs.
//
// A hot lead is a person who called and is waiting; a cold one came off the
// vendor feed and can keep. The whole point of this screen is that the first is
// never mistaken for the second, so hot rows carry the orange rule and the
// orange age, and the age is the loudest thing after the name.
//
// Times are America/New_York via fmtEt. The only clock arithmetic here is
// minutesSince, which is a pure epoch difference and has no timezone in it;
// anything that lands on a calendar day goes through fmtEt.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtEt,
  fmtPhone,
  minutesSince,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Lead,
} from "@urso/types";
import { owner, SessionExpiredError } from "@/api";
import { color, font, HIT, radius, space, type } from "@/theme";

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
        <Text style={styles.source}>{SOURCE_LABEL[lead.source]}</Text>
      </View>
    </Pressable>
  );
}

export default function LeadsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const result = await owner.leads();
        if (result.ok) {
          setLeads(result.data);
          setNotice(null);
        } else {
          // A refusal leaves the list that is already on screen alone — a stale
          // lead list still beats a blank one when the signal drops.
          setNotice(result.notice);
        }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          router.replace("/login");
          return;
        }
        setNotice("Something went wrong. Pull down to try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  // Refetch on focus so a status changed on the detail screen shows here.
  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const openLead = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/lead/[id]", params: { id } });
    },
    [router],
  );

  const showSpinner = loading && leads === null;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>Leads</Text>
        <View style={styles.chromeStat}>
          <Text style={styles.chromeStatValue}>{leads?.length ?? 0}</Text>
          <Text style={styles.chromeStatLabel}>Total</Text>
        </View>
      </View>

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={leads ?? []}
          keyExtractor={(lead) => lead.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + space.xxl },
            (leads?.length ?? 0) === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("refresh");
              }}
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
            leads !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No leads yet. New ones land here on their own.</Text>
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
  source: { ...type.micro, color: color.faint, flexShrink: 1 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
