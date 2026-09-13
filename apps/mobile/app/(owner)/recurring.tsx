// Recurring — every recurring plan, and what they are worth together.
//
// Sebastian, 2026-09-13: "a recurring spot where I can keep track of all
// recurring work", and "I'm going to start adding my recurring clients onto
// the system." A plan here is the contract behind repeat work (0027): who,
// what, how much per visit, how often, signed or not, and its next visit.
// Visits themselves are ordinary work orders, minted three weeks ahead.
//
// The headline is ARR — the number he asked for on the dashboard — with MRR
// beside it. Tabs are the plan's life: Active (default) · Paused · Draft ·
// Canceled · All.

import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  etLocalToIso,
  fmtEt,
  fmtMoney,
  PLAN_CADENCE_LABEL,
  PLAN_STATUS_LABEL,
  planAnnualCents,
  type PlanStatus,
  type RecurringPlan,
} from "@urso/types";
import { Avatar, Chevron, Chip, ChromeBar, EmptyState, listRowStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useRecurringPlans } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, radius, space, type } from "@/theme";

type Filter = PlanStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Draft" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All" },
];

function statusTone(status: PlanStatus): "good" | "brand" | "neutral" | "danger" {
  if (status === "active") return "good";
  if (status === "draft") return "brand";
  if (status === "canceled") return "danger";
  return "neutral";
}

function fmtWhole(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function nextLine(plan: RecurringPlan): string {
  if (plan.status === "canceled") return plan.canceled_at ? `Canceled ${fmtEt(plan.canceled_at, { month: "short", day: "numeric" })}` : "Canceled";
  if (plan.status === "paused") return "Paused";
  if (plan.status === "draft") return plan.sent_at ? "Agreement sent — waiting for signature" : "Draft — send or mark agreed";
  return plan.next_due_on
    ? `Next visit ${fmtEt(etLocalToIso(`${plan.next_due_on}T12:00`), { month: "short", day: "numeric" })}`
    : "Active";
}

export default function RecurringScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const plansQuery = useRecurringPlans();
  useRefetchOnFocus(plansQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(plansQuery.refetch);

  const [filter, setFilter] = useState<Filter>("active");
  const plans = plansQuery.data?.plans ?? [];
  const summary = plansQuery.data?.summary ?? null;
  const notice = noticeFrom(plansQuery.error);

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.value] = plans.filter((p) => f.value === "all" || p.status === f.value).length;
    return out;
  }, [plans]);

  const visible = useMemo(
    () =>
      plans
        .filter((p) => filter === "all" || p.status === filter)
        .sort((a, b) => (a.next_due_on ?? "9999").localeCompare(b.next_due_on ?? "9999")),
    [plans, filter],
  );

  const emptyCopy: Record<Filter, string> = {
    active: "No active plans yet. Open an estimate, invoice or work order and tap Make it recurring — or start one here.",
    paused: "Nothing paused.",
    draft: "No drafts. A plan sits here until the customer signs or you mark it agreed in person.",
    canceled: "No canceled plans.",
    all: "No recurring plans yet. Open an estimate, invoice or work order and tap Make it recurring — or start one here.",
  };

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Recurring"
        sub={summary && summary.activeCount > 0 ? `${summary.activeCount} active ${summary.activeCount === 1 ? "plan" : "plans"}` : "Repeat customers and contracts"}
        onBack={() => router.back()}
        action="New plan"
        onAction={() => router.push({ pathname: "/(owner)/plan/new", params: { draftKey: String(Date.now()) } })}
      />
      {plansQuery.isPending ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(plan) => plan.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }, visible.length === 0 && styles.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />}
          ListHeaderComponent={
            <View style={styles.headerSlot}>
              <Notice text={notice} />
              {summary ? (
                <View style={styles.summaryCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Annual recurring revenue</Text>
                    <Text style={[styles.summaryValue, summary.arrCents === 0 && styles.dim]}>{fmtWhole(summary.arrCents)}</Text>
                    <Text style={styles.summarySub}>{fmtWhole(summary.mrrCents)} a month across active plans</Text>
                  </View>
                  <View style={styles.summaryIcon}>
                    <Feather name="repeat" size={22} color={color.brandDeep} />
                  </View>
                </View>
              ) : null}
              <View style={styles.filters}>
                {FILTERS.map((option) => {
                  const on = filter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      onPress={() => setFilter(option.value)}
                      style={({ pressed }) => [styles.filter, on && styles.filterOn, pressed && !on && styles.pressed]}
                    >
                      <Text style={[styles.filterText, on && styles.filterTextOn]}>{option.label}</Text>
                      {counts[option.value] > 0 ? <Text style={[styles.filterCount, on && styles.filterTextOn]}>{counts[option.value]}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState text={emptyCopy[filter]} />}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.customer_name ?? "Plan"}, ${PLAN_CADENCE_LABEL[item.cadence]}, ${PLAN_STATUS_LABEL[item.status]}`}
              onPress={() => router.push({ pathname: "/(owner)/plan/[id]", params: { id: item.id } })}
              style={({ pressed }) => [...listRowStyle(index === 0, index === visible.length - 1), styles.row, pressed && styles.pressed]}
            >
              <Avatar name={item.customer_name ?? "Plan"} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.customer_name ?? item.job_name ?? item.number}
                  </Text>
                  <Chip label={PLAN_STATUS_LABEL[item.status]} tone={statusTone(item.status)} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {[item.job_name, PLAN_CADENCE_LABEL[item.cadence]].filter(Boolean).join(" · ")}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {nextLine(item)}
                </Text>
              </View>
              <View style={styles.rowEnd}>
                <Text style={styles.money}>{fmtMoney(item.price_per_visit_cents)}</Text>
                <Text style={styles.moneySub}>{fmtWhole(planAnnualCents(item))}/yr</Text>
                <Chevron />
              </View>
            </Pressable>
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
  headerSlot: { gap: space.md, marginBottom: space.md },
  dim: { color: color.muted },
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.lg,
  },
  summaryLabel: { ...type.small, color: color.muted },
  summaryValue: { fontFamily: font.display, fontSize: 32, letterSpacing: -0.8, color: color.ink, marginTop: 2 },
  summarySub: { ...type.small, color: color.muted, marginTop: 4 },
  summaryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.brandWash, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filter: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  filterOn: { borderColor: color.brandEdge, backgroundColor: color.brandSoft },
  filterText: { ...type.small, fontFamily: font.bodySemi, color: color.muted },
  filterCount: { fontFamily: font.monoMedium, fontSize: 12, color: color.faint },
  filterTextOn: { color: color.brandDeep },
  pressed: { backgroundColor: color.hover },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { fontFamily: font.bodySemi, fontSize: 16.5, lineHeight: 20, color: color.ink, flexShrink: 1 },
  sub: { ...type.small, lineHeight: 18, color: color.muted, marginTop: 2 },
  rowEnd: { alignItems: "flex-end", gap: 2 },
  money: { fontFamily: font.monoMedium, fontSize: 14, color: color.ink },
  moneySub: { fontFamily: font.mono, fontSize: 11, color: color.faint },
});
