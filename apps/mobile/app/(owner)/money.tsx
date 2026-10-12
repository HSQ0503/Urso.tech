import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  fmtEt,
  fmtMoney,
  moneyCsv,
  type MoneyPeriod,
  type MoneyTab,
} from "@urso/types";
import { useMoney } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { MoneyForm } from "@/components/money-form";
import { color, HIT, space, type } from "@/canes-theme";

const tabs: MoneyTab[] = [
  "services",
  "marketing",
  "workers",
  "expenses",
  "payments",
];
function Bar({
  name,
  cents,
  max,
  detail,
}: {
  name: string;
  cents: number;
  max: number;
  detail?: string;
}) {
  return (
    <View style={styles.barRow}>
      <View style={styles.row}>
        <Text style={[styles.title, { flex: 1 }]}>{name}</Text>
        <Text style={styles.value}>{fmtMoney(cents)}</Text>
      </View>
      <View style={styles.track} accessibilityElementsHidden>
        <View
          style={[
            styles.fill,
            { width: `${(Math.max(0, cents) / Math.max(1, max)) * 100}%` },
          ]}
        />
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}
export default function MoneyScreen() {
  const [period, setPeriod] = useState<MoneyPeriod>("month"),
    [tab, setTab] = useState<MoneyTab>("services"),
    [notice, setNotice] = useState<string | null>(null);
  const query = useMoney(period),
    report = query.data;
  useRefetchOnFocus(query.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);
  async function exportCsv() {
    if (!report) return;
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is unavailable on this device.");
      const file = new File(Paths.cache, `canes-money-${tab}-${period}.csv`);
      file.create({ overwrite: true });
      file.write(moneyCsv(report, tab));
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
        dialogTitle: "Export Canes report",
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The report could not be exported.",
      );
    }
  }
  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Money"
        sub="Collections, costs and worker earnings"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
          />
        }
      >
        <Notice text={notice ?? noticeFrom(query.error)} />
        <View style={styles.row}>
          {(["week", "month", "year"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setPeriod(value)}
              style={[styles.chip, period === value && styles.selected]}
            >
              <Text style={styles.text}>This {value}</Text>
            </Pressable>
          ))}
        </View>
        {query.isPending && !query.error ? (
          <ActivityIndicator color={color.brand} />
        ) : null}
        {report ? (
          <>
            <View style={styles.card}>
              {[
                ["Cash collected", report.cash.collectedCents],
                ["Cash spent", report.cash.spentCents],
                ["Net cash", report.cash.netCents],
              ].map(([label, cents]) => (
                <View style={styles.row} key={label}>
                  <Text style={styles.text}>{label}</Text>
                  <Text style={styles.value}>{fmtMoney(Number(cents))}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.detail}>
              Cash follows payment dates, net of refunds. Worker payments count
              once.{" "}
              {report.cash.undatedJobCostCents > 0
                ? `${fmtMoney(report.cash.undatedJobCostCents)} of job costs need a paid date.`
                : ""}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {tabs.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  onPress={() => setTab(value)}
                  style={[styles.chip, tab === value && styles.selected]}
                >
                  <Text style={[styles.text, { textTransform: "capitalize" }]}>
                    {value}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {tab === "services" ? (
              <View style={styles.card}>
                <Text style={styles.heading}>Collections by service</Text>
                <Text style={styles.detail}>
                  Collections exclude tax. Profitability follows completion
                  dates, including unpaid work, and recorded job costs plus
                  approved wages. Missing costs are not estimates of zero cost.
                </Text>
                {report.undatedCompletedJobs ? (
                  <Text style={styles.detail}>
                    {report.undatedCompletedJobs} completed work orders need an
                    actual completion date.
                  </Text>
                ) : null}
                {report.services.map((row) => (
                  <Bar
                    key={row.key}
                    name={row.name}
                    cents={row.collectedCents}
                    max={Math.max(
                      ...report.services.map((row) => row.collectedCents),
                    )}
                    detail={`Completed value ${fmtMoney(row.revenueCents)} · costs ${fmtMoney(row.costCents)} (${fmtMoney(row.allocatedCostCents)} allocated) · margin after recorded costs ${fmtMoney(row.profitCents)}`}
                  />
                ))}
                {!report.services.length ? (
                  <Text style={styles.detail}>
                    No service activity in this period.
                  </Text>
                ) : null}
              </View>
            ) : null}
            {tab === "marketing" ? (
              <View style={styles.card}>
                <Text style={styles.heading}>Marketing return</Text>
                <Text style={styles.detail}>
                  Period ROAS = net attributed collections (excluding tax) /
                  period paid spend. Record period totals only if their
                  individual expenses aren’t already recorded.
                </Text>
                {report.marketing.map((row) => (
                  <Bar
                    key={row.id}
                    name={row.name}
                    cents={row.collectedCents}
                    max={Math.max(
                      ...report.marketing.map((row) => row.collectedCents),
                    )}
                    detail={`Spend ${fmtMoney(row.spendCents)} · ROAS ${row.roas === null ? "N/A" : `${row.roas.toFixed(2)}×`} · booked ${fmtMoney(row.bookedCents)}`}
                  />
                ))}
              </View>
            ) : null}
            {tab === "workers" ? (
              <>
                <Text style={styles.detail}>
                  Approved actual time and collected upsells create earnings.
                  Recorded payments do not transfer money.
                </Text>
                {report.workers.map((worker) => (
                  <View key={worker.id} style={styles.card}>
                    <Text style={styles.heading}>{worker.name}</Text>
                    <Text style={styles.text}>
                      Earned this period: {fmtMoney(worker.periodEarnedCents)}
                    </Text>
                    <Text style={styles.text}>
                      Outstanding, all time: {fmtMoney(worker.unpaidCents)}
                    </Text>
                    <Text style={styles.text}>
                      Approved hours this period: {worker.hours.toFixed(2)}
                    </Text>
                    <Text style={styles.text}>
                      Recorded payments, all time:{" "}
                      {fmtMoney(worker.recordedPaidCents)}
                    </Text>
                    <Text style={styles.detail}>
                      {worker.rate
                        ? `${fmtMoney(worker.rate.hourly_cents)}/hour · ${worker.rate.commission_bps / 100}% upsell commission`
                        : "Set an effective rate before approving hours."}{" "}
                      {worker.unallocatedPaidCents
                        ? `${fmtMoney(worker.unallocatedPaidCents)} in historical or unallocated payments remains separate.`
                        : ""}
                    </Text>
                  </View>
                ))}
                <Pressable
                  style={styles.chip}
                  accessibilityRole="button"
                  onPress={() => router.push("/(owner)/expenses")}
                >
                  <Text style={styles.action}>
                    Record payment / payment history
                  </Text>
                </Pressable>
                {report.earnings.map((earning) => (
                  <View key={earning.id} style={styles.card}>
                    <Text style={styles.text}>
                      {
                        report.workers.find(
                          (worker) => worker.id === earning.employee_id,
                        )?.name
                      }{" "}
                      · {fmtMoney(earning.amount_cents)}
                    </Text>
                    <Text style={styles.detail}>
                      {earning.earned_on} · {earning.kind} · {earning.reason}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
            {tab === "expenses" ? (
              <View style={styles.card}>
                <Text style={styles.heading}>Paid spending by category</Text>
                {report.expenses.map((row) => (
                  <Bar
                    key={row.category}
                    name={row.category}
                    cents={row.cents}
                    max={Math.max(...report.expenses.map((row) => row.cents))}
                  />
                ))}
                <Pressable
                  style={styles.chip}
                  accessibilityRole="button"
                  onPress={() => router.push("/(owner)/expenses")}
                >
                  <Text style={styles.action}>Manage expenses</Text>
                </Pressable>
              </View>
            ) : null}
            {tab === "payments" ? (
              <View style={styles.card}>
                {report.payments.map((payment) => (
                  <View key={payment.id} style={styles.barRow}>
                    <View style={styles.row}>
                      <Text style={styles.title}>{payment.method}</Text>
                      <Text style={styles.value}>
                        {fmtMoney(payment.cents)}
                      </Text>
                    </View>
                    <Text style={styles.detail}>
                      {fmtEt(payment.at)} · {payment.provider}
                      {payment.cents < 0 ? " · Refund" : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <MoneyForm report={report} tab={tab} />
            <Pressable
              accessibilityRole="button"
              style={styles.chip}
              onPress={() => void exportCsv()}
            >
              <Text style={styles.action}>Export CSV</Text>
            </Pressable>
            <Text style={styles.detail}>Updated {fmtEt(report.asOf)}</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  card: {
    padding: space.lg,
    borderRadius: 10,
    backgroundColor: color.surface,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  chip: {
    minHeight: HIT,
    paddingHorizontal: space.md,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: color.surface,
  },
  selected: {
    backgroundColor: color.brandSoft,
    borderWidth: 1,
    borderColor: color.brandEdge,
  },
  text: { ...type.body, color: color.ink },
  title: { ...type.title, color: color.ink },
  heading: { ...type.heading, color: color.ink },
  detail: { ...type.small, color: color.muted },
  value: { ...type.figure, color: color.ink },
  action: { ...type.body, color: color.brand },
  barRow: {
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderColor: color.line,
  },
  track: {
    height: 8,
    backgroundColor: color.hover,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: { height: 8, backgroundColor: color.brand, borderRadius: 4 },
});
