import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney, type PayoutRangeKey } from "@urso/types";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { usePayouts } from "@/queries";
import { noticeFrom, usePullToRefresh } from "@/query";
import { color, font, radius, space, type } from "@/theme";

const RANGES: { value: PayoutRangeKey; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export default function PayoutsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<PayoutRangeKey>("month");
  const payoutsQuery = usePayouts(range);
  const { refreshing, onRefresh } = usePullToRefresh(payoutsQuery.refetch);
  const summary = payoutsQuery.data ?? null;

  return (
    <View style={styles.screen}>
      <ChromeBar title="Payouts" sub={summary?.rangeLabel ?? "Owner-only payroll view"} onBack={() => router.back()} />
      {payoutsQuery.isPending ? (
        <View style={styles.centre}><ActivityIndicator color={color.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
        >
          <Notice text={noticeFrom(payoutsQuery.error)} />
          <View style={styles.segment}>
            {RANGES.map((item) => (
              <Pressable key={item.value} onPress={() => setRange(item.value)} style={[styles.segmentButton, range === item.value && styles.segmentButtonOn]}>
                <Text style={[styles.segmentText, range === item.value && styles.segmentTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {summary ? (
            <>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}><Text style={styles.rule}>Collected</Text><Text style={styles.value}>{fmtMoney(summary.collectedCents)}</Text></View>
                <View style={styles.summaryCard}><Text style={styles.rule}>Gross profit</Text><Text style={[styles.value, styles.good]}>{fmtMoney(summary.grossProfitCents)}</Text></View>
                <View style={styles.summaryCard}><Text style={styles.rule}>Labor</Text><Text style={styles.value}>{fmtMoney(summary.laborCents)}</Text></View>
                <View style={styles.summaryCard}><Text style={styles.rule}>Distributable</Text><Text style={[styles.value, styles.brand]}>{fmtMoney(summary.distributableCents)}</Text></View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Waterfall</Text>
                <MoneyRow label="Collected" value={summary.collectedCents} />
                <MoneyRow label="Job expenses" value={-summary.jobExpensesCents} />
                <MoneyRow label="Overhead" value={-summary.overheadCents} />
                <MoneyRow label="Labor" value={-summary.laborCents} />
                <MoneyRow label="Ops share" value={-summary.opsShareCents} />
                <View style={styles.totalRow}><Text style={styles.cardTitle}>Distributable</Text><Text style={styles.total}>{fmtMoney(summary.distributableCents)}</Text></View>
              </View>

              <View style={styles.section}>
                <Text style={styles.rule}>Team payouts</Text>
                <View style={styles.list}>
                  {summary.lines.length === 0 ? <Text style={styles.empty}>No payouts in this period.</Text> : summary.lines.map((line, index) => (
                    <View key={line.member_id} style={[styles.personRow, index > 0 && styles.divided]}>
                      <View style={styles.personBody}><Text style={styles.personName}>{line.name}</Text><Text style={styles.muted}>{line.basis}</Text></View>
                      <Text style={styles.money}>{fmtMoney(line.amount_cents)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return <View style={styles.moneyRow}><Text style={styles.muted}>{label}</Text><Text style={styles.money}>{value < 0 ? "−" : ""}{fmtMoney(Math.abs(value))}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg }, centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: space.lg, gap: space.lg },
  segment: { flexDirection: "row", borderRadius: radius.md, backgroundColor: color.hover, padding: 3 },
  segmentButton: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentButtonOn: { backgroundColor: color.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  segmentText: { ...type.small, fontFamily: font.bodySemi, color: color.muted }, segmentTextOn: { color: color.ink },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: { flexBasis: "48%", flexGrow: 1, minHeight: 100, justifyContent: "center", gap: 8, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, padding: space.lg },
  rule: { ...type.micro, color: color.faint }, value: { fontFamily: font.bodySemi, fontSize: 20, color: color.ink, fontVariant: ["tabular-nums"] }, good: { color: color.good }, brand: { color: color.brandDeep },
  card: { gap: 12, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, padding: space.lg },
  cardTitle: { ...type.title, color: color.ink }, moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: 12 }, total: { fontFamily: font.bodySemi, fontSize: 18, color: color.ink },
  muted: { ...type.small, color: color.muted }, money: { ...type.body, fontFamily: font.bodySemi, color: color.ink, fontVariant: ["tabular-nums"] },
  section: { gap: 8 }, list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, overflow: "hidden" },
  personRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, padding: space.lg }, divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line }, personBody: { flex: 1, gap: 4 }, personName: { ...type.title, color: color.ink }, empty: { ...type.body, color: color.muted, padding: space.lg },
});
