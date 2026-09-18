import { RepeatSettings } from "@/components/repeat-settings";
// One recurring plan: the contract, its services, its next visit, and every
// visit it has produced. The forward action is always the single most useful
// thing for the plan's state — send the agreement, mark it agreed, book the
// next visit — and the rest sits under the bar's More.
//
// Every time is America/New_York via fmtEt; calendar dates (next visit) are
// ET day keys rendered through etLocalToIso at noon.

import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  etLocalToIso,
  fmtEt,
  fmtEtTimeRange,
  fmtMoney,
  fmtPhone,
  JOB_STATUS_LABEL,
  PLAN_CADENCE_LABEL,
  PLAN_STATUS_LABEL,
  planAnnualCents,
  planCancellationFeeCents,
  type PlanCadence,
  type RecurringPlanVisit,
} from "@urso/types";
import { API_BASE, recurringActions } from "@/api";
import { DatePicker } from "@/components/date-picker";
import { DeliverySheet, type DeliveryChannels } from "@/components/delivery-sheet";
import { Chip, NextStep } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { dateLabel, todayEt } from "@/dates";
import { keys, useRecurringPlan } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const CADENCES: PlanCadence[] = ["monthly", "quarterly", "semiannual", "yearly"];

function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function visitLine(visit: RecurringPlanVisit): string {
  if (visit.scheduled_at) return `${fmtEt(visit.scheduled_at, { weekday: "short", month: "short", day: "numeric" })} · ${fmtEtTimeRange(visit.scheduled_at, visit.ends_at)}`;
  return visit.plan_visit_due_on ? `Due ${dateLabel(visit.plan_visit_due_on)} · not scheduled yet` : "Not scheduled yet";
}

export default function PlanScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlanDetail key={id} />;
}

