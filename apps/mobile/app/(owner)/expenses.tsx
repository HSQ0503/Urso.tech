// My expenses — the Markate-shaped ledger.
//
// Markate's expense screen is a searchable, month-grouped list: a search strip
// with a filter beside it, three tappable totals across the top, then rows
// under a tinted month band that carries that month's subtotal. Sebastian reads
// it that way already, so the shape is theirs.
//
// Two deliberate differences:
//
//   · Their third total is MILEAGE. Urso does not track mileage, and a card
//     that always reads $0.00 teaches him to stop reading the row. The third
//     segment is RECURRING instead, which is the split that actually exists
//     here — and it is the one Han asked to keep.
//   · Their filter is a separate screen of radio buttons. It is one choice out
//     of five, so it is a chip strip in place rather than a push-and-return.
//
// DATE HANDLING: `incurred_on` is "YYYY-MM-DD", an ET CALENDAR DATE and not an
// instant. It is never handed to `new Date()` — that reads it as UTC midnight,
// which is the previous evening in ET, and every expense logged on the 1st
// would file under the previous month. Grouping and labelling both work on the
// string.

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney, type BusinessExpense, type ExpenseFrequency } from "@urso/types";
import { expenseActions } from "@/api";
import { ChromeBar, SearchStrip, searchInputStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { keys, useExpenses } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Today as an ET calendar date, so "this month" means the shop's month rather
// than the phone's. Same en-CA trick the server uses: it formats as YYYY-MM-DD,
// which compares as a plain string.
const ET_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const THIS_YEAR = ET_TODAY.slice(0, 4);
const THIS_MONTH = ET_TODAY.slice(0, 7);

type Period = "all" | "year" | "month" | "quarter";
type Segment = "total" | "oneOff" | "recurring";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "year", label: "This year" },
  { value: "quarter", label: "This quarter" },
  { value: "month", label: "This month" },
];

// "2026-07" → "JULY 2026". Built from the parts, never parsed.
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`.toUpperCase();
}

// The quarter an ET month belongs to, as a "YYYY-Q" key.
function quarterOf(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year}-${Math.floor((Number(month) - 1) / 3)}`;
}

function inPeriod(expense: BusinessExpense, period: Period): boolean {
  const yearMonth = expense.incurred_on.slice(0, 7);
  if (period === "all") return true;
  if (period === "year") return yearMonth.startsWith(THIS_YEAR);
  if (period === "month") return yearMonth === THIS_MONTH;
  return quarterOf(yearMonth) === quarterOf(THIS_MONTH);
}

