import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ESTIMATE_STATUS_LABEL,
  fmtEt,
  fmtMoney,
  type Estimate,
  type EstimateStatus,
  type EstimateType,
} from "@urso/types";
import { Notice } from "@/components/notice";
import { useEstimates } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const STATUS_COPY: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Submitted",
  viewed: "Viewed",
  approved: "Accepted",
  declined: "Declined by customer",
  expired: "Expired",
};

const TYPE_OPTIONS: {
  value: EstimateType;
  title: string;
  copy: string;
  icon: "file-text" | "toggle-right" | "layers";
}[] = [
  {
    value: "standard",
    title: "Standard Estimate",
    copy: "Create a regular estimate with items",
    icon: "file-text",
  },
  {
    value: "options",
    title: "Options Estimate",
    copy: "Customers can select all or only certain options",
    icon: "toggle-right",
  },
  {
    value: "packages",
    title: "Package Estimate",
    copy: "Customers can select only one package",
    icon: "layers",
  },
];

type MonthRow = { kind: "month"; key: string; label: string };
type EstimateRow = { kind: "estimate"; key: string; estimate: Estimate };
type ListRow = MonthRow | EstimateRow;

function statusTone(status: EstimateStatus): { border: string; text: string; icon: string } {
  if (status === "approved") return { border: color.good, text: color.good, icon: "check" };
  if (status === "declined" || status === "expired") {
    return { border: color.danger, text: color.danger, icon: "x" };
  }
  if (status === "sent" || status === "viewed") {
    return { border: color.brand, text: color.brandDeep, icon: status === "viewed" ? "eye" : "send" };
  }
  return { border: color.lineStrong, text: color.muted, icon: "edit-3" };
}

function StatusPill({ status }: { status: EstimateStatus }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.statusPill, { borderColor: tone.border }]}>
      <Feather name={tone.icon as "check"} size={12} color={tone.text} />
      <Text style={[styles.statusText, { color: tone.text }]}>{STATUS_COPY[status]}</Text>
    </View>
  );
}

