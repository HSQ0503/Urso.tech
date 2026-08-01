import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WG_DASHBOARD_SECTIONS, type WgDashboardSection } from "@urso/types";
import { font, HIT, space, type } from "@/theme";
import { WgApiError, woofGangApi, type WgSession } from "@/workspaces/woof-gang/api";
import { DashboardBlock } from "@/workspaces/woof-gang/dashboard-blocks";
import { currentEasternMonth, shiftMonth } from "@/workspaces/woof-gang/period";
import { IconButton, Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

const compareModes = ["stores", "groomers", "products"] as const;
const comparePresets = ["mom", "yoy", "years", "30d", "custom"] as const;
const compareMetrics = {
  stores: ["all", "revenue", "bookings", "avgTicket", "rebook", "attach", "groomingShare"],
  groomers: ["all", "revenue", "appts", "avgTicket"],
  products: ["all", "revenue", "units", "margin"],
} as const;

function validSection(value: string | string[] | undefined): WgDashboardSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  return WG_DASHBOARD_SECTIONS.find((section) => section === candidate) ?? "performance";
}

function nextStore(session: WgSession, current: string | null): string | null {
  const index = session.stores.findIndex((store) => store.id === current);
  return session.stores[(index + 1) % session.stores.length]?.id ?? session.stores[0]?.id ?? null;
}

function nextValue<T extends string>(values: readonly T[], current: string): T {
  const index = values.findIndex((value) => value === current);
  return values[(index + 1) % values.length];
}

