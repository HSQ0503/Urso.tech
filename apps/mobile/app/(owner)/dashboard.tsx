// Dashboard — revenue, and nothing else.
//
// Sebastian, 2026-09-13: "the dashboard is very useless right now so I want it
// simplified to multiple things I can view: revenue made on the year, on the
// month, on the week and on the day. That's all, no other things for now. Also
// another slot to see my recurring revenue on each month of the year and
// overall year ARR."
//
// So: four figures, then recurring. Revenue is COLLECTED — the payments ledger
// minus refunds — because that is the number he can spend and it cannot be
// inflated by an unpaid invoice. The action queue that used to live here moved
// to where its items belong (Leads carries "Call these now"); the Today report
// grid is gone.
//
// Every window is an ET calendar period computed on the server. The device
// clock is never read.

import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney, type RevenueMonth } from "@urso/types";
import { useRevenue } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { StatGrid } from "@/components/launcher";
import { ChromeBar, SectionRule, bodyStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { color, font, radius, space, type } from "@/theme";

// "$12,400" not "$12,400.00" on a chart axis or a headline — the cents are
// noise at that size. fmtMoney stays the rule everywhere a figure is read
// exactly; this is only for the big numbers and the bars.
function fmtWhole(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

// Twelve bars, one per ET month, oldest first — the "recurring revenue on
// each month of the year" slot. Pure Views: recharts does not exist in RN and
// a bar chart is twelve rectangles.
function RecurringBars({ months }: { months: RevenueMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.recurringCents));
  return (
    <View style={styles.bars}>
      {months.map((month) => {
        const ratio = month.recurringCents / max;
        return (
          <View key={month.key} style={styles.barCol}>
            <Text style={styles.barValue} numberOfLines={1}>
              {month.recurringCents > 0 ? fmtWhole(month.recurringCents) : ""}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${Math.max(ratio * 100, month.recurringCents > 0 ? 6 : 0)}%` }]} />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>
              {month.label.split(" ")[0]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DashboardScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const revenueQuery = useRevenue();
  useRefetchOnFocus(revenueQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(revenueQuery.refetch);

  const revenue = revenueQuery.data ?? null;
  const notice = noticeFrom(revenueQuery.error);
  const loading = revenueQuery.isPending && revenueQuery.errorUpdateCount === 0;

  const icons = ["sun", "calendar", "bar-chart-2", "trending-up"] as const;

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Dashboard"
        sub={fmtEt(new Date().toISOString(), { weekday: "short", month: "long", day: "numeric" })}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[bodyStyle, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
        }
      >
        <Notice text={notice} />

        <SectionRule label="Revenue collected" tone="muted" />
        <StatGrid
          cards={(revenue?.windows ?? []).map((window, index) => ({
            key: window.key,
            label: window.label,
            icon: icons[index] ?? "dollar-sign",
            value: fmtMoney(window.collectedCents),
            dim: window.collectedCents === 0,
          }))}
        />
        {!loading && revenue !== null ? (
          <Text style={styles.footnote}>
            Money actually collected — card payments through Square and cash or checks you recorded — minus refunds.
            Eastern time weeks start Monday.
          </Text>
        ) : null}

        <View style={styles.recurringRule}>
          <SectionRule label="Recurring revenue" tone="muted" />
        </View>
        {revenue !== null ? (
          <View style={styles.card}>
            <View style={styles.arrRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.arrLabel}>Annual recurring revenue</Text>
                <Text style={[styles.arrValue, revenue.recurring.arrCents === 0 && styles.dim]}>
                  {fmtWhole(revenue.recurring.arrCents)}
                </Text>
                <Text style={styles.arrSub}>
                  {fmtWhole(revenue.recurring.mrrCents)} a month · {revenue.recurring.activePlans}{" "}
                  {revenue.recurring.activePlans === 1 ? "recurring customer" : "recurring customers"}
                </Text>
              </View>
              <View style={styles.arrIcon}>
                <Feather name="repeat" size={22} color={color.brandDeep} />
              </View>
            </View>
            <Text style={styles.chartLabel}>Collected on recurring work, by month</Text>
            <RecurringBars months={revenue.recurring.months} />
            {revenue.recurring.activePlans === 0 ? (
              <Text style={styles.footnoteInCard}>
                Nothing recurring yet. Set up plans from the Recurring tile and this fills in as visits are paid.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  footnote: { ...type.small, color: color.faint, marginTop: space.sm, paddingHorizontal: 4 },
  footnoteInCard: { ...type.small, color: color.muted, marginTop: space.md },
  recurringRule: { marginTop: space.xl },
  dim: { color: color.muted },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.lg,
    marginTop: space.sm,
  },
  arrRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  arrLabel: { ...type.small, color: color.muted },
  arrValue: { fontFamily: font.display, fontSize: 34, letterSpacing: -0.8, color: color.ink, marginTop: 2 },
  arrSub: { ...type.small, color: color.muted, marginTop: 4 },
  arrIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  chartLabel: { ...type.micro, color: color.faint, marginTop: space.lg, marginBottom: space.sm },

  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 150 },
  barCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  barValue: { fontFamily: font.mono, fontSize: 8.5, color: color.muted, marginBottom: 3 },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 3, backgroundColor: color.brandFill },
  barLabel: { fontFamily: font.mono, fontSize: 9.5, color: color.faint, marginTop: 6 },
});
