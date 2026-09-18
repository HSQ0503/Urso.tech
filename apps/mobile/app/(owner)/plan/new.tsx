// New recurring plan, by hand — for the customer who signs up on the phone
// with no estimate or invoice behind them: "I want you out every quarter."
//
// Most plans should come from Make it recurring on an estimate, invoice or
// work order, which copies the lines. This form is the sideways door: pick or
// type the customer, add the services and price per visit, choose how often
// and when the first visit is. It lands on the plan, where the agreement is
// sent or marked agreed.
//
// THE FORM RETIRES BEFORE IT NAVIGATES: this is a Tabs group, so leaving does
// not unmount the screen, and a second Save would mint a second plan.

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney, fmtPhone, PLAN_CADENCE_LABEL, PLAN_VISITS_PER_YEAR, type CustomerSummary, type PlanCadence } from "@urso/types";
import { recurringActions, type PlanLineInput } from "@/api";
import { AddressInput } from "@/components/address-input";
import { DatePicker } from "@/components/date-picker";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { useToast } from "@/components/toast";
import { addCalendarDays, dateLabel, todayEt } from "@/dates";
import { keys, useCatalog, useCustomers } from "@/queries";
import { useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const CADENCES: PlanCadence[] = ["monthly", "quarterly", "semiannual", "yearly"];

type DraftLine = { key: string; name: string; quantityText: string; priceText: string };

function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function lineTotal(line: DraftLine): number {
  const qty = Number(line.quantityText) || 0;
  return Math.round(qty * inputToCents(line.priceText));
}

let lineSeq = 0;
const newLine = (name = "", price = ""): DraftLine => ({ key: `line-${++lineSeq}`, name, quantityText: "1", priceText: price });

export default function NewPlanScreen(): React.ReactElement {
  const { draftKey } = useLocalSearchParams<{ draftKey?: string }>();
  return <NewPlanForm key={draftKey ?? "new"} />;
}

function NewPlanForm(): React.ReactElement {
  const params = useLocalSearchParams<{ contactId?: string; name?: string; phone?: string; email?: string; address?: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const customersQuery = useCustomers();
  const catalogQuery = useCatalog();

  const [contactId, setContactId] = useState<string | null>(typeof params.contactId === "string" ? params.contactId : null);
  const [customerName, setCustomerName] = useState(typeof params.name === "string" ? params.name : "");
  const [customerPhone, setCustomerPhone] = useState(typeof params.phone === "string" ? fmtPhone(params.phone) : "");
  const [customerEmail, setCustomerEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [jobAddress, setJobAddress] = useState(typeof params.address === "string" ? params.address : "");
  const [jobName, setJobName] = useState("");
  const [repeatTime, setRepeatTime] = useState("08:00");
  const [cadence, setCadence] = useState<PlanCadence>("quarterly");
  const [startsOn, setStartsOn] = useState(() => addCalendarDays(todayEt(), 14));
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const create = useAction((input: Parameters<typeof recurringActions.create>[0]) => recurringActions.create(input), {
    invalidates: [keys.recurring.all(), keys.customers.all(), keys.revenue()],
  });

  const customerSections = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const grouped = new Map<string, CustomerSummary[]>();
    for (const item of customersQuery.data ?? []) {
      const haystack = `${item.name ?? ""} ${item.phone ?? ""} ${item.primary_address ?? ""}`.toLowerCase();
      if (term && !haystack.includes(term)) continue;
      const letter = (item.name?.trim().charAt(0) || "#").toUpperCase();
      grouped.set(letter, [...(grouped.get(letter) ?? []), item]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data: data.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")) }));
  }, [customerSearch, customersQuery.data]);

  const perVisit = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const ready = customerName.trim().length > 0 && lines.some((l) => l.name.trim() && lineTotal(l) >= 0) && perVisit > 0;

  const chooseCustomer = (c: CustomerSummary) => {
    setContactId(c.id);
    setCustomerName(c.name ?? c.phone ?? "Customer");
    setCustomerPhone(c.phone ? fmtPhone(c.phone) : "");
    setCustomerEmail(c.email ?? "");
    setJobAddress(c.primary_address ?? "");
    setCustomerOpen(false);
    setCustomerSearch("");
  };

  const save = async () => {
    setNotice(null);
    const items: PlanLineInput[] = lines
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), quantity: Number(l.quantityText) || 1, unitPriceCents: inputToCents(l.priceText) }));
    const r = await create.mutateAsync({
      contactId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      customerEmail: customerEmail.trim() || null,
      jobAddress: jobAddress.trim() || null,
      jobName: jobName.trim() || null,
      cadence,
      startsOn,
      repeatTime,
      items,
    });
    if (!r.ok) {
      setNotice(r.notice);
      return;
    }
    setDone(true);
    toast.show(r.data.notice ?? "Plan created. Send the agreement or mark it agreed.");
    if (typeof r.data.planId === "string") {
      router.replace({ pathname: "/(owner)/plan/[id]", params: { id: r.data.planId } });
    } else {
      router.replace("/(owner)/recurring");
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <View style={styles.screen}>
      <View style={[styles.head, { paddingTop: insets.top + space.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New recurring plan</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Save plan" disabled={!ready || create.isPending || done} onPress={() => void save()} hitSlop={8}>
          <Text style={[styles.save, (!ready || create.isPending || done) && styles.saveOff]}>{create.isPending ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Notice text={notice} />

        <Text style={styles.label}>Customer</Text>
        <Pressable accessibilityRole="button" onPress={() => setCustomerOpen(true)} style={({ pressed }) => [styles.picker, pressed && styles.pressed]}>
          <Feather name="users" size={18} color={color.brandDeep} />
          <Text style={[styles.pickerText, !contactId && styles.pickerHint]} numberOfLines={1}>
            {contactId ? customerName : "Choose a saved customer"}
          </Text>
          <Feather name="chevron-right" size={18} color={color.faint} />
        </Pressable>
        <Text style={styles.orLabel}>OR ENTER SOMEONE NEW</Text>
        <TextInput value={customerName} onChangeText={(v) => { setCustomerName(v); setContactId(null); }} placeholder="Customer name" placeholderTextColor={color.faint} style={styles.input} accessibilityLabel="Customer name" />
        <PhoneInput value={customerPhone} onChange={setCustomerPhone} style={styles.input} />
        <TextInput value={customerEmail} onChangeText={setCustomerEmail} placeholder="Email (optional)" placeholderTextColor={color.faint} autoCapitalize="none" keyboardType="email-address" style={styles.input} accessibilityLabel="Email" />
        <AddressInput value={jobAddress} onChange={setJobAddress} style={styles.input} />

        <Text style={styles.label}>Plan</Text>
        <TextInput value={jobName} onChangeText={setJobName} placeholder="Name, e.g. Quarterly house wash" placeholderTextColor={color.faint} style={styles.input} accessibilityLabel="Plan name" />
        <View style={styles.chips}>
          {CADENCES.map((option) => {
            const on = option === cadence;
            return (
              <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCadence(option)} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && styles.pressed]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{PLAN_CADENCE_LABEL[option]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose first visit date" onPress={() => setDateOpen(true)} style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}>
          <Feather name="calendar" size={20} color={color.brandDeep} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dateTitle}>First visit · {dateLabel(startsOn)}</Text>
            <Text style={styles.muted}>The next visit is created on the calendar at your chosen date and time.</Text>
          </View>
          <Feather name="chevron-right" size={20} color={color.brandDeep} />
        </Pressable>

        <Text style={styles.label}>Each visit</Text>
        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <TextInput value={line.name} onChangeText={(v) => updateLine(line.key, { name: v })} placeholder="Service" placeholderTextColor={color.faint} style={styles.lineName} accessibilityLabel="Service name" />
            <View style={styles.lineRow}>
              <View style={styles.lineField}>
                <Text style={styles.lineLabel}>QTY</Text>
                <TextInput value={line.quantityText} onChangeText={(v) => updateLine(line.key, { quantityText: v })} keyboardType="decimal-pad" style={styles.lineInput} accessibilityLabel="Quantity" />
              </View>
              <View style={[styles.lineField, { flex: 1.6 }]}>
                <Text style={styles.lineLabel}>PRICE</Text>
                <TextInput value={line.priceText} onChangeText={(v) => updateLine(line.key, { priceText: v })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={color.faint} style={styles.lineInput} accessibilityLabel="Unit price in dollars" />
              </View>
              <View style={[styles.lineField, { alignItems: "flex-end" }]}>
                <Text style={styles.lineLabel}>TOTAL</Text>
                <Text style={styles.lineTotal}>{fmtMoney(lineTotal(line))}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove line" disabled={lines.length === 1} onPress={() => setLines((c) => c.filter((l) => l.key !== line.key))} style={[styles.trash, lines.length === 1 && styles.disabled]}>
                <Feather name="trash-2" size={17} color={color.danger} />
              </Pressable>
            </View>
          </View>
        ))}
        <View style={styles.addRow}>
          <Pressable accessibilityRole="button" onPress={() => setCatalogOpen(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Feather name="list" size={16} color={color.brandDeep} />
            <Text style={styles.addText}>From price list</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setLines((c) => [...c, newLine()])} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Feather name="plus" size={16} color={color.brandDeep} />
            <Text style={styles.addText}>Custom line</Text>
          </Pressable>
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Per visit</Text>
            <Text style={styles.totalValue}>{fmtMoney(perVisit)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>{PLAN_VISITS_PER_YEAR[cadence]} {PLAN_VISITS_PER_YEAR[cadence] === 1 ? "visit" : "visits"} a year</Text>
            <Text style={styles.muted}>{fmtMoney(perVisit * PLAN_VISITS_PER_YEAR[cadence])} a year</Text>
          </View>
        </View>
      <View style={{ padding: space.lg }}><Text style={{color: color.ink}}>Repeat time (Eastern, HH:mm)</Text><TextInput accessibilityLabel="Repeat time Eastern HH:mm" value={repeatTime} onChangeText={setRepeatTime} style={{ minHeight: HIT, color: color.ink, padding: space.sm, backgroundColor: color.surface }} /></View>
      </ScrollView>

      <Modal visible={customerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCustomerOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Pressable accessibilityRole="button" onPress={() => setCustomerOpen(false)} hitSlop={8}>
              <Text style={styles.cancel}>Close</Text>
            </Pressable>
            <Text style={styles.title}>Customers</Text>
            <View style={{ width: 44 }} />
          </View>
          <TextInput value={customerSearch} onChangeText={setCustomerSearch} placeholder="Search name, phone, or address" placeholderTextColor={color.faint} style={[styles.input, { marginHorizontal: space.lg, marginBottom: space.sm }]} autoFocus accessibilityLabel="Search customers" />
          {customersQuery.isPending ? (
            <ActivityIndicator color={color.brand} style={{ marginTop: space.xl }} />
          ) : (
            <SectionList
              sections={customerSections}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl }}
              renderSectionHeader={({ section }) => <Text style={styles.sectionLetter}>{section.title}</Text>}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" onPress={() => chooseCustomer(item)} style={({ pressed }) => [styles.customerRow, pressed && styles.pressed]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickerText} numberOfLines={1}>{item.name ?? "Unnamed"}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{[item.phone ? fmtPhone(item.phone) : null, item.primary_address].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={color.faint} />
                </Pressable>
              )}
              ListEmptyComponent={<Text style={[styles.muted, { padding: space.lg }]}>No customers match. Type the name above instead.</Text>}
            />
          )}
        </View>
      </Modal>

      <Modal visible={catalogOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCatalogOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Pressable accessibilityRole="button" onPress={() => setCatalogOpen(false)} hitSlop={8}>
              <Text style={styles.cancel}>Close</Text>
            </Pressable>
            <Text style={styles.title}>Price list</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl }}>
            {(catalogQuery.data ?? []).filter((c) => c.active).map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => {
                  setLines((current) => {
                    const blank = current.findIndex((l) => !l.name.trim() && !l.priceText);
                    const next = newLine(c.name, (c.default_price_cents / 100).toFixed(2));
                    if (blank >= 0) return current.map((l, i) => (i === blank ? next : l));
                    return [...current, next];
                  });
                  setCatalogOpen(false);
                }}
                style={({ pressed }) => [styles.customerRow, pressed && styles.pressed]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.pickerText} numberOfLines={1}>{c.name}</Text>
                  {c.description ? <Text style={styles.muted} numberOfLines={1}>{c.description}</Text> : null}
                </View>
                <Text style={styles.lineTotal}>{fmtMoney(c.default_price_cents)}</Text>
              </Pressable>
            ))}
            {(catalogQuery.data ?? []).length === 0 ? <Text style={[styles.muted, { padding: space.lg }]}>No price-list items yet.</Text> : null}
          </ScrollView>
        </View>
      </Modal>


      <DatePicker visible={dateOpen} title="First visit" value={startsOn} minimumDate={todayEt()} onChange={setStartsOn} onClose={() => setDateOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  title: { ...type.title, color: color.ink },
  cancel: { ...type.body, color: color.muted },
  save: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  saveOff: { color: color.faint },
  body: { padding: space.lg, gap: space.sm },
  label: { ...type.micro, color: color.faint, marginTop: space.md },
  orLabel: { ...type.micro, color: color.faint, textAlign: "center", marginVertical: 2 },
  muted: { ...type.small, color: color.muted },
  input: {
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  picker: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  pickerText: { ...type.body, color: color.ink, flex: 1 },
  pickerHint: { color: color.muted },
  pressed: { backgroundColor: color.hover },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 },
  chip: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  chipText: { ...type.body, color: color.ink },
  chipTextOn: { color: color.chromeInk },
  dateButton: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: color.brandWash,
    borderWidth: 1,
    borderColor: color.brandEdgeSoft,
  },
  dateTitle: { fontFamily: font.bodyMedium, fontSize: 15, color: color.ink },
  lineCard: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.md,
    gap: space.sm,
  },
  lineName: { fontFamily: font.bodyMedium, fontSize: 15, color: color.ink, minHeight: 36, paddingHorizontal: 2 },
  lineRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  lineField: { flex: 1, gap: 2 },
  lineLabel: { ...type.micro, color: color.faint },
  lineInput: {
    fontFamily: font.mono,
    fontSize: 15,
    color: color.ink,
    minHeight: 38,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
  lineTotal: { fontFamily: font.monoMedium, fontSize: 15, color: color.ink, minHeight: 38, lineHeight: 38 },
  trash: { width: 36, height: 38, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.35 },
  addRow: { flexDirection: "row", gap: space.sm },
  addButton: {
    flex: 1,
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.brandEdgeSoft,
    backgroundColor: color.brandWash,
  },
  addText: { ...type.small, fontFamily: font.bodySemi, color: color.brandDeep },
  totals: {
    marginTop: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.md,
    gap: 4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: { ...type.title, color: color.ink },
  totalValue: { fontFamily: font.monoMedium, fontSize: 20, color: color.ink },
  sheet: { flex: 1, backgroundColor: color.bg, paddingTop: space.sm },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    minHeight: HIT,
    marginBottom: space.sm,
  },
  sectionLetter: { ...type.micro, color: color.faint, marginTop: space.md, marginBottom: 4 },
  customerRow: {
    minHeight: HIT + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    marginBottom: 6,
  },
});