function PlanDetail(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const planQuery = useRecurringPlan(id);
  const { refreshing, onRefresh } = usePullToRefresh(planQuery.refetch);
  const plan = planQuery.data ?? null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [cadenceOpen, setCadenceOpen] = useState(false);

  const invalidates = [...keys.workflow()];
  const send = useAction((channels: DeliveryChannels) => recurringActions.send(id, channels), { invalidates });
  const agree = useAction<void, { notice?: string }>(() => recurringActions.agreeInPerson(id), { invalidates });
  const pause = useAction<void, { notice?: string }>(() => recurringActions.pause(id), { invalidates });
  const resume = useAction((nextDueOn?: string) => recurringActions.resume(id, nextDueOn), { invalidates });
  const cancel = useAction(
    (opts: { reason?: string; cancelOpenVisit?: boolean; billFee?: boolean }) => recurringActions.cancel(id, opts),
    { invalidates: [...invalidates, keys.invoices()] },
  );
  const update = useAction((patch: Parameters<typeof recurringActions.update>[1]) => recurringActions.update(id, patch), { invalidates });
  const busy = send.isPending || agree.isPending || pause.isPending || resume.isPending || cancel.isPending || update.isPending;

  if (planQuery.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.brand} />
      </View>
    );
  }
  if (plan === null) {
    return (
      <View style={styles.loading}>
        <Notice text={noticeFrom(planQuery.error) ?? "Plan not found."} />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const agreementUrl = `${API_BASE}/CanesPressure/r/${plan.public_token}`;
  const openVisit = plan.visits.find((v) => ["unscheduled", "scheduled", "confirmed"].includes(v.status) && (!v.scheduled_at || Date.parse(v.scheduled_at)>Date.now())) ?? null;
  const fee = plan.signed_cancellation_fee_cents ?? (plan.signed_at ? planCancellationFeeCents(plan) : 0);
  const choosingFirstVisit = plan.status === "draft" && !plan.last_generated_for;

  const run = async (result: Promise<{ ok: true; data: unknown } | { ok: false; notice: string }>, fallback: string) => {
    setNotice(null);
    const r = await result;
    if (!r.ok) {
      setNotice(r.notice);
      return false;
    }
    toast.show(successNotice(r.data) ?? fallback);
    return true;
  };

  const sendNow = async (channels: DeliveryChannels) => {
    const ok = await run(send.mutateAsync(channels), "Agreement sent.");
    if (ok) setDeliveryOpen(false);
  };

  const agreeNow = () => {
    Alert.alert("Mark as agreed in person?", "Records the customer's agreement. Automatic booking follows the confirmed repeat date and time.", [
      { text: "Not yet", style: "cancel" },
      { text: "Mark agreed", onPress: () => void run(agree.mutateAsync(), "Plan is active.") },
    ]);
  };

  const pauseNow = () => {
    Alert.alert("Pause this plan?", "No new visits are created until you resume. Anything already on the calendar stays.", [
      { text: "Keep going", style: "cancel" },
      { text: "Pause", onPress: () => void run(pause.mutateAsync(), "Paused.") },
    ]);
  };

  const cancelNow = () => {
    const feeApplies = openVisit !== null && openVisit.scheduled_at !== null && fee > 0 && ((plan.signed_notice_days??plan.notice_days)===0 || Math.floor((Date.parse(openVisit.scheduled_at)-Date.now())/86_400_000)<(plan.signed_notice_days??plan.notice_days));
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Keep the plan", style: "cancel" }];
    if (feeApplies) {
      buttons.push({
        text: `Cancel & bill ${fmtMoney(fee)} fee`,
        style: "destructive",
        onPress: () => void run(cancel.mutateAsync({ cancelOpenVisit: true, billFee: true }), "Plan canceled."),
      });
      buttons.push({
        text: "Cancel, waive the fee",
        style: "destructive",
        onPress: () => void run(cancel.mutateAsync({ cancelOpenVisit: true, billFee: false }), "Plan canceled."),
      });
    } else {
      buttons.push({
        text: "Cancel plan",
        style: "destructive",
        onPress: () => void run(cancel.mutateAsync({ cancelOpenVisit: openVisit !== null, billFee: false }), "Plan canceled."),
      });
    }
    Alert.alert(
      "Cancel this plan?",
      feeApplies
        ? `The next visit is already scheduled. Per the agreement a ${fmtMoney(fee)} cancellation fee (50% of a visit) applies — billing it drafts an invoice you send from Invoices.`
        : openVisit
          ? "No more visits will be created. The unscheduled next visit is canceled too."
          : "No more visits will be created.",
      buttons,
    );
  };

  const shareNow = async () => {
    setMoreOpen(false);
    try {
      await Share.share({ message: agreementUrl });
    } catch {
      setNotice("This phone couldn't share the agreement link.");
    }
  };

  // The one forward action for the plan's state.
  const forward =
    plan.status === "draft"
      ? plan.sent_at
        ? { label: "Waiting for signature", hint: "Sent. Tap to re-send, or mark it agreed in person from More.", icon: "send" as const, onPress: () => setDeliveryOpen(true) }
        : { label: "Send the agreement", hint: "Texts and emails the customer a link to read and sign.", icon: "send" as const, onPress: () => setDeliveryOpen(true) }
      : plan.status === "active" && openVisit && openVisit.scheduled_at === null
        ? { label: "Book the next visit", hint: `Due ${openVisit.plan_visit_due_on ? dateLabel(openVisit.plan_visit_due_on) : "soon"} — it's waiting in Work orders.`, icon: "calendar" as const, onPress: () => router.push({ pathname: "/(owner)/job/[id]", params: { id: openVisit.id } }) }
        : plan.status === "paused"
          ? { label: "Resume the plan", hint: "Visits start being created again.", icon: "play" as const, onPress: () => setNextOpen(true) }
          : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to recurring plans" onPress={() => router.push("/(owner)/recurring")} hitSlop={space.sm} style={styles.back}>
          <Feather name="chevron-left" size={20} color={color.muted} />
          <Text style={styles.backText}>Recurring</Text>
        </Pressable>
        <Text style={styles.chromeName}>Recurring plan</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl + HIT }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />}
      >
        <Notice text={notice} />
        {settingsOpen ? <RepeatSettings plan={plan} onClose={() => setSettingsOpen(false)} /> : null}
        {plan.status !== "canceled" ? <Pressable accessibilityRole="button" style={{padding:16,minHeight:48,backgroundColor:color.surface}} onPress={() => setSettingsOpen(true)}><Text style={{color:color.brandDeep}}>{plan.scheduling_enabled ? "Edit upcoming and future scheduling" : "Set date and time to enable automatic booking"}</Text></Pressable> : null}
        {forward ? <NextStep label={forward.label} hint={forward.hint} icon={forward.icon} onPress={forward.onPress} /> : null}

        <View style={styles.card}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Pressable
                accessibilityRole={plan.contact_id ? "button" : undefined}
                disabled={!plan.contact_id}
                onPress={() => plan.contact_id && router.push({ pathname: "/(owner)/customer/[id]", params: { id: plan.contact_id } })}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {plan.customer_name ?? "Customer"}
                </Text>
                {plan.contact_id ? <Text style={styles.link}>View customer profile</Text> : null}
              </Pressable>
              <Text style={styles.sub}>{plan.job_name ?? "Recurring service"}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={styles.money}>{fmtMoney(plan.price_per_visit_cents)}</Text>
              <Text style={styles.moneySub}>per visit</Text>
            </View>
          </View>
          <View style={styles.chips}>
            <Chip label={PLAN_STATUS_LABEL[plan.status]} tone={plan.status === "active" ? "good" : plan.status === "canceled" ? "danger" : plan.status === "draft" ? "brand" : "neutral"} />
            <Chip label={PLAN_CADENCE_LABEL[plan.cadence]} tone="neutral" />
            <Chip label={`${fmtMoney(planAnnualCents(plan))} / yr`} tone="neutral" />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Schedule</Text>
        <View style={styles.card}>
          <Field
            label={choosingFirstVisit ? "First visit" : "Next visit due"}
            value={plan.next_due_on ? dateLabel(plan.next_due_on) : plan.status === "canceled" ? "—" : dateLabel(plan.starts_on)}
          />
          <Field label="Visits are created" value={plan.scheduling_enabled ? "The next future visit is scheduled automatically" : "Confirm the date and time to enable automatic booking"} />
          {plan.last_generated_for ? <Field label="Last visit created for" value={dateLabel(plan.last_generated_for)} /> : null}
          {plan.status !== "canceled" ? (
            <View style={styles.rowButtons}>
              <Pressable accessibilityRole="button" onPress={() => setNextOpen(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>{choosingFirstVisit ? "Change first visit" : "Move next visit"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setCadenceOpen(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>Change cadence</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Each visit</Text>
        <View style={styles.card}>
          {plan.items.length === 0 ? (
            <Text style={styles.muted}>No services on this plan.</Text>
          ) : (
            plan.items.map((item, index) => (
              <View key={item.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.fieldValue}>{item.name}</Text>
                  {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
                </View>
                <Text style={styles.itemQty}>{item.quantity !== 1 ? `×${item.quantity}` : ""}</Text>
                <Text style={styles.itemMoney}>{fmtMoney(item.line_total_cents)}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionLabel}>Agreement</Text>
        <View style={styles.card}>
          <Field
            label="Status"
            value={
              plan.signed_at
                ? `${plan.agreement_source === "in_person" ? "Agreed in person" : `Signed by ${plan.signature_name ?? "customer"}`} · ${fmtEt(plan.signed_at, { month: "short", day: "numeric", year: "numeric" })}`
                : plan.sent_at
                  ? `Sent ${fmtEt(plan.sent_at, { month: "short", day: "numeric" })}${plan.viewed_at ? ` · Viewed ${fmtEt(plan.viewed_at, { month: "short", day: "numeric" })}` : " · Not viewed yet"}`
                  : "Not sent yet"
            }
          />
          <Field label="Cancellation fee" value={fee > 0 ? `${fmtMoney(fee)} (${plan.cancellation_fee_bps / 100}% of a visit) if canceled after the next visit is scheduled` : "None"} />
          <Field label="Contact" value={[plan.customer_phone ? fmtPhone(plan.customer_phone) : null, plan.customer_email].filter(Boolean).join(" · ") || "No contact details"} />
          {plan.job_address ? <Field label="Address" value={plan.job_address} /> : null}
          {plan.canceled_at ? <Field label="Canceled" value={`${fmtEt(plan.canceled_at, { month: "short", day: "numeric", year: "numeric" })}${plan.canceled_reason ? ` — ${plan.canceled_reason}` : ""}`} /> : null}
          {plan.cancellation_fee_invoice_id ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/(owner)/invoice/[id]", params: { id: plan.cancellation_fee_invoice_id as string } })}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>Open cancellation-fee invoice</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Visits · {plan.visits.length}</Text>
        <View style={styles.card}>
          {plan.visits.length === 0 ? (
            <Text style={styles.muted}>
              {plan.status === "active"
                ? "No visits yet. Confirm the repeat date and time to schedule the next visit."
                : "No visits yet."}
            </Text>
          ) : (
            plan.visits.map((visit, index) => (
              <Pressable
                key={visit.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/(owner)/job/[id]", params: { id: visit.id } })}
                style={({ pressed }) => [styles.visitRow, index > 0 && styles.divided, pressed && styles.pressed]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.fieldValue}>{visitLine(visit)}</Text>
                  <Text style={styles.muted}>{JOB_STATUS_LABEL[visit.status]}</Text>
                </View>
                <Text style={styles.itemMoney}>{fmtMoney(visit.total_cents)}</Text>
                <Feather name="chevron-right" size={18} color={color.faint} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        {!plan.signed_at && ["draft", "active"].includes(plan.status) ? (
          <>
            <BarButton icon="send" label={plan.sent_at ? "Re-send" : "Send"} disabled={busy} onPress={() => setDeliveryOpen(true)} />
            <BarButton icon="check" label="Agreed" disabled={busy} onPress={agreeNow} />
          </>
        ) : null}
        {plan.status === "active" ? <BarButton icon="pause" label="Pause" disabled={busy} onPress={pauseNow} /> : null}
        {plan.status === "paused" ? <BarButton icon="play" label="Resume" disabled={busy} onPress={() => setNextOpen(true)} /> : null}
        {plan.status !== "canceled" ? <BarButton icon="slash" label="Cancel" danger disabled={busy} onPress={cancelNow} /> : null}
        <BarButton icon="more-horizontal" label="More" onPress={() => setMoreOpen(true)} />
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.moreSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.handle} />
            <View style={styles.moreGrid}>
              <MoreTile icon="link" label="Share agreement link" onPress={() => void shareNow()} />
              {!plan.signed_at && ["draft", "active"].includes(plan.status) ? <MoreTile icon="check" label="Mark agreed in person" onPress={() => { setMoreOpen(false); agreeNow(); }} /> : null}
              {plan.contact_id ? <MoreTile icon="user" label="View customer" onPress={() => { setMoreOpen(false); router.push({ pathname: "/(owner)/customer/[id]", params: { id: plan.contact_id as string } }); }} /> : null}
              {plan.source_estimate_id ? <MoreTile icon="clipboard" label="View estimate" onPress={() => { setMoreOpen(false); router.push({ pathname: "/(owner)/estimate/[id]", params: { id: plan.source_estimate_id as string } }); }} /> : null}
              {plan.source_invoice_id ? <MoreTile icon="file-text" label="View invoice" onPress={() => { setMoreOpen(false); router.push({ pathname: "/(owner)/invoice/[id]", params: { id: plan.source_invoice_id as string } }); }} /> : null}
              {openVisit ? <MoreTile icon="briefcase" label="Open next visit" onPress={() => { setMoreOpen(false); router.push({ pathname: "/(owner)/job/[id]", params: { id: openVisit.id } }); }} /> : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cadenceOpen} transparent animationType="slide" onRequestClose={() => setCadenceOpen(false)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCadenceOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.moreSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>How often</Text>
            <Text style={styles.muted}>Applies to future visits. Already-created visits keep their dates.</Text>
            <View style={[styles.chips, { marginTop: space.md }]}>
              {CADENCES.map((option) => {
                const on = option === plan.cadence;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    disabled={busy}
                    onPress={() => {
                      setCadenceOpen(false);
                      if (!on) void run(update.mutateAsync({ cadence: option }), `Now ${PLAN_CADENCE_LABEL[option].toLowerCase()}.`);
                    }}
                    style={({ pressed }) => [styles.cadenceChip, on && styles.cadenceChipOn, pressed && !on && styles.pressed]}
                  >
                    <Text style={[styles.buttonText, on && styles.cadenceTextOn]}>{PLAN_CADENCE_LABEL[option]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <DatePicker
        visible={nextOpen}
        title={plan.status === "paused" ? "Resume — next visit" : choosingFirstVisit ? "First visit" : "Next visit"}
        value={plan.next_due_on ?? plan.starts_on}
        minimumDate={todayEt()}
        onChange={(date) => {
          if (plan.status === "paused") void run(resume.mutateAsync(date), `Resumed. Next visit ${dateLabel(date)}.`);
          else if (choosingFirstVisit) void run(update.mutateAsync({ startsOn: date }), `First visit ${dateLabel(date)}.`);
          else void run(update.mutateAsync({ nextDueOn: date }), `Next visit ${dateLabel(date)}.`);
        }}
        onClose={() => setNextOpen(false)}
      />

      <DeliverySheet
        visible={deliveryOpen}
        documentLabel="agreement"
        phone={plan.customer_phone}
        email={plan.customer_email}
        sending={send.isPending}
        onClose={() => { if (!send.isPending) setDeliveryOpen(false); }}
        onSend={(channels) => void sendNow(channels)}
      />
    </View>
  );
}

function BarButton({ icon, label, onPress, disabled = false, danger = false }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const tint = disabled ? color.faint : danger ? color.danger : color.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.barButton, pressed && !disabled && styles.pressed]}>
      <Feather name={icon} size={21} color={tint} />
      <Text style={[styles.barLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

function MoreTile({ icon, label, onPress }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.moreTile, pressed && styles.pressed]}>
      <Feather name={icon} size={22} color={color.muted} />
      <Text style={styles.moreTileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: color.bg, padding: 24 },
  backButton: { minHeight: HIT, minWidth: 180, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  backButtonText: { ...type.title, color: color.ink },
  chrome: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: 2 },
  back: { flexDirection: "row", alignItems: "center", minHeight: HIT - 8, marginLeft: -6 },
  backText: { ...type.body, color: color.muted },
  chromeName: { ...type.chromeTitle, color: color.ink },
  body: { padding: space.lg, gap: space.md },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.lg,
    gap: space.sm,
  },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  name: { ...type.heading, color: color.ink },
  link: { ...type.small, color: color.brandDeep, marginTop: 2 },
  sub: { ...type.body, color: color.muted, marginTop: 4 },
  money: { fontFamily: font.monoMedium, fontSize: 20, color: color.ink },
  moneySub: { ...type.small, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 },
  sectionLabel: { ...type.micro, color: color.faint, marginTop: space.sm },
  field: { gap: 2 },
  fieldLabel: { ...type.micro, color: color.faint },
  fieldValue: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  rowButtons: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  button: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
  },
  buttonText: { ...type.body, color: color.ink, textAlign: "center" },
  pressed: { backgroundColor: color.hover },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.sm },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  itemQty: { ...type.small, color: color.muted, width: 32, textAlign: "right" },
  itemMoney: { fontFamily: font.monoMedium, fontSize: 14, color: color.ink, fontVariant: ["tabular-nums"] },
  visitRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: HIT },
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
    gap: space.xs,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  barButton: { flex: 1, minHeight: HIT + 6, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: radius.md },
  barLabel: { ...type.smaller, fontFamily: font.bodyMedium },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  moreSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: color.line, marginBottom: space.md },
  sheetTitle: { ...type.heading, color: color.ink, marginBottom: 4 },
  moreGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  moreTile: { width: "48%", flexGrow: 1, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, backgroundColor: color.bg },
  moreTileText: { ...type.small, fontFamily: font.bodyMedium, color: color.ink, textAlign: "center" },
  cadenceChip: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  cadenceChipOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  cadenceTextOn: { color: color.chromeInk },
});
