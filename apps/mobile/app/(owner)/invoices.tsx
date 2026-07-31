// The bill book.
//
// The whole invoice list arrives in one read, so the search box filters what is
// already in memory rather than asking the server on every keystroke — same
// contract as the customer book. Every row opens the bill at
// /(owner)/invoice/[id].
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
import { fmtMoney, INVOICE_STATUS_LABEL, type Invoice } from "@urso/types";
import { useInvoices } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Number and customer name both match on plain text, so "1042" finds the bill
// and "rodriguez" finds everything billed to the family.
function matches(invoice: Invoice, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  if (invoice.number.toLowerCase().includes(text)) return true;
  return (invoice.customer_name ?? "").toLowerCase().includes(text);
}

function InvoiceRow({ invoice, onPress }: { invoice: Invoice; onPress: () => void }) {
  // Partially paid and still open — the figure Sebastian is chasing.
  const partiallyPaid = invoice.status !== "paid" && invoice.amount_paid_cents > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.number}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.number} numberOfLines={1}>
            {invoice.number}
          </Text>
          <Text style={styles.total}>{fmtMoney(invoice.total_cents)}</Text>
        </View>

        <Text style={styles.name} numberOfLines={1}>
          {invoice.customer_name ?? "No customer"}
        </Text>

        <View style={styles.rowFoot}>
          <Text style={styles.meta}>{INVOICE_STATUS_LABEL[invoice.status]}</Text>
          {partiallyPaid ? (
            <Text style={styles.paid}>{fmtMoney(invoice.amount_paid_cents)} paid so far</Text>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={color.faint} />
    </Pressable>
  );
}

export default function InvoicesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openInvoice = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/invoice/[id]", params: { id } });
    },
    [router],
  );

  // Refusal semantics mirror customers.tsx: an error keeps the last-good list
  // on screen and the sentence shows in the notice banner, verbatim. Session
  // death routes to /login in the query cache's onError, not here.
  const invoicesQuery = useInvoices();
  useRefetchOnFocus(invoicesQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(invoicesQuery.refetch);

  const invoices = invoicesQuery.data ?? null;
  const notice = noticeFrom(invoicesQuery.error);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => (invoices ?? []).filter((invoice) => matches(invoice, query)),
    [invoices, query],
  );

  const searching = query.trim().length > 0;
  const showSpinner = invoicesQuery.isPending;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>Invoices</Text>
        <View style={styles.chromeStat}>
          <Text style={styles.chromeStatValue}>{visible.length}</Text>
          <Text style={styles.chromeStatLabel}>{searching ? "Matches" : "Total"}</Text>
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
          accessibilityLabel="Search invoices"
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
          keyExtractor={(invoice) => invoice.id}
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
            invoices !== null ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {searching
                    ? "No invoices match that."
                    : "No invoices yet. Completing a job creates its bill."}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <InvoiceRow invoice={item} onPress={() => openInvoice(item.id)} />
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
  number: { ...type.title, color: color.ink, flexShrink: 1 },
  total: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  name: { ...type.small, color: color.muted },

  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.xs,
  },
  meta: { ...type.micro, color: color.faint },
  paid: { ...type.small, color: color.good, fontVariant: ["tabular-nums"] },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },
});
