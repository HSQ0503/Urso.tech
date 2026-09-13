import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { fmtMoney, PLAN_CADENCE_LABEL, PLAN_VISITS_PER_YEAR, type PlanCadence } from "@urso/types";
import { recurringActions } from "@/api";
import { DatePicker } from "@/components/date-picker";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { addCalendarDays, dateLabel, todayEt } from "@/dates";
import { keys, useJob } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// "Convert to recurring" — the same sheet from an estimate, an invoice or a
// work order. The document already knows the customer and the services; the
// two things it cannot know are asked here: how often, and when the first
// visit is. On success the app lands on the new plan, where the agreement is
// sent or marked agreed.
//
// The default first visit is a month out from today: a plan made from a job
// that was just done is for the NEXT visit, not for today.

const CADENCES: PlanCadence[] = ["monthly", "quarterly", "semiannual", "yearly"];

export type RecurringSource =
  | { kind: "estimate"; id: string; jobId?: string }
  | { kind: "invoice"; id: string; jobId?: string }
  | { kind: "job"; id: string };

export function RecurringSheet({
  source,
  pricePerVisitCents,
  customerName,
  onClose,
}: {
  source: RecurringSource;
  pricePerVisitCents: number;
  customerName: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [cadence, setCadence] = useState<PlanCadence>("quarterly");
  const [startsOn, setStartsOn] = useState<string>(() => addCalendarDays(todayEt(), 30));
  const [dateOpen, setDateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const jobId = source.kind === "job" ? source.id : source.jobId ?? null;
  const jobQuery = useJob(jobId);
  const firstVisitOn = jobQuery.data?.scheduled_at && !jobQuery.data.plan_id
    ? todayEt(new Date(jobQuery.data.scheduled_at))
    : null;
  const sourcePending = jobId !== null && (jobQuery.isPending || jobQuery.isError);

  const create = useAction(
    (vars: { cadence: PlanCadence; startsOn: string }) =>
      source.kind === "estimate"
        ? recurringActions.createFromEstimate(source.id, vars.cadence, vars.startsOn)
        : source.kind === "invoice"
          ? recurringActions.createFromInvoice(source.id, vars.cadence, vars.startsOn)
          : recurringActions.createFromJob(source.id, vars.cadence, vars.startsOn),
    { invalidates: [keys.recurring.all(), keys.jobs.all(), keys.revenue(), keys.overview()] },
  );

  const annual = pricePerVisitCents * PLAN_VISITS_PER_YEAR[cadence];

  const submit = async () => {
    setNotice(null);
    const r = await create.mutateAsync({ cadence, startsOn: firstVisitOn ?? startsOn });
    if (!r.ok) {
      setNotice(r.notice);
      return;
    }
    toast.show(r.data.notice ?? "Recurring plan created. Send the agreement or mark it agreed.");
    onClose();
    if (typeof r.data.planId === "string") {
      router.push({ pathname: "/(owner)/plan/[id]", params: { id: r.data.planId } });
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Make it recurring</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create recurring plan"
            disabled={create.isPending || sourcePending}
            onPress={() => void submit()}
            hitSlop={8}
          >
            <Text style={[styles.save, (create.isPending || sourcePending) && styles.saveOff]}>{create.isPending ? "Creating…" : "Create"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Notice text={notice} />
          <Notice text={noticeFrom(jobQuery.error)} />
          <View style={styles.group}>
            <Text style={styles.label}>Plan</Text>
            <Text style={styles.value}>{customerName ?? "Customer"}</Text>
            <Text style={styles.muted}>
              {fmtMoney(pricePerVisitCents)} per visit — the services and price come from this {source.kind === "job" ? "work order" : source.kind}.
            </Text>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>How often</Text>
            <View style={styles.chips}>
              {CADENCES.map((option) => {
                const on = option === cadence;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setCadence(option)}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && styles.pressed]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{PLAN_CADENCE_LABEL[option]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>
              {PLAN_VISITS_PER_YEAR[cadence]} {PLAN_VISITS_PER_YEAR[cadence] === 1 ? "visit" : "visits"} a year · {fmtMoney(annual)} a year
            </Text>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>First visit</Text>
            {firstVisitOn ? (
              <View style={styles.dateButton}>
                <Feather name="calendar" size={20} color={color.brandDeep} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateTitle}>{dateLabel(firstVisitOn)}</Text>
                  <Text style={styles.muted}>The linked work order is visit one. Future visits follow the cadence you choose. You can move the next visit on the plan.</Text>
                </View>
              </View>
            ) : sourcePending ? (
              <Text style={styles.muted}>Loading the linked work order…</Text>
            ) : <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose first visit date"
              onPress={() => setDateOpen(true)}
              style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
            >
              <Feather name="calendar" size={20} color={color.brandDeep} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dateTitle}>{dateLabel(startsOn)}</Text>
                <Text style={styles.muted}>Visits are created three weeks ahead so you can book them.</Text>
              </View>
              <Feather name="chevron-right" size={20} color={color.brandDeep} />
            </Pressable>}
          </View>

          <View style={styles.terms}>
            <Feather name="file-text" size={16} color={color.muted} />
            <Text style={styles.termsText}>
              The agreement carries a cancellation fee of 50% of a visit if the customer cancels after the next visit is
              scheduled. You send it for signature — or mark it agreed in person — from the plan.
            </Text>
          </View>
        </ScrollView>
        <DatePicker
          visible={dateOpen}
          title="First visit"
          value={startsOn}
          minimumDate={todayEt()}
          onChange={setStartsOn}
          onClose={() => setDateOpen(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bg, paddingTop: space.sm },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: space.lg,
    minHeight: HIT,
  },
  title: { ...type.title, color: color.ink },
  cancel: { ...type.body, color: color.muted },
  save: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  saveOff: { color: color.faint },
  body: { padding: space.lg, gap: space.lg },
  group: { gap: space.sm },
  label: { ...type.micro, color: color.faint },
  value: { ...type.title, color: color.ink },
  muted: { ...type.small, color: color.muted },
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
  pressed: { backgroundColor: color.hover },
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
  terms: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  termsText: { ...type.small, color: color.muted, flex: 1 },
});
