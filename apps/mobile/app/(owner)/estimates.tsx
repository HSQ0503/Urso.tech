// The quote book.
//
// Same shape as the customer book: the whole list arrives in one read and the
// search box filters what is already in memory — instant, and it keeps working
// in a driveway with one bar. Every row opens the quote at /(owner)/estimate/[id].
//
// Money is integer cents from the server, rendered with fmtMoney. Nothing here
// divides, rounds, or adds — the figures are exactly what the API returned.

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ESTIMATE_STATUS_LABEL, fmtEt, fmtMoney, type Estimate } from "@urso/types";
import { useEstimates } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// "EST-0012" or "Rodriguez" both find the quote — number and name are the two
// handles Sebastian actually remembers.
function matches(estimate: Estimate, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  if (estimate.number.toLowerCase().includes(text)) return true;
  return (estimate.customer_name ?? "").toLowerCase().includes(text);
}

// Compact day stamps for the journey line — the row answers "did they see it
// yet?" at a glance; the full ET timestamps live on the detail screen.
const STAMP: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function EstimateRow({ estimate, onPress }: { estimate: Estimate; onPress: () => void }) {
  const hasJourney =
    estimate.sent_at !== null || estimate.viewed_at !== null || estimate.approved_at !== null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Estimate ${estimate.number}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {estimate.customer_name ?? "No customer"}
          </Text>
          <Text style={styles.total}>{fmtMoney(estimate.total_cents)}</Text>
        </View>

        <View style={styles.rowMid}>
          <Text style={styles.number}>{estimate.number}</Text>
          <Text style={styles.status}>{ESTIMATE_STATUS_LABEL[estimate.status]}</Text>
        </View>

        {hasJourney ? (
          <View style={styles.rowFoot}>
            {estimate.sent_at !== null ? (
              <Text style={styles.meta}>Sent {fmtEt(estimate.sent_at, STAMP)}</Text>
            ) : null}
            {estimate.viewed_at !== null ? (
              <Text style={styles.meta}>Viewed {fmtEt(estimate.viewed_at, STAMP)}</Text>
            ) : null}
            {estimate.approved_at !== null ? (
              <Text style={styles.meta}>Approved {fmtEt(estimate.approved_at, STAMP)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Feather name="chevron-right" size={18} color={color.faint} />
    </Pressable>
  );
}

export default function EstimatesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openEstimate = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/estimate/[id]", params: { id } });
    },
    [router],
  );

  // A refusal keeps the last-good list on screen (query.data survives an error
  // state) and the server's sentence shows in the notice banner, verbatim.
  const estimatesQuery = useEstimates();
  useRefetchOnFocus(estimatesQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(estimatesQuery.refetch);

  const estimates = estimatesQuery.data ?? null;
  const notice = noticeFrom(estimatesQuery.error);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => (estimates ?? []).filter((estimate) => matches(estimate, query)),
    [estimates, query],
  );

  const searching = query.trim().length > 0;
  const showSpinner = estimatesQuery.isPending;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>Estimates</Text>
        <View style={styles.chromeRight}>
          <View style={styles.chromeStat}>
            <Text style={styles.chromeStatValue}>{visible.length}</Text>
            <Text style={styles.chromeStatLabel}>{searching ? "Matches" : "Total"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by number or name"
          placeholderTextColor={color.faint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search estimates"
          style={styles.search}
        />
      </View>

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(estimate) => estimate.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + space.xxl },
            visible.length === 0 && styles.listEmpty,
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
            estimates !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {searching
                    ? "No estimates match that."
                    : "No estimates yet. Start one from a lead or a customer."}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <EstimateRow estimate={item} onPress={() => openEstimate(item.id)} />
          )}
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
  chromeRight: { flexDirection: "row", alignItems: "center", gap: space.md },
  chromeStat: { alignItems: "flex-end" },
  chromeStatValue: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    color: color.chromeInk,
    fontVariant: ["tabular-nums"],
  },
  chromeStatLabel: { ...type.micro, color: color.chromeMuted, marginTop: 2 },


  searchBar: {
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  search: {
    // Deliberately NOT ...type.body: that spread carries lineHeight, and iOS
    // renders a TextInput placeholder with visibly wrong tracking when a
    // lineHeight is combined with a custom font. Height comes from minHeight.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },

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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  pressed: { backgroundColor: color.hover },
  rowBody: { flex: 1, gap: space.xs },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  total: { ...type.small, color: color.ink, fontVariant: ["tabular-nums"] },
  rowMid: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  number: { ...type.micro, color: color.faint, fontVariant: ["tabular-nums"] },
  status: { ...type.micro, color: color.muted },

  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.xs,
  },
  meta: { ...type.micro, color: color.faint },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