export default function WoofGangExplore(): React.ReactElement {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = validSection(params.section);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [productSort, setProductSort] = useState("revenue");
  const [productDirection, setProductDirection] = useState<"asc" | "desc">("desc");
  const [productPage, setProductPage] = useState(1);
  const [compareMode, setCompareMode] = useState<"stores" | "groomers" | "products">("stores");
  const [comparePreset, setComparePreset] = useState<"mom" | "yoy" | "years" | "30d" | "custom">("mom");
  const [compareMetric, setCompareMetric] = useState("all");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  const storeId = selectedStore ?? sessionQuery.data?.defaultStoreId ?? sessionQuery.data?.stores[0]?.id ?? null;
  const options = useMemo(() => {
    if (section === "products") return { q: submittedQuery || undefined, sort: productSort, dir: productDirection, page: productPage };
    if (section === "compare") return { mode: compareMode, preset: comparePreset, metric: compareMetric, a: comparePreset === "custom" ? compareA || undefined : undefined, b: comparePreset === "custom" ? compareB || undefined : undefined };
    return {};
  }, [compareA, compareB, compareMetric, compareMode, comparePreset, productDirection, productPage, productSort, section, submittedQuery]);
  const sectionQuery = useQuery({
    queryKey: ["wg", "dashboard", section, storeId, month, options],
    queryFn: () => woofGangApi.section(section, storeId, month, options),
    enabled: sessionQuery.isSuccess,
  });
  const refresh = useCallback(async () => { await sectionQuery.refetch(); }, [sectionQuery]);
  const data = sectionQuery.data;
  const storeName = sessionQuery.data?.stores.find((store) => store.id === storeId)?.name ?? "All stores";

  if (sessionQuery.isLoading || sectionQuery.isLoading) return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.orange} size="large" /></View>;
  const error = sessionQuery.error ?? sectionQuery.error;
  if (error) return <View style={wgStyles.centre}><Notice tone="error" text={error instanceof WgApiError ? error.message : "This dashboard section could not be loaded."} /><View style={{ height: space.md }} /><Pressable accessibilityRole="button" onPress={() => router.back()} style={wgStyles.retry}><Text style={wgStyles.retryText}>Go back</Text></Pressable></View>;
  if (!data || !sessionQuery.data) return <View style={wgStyles.centre}><Notice text="No dashboard data is available." /></View>;

  const compareMetricOptions = compareMetrics[compareMode];
  return (
    <View style={wgStyles.screen}>
      <ScrollView
        contentContainerStyle={[wgStyles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={<RefreshControl refreshing={sectionQuery.isRefetching} onRefresh={() => void refresh()} tintColor={wgColor.orange} colors={[wgColor.orange]} />}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader eyebrow={`${data.eyebrow.toUpperCase()} · ${data.period.toUpperCase()}`} title={data.title} right={<IconButton icon="x" label="Close dashboard section" onPress={() => router.back()} />} />
        {section !== "actions" ? <Pressable accessibilityRole="button" accessibilityLabel={`Ask urso.ai about ${data.title}`} onPress={() => router.push({ pathname: "/(woof-gang)/ai", params: { topic: data.title, store: storeId ?? "all", month } })} style={({ pressed }) => [styles.askAi, pressed && { opacity: 0.68 }]}><Text style={styles.askAiLabel}>URSO.AI</Text><Text style={styles.askAiText}>Ask about this dashboard</Text><Feather name="arrow-up-right" size={16} color={wgColor.orange} /></Pressable> : null}
        {section !== "events" ? <View style={wgStyles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change store" onPress={() => setSelectedStore(nextStore(sessionQuery.data, storeId))} style={({ pressed }) => [wgStyles.control, pressed && wgStyles.pressed]}><Text style={wgStyles.controlLabel}>Store</Text><Text style={wgStyles.controlValue} numberOfLines={1}>{storeName}</Text></Pressable>
          {section !== "brief" && section !== "compare" ? <Pressable accessibilityRole="button" accessibilityLabel="Change period" onPress={() => setMonth(month === "all" ? currentEasternMonth() : month === currentEasternMonth() ? shiftMonth(month, -1) : "all")} style={({ pressed }) => [wgStyles.control, pressed && wgStyles.pressed]}><Text style={wgStyles.controlLabel}>Period</Text><Text style={wgStyles.controlValue} numberOfLines={1}>{data.period}</Text></Pressable> : null}
        </View> : null}

        {section === "products" ? <View style={styles.filters}><View style={styles.searchRow}><TextInput accessibilityLabel="Search products" placeholder="Search products…" placeholderTextColor={wgColor.faint} value={query} onChangeText={setQuery} onSubmitEditing={() => { setProductPage(1); setSubmittedQuery(query); }} style={styles.search} /><Pressable accessibilityRole="button" onPress={() => { setProductPage(1); setSubmittedQuery(query); }} style={styles.searchButton}><Feather name="search" color={wgColor.bg} size={18} /></Pressable></View><View style={styles.searchRow}><Pressable accessibilityRole="button" onPress={() => { setProductPage(1); const nextSort = nextValue(["revenue", "units", "margin", "name"], productSort); setProductSort(nextSort); setProductDirection(nextSort === "name" ? "asc" : "desc"); }} style={styles.filterButton}><Text style={styles.filterLabel}>SORT</Text><Text style={styles.filterValue}>{productSort}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setProductPage(1); setProductDirection((value) => value === "asc" ? "desc" : "asc"); }} style={styles.filterButton}><Text style={styles.filterLabel}>DIRECTION</Text><Text style={styles.filterValue}>{productDirection === "asc" ? "ascending" : "descending"}</Text></Pressable></View></View> : null}

        {section === "compare" ? <View style={styles.compareControls}><View style={styles.searchRow}><Pressable accessibilityRole="button" onPress={() => { const mode = nextValue(compareModes, compareMode); setCompareMode(mode); setCompareMetric("all"); }} style={styles.filterButton}><Text style={styles.filterLabel}>COMPARE</Text><Text style={styles.filterValue}>{compareMode}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setComparePreset(nextValue(comparePresets, comparePreset))} style={styles.filterButton}><Text style={styles.filterLabel}>PERIODS</Text><Text style={styles.filterValue}>{comparePreset}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setCompareMetric(nextValue(compareMetricOptions, compareMetric))} style={styles.filterButton}><Text style={styles.filterLabel}>METRIC</Text><Text style={styles.filterValue}>{compareMetric}</Text></Pressable></View>{comparePreset === "custom" ? <View style={styles.customDates}><Text style={styles.customHint}>Use START..END. Add up to three comma-separated baseline ranges.</Text><TextInput accessibilityLabel="Focus date range" placeholder="Focus 2026-07-01..2026-07-31" placeholderTextColor={wgColor.faint} value={compareA} onChangeText={setCompareA} autoCapitalize="none" style={styles.search} /><TextInput accessibilityLabel="Baseline date ranges" placeholder="Baseline 2026-06-01..2026-06-30" placeholderTextColor={wgColor.faint} value={compareB} onChangeText={setCompareB} autoCapitalize="none" style={styles.search} /></View> : null}</View> : null}

        {data.blocks.map((block) => <DashboardBlock key={block.id} block={block} onChanged={() => void refresh()} />)}

        {section === "products" && data.controls ? <View style={styles.pagination}><Pressable accessibilityRole="button" disabled={(data.controls.page ?? 1) <= 1} onPress={() => setProductPage((page) => Math.max(1, page - 1))} style={[styles.pageButton, (data.controls.page ?? 1) <= 1 && styles.disabled]}><Feather name="arrow-left" size={16} color={wgColor.ink} /><Text style={styles.pageText}>Previous</Text></Pressable><Text style={styles.pageMeta}>{data.controls.page} / {data.controls.pages} · {data.controls.total} products</Text><Pressable accessibilityRole="button" disabled={(data.controls.page ?? 1) >= (data.controls.pages ?? 1)} onPress={() => setProductPage((page) => page + 1)} style={[styles.pageButton, (data.controls.page ?? 1) >= (data.controls.pages ?? 1) && styles.disabled]}><Text style={styles.pageText}>Next</Text><Feather name="arrow-right" size={16} color={wgColor.ink} /></Pressable></View> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  askAi: { minHeight: HIT, borderLeftWidth: 2, borderLeftColor: wgColor.orange, backgroundColor: wgColor.orangeWash, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  askAiLabel: { color: wgColor.orange, ...type.micro },
  askAiText: { flex: 1, color: wgColor.muted, fontFamily: font.bodyMedium, fontSize: 13 },
  filters: { gap: space.sm },
  searchRow: { flexDirection: "row", gap: space.sm },
  search: { minHeight: HIT, flex: 1, borderWidth: 1, borderColor: wgColor.lineStrong, backgroundColor: wgColor.surface, color: wgColor.ink, paddingHorizontal: space.md, fontFamily: font.body, fontSize: 15 },
  searchButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orange },
  filterButton: { minHeight: HIT, flex: 1, borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface, paddingHorizontal: space.md, justifyContent: "center" },
  filterLabel: { color: wgColor.faint, ...type.micro },
  filterValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  compareControls: { gap: space.sm },
  customDates: { gap: space.sm },
  customHint: { color: wgColor.faint, ...type.small },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  pageButton: { minHeight: HIT, flexDirection: "row", alignItems: "center", gap: space.sm },
  pageText: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 13 },
  pageMeta: { color: wgColor.faint, fontFamily: font.mono, fontSize: 10, textAlign: "center" },
  disabled: { opacity: 0.32 },
});
