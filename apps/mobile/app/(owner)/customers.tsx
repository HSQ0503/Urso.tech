// The customer book.
//
// The whole list arrives in one read, so the search box filters what is already
// in memory rather than asking the server on every keystroke — instant, and it
// keeps working in a driveway with one bar. Rows do not navigate yet: the
// customer detail screen is a later slice, and a tap that goes nowhere teaches
// the wrong thing about the app.
//
// Money is integer cents from the server, rendered with fmtMoney. Nothing here
// divides, rounds, or adds — the figures are exactly what the API returned.

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney, fmtPhone, type CustomerSummary } from "@urso/types";
import { owner, SessionExpiredError } from "@/api";
import { color, font, HIT, radius, space, type } from "@/theme";

// Name matches on plain text; phone matches on digits, so "407" finds a number
// stored as +14075550123 and typing it with dashes still works.
function matches(customer: CustomerSummary, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  if (customer.name && customer.name.toLowerCase().includes(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && (customer.phone ?? "").includes(digits);
}

// Deliberately a View, not a Pressable: the customer detail screen is a later
// slice, and a row that presses but goes nowhere is a worse answer than a row
// that plainly does not press.
function CustomerRow({ customer }: { customer: CustomerSummary }) {
  const owes = customer.open_balance_cents > 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {customer.name ?? "Unnamed customer"}
        </Text>
        {/* A customer who has never been billed shows nothing here. "$0.00"
            reads as a figure that was calculated, and it put a column of zeroes
            down the list where the eye is looking for real revenue. */}
        {customer.lifetime_cents > 0 ? (
          <Text style={styles.lifetime}>{fmtMoney(customer.lifetime_cents)}</Text>
        ) : null}
      </View>

      {customer.phone !== null ? (
        <Text style={styles.phone}>{fmtPhone(customer.phone)}</Text>
      ) : null}

      {customer.primary_address !== null ? (
        <Text style={styles.address} numberOfLines={1}>
          {customer.primary_address}
        </Text>
      ) : null}

      <View style={styles.rowFoot}>
        <Text style={styles.meta}>
          {customer.jobs_count} {customer.jobs_count === 1 ? "job" : "jobs"}
        </Text>
        {customer.last_job_at !== null ? (
          <Text style={styles.meta}>
            Last {fmtEt(customer.last_job_at, { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        ) : null}
        {owes ? (
          <Text style={styles.owing}>{fmtMoney(customer.open_balance_cents)} open</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function CustomersScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const result = await owner.customers();
        if (result.ok) {
          setCustomers(result.data);
          setNotice(null);
        } else {
          // Keep whatever list is already loaded; a refusal is a message, not a
          // reason to empty the screen.
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

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const visible = useMemo(
    () => (customers ?? []).filter((customer) => matches(customer, query)),
    [customers, query],
  );

  const searching = query.trim().length > 0;
  const showSpinner = loading && customers === null;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>Customers</Text>
        <View style={styles.chromeStat}>
          <Text style={styles.chromeStatValue}>{visible.length}</Text>
          <Text style={styles.chromeStatLabel}>{searching ? "Matches" : "Total"}</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or phone"
          placeholderTextColor={color.faint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search customers"
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
          keyExtractor={(customer) => customer.id}
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
            customers !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {searching
                    ? "Nobody here matches that."
                    : "No customers yet. They appear once a lead turns into work."}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <CustomerRow customer={item} />}
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
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  lifetime: { ...type.small, color: color.ink, fontVariant: ["tabular-nums"] },
  phone: { ...type.small, color: color.muted, fontVariant: ["tabular-nums"] },
  address: { ...type.small, color: color.faint },

  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.xs,
  },
  meta: { ...type.micro, color: color.faint },
  owing: { ...type.micro, color: color.brand, fontVariant: ["tabular-nums"] },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