function EstimateListRow({ estimate }: { estimate: Estimate }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open estimate ${estimate.number}`}
      onPress={() => router.push({ pathname: "/(owner)/estimate/[id]", params: { id: estimate.id } })}
      style={({ pressed }) => [styles.estimateRow, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.customer} numberOfLines={1}>
          {estimate.customer_name ?? "No customer"}
        </Text>
        <Text style={styles.amount}>{fmtMoney(estimate.total_cents)}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.number}>{estimate.number}</Text>
        {estimate.viewed_at !== null ? <Feather name="eye" size={17} color={color.brand} /> : null}
        <Text style={styles.date}>
          {fmtEt(estimate.created_at, { weekday: "long", month: "short", day: "2-digit", year: "numeric" })}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <StatusPill status={estimate.status} />
      </View>
    </Pressable>
  );
}

export default function EstimatesScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const estimatesQuery = useEstimates();
  useRefetchOnFocus(estimatesQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(estimatesQuery.refetch);
  const estimates = estimatesQuery.data ?? [];
  const queryNotice = noticeFrom(estimatesQuery.error);

  const [query, setQuery] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [status, setStatus] = useState<EstimateStatus | "all">("all");

  const rows = useMemo<ListRow[]>(() => {
    const normalized = query.trim().toLowerCase();
    const visible = estimates
      .filter((estimate) => status === "all" || estimate.status === status)
      .filter((estimate) => {
        if (!normalized) return true;
        return `${estimate.customer_name ?? ""} ${estimate.number}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    const next: ListRow[] = [];
    let lastMonth = "";
    for (const estimate of visible) {
      const monthKey = fmtEt(estimate.created_at, { year: "numeric", month: "2-digit" });
      if (monthKey !== lastMonth) {
        next.push({
          kind: "month",
          key: `month-${monthKey}`,
          label: fmtEt(estimate.created_at, { month: "long", year: "numeric" }),
        });
        lastMonth = monthKey;
      }
      next.push({ kind: "estimate", key: estimate.id, estimate });
    }
    return next;
  }, [estimates, query, status]);

  const chooseType = (estimateType: EstimateType) => {
    setTypeOpen(false);
    router.push({ pathname: "/(owner)/estimate/new", params: { type: estimateType } });
  };

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: color.chrome }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={31} color={color.brand} />
          <Text style={styles.headerTitle}>ESTIMATES</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New estimate"
          onPress={() => setTypeOpen(true)}
          style={({ pressed }) => [styles.addButton, pressed && styles.actionPressed]}
        >
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter estimates"
          onPress={() => setFilterOpen(true)}
          style={styles.filterButton}
        >
          <Feather name="sliders" size={25} color={status === "all" ? color.muted : color.brand} />
        </Pressable>
        <View style={styles.searchBox}>
          <Feather name="search" size={24} color={color.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Estimates"
            placeholderTextColor={color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search estimates"
            style={styles.searchInput}
          />
        </View>
      </View>

      {queryNotice !== null ? <Notice text={queryNotice} /> : null}
      {estimatesQuery.isPending ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={color.brand} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }, rows.length === 0 && styles.emptyList]}
          ListEmptyComponent={<Text style={styles.emptyText}>No estimates match this view.</Text>}
          renderItem={({ item }) =>
            item.kind === "month" ? (
              <View style={styles.monthRow}><Text style={styles.monthText}>{item.label}</Text></View>
            ) : (
              <EstimateListRow estimate={item.estimate} />
            )
          }
        />
      )}

      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTypeOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.typeModal, { paddingBottom: insets.bottom + space.xl }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setTypeOpen(false)} style={styles.modalClose}>
              <Feather name="x" size={28} color={color.faint} />
            </Pressable>
            <Text style={styles.modalTitle}>New Estimate</Text>
            <View style={styles.typeStack}>
              {TYPE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.title}
                  onPress={() => chooseType(option.value)}
                  style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
                >
                  <View style={styles.typeIcon}><Feather name={option.icon} size={34} color={color.brand} /></View>
                  <View style={styles.typeCopyWrap}>
                    <Text style={styles.typeTitle}>{option.title}</Text>
                    <Text style={styles.typeCopy}>{option.copy}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.scrimBottom}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Show estimates</Text>
            <ScrollView>
              {(["all", "draft", "sent", "viewed", "approved", "declined", "expired"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: status === value }}
                  onPress={() => { setStatus(value); setFilterOpen(false); }}
                  style={styles.filterChoice}
                >
                  <Text style={[styles.filterChoiceText, status === value && styles.filterChoiceOn]}>
                    {value === "all" ? "All estimates" : ESTIMATE_STATUS_LABEL[value]}
                  </Text>
                  {status === value ? <Feather name="check" size={22} color={color.brand} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  header: { minHeight: 94, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBack: { minHeight: HIT, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { fontFamily: font.bodyMedium, fontSize: 20, letterSpacing: 1.2, color: color.ink },
  addButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: color.brandFill, alignItems: "center", justifyContent: "center" },
  addText: { fontFamily: font.body, fontSize: 37, lineHeight: 39, color: color.surface, marginTop: -3 },
  actionPressed: { opacity: 0.72 },
  searchRow: { paddingHorizontal: 18, paddingBottom: 22, flexDirection: "row", alignItems: "center", gap: 10 },
  filterButton: { width: HIT, height: 62, alignItems: "center", justifyContent: "center" },
  searchBox: { flex: 1, height: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, backgroundColor: color.bg, borderRadius: radius.md },
  searchInput: { flex: 1, fontFamily: font.body, fontSize: 18, color: color.ink },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 1 },
  emptyList: { justifyContent: "center" },
  emptyText: { ...type.body, color: color.muted, textAlign: "center", padding: space.xl },
  monthRow: { height: 44, justifyContent: "center", paddingHorizontal: 18, backgroundColor: color.hover },
  monthText: { fontFamily: font.bodySemi, fontSize: 18, letterSpacing: 2, textTransform: "uppercase", color: color.muted },
  estimateRow: { minHeight: 146, paddingHorizontal: 18, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  rowPressed: { backgroundColor: color.hover },
  rowTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  customer: { flex: 1, fontFamily: font.body, fontSize: 20, color: color.ink },
  amount: { fontFamily: font.bodySemi, fontSize: 17, color: color.ink, fontVariant: ["tabular-nums"] },
  rowMeta: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  number: { fontFamily: font.body, fontSize: 17, color: color.muted },
  date: { marginLeft: "auto", fontFamily: font.body, fontSize: 13, color: color.muted },
  statusRow: { marginTop: 13, alignItems: "flex-end" },
  statusPill: { minHeight: 29, maxWidth: "78%", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.25, borderRadius: 15, paddingHorizontal: 12 },
  statusText: { fontFamily: font.bodyMedium, fontSize: 12.5, letterSpacing: 0.7, textTransform: "uppercase" },
  scrim: { flex: 1, backgroundColor: color.scrim, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  typeModal: { width: "100%", maxWidth: 430, backgroundColor: color.surface, borderRadius: 20, paddingHorizontal: 26, paddingTop: 44 },
  modalClose: { position: "absolute", top: 12, right: 12, width: HIT, height: HIT, alignItems: "center", justifyContent: "center", zIndex: 2 },
  modalTitle: { fontFamily: font.display, fontSize: 30, color: color.ink, textAlign: "center", marginBottom: 30 },
  typeStack: { gap: 16 },
  typeCard: { minHeight: 116, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.lg, backgroundColor: color.hover, padding: 16, flexDirection: "row", alignItems: "center", gap: 17 },
  typeCardPressed: { backgroundColor: color.brandWash, borderColor: color.brandEdge },
  typeIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  typeCopyWrap: { flex: 1, gap: 7 },
  typeTitle: { fontFamily: font.bodySemi, fontSize: 20, color: color.ink },
  typeCopy: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.muted },
  scrimBottom: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  filterSheet: { maxHeight: "74%", backgroundColor: color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  sheetHandle: { alignSelf: "center", width: 52, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginBottom: 18 },
  sheetTitle: { fontFamily: font.display, fontSize: 26, color: color.ink, marginBottom: 10 },
  filterChoice: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  filterChoiceText: { ...type.body, color: color.ink },
  filterChoiceOn: { fontFamily: font.bodySemi, color: color.brandDeep },
});
