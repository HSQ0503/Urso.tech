// The customer book.
//
// The whole list arrives in one read, so the search box filters what is already
// in memory rather than asking the server on every keystroke — instant, and it
// keeps working in a driveway with one bar. Every row opens the customer's
// profile at /(owner)/customer/[id].
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
import { fmtEt, fmtMoney, fmtPhone, type CustomerSummary } from "@urso/types";
import { useCustomers } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, space, type } from "@/theme";
import {
  Avatar,
  Chevron,
  ChromeBar,
  EmptyState,
  SearchStrip,
  listRowStyle,
  searchInputStyle,
} from "@/components/ledger";

// Name matches on plain text; phone matches on digits, so "407" finds a number
// stored as +14075550123 and typing it with dashes still works.
function matches(customer: CustomerSummary, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  if (customer.name && customer.name.toLowerCase().includes(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && (customer.phone ?? "").includes(digits);
}

// Tapping a row opens the customer's profile at /(owner)/customer/[id].
function CustomerRow({
  customer,
  first,
  last,
  onPress,
}: {
  customer: CustomerSummary;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const owes = customer.open_balance_cents > 0;
  const name = customer.name ?? "Unnamed customer";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [...listRowStyle(first, last), styles.row, pressed && styles.pressed]}
    >
      <Avatar name={name} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
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
      <Chevron />
    </Pressable>
  );
}

export default function CustomersScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openCustomer = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/customer/[id]", params: { id } });
    },
    [router],
  );

  // Refusal semantics carry over from the hand-rolled version: an error keeps
  // the last-good list on screen (query.data survives an error state) and the
  // sentence shows in the notice banner. Session death routes to /login in the
  // query cache's onError, not here.
  const customersQuery = useCustomers();
  useRefetchOnFocus(customersQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(customersQuery.refetch);

  const customers = customersQuery.data ?? null;
  const notice = noticeFrom(customersQuery.error);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => (customers ?? []).filter((customer) => matches(customer, query)),
    [customers, query],
  );

  const searching = query.trim().length > 0;
  const showSpinner = customersQuery.isPending;

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Customers"
        stat={String(visible.length)}
        statLabel={searching ? "Matches" : "Total"}
        action="New"
        /* A referral he already knows is a customer from the first word.
           Making him invent a lead to reach the record is paperwork. */
        onAction={() => router.push("/(owner)/customer/new")}
      />

      <SearchStrip>
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
          style={searchInputStyle}
        />
      </SearchStrip>

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
            customers !== null ? (
              <EmptyState
                text={
                  searching
                    ? `Nothing matches “${query.trim()}”.`
                    : "No customers yet. They appear once a lead turns into work — or tap New to add someone yourself."
                }
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <CustomerRow
              customer={item}
              first={index === 0}
              last={index === visible.length - 1}
              onPress={() => openCustomer(item.id)}
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

  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  pressed: { backgroundColor: color.hover },
  rowBody: { flex: 1, minWidth: 0 },

  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  name: { ...type.title, color: color.ink, flexShrink: 1 },
  lifetime: { ...type.figureSm, color: color.ink, fontVariant: ["tabular-nums"] },

  phone: { ...type.smaller, color: color.muted, marginTop: 4 },
  address: { ...type.smaller, color: color.muted, marginTop: 2 },

  rowFoot: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9, marginTop: 6 },
  meta: { ...type.ruleSm, color: color.faint },
  owing: { ...type.ruleSm, fontFamily: font.monoMedium, color: color.danger },

  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: 5,
    padding: space.md,
    marginBottom: space.md,
  },
  noticeText: { ...type.small, color: color.danger },
});