function inputToCents(value: string): number {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

// A yearly cost spread across the twelve months it actually covers, so the
// overhead figure is comparable month to month.
function monthlyCostOf(expense: BusinessExpense): number {
  return expense.frequency === "yearly"
    ? Math.round(expense.amount_cents / 12)
    : expense.amount_cents;
}

export default function ExpensesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const expensesQuery = useExpenses();
  const { refreshing, onRefresh } = usePullToRefresh(expensesQuery.refetch);
  const addExpense = useAction(
    (input: Parameters<typeof expenseActions.addBusiness>[0]) => expenseActions.addBusiness(input),
    { invalidates: [keys.expenses()] },
  );
  const deleteExpense = useAction((id: string) => expenseActions.deleteBusiness(id), {
    invalidates: [keys.expenses()],
  });

  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [segment, setSegment] = useState<Segment>("total");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Software");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("one_time");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const rows = expensesQuery.data ?? [];

  // The period narrows everything — the segment totals as well as the list, so
  // the three figures always describe exactly what is shown underneath them.
  // A total that silently covers a wider window than the rows below it is the
  // kind of small wrongness that makes someone stop trusting the screen.
  const inWindow = useMemo(() => rows.filter((e) => inPeriod(e, period)), [rows, period]);

  const totals = useMemo(() => {
    const recurring = inWindow.filter((e) => e.recurring);
    const oneOff = inWindow.filter((e) => !e.recurring);
    return {
      total: inWindow.reduce((sum, e) => sum + e.amount_cents, 0),
      oneOff: oneOff.reduce((sum, e) => sum + e.amount_cents, 0),
      recurring: recurring.reduce((sum, e) => sum + e.amount_cents, 0),
      // Kept from the previous screen: normalized monthly overhead, which is a
      // different question from "what did recurring cost inside this window".
      monthlyOverhead: rows
        .filter((e) => e.active && e.recurring)
        .reduce((sum, e) => sum + monthlyCostOf(e), 0),
      activeSubscriptions: rows.filter((e) => e.active && e.recurring).length,
    };
  }, [inWindow, rows]);

  // Search, segment, then group by ET month, newest month first and newest row
  // first inside it.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = inWindow
      .filter((e) => (segment === "total" ? true : segment === "recurring" ? e.recurring : !e.recurring))
      .filter(
        (e) =>
          needle === "" ||
          e.name.toLowerCase().includes(needle) ||
          e.category.toLowerCase().includes(needle),
      );

    const byMonth = new Map<string, BusinessExpense[]>();
    for (const expense of visible) {
      const key = expense.incurred_on.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), expense]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        label: monthLabel(key),
        cents: items.reduce((sum, e) => sum + e.amount_cents, 0),
        items: [...items].sort((a, b) => b.incurred_on.localeCompare(a.incurred_on)),
      }));
  }, [inWindow, query, segment]);

  const save = async () => {
    setActionNotice(null);
    const result = await addExpense.mutateAsync({
      name,
      amountCents: inputToCents(amount),
      category,
      recurring: frequency !== "one_time",
      frequency,
    });
    if (!result.ok) {
      setActionNotice(result.notice);
      return;
    }
    setName("");
    setAmount("");
    setFrequency("one_time");
    setFormOpen(false);
  };

  const confirmDelete = (id: string, label: string) => {
    Alert.alert("Delete expense?", label, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteExpense.mutateAsync(id) },
    ]);
  };

  const canSave = name.trim().length > 0 && inputToCents(amount) > 0 && !addExpense.isPending;

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="My expenses"
        sub="Overhead and job costs"
        onBack={() => router.back()}
        action="Add expense"
        onAction={() => setFormOpen((open) => !open)}
      />
      {expensesQuery.isPending ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />
          }
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Notice text={noticeFrom(expensesQuery.error)} />

          {/* Search, with the filter toggle sitting where Markate puts it. */}
          <View style={styles.searchRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter expenses"
              accessibilityState={{ expanded: filtersOpen }}
              onPress={() => setFiltersOpen((open) => !open)}
              style={({ pressed }) => [
                styles.filterToggle,
                (filtersOpen || period !== "all") && styles.filterToggleOn,
                pressed && styles.pressed,
              ]}
            >
              <Feather
                name="sliders"
                size={18}
                color={filtersOpen || period !== "all" ? color.brandDeep : color.muted}
              />
            </Pressable>
            <View style={styles.searchGrow}>
              <SearchStrip>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search expenses"
                  placeholderTextColor={color.muted}
                  style={searchInputStyle}
                  returnKeyType="search"
                  accessibilityLabel="Search expenses"
                />
              </SearchStrip>
            </View>
          </View>

          {filtersOpen ? (
            <View style={styles.periodRow}>
              {PERIODS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: period === option.value }}
                  onPress={() => setPeriod(option.value)}
                  style={({ pressed }) => [
                    styles.period,
                    period === option.value && styles.periodOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.periodText, period === option.value && styles.periodTextOn]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Three totals across the top. Tapping one narrows the list to it,
              the way Markate's TOTAL / EXPENSES / MILEAGE row does. */}
          <View style={styles.segmentRow}>
            <Segment
              label="Total"
              value={fmtMoney(totals.total)}
              on={segment === "total"}
              onPress={() => setSegment("total")}
            />
            <Segment
              label="One-off"
              value={fmtMoney(totals.oneOff)}
              on={segment === "oneOff"}
              onPress={() => setSegment("oneOff")}
            />
            <Segment
              label="Recurring"
              value={fmtMoney(totals.recurring)}
              on={segment === "recurring"}
              onPress={() => setSegment("recurring")}
            />
          </View>

          {/* Kept per Han: the normalized monthly overhead. This is NOT the
              recurring segment above it — that one is what recurring cost
              inside the chosen window; this is what the business carries every
              month with a yearly bill spread across its twelve. */}
          <View style={styles.overhead}>
            <View style={styles.overheadBody}>
              <Text style={styles.rule}>Monthly recurring overhead</Text>
              <Text style={styles.muted}>
                {totals.activeSubscriptions} active recurring{" "}
                {totals.activeSubscriptions === 1 ? "cost" : "costs"} · yearly spread over 12
              </Text>
            </View>
            <Text style={styles.overheadValue}>{fmtMoney(totals.monthlyOverhead)}</Text>
          </View>

          {formOpen ? (
            <View style={styles.form}>
              <Text style={styles.sectionLabel}>Add expense</Text>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Insurance, truck payment, software…"
                placeholderTextColor={color.muted}
                style={styles.input}
              />
              <Text style={styles.label}>Amount</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={color.muted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Category</Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="Software"
                placeholderTextColor={color.muted}
                style={styles.input}
              />
              <View style={styles.frequencyRow}>
                {FREQUENCIES.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: frequency === option.value }}
                    onPress={() => setFrequency(option.value)}
                    style={[styles.frequency, frequency === option.value && styles.frequencyOn]}
                  >
                    <Text
                      style={[
                        styles.frequencyText,
                        frequency === option.value && styles.frequencyTextOn,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Notice text={actionNotice} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add expense"
                disabled={!canSave}
                onPress={() => void save()}
                style={({ pressed }) => [
                  styles.primary,
                  !canSave && styles.disabled,
                  pressed && styles.primaryDown,
                ]}
              >
                <Text style={styles.primaryText}>
                  {addExpense.isPending ? "Adding…" : "Add expense"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {groups.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.empty}>
                {rows.length === 0
                  ? "No expenses logged yet."
                  : "Nothing matches that search or filter."}
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <View style={styles.monthBand}>
                  <Text style={styles.monthLabel} numberOfLines={1}>
                    {group.label}
                  </Text>
                  <Text style={styles.monthTotal}>{fmtMoney(group.cents)}</Text>
                </View>
                <View style={styles.card}>
                  {group.items.map((expense, index) => (
                    <View key={expense.id} style={[styles.row, index > 0 && styles.divided]}>
                      <View style={styles.rowBody}>
                        <View style={styles.rowTitleLine}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {expense.name}
                          </Text>
                          {expense.recurring ? (
                            <View style={styles.chip}>
                              <Text style={styles.chipText}>
                                {expense.frequency.replace("_", " ").toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.muted} numberOfLines={1}>
                          {expense.incurred_on} · {expense.category}
                        </Text>
                      </View>
                      <Text style={styles.money}>{fmtMoney(expense.amount_cents)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${expense.name}`}
                        onPress={() => confirmDelete(expense.id, expense.name)}
                        style={styles.iconButton}
                      >
                        <Feather name="trash-2" size={17} color={color.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Segment({
  label,
  value,
  on,
  onPress,
}: {
  label: string;
  value: string;
  on: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.segmentValue, on && styles.segmentValueOn]} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: space.lg, gap: space.md },
  pressed: { opacity: 0.7 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchGrow: { flex: 1, marginHorizontal: -16 },
  filterToggle: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  filterToggleOn: { borderColor: color.brandEdge, backgroundColor: color.brandSoft },

  periodRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  period: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  periodOn: { borderColor: color.brandEdge, backgroundColor: color.brandSoft },
  periodText: { ...type.small, fontFamily: font.bodySemi, color: color.muted },
  periodTextOn: { color: color.brandDeep },

  segmentRow: { flexDirection: "row", gap: 7 },
  segment: {
    flex: 1,
    minHeight: 74,
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  segmentOn: { borderColor: color.brandEdgeStrong, backgroundColor: color.brandSoft },
  segmentLabel: { ...type.ruleSm, color: color.muted },
  segmentLabelOn: { color: color.brandDeep },
  segmentValue: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  segmentValueOn: { color: color.brandDeep },

  overhead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  overheadBody: { flex: 1, minWidth: 0, gap: 5 },
  overheadValue: {
    fontFamily: font.monoMedium,
    fontSize: 19,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  rule: { ...type.micro, color: color.muted },
  muted: { ...type.small, color: color.muted },

  group: { gap: 0 },
  monthBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 42,
    paddingHorizontal: 14,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.hover,
  },
  monthLabel: { ...type.rule, color: color.ink, flexShrink: 1 },
  monthTotal: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },

  sectionLabel: { ...type.micro, color: color.muted },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  empty: { ...type.body, color: color.muted, padding: space.lg },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowBody: { flex: 1, minWidth: 0, gap: 5 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  rowTitle: { ...type.title, color: color.ink, flexShrink: 1 },
  chip: { borderRadius: radius.sm, backgroundColor: color.brandSoft, paddingHorizontal: 8, paddingVertical: 5 },
  chipText: { ...type.ruleSm, color: color.brandDeep },
  money: { ...type.body, fontFamily: font.bodySemi, color: color.ink, fontVariant: ["tabular-nums"] },
  iconButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", marginRight: -10 },

  form: {
    gap: 10,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  label: { ...type.micro, color: color.muted },
  input: {
    minHeight: HIT + 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
  },
  frequencyRow: { flexDirection: "row", gap: 7 },
  frequency: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  frequencyOn: { borderColor: color.brand, backgroundColor: color.brandSoft },
  frequencyText: { ...type.small, fontFamily: font.bodySemi, color: color.muted },
  frequencyTextOn: { color: color.brandDeep },
  primary: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandDown,
  },
  primaryDown: { opacity: 0.85 },
  primaryText: { ...type.title, color: color.surface },
  disabled: { opacity: 0.45 },
});
