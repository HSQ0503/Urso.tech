// The job sheet — everything about one job on one screen.
//
// Sebastian opens this from the schedule with wet gloves on. The customer card
// sits at the top because "who is this and how do I reach them" is the question
// he is asking nine times out of ten; the status actions live with the schedule
// facts they change; the dangerous thing is one row, at the bottom, behind a
// confirm. Every mutation refusal is the server's own sentence, shown verbatim
// in the section where the tap happened — never rephrased, never an Alert.
//
// Money is integer cents formatted with fmtMoney. The single sanctioned
// conversion is the deposit dollars input at the edge, using the web's own
// inputToCents contract. Every timestamp is America/New_York via fmtEt.

import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueryKey } from "@tanstack/react-query";
import {
  etLocalToIso,
  fmtEt,
  fmtEtTimeRange,
  fmtMoney,
  fmtPhone,
  INVOICE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@urso/types";
import { jobActions, type JobDetailsPatch } from "@/api";
import { Avatar } from "@/components/avatar";
import { NavigateButton } from "@/components/navigate";
import { Notice } from "@/components/notice";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { keys, useCrews, useInvoices, useJob } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web's own dollars-to-cents contract (estimate-builder.tsx), copied
// character for character — the one place the app converts money instead of
// formatting it.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

// The green sibling of Notice — same shape, good colours. Used for exactly one
// sentence today: "Invoice created." after a complete.
function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.goodNotice}>
      <Text style={styles.goodNoticeText}>{text}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function JobScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // The job is the only read whose refusal blocks the screen; crews and
  // invoices each say their sentence in the section that needed them. Like
  // lead/[id], no focus refetch — pull-to-refresh is the reader's explicit
  // refresh on a pushed detail screen.
  const jobQuery = useJob(id);
  const crewsQuery = useCrews();
  const invoicesQuery = useInvoices();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([jobQuery.refetch(), crewsQuery.refetch(), invoicesQuery.refetch()]),
  );

  // Every surface a job row can appear on. ["owner","schedule"] is a prefix
  // that covers every board window, but the tray key is ["owner","unscheduled"]
  // — its own root, NOT under the schedule prefix — so it is named explicitly.
  const everywhere: QueryKey[] = [
    keys.jobs.one(id),
    ["owner", "schedule"],
    keys.schedule.unscheduled(),
    keys.agenda(),
    keys.overview(),
  ];

  // Zero-payload actions get explicit generics: a zero-arg fn gives TVars no
  // inference site, and `unknown` there would make mutateAsync demand an
  // argument.
  const start = useAction<void, Record<string, never>>(() => jobActions.start(id), {
    invalidates: everywhere,
  });
  const complete = useAction<void, { invoiceId?: string }>(() => jobActions.complete(id), {
    invalidates: [...everywhere, keys.invoices()],
  });
  const reopen = useAction<void, Record<string, never>>(() => jobActions.reopen(id), {
    invalidates: [...everywhere, keys.invoices()],
  });
  const unschedule = useAction<void, Record<string, never>>(() => jobActions.unschedule(id), {
    invalidates: everywhere,
  });
  const assign = useAction((crewId: string | null) => jobActions.assign(id, crewId), {
    invalidates: everywhere,
  });
  // One mutation serves both booking flows. An UNSCHEDULED job goes through
  // `schedule`, whose crewId is required-and-nullable — passing the job's
  // current crew means booking never silently unassigns (crew changes belong
  // to the Assign picker). A SCHEDULED job goes through `move` with crewId
  // omitted entirely, which is that action's "keep the crew" value.
  const book = useAction(
    (vars: { iso: string; durationMinutes: number; scheduled: boolean; crewId: string | null }) =>
      vars.scheduled
        ? jobActions.move(id, vars.iso, { durationMinutes: vars.durationMinutes })
        : jobActions.schedule(id, vars.iso, vars.durationMinutes, vars.crewId),
    { invalidates: everywhere },
  );
  const recordDeposit = useAction(
    (vars: { amountCents: number; method: string }) =>
      jobActions.recordDeposit(id, vars.amountCents, vars.method),
    { invalidates: [...everywhere, keys.invoices()] },
  );
  const updateDetails = useAction(
    (fields: JobDetailsPatch) => jobActions.updateDetails(id, fields),
    { invalidates: everywhere },
  );
  const cancel = useAction((reason: string | undefined) =>
    jobActions.setStatus(id, "canceled", reason), {
    invalidates: [keys.jobs.one(id), ["owner", "schedule"], keys.schedule.unscheduled(), keys.agenda(), keys.overview()],
  });
  const del = useAction<void, Record<string, never>>(() => jobActions.delete(id), {
    invalidates: everywhere,
  });

  // One refusal surface per section, so the sentence lands next to the tap
  // that earned it instead of at the top of a long scroll.
  const [customerNotice, setCustomerNotice] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [goodNotice, setGoodNotice] = useState<string | null>(null);
  const [moneyNotice, setMoneyNotice] = useState<string | null>(null);
  const [siteNotice, setSiteNotice] = useState<string | null>(null);
  const [dangerNotice, setDangerNotice] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotValue, setSlotValue] = useState("");
  const [durationDraft, setDurationDraft] = useState<number | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("cash");
  const [editOpen, setEditOpen] = useState(false);
  const [gateDraft, setGateDraft] = useState("");
  const [siteDraft, setSiteDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");

  const job = jobQuery.data ?? null;
  const notice = noticeFrom(jobQuery.error);
  const crewsNotice = noticeFrom(crewsQuery.error);
  const invoicesNotice = noticeFrom(invoicesQuery.error);
  const crews = (crewsQuery.data ?? []).filter((c) => c.active);

  const loading = jobQuery.isPending || crewsQuery.isPending || invoicesQuery.isPending;

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Feather name="chevron-left" size={20} color={color.chromeMuted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.chromeName} numberOfLines={1}>
        {job?.job_name ?? "Job"}
      </Text>
      {job ? <Text style={styles.chromeMeta}>{JOB_STATUS_LABEL[job.status]}</Text> : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          {notice !== null ? <Notice text={notice} /> : <Text style={styles.muted}>Not found.</Text>}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.button, styles.wide, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // First invoice tied to this job, found client-side — there is no per-job
  // invoice read yet, and the whole invoices list is already cached.
  const invoice = (invoicesQuery.data ?? []).find((i) => i.job_id === job.id) ?? null;

  // Const binding so the non-null narrowing survives into onPress closures.
  const estimateId = job.estimate_id;

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setCustomerNotice("This phone couldn't open that."));
  };

  const goCustomer = () => {
    if (job.contact_id === null) return;
    router.push({ pathname: "/(owner)/customer/[id]", params: { id: job.contact_id } });
  };

  const openSlot = () => {
    setSlotValue("");
    setDurationDraft(job.duration_minutes || 120);
    setScheduleNotice(null);
    setSlotOpen((v) => !v);
  };

  const onBook = async () => {
    setScheduleNotice(null);
    const r = await book.mutateAsync({
      iso: etLocalToIso(slotValue),
      durationMinutes: durationDraft ?? job.duration_minutes ?? 120,
      scheduled: job.scheduled_at !== null,
      crewId: job.crew_id,
    });
    if (!r.ok) setScheduleNotice(r.notice);
    else {
      setSlotOpen(false);
      setSlotValue("");
    }
  };

  const onStart = async () => {
    setScheduleNotice(null);
    const r = await start.mutateAsync();
    if (!r.ok) setScheduleNotice(r.notice);
  };

  const onComplete = async () => {
    setScheduleNotice(null);
    setGoodNotice(null);
    const r = await complete.mutateAsync();
    if (!r.ok) setScheduleNotice(r.notice);
    else if (r.data.invoiceId !== undefined) setGoodNotice("Invoice created.");
  };

  const onReopen = () => {
    Alert.alert("Reopen job?", "Its draft invoice will be voided.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reopen",
        onPress: () => {
          void (async () => {
            setScheduleNotice(null);
            setGoodNotice(null);
            const r = await reopen.mutateAsync();
            if (!r.ok) setScheduleNotice(r.notice);
          })();
        },
      },
    ]);
  };

  const onUnschedule = () => {
    Alert.alert("Send back to tray?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send back",
        onPress: () => {
          void (async () => {
            setScheduleNotice(null);
            const r = await unschedule.mutateAsync();
            if (!r.ok) setScheduleNotice(r.notice);
          })();
        },
      },
    ]);
  };

  const onAssign = async (crewId: string | null) => {
    setScheduleNotice(null);
    const r = await assign.mutateAsync(crewId);
    if (!r.ok) setScheduleNotice(r.notice);
    else setPickerOpen(false);
  };

  const onRecordDeposit = async () => {
    setMoneyNotice(null);
    const r = await recordDeposit.mutateAsync({
      amountCents: inputToCents(depositAmount),
      method: depositMethod,
    });
    if (!r.ok) setMoneyNotice(r.notice);
    else {
      setDepositOpen(false);
      setDepositAmount("");
    }
  };

  const openEdit = () => {
    setGateDraft(job.gate_code ?? "");
    setSiteDraft(job.site_notes ?? "");
    setNotesDraft(job.notes ?? "");
    setSiteNotice(null);
    setEditOpen(true);
  };

  const onSaveDetails = async () => {
    // Only the keys the user changed travel — an absent field means "leave
    // alone" server-side, so sending an untouched value would be a claim.
    const fields: JobDetailsPatch = {};
    if (gateDraft !== (job.gate_code ?? "")) fields.gateCode = gateDraft;
    if (siteDraft !== (job.site_notes ?? "")) fields.siteNotes = siteDraft;
    if (notesDraft !== (job.notes ?? "")) fields.notes = notesDraft;
    if (Object.keys(fields).length === 0) {
      setEditOpen(false);
      return;
    }
    setSiteNotice(null);
    const r = await updateDetails.mutateAsync(fields);
    if (!r.ok) setSiteNotice(r.notice);
    else setEditOpen(false);
  };

  // Cancel is the web sheet's soft ending — the record survives, the schedule
  // frees up. The reason is optional; the action owns the actual rules.
  // (Scheduling/moving from this sheet is deliberately absent until the slot
  // picker exists — the board is where jobs land on the calendar today.)
  const onCancel = () => {
    Alert.prompt("Cancel this job?", "Add a reason if you have one.", [
      { text: "Keep job", style: "cancel" },
      {
        text: "Cancel job",
        style: "destructive",
        onPress: (text?: string) => {
          void (async () => {
            setDangerNotice(null);
            const detail = text?.trim();
            const r = await cancel.mutateAsync(detail ? detail : undefined);
            if (!r.ok) setDangerNotice(r.notice);
          })();
        },
      },
    ]);
  };

  const onDelete = () => {
    Alert.alert("Delete job?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDangerNotice(null);
            const r = await del.mutateAsync();
            if (r.ok) router.back();
            else setDangerNotice(r.notice);
          })();
        },
      },
    ]);
  };

  // "Start job" also shows for `confirmed`: a customer saying YES moves the
  // status past `scheduled`, and a confirmed job with no way to start would be
  // a dead end. The action still owns the actual rule.
  const canStart = job.status === "scheduled" || job.status === "confirmed";

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        // The Edit-details form lives at the bottom of this page, exactly where
        // the keyboard rises; without this the inputs and Save stay covered.
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
      >
        <Notice text={notice} />

        <Section label="Customer">
          <Pressable
            accessibilityRole={job.contact_id !== null ? "button" : undefined}
            accessibilityLabel={
              job.contact_id !== null
                ? `Open customer ${job.customer_name ?? ""}`.trim()
                : undefined
            }
            onPress={job.contact_id !== null ? goCustomer : undefined}
            style={({ pressed }) => [
              styles.card,
              styles.customer,
              pressed && job.contact_id !== null && styles.cardPressed,
            ]}
          >
            <Avatar name={job.customer_name} />
            <View style={styles.customerBody}>
              <Text style={styles.customerName} numberOfLines={1}>
                {job.customer_name ?? "No customer"}
              </Text>
              {job.customer_phone !== null ? (
                <Text style={styles.customerPhone}>{fmtPhone(job.customer_phone)}</Text>
              ) : null}
              {job.job_address !== null ? (
                <>
                  <Text style={styles.customerAddress} numberOfLines={2}>
                    {job.job_address}
                  </Text>
                  {/* Its own Pressable, like the call glyph below — opening
                      Maps must never also push the customer screen. */}
                  <View style={styles.navigate}>
                    <NavigateButton address={job.job_address} onFail={setCustomerNotice} />
                  </View>
                </>
              ) : null}
            </View>
            {job.customer_phone !== null ? (
              // Its own Pressable so dialling never also navigates — the inner
              // responder wins and the card press does not fire.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                onPress={() => open(`tel:${job.customer_phone}`)}
                style={({ pressed }) => [styles.phoneGlyph, pressed && styles.phoneGlyphPressed]}
              >
                <Feather name="phone" size={18} color={color.brandDeep} />
              </Pressable>
            ) : null}
            {job.contact_id !== null ? (
              <Feather name="chevron-right" size={20} color={color.faint} />
            ) : null}
          </Pressable>
          <Notice text={customerNotice} />
        </Section>

        <Section label="Schedule">
          <Notice text={crewsNotice} />
          <View style={styles.card}>
            <View style={styles.pad}>
              {job.scheduled_at !== null ? (
                <>
                  <Field label="Scheduled" value={fmtEt(job.scheduled_at)} />
                  <Field
                    label="Window"
                    value={`${fmtEtTimeRange(job.scheduled_at, job.ends_at)} · ${fmtDuration(job.duration_minutes)}`}
                  />
                  {job.confirmed_at !== null ? (
                    <Text style={styles.goodBadge}>
                      Confirmed {fmtEt(job.confirmed_at)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.muted}>Not scheduled — this job is in the tray.</Text>
              )}
              <Field label="Crew" value={job.crew?.name ?? "No crew"} />
            </View>

            <View style={[styles.pad, styles.divided, styles.actions]}>
              <GoodNotice text={goodNotice} />
              <Notice text={scheduleNotice} />

              {canStart ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onStart}
                  disabled={start.isPending}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.primaryPressed,
                    start.isPending && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>Start job</Text>
                </Pressable>
              ) : null}

              {job.status === "in_progress" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onComplete}
                  disabled={complete.isPending}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.primaryPressed,
                    complete.isPending && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>Complete job</Text>
                </Pressable>
              ) : null}

              {job.status === "completed" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onReopen}
                  disabled={reopen.isPending}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                    reopen.isPending && styles.disabled,
                  ]}
                >
                  <Text style={styles.buttonText}>Reopen</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen((v) => !v)}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Assign crew</Text>
              </Pressable>

              {pickerOpen ? (
                <View style={styles.picker}>
                  {crews.map((crew, index) => (
                    <Pressable
                      key={crew.id}
                      accessibilityRole="button"
                      onPress={() => void onAssign(crew.id)}
                      disabled={assign.isPending}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        index > 0 && styles.divided,
                        pressed && styles.pressed,
                        assign.isPending && styles.disabled,
                      ]}
                    >
                      <Text style={styles.buttonText}>{crew.name}</Text>
                      {job.crew_id === crew.id ? (
                        <Text style={styles.assignedMark}>Assigned</Text>
                      ) : null}
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void onAssign(null)}
                    disabled={assign.isPending}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      crews.length > 0 && styles.divided,
                      pressed && styles.pressed,
                      assign.isPending && styles.disabled,
                    ]}
                  >
                    <Text style={styles.buttonText}>No crew</Text>
                    {job.crew_id === null ? <Text style={styles.assignedMark}>Assigned</Text> : null}
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={openSlot}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>
                  {job.scheduled_at !== null ? "Move job" : "Schedule job"}
                </Text>
              </Pressable>

              {slotOpen ? (
                <View style={styles.slotCard}>
                  {/* allowPast: Sebastian back-dates work he forgot to log —
                      the same reason the web job flows pass it. */}
                  <SlotPicker value={slotValue} onChange={setSlotValue} allowPast />
                  <View style={styles.durationRow}>
                    {[60, 90, 120, 180, 240].map((m) => (
                      <Pressable
                        key={m}
                        accessibilityRole="button"
                        accessibilityState={{ selected: durationDraft === m }}
                        onPress={() => setDurationDraft(m)}
                        style={({ pressed }) => [
                          styles.durationChip,
                          durationDraft === m && styles.durationChipOn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            durationDraft === m && styles.durationTextOn,
                          ]}
                        >
                          {fmtDuration(m)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void onBook()}
                    disabled={!isCompleteWhen(slotValue) || book.isPending}
                    style={({ pressed }) => [
                      styles.primary,
                      pressed && styles.primaryPressed,
                      (!isCompleteWhen(slotValue) || book.isPending) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryText}>
                      {book.isPending
                        ? "Booking…"
                        : job.scheduled_at !== null
                          ? "Move here"
                          : "Book it"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {job.scheduled_at !== null ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onUnschedule}
                  disabled={unschedule.isPending}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                    unschedule.isPending && styles.disabled,
                  ]}
                >
                  <Text style={styles.buttonText}>Send back to tray</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Section>

        <Section label="Work">
          <View style={styles.card}>
            {job.items.length > 0 ? (
              job.items.map((item, index) =>
                item.checklist_only === true ? (
                  // Checklist rows carry no money — plain name, done state.
                  <View key={item.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                    <Text style={[styles.body, styles.itemName]}>{item.name}</Text>
                    {item.done ? <Text style={styles.doneMark}>Done</Text> : null}
                  </View>
                ) : (
                  // JobItem carries no unit price, so a priced line shows its
                  // quantity and the line total — never a computed unit figure.
                  <View key={item.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                    <View style={styles.itemMain}>
                      <Text style={styles.body}>{item.name}</Text>
                      <Text style={styles.itemQty}>Qty {item.quantity}</Text>
                    </View>
                    <Text style={styles.money}>{fmtMoney(item.line_total_cents)}</Text>
                  </View>
                ),
              )
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>No line items on this job.</Text>
              </View>
            )}
          </View>
        </Section>

        <Section label="Money">
          <Notice text={invoicesNotice} />
          <View style={styles.card}>
            <View style={styles.pad}>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Total</Text>
                <Text style={styles.moneyBig}>{fmtMoney(job.total_cents)}</Text>
              </View>
              {job.deposit_cents > 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Deposit</Text>
                  <Text style={styles.money}>{fmtMoney(job.deposit_cents)}</Text>
                </View>
              ) : null}
              {job.deposit_paid_at != null ? (
                <Text style={styles.goodBadge}>Deposit collected</Text>
              ) : null}
            </View>

            {invoice !== null ? (
              // Presses through to the invoice screen, which exists now.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open invoice ${invoice.number}`}
                onPress={() =>
                  router.push({ pathname: "/(owner)/invoice/[id]", params: { id: invoice.id } })
                }
                style={({ pressed }) => [
                  styles.pad,
                  styles.divided,
                  styles.linkedRow,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.linkedRowBody}>
                  <Text style={styles.fieldLabel}>Invoice {invoice.number}</Text>
                  <View style={styles.moneyRow}>
                    <Text style={styles.body}>{INVOICE_STATUS_LABEL[invoice.status]}</Text>
                    <Text style={styles.money}>{fmtMoney(invoice.total_cents)}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={20} color={color.faint} />
              </Pressable>
            ) : (
              <View style={[styles.pad, styles.divided, styles.actions]}>
                <Notice text={moneyNotice} />
                {depositOpen ? (
                  <>
                    <Text style={styles.fieldLabel}>Amount</Text>
                    <TextInput
                      value={depositAmount}
                      onChangeText={setDepositAmount}
                      placeholder="0.00"
                      placeholderTextColor={color.faint}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Deposit amount in dollars"
                      style={styles.input}
                    />
                    <Text style={styles.fieldLabel}>Method</Text>
                    <View style={styles.methodRow}>
                      {Object.entries(PAYMENT_METHOD_LABEL).map(([method, label]) => (
                        <Pressable
                          key={method}
                          accessibilityRole="button"
                          accessibilityLabel={`Method ${label}`}
                          onPress={() => setDepositMethod(method)}
                          style={[styles.method, depositMethod === method && styles.methodOn]}
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              depositMethod === method && styles.methodTextOn,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.buttonRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setDepositOpen(false)}
                        style={({ pressed }) => [
                          styles.button,
                          styles.grow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void onRecordDeposit()}
                        disabled={recordDeposit.isPending}
                        style={({ pressed }) => [
                          styles.primary,
                          styles.grow,
                          pressed && styles.primaryPressed,
                          recordDeposit.isPending && styles.disabled,
                        ]}
                      >
                        <Text style={styles.primaryText}>Save deposit</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDepositOpen(true)}
                    style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                  >
                    <Text style={styles.buttonText}>Record deposit</Text>
                  </Pressable>
                )}
              </View>
            )}

            {estimateId !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View estimate"
                onPress={() =>
                  router.push({ pathname: "/(owner)/estimate/[id]", params: { id: estimateId } })
                }
                style={({ pressed }) => [
                  styles.pad,
                  styles.divided,
                  styles.linkedRow,
                  pressed && styles.cardPressed,
                ]}
              >
                <Text style={[styles.body, styles.grow]}>View estimate</Text>
                <Feather name="chevron-right" size={20} color={color.faint} />
              </Pressable>
            ) : null}
          </View>
        </Section>

        <Section label="Site">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Field label="Gate code" value={job.gate_code ?? "—"} />
              <Field label="Site notes" value={job.site_notes ?? "—"} />
              <Field label="Notes" value={job.notes ?? "—"} />
            </View>

            <View style={[styles.pad, styles.divided, styles.actions]}>
              <Notice text={siteNotice} />
              {editOpen ? (
                <>
                  <Text style={styles.fieldLabel}>Gate code</Text>
                  <TextInput
                    value={gateDraft}
                    onChangeText={setGateDraft}
                    placeholder="Gate code"
                    placeholderTextColor={color.faint}
                    autoCapitalize="none"
                    accessibilityLabel="Gate code"
                    style={styles.input}
                  />
                  <Text style={styles.fieldLabel}>Site notes</Text>
                  <TextInput
                    value={siteDraft}
                    onChangeText={setSiteDraft}
                    placeholder="Dogs, hoses, breaker locations…"
                    placeholderTextColor={color.faint}
                    multiline
                    accessibilityLabel="Site notes"
                    style={[styles.input, styles.inputTall]}
                  />
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    value={notesDraft}
                    onChangeText={setNotesDraft}
                    placeholder="Internal notes"
                    placeholderTextColor={color.faint}
                    multiline
                    accessibilityLabel="Notes"
                    style={[styles.input, styles.inputTall]}
                  />
                  <View style={styles.buttonRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setEditOpen(false)}
                      style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}
                    >
                      <Text style={styles.buttonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void onSaveDetails()}
                      disabled={updateDetails.isPending}
                      style={({ pressed }) => [
                        styles.primary,
                        styles.grow,
                        pressed && styles.primaryPressed,
                        updateDetails.isPending && styles.disabled,
                      ]}
                    >
                      <Text style={styles.primaryText}>Save</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={openEdit}
                  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                >
                  <Text style={styles.buttonText}>Edit details</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Section>

        <View style={styles.section}>
          <Notice text={dangerNotice} />
          {job.status !== "canceled" ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              disabled={cancel.isPending}
              style={({ pressed }) => [
                styles.danger,
                pressed && styles.dangerPressed,
                cancel.isPending && styles.disabled,
              ]}
            >
              <Text style={styles.dangerText}>Cancel job</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            disabled={del.isPending}
            style={({ pressed }) => [
              styles.danger,
              pressed && styles.dangerPressed,
              del.isPending && styles.disabled,
            ]}
          >
            <Text style={styles.dangerText}>Delete job</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
  },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeMeta: { ...type.micro, color: color.chromeMuted },

  scrollBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  cardPressed: { backgroundColor: color.hover },
  linkedRow: { flexDirection: "row", alignItems: "center", minHeight: HIT },
  linkedRowBody: { flex: 1, gap: space.sm },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  actions: { gap: space.sm },

  customer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    minHeight: HIT,
  },
  customerBody: { flex: 1, gap: 2 },
  customerName: { ...type.title, color: color.ink },
  customerPhone: { ...type.small, color: color.muted, fontVariant: ["tabular-nums"] },
  customerAddress: { ...type.small, color: color.faint },
  navigate: { alignSelf: "flex-start", marginTop: space.xs },
  phoneGlyph: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  phoneGlyphPressed: { backgroundColor: color.brandSoft },

  field: { gap: 2 },
  fieldLabel: { ...type.micro, color: color.faint },
  fieldValue: { ...type.body, color: color.ink },
  goodBadge: {
    ...type.micro,
    color: color.good,
    backgroundColor: color.goodBg,
    alignSelf: "flex-start",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    overflow: "hidden",
  },

  primary: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.brandDown },
  primaryText: { ...type.title, color: color.chromeInk },

  button: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
  pressed: { backgroundColor: color.hover },
  wide: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  buttonRow: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },

  picker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  pickerRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
  },
  assignedMark: { ...type.micro, color: color.brandDeep },

  slotCard: {
    gap: space.sm,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.bg,
  },
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 },
  durationChip: {
    minHeight: HIT - 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  durationChipOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  durationTextOn: { color: color.chromeInk },

  itemRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: { flex: 1 },
  itemQty: { ...type.micro, color: color.faint },
  doneMark: { ...type.micro, color: color.good },
  money: { ...type.body, color: color.ink, fontVariant: ["tabular-nums"] },
  moneyBig: {
    fontFamily: font.bodySemi,
    fontSize: 17,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  moneyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },

  input: {
    // No lineHeight — the iOS placeholder-tracking gotcha every TextInput in
    // this app avoids (see customers.tsx search).
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
  inputTall: { minHeight: 80, paddingTop: space.md, textAlignVertical: "top" },
  methodRow: { flexDirection: "row", gap: space.sm },
  method: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  methodOn: { borderColor: color.brandDeep, backgroundColor: color.brandSoft },
  methodTextOn: { color: color.brandDeep, fontFamily: font.bodySemi },

  danger: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  dangerPressed: { backgroundColor: color.dangerBg },
  dangerText: { ...type.body, color: color.danger },

  goodNotice: {
    backgroundColor: color.goodBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  goodNoticeText: { ...type.small, color: color.good },
});
