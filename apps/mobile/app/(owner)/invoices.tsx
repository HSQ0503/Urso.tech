import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fmtEt,
  fmtMoney,
  invoiceBalanceCents,
  type Invoice,
  type InvoiceStatus,
} from "@urso/types";
import { Notice } from "@/components/notice";
import { useInvoices } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space } from "@/theme";

type SummaryFilter = "all" | "due" | "paid";
type StatusFilter = InvoiceStatus | "all";
type DateHeader = { kind: "date"; key: string; label: string; totalCents: number };
type InvoiceEntry = { kind: "invoice"; key: string; invoice: Invoice };
type LedgerRow = DateHeader | InvoiceEntry;

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "DRAFT",
  sent: "SENT",
  viewed: "VIEWED",
  paid: "PAID",
  void: "VOID",
};

function localDayKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusTone(status: InvoiceStatus): { color: string; icon: "dollar-sign" | "send" | "eye" | "edit-3" | "x" } {
  if (status === "paid") return { color: color.good, icon: "dollar-sign" };
  if (status === "sent") return { color: color.brand, icon: "send" };
  if (status === "viewed") return { color: color.brand, icon: "eye" };
  if (status === "void") return { color: color.danger, icon: "x" };
  return { color: color.muted, icon: "edit-3" };
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.statusPill, { borderColor: tone.color }]}>
      <Feather name={tone.icon} size={12} color={tone.color} />
      <Text style={[styles.statusText, { color: tone.color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function SummaryTile({
  label,
  amount,
  selected,
  onPress,
}: {
  label: string;
  amount: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${label}, ${fmtMoney(amount)}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.summaryTile, selected && styles.summaryTileSelected, pressed && styles.pressed]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryAmount} numberOfLines={1}>{fmtMoney(amount)}</Text>
    </Pressable>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const customer = invoice.customer_name?.trim();
  const job = invoice.job_name?.trim();
  const title = customer && job && customer.toLowerCase() !== job.toLowerCase()
    ? `${customer} (${job})`
    : customer || job || "Untitled invoice";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open invoice ${invoice.number} for ${invoice.customer_name ?? "customer"}`}
      onPress={() => router.push({ pathname: "/(owner)/invoice/[id]", params: { id: invoice.id } })}
      style={({ pressed }) => [styles.invoiceRow, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.customer} numberOfLines={2}>{title}</Text>
        <Text style={styles.amount}>{fmtMoney(invoice.total_cents)}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.invoiceNumber}>{invoice.number}</Text>
        {invoice.viewed_at ? <Feather name="eye" size={18} color={color.brand} /> : null}
        <StatusPill status={invoice.status} />
      </View>
      {invoice.job_id ? (
        <View style={styles.workOrderRow}>
          <Feather name="calendar" size={16} color={color.faint} />
          <Text style={styles.workOrder}>WORK ORDER</Text>
        </View>
      ) : invoice.customer_name && title !== invoice.customer_name ? (
        <Text style={styles.customerName} numberOfLines={1}>{invoice.customer_name}</Text>
      ) : null}
    </Pressable>
  );
}

export default function InvoicesScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const invoicesQuery = useInvoices();
  useRefetchOnFocus(invoicesQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(invoicesQuery.refetch);
  const invoices = invoicesQuery.data ?? [];
  const queryNotice = noticeFrom(invoicesQuery.error);

  const [query, setQuery] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const totals = useMemo(() => {
    const active = invoices.filter((invoice) => invoice.status !== "void");
    return {
      all: active.reduce((sum, invoice) => sum + invoice.total_cents, 0),
      due: active.reduce((sum, invoice) => sum + invoiceBalanceCents(invoice), 0),
      paid: active.reduce((sum, invoice) => sum + Math.min(invoice.total_cents, invoice.amount_paid_cents), 0),
    };
  }, [invoices]);

  const rows = useMemo<LedgerRow[]>(() => {
    const normalized = query.trim().toLowerCase();
    const visible = invoices
      .filter((invoice) => {
        if (summaryFilter === "paid") return invoice.status === "paid";
        if (summaryFilter === "due") return invoice.status !== "paid" && invoice.status !== "void" && invoiceBalanceCents(invoice) > 0;
        return invoice.status !== "void" || statusFilter === "void";
      })
      .filter((invoice) => statusFilter === "all" || invoice.status === statusFilter)
      .filter((invoice) => {
        if (!normalized) return true;
        return `${invoice.customer_name ?? ""} ${invoice.job_name ?? ""} ${invoice.number}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    const grouped = new Map<string, Invoice[]>();
    for (const invoice of visible) {
      const key = localDayKey(invoice.created_at);
      grouped.set(key, [...(grouped.get(key) ?? []), invoice]);
    }

    const result: LedgerRow[] = [];
    for (const [key, dayInvoices] of grouped) {
      const first = dayInvoices[0];
      if (!first) continue;
      result.push({
        kind: "date",
        key: `date-${key}`,
        label: fmtEt(first.created_at, { weekday: "long", month: "short", day: "2-digit", year: "numeric" }),
        totalCents: dayInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0),
      });
      result.push(...dayInvoices.map((invoice) => ({ kind: "invoice" as const, key: invoice.id, invoice })));
    }
    return result;
  }, [invoices, query, statusFilter, summaryFilter]);

  const chooseSummary = (filter: SummaryFilter) => {
    setSummaryFilter(filter);
    if (filter === "paid") setStatusFilter("paid");
    else if (statusFilter === "paid") setStatusFilter("all");
  };

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: color.chrome }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={31} color={color.brand} />
          <Text style={styles.headerTitle}>MY INVOICES</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create invoice" onPress={() => router.push("/(owner)/invoice/new")} style={styles.addButton}>
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Filter invoices" onPress={() => setFilterOpen(true)} style={styles.filterButton}>
          <Feather name="sliders" size={25} color={statusFilter === "all" ? color.muted : color.brand} />
        </Pressable>
        <View style={styles.searchBox}>
          <Feather name="search" size={24} color={color.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Invoices"
            placeholderTextColor={color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search invoices"
            style={styles.searchInput}
          />
        </View>
      </View>

      <View accessibilityRole="tablist" style={styles.summaryRow}>
        <SummaryTile label="ALL" amount={totals.all} selected={summaryFilter === "all"} onPress={() => chooseSummary("all")} />
        <SummaryTile label="DUE" amount={totals.due} selected={summaryFilter === "due"} onPress={() => chooseSummary("due")} />
        <SummaryTile label="PAID" amount={totals.paid} selected={summaryFilter === "paid"} onPress={() => chooseSummary("paid")} />
      </View>

      {queryNotice ? <Notice text={queryNotice} /> : null}
      {invoicesQuery.isPending ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={color.brand} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }, rows.length === 0 && styles.emptyList]}
          ListEmptyComponent={<Text style={styles.emptyText}>No invoices match this view.</Text>}
          renderItem={({ item }) => item.kind === "date" ? (
            <View style={styles.dateBand}>
              <Text style={styles.dateLabel} numberOfLines={1}>{item.label}</Text>
              <Text style={styles.dateTotal}>{fmtMoney(item.totalCents)}</Text>
            </View>
          ) : <InvoiceRow invoice={item.invoice} />}
        />
      )}

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setFilterOpen(false)}>
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 18 }]}>
            <Text style={styles.filterTitle}>FILTER INVOICES</Text>
            {(["all", "draft", "sent", "viewed", "paid", "void"] as StatusFilter[]).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: statusFilter === value }}
                onPress={() => {
                  setStatusFilter(value);
                  setSummaryFilter(value === "paid" ? "paid" : "all");
                  setFilterOpen(false);
                }}
                style={styles.filterOption}
              >
                <Text style={[styles.filterOptionText, statusFilter === value && styles.filterOptionTextOn]}>{value === "all" ? "All statuses" : STATUS_LABEL[value]}</Text>
                {statusFilter === value ? <Feather name="check" size={22} color={color.brand} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.surface },
  headerBack: { minHeight: HIT, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { fontFamily: font.bodyMedium, fontSize: 19, letterSpacing: 1.15, color: color.ink },
  addButton: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: color.brandFill },
  addText: { fontFamily: font.body, fontSize: 45, lineHeight: 49, color: color.surface, marginTop: -4 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingBottom: 18 },
  filterButton: { width: 42, height: 58, alignItems: "center", justifyContent: "center" },
  searchBox: { flex: 1, height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.hover, borderRadius: radius.md },
  searchInput: { flex: 1, fontFamily: font.body, fontSize: 17, color: color.ink },
  summaryRow: { flexDirection: "row", gap: 7, paddingHorizontal: 18, paddingBottom: 18 },
  summaryTile: { flex: 1, height: 76, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent", backgroundColor: color.hover },
  summaryTileSelected: { borderWidth: 2, borderColor: color.muted, backgroundColor: color.surface },
  summaryLabel: { fontFamily: font.bodySemi, fontSize: 18, letterSpacing: 0.6, color: color.muted },
  summaryAmount: { marginTop: 5, fontFamily: font.bodyMedium, fontSize: 13.5, color: color.muted, fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.72 },
  list: { flexGrow: 1 },
  emptyList: { justifyContent: "center" },
  emptyText: { fontFamily: font.body, fontSize: 16, color: color.muted, textAlign: "center", padding: 32 },
  dateBand: { minHeight: 38, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: color.hover },
  dateLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 16, letterSpacing: 1.05, color: color.muted },
  dateTotal: { fontFamily: font.bodySemi, fontSize: 18, color: color.muted, fontVariant: ["tabular-nums"] },
  invoiceRow: { minHeight: 148, paddingHorizontal: 18, paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong, backgroundColor: color.surface },
  rowPressed: { backgroundColor: color.brandWash },
  rowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  customer: { flex: 1, fontFamily: font.bodyMedium, fontSize: 20, lineHeight: 25, color: color.ink },
  amount: { fontFamily: font.bodySemi, fontSize: 18, color: color.ink, fontVariant: ["tabular-nums"] },
  rowMeta: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  invoiceNumber: { flex: 1, fontFamily: font.body, fontSize: 17, color: color.muted },
  statusPill: { minHeight: 28, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 15 },
  statusText: { fontFamily: font.bodyMedium, fontSize: 13, letterSpacing: 0.35 },
  workOrderRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  workOrder: { fontFamily: font.body, fontSize: 15, color: color.muted, letterSpacing: 0.5 },
  customerName: { marginTop: 12, fontFamily: font.body, fontSize: 15, color: color.muted },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  filterSheet: { paddingHorizontal: 18, paddingTop: 22, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: color.surface },
  filterTitle: { fontFamily: font.bodySemi, fontSize: 20, letterSpacing: 1, color: color.ink, marginBottom: 10 },
  filterOption: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  filterOptionText: { fontFamily: font.body, fontSize: 17, color: color.muted },
  filterOptionTextOn: { fontFamily: font.bodySemi, color: color.brandDeep },
});
