import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney } from "@urso/types";
import type { InsightsRange } from "@/api";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useInsights } from "@/queries";
import { noticeFrom, usePullToRefresh } from "@/query";
import { color, font, radius, space, type } from "@/theme";

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
];

export default function InsightsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<InsightsRange>("30d");
  const insightsQuery = useInsights(range);
  const { refreshing, onRefresh } = usePullToRefresh(insightsQuery.refetch);
  const insights = insightsQuery.data ?? null;

  return (
    <View style={styles.screen}>
      <ChromeBar title="Insights" sub={insights?.rangeLabel ?? "Business performance"} onBack={() => router.back()} />
      {insightsQuery.isPending ? <View style={styles.centre}><ActivityIndicator color={color.brand} /></View> : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}>
          <Notice text={noticeFrom(insightsQuery.error)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {RANGES.map((item) => <Pressable key={item.value} onPress={() => setRange(item.value)} style={[styles.filter, range === item.value && styles.filterOn]}><Text style={[styles.filterText, range === item.value && styles.filterTextOn]}>{item.label}</Text></Pressable>)}
          </ScrollView>
          {insights ? <>
            <View style={styles.kpiGrid}>
              <Kpi label="Collected" value={fmtMoney(insights.kpis.collectedCents)} tone="good" />
              <Kpi label="Outstanding" value={fmtMoney(insights.kpis.outstandingCents)} detail={`${insights.kpis.outstandingCount} invoices`} tone="brand" />
              <Kpi label="Won work" value={fmtMoney(insights.kpis.wonCents)} detail={`${insights.kpis.wonCount} estimates`} />
              <Kpi label="Avg job" value={insights.kpis.avgJobCents === null ? "—" : fmtMoney(insights.kpis.avgJobCents)} detail={`${insights.kpis.paidJobs} paid jobs`} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Profit snapshot</Text>
              <MetricRow label="Collected" value={fmtMoney(insights.kpis.collectedCents)} />
              <MetricRow label="Job expenses" value={`−${fmtMoney(insights.expensesCents)}`} />
              <View style={styles.totalRow}><Text style={styles.cardTitle}>Margin</Text><Text style={styles.margin}>{fmtMoney(insights.marginCents)}</Text></View>
            </View>
            <View style={styles.section}><Text style={styles.rule}>Top services</Text><View style={styles.list}>{insights.topServices.length === 0 ? <Text style={styles.empty}>No paid services in this period.</Text> : insights.topServices.map((service, index) => <View key={`${service.name}-${index}`} style={[styles.listRow, index > 0 && styles.divided]}><View style={styles.listBody}><Text style={styles.listTitle}>{service.name}</Text><Text style={styles.muted}>{service.count} jobs</Text></View><Text style={styles.money}>{fmtMoney(service.cents)}</Text></View>)}</View></View>
            <View style={styles.section}><Text style={styles.rule}>Lead funnel</Text><View style={styles.card}>{insights.funnel.map((step) => <MetricRow key={step.label} label={step.label} value={String(step.count)} />)}</View></View>
            <View style={styles.section}><Text style={styles.rule}>Crew margin</Text><View style={styles.list}>{insights.revenueByCrew.length === 0 ? <Text style={styles.empty}>No crew revenue in this period.</Text> : insights.revenueByCrew.map((crew, index) => <View key={crew.name} style={[styles.listRow, index > 0 && styles.divided]}><View style={styles.crewDot} /><View style={styles.listBody}><Text style={styles.listTitle}>{crew.name}</Text><Text style={styles.muted}>{crew.jobs} jobs · {fmtMoney(crew.expenseCents)} costs</Text></View><Text style={[styles.money, styles.good]}>{fmtMoney(crew.marginCents)}</Text></View>)}</View></View>
          </> : null}
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({ label, value, detail, tone = "ink" }: { label: string; value: string; detail?: string; tone?: "ink" | "good" | "brand" }) {
  return <View style={styles.kpi}><Text style={styles.rule}>{label}</Text><Text style={[styles.kpiValue, tone === "good" && styles.good, tone === "brand" && styles.brand]}>{value}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View>;
}
function MetricRow({ label, value }: { label: string; value: string }) { return <View style={styles.metricRow}><Text style={styles.muted}>{label}</Text><Text style={styles.money}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg }, centre: { flex: 1, alignItems: "center", justifyContent: "center" }, body: { padding: space.lg, gap: space.lg },
  filters: { gap: 7 }, filter: { minHeight: 40, justifyContent: "center", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, paddingHorizontal: 14 }, filterOn: { borderColor: color.brand, backgroundColor: color.brandSoft }, filterText: { ...type.small, fontFamily: font.bodySemi, color: color.muted }, filterTextOn: { color: color.brandDeep },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, kpi: { flexBasis: "48%", flexGrow: 1, minHeight: 108, justifyContent: "center", gap: 7, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, padding: space.lg },
  rule: { ...type.micro, color: color.faint }, kpiValue: { fontFamily: font.bodySemi, fontSize: 21, color: color.ink, fontVariant: ["tabular-nums"] }, good: { color: color.good }, brand: { color: color.brandDeep }, muted: { ...type.small, color: color.muted },
  card: { gap: 12, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, padding: space.lg }, cardTitle: { ...type.title, color: color.ink }, metricRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }, money: { ...type.body, fontFamily: font.bodySemi, color: color.ink, fontVariant: ["tabular-nums"] }, totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: 12 }, margin: { fontFamily: font.bodySemi, fontSize: 19, color: color.good },
  section: { gap: 8 }, list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, overflow: "hidden" }, listRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, padding: space.lg }, divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line }, listBody: { flex: 1, gap: 4 }, listTitle: { ...type.title, color: color.ink }, crewDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.brand }, empty: { ...type.body, color: color.muted, padding: space.lg },
});
