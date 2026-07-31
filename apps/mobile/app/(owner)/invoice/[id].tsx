// The bill — everything about one invoice on one screen.
//
// Customer card first (who owes this, one tap to reach them), then the lines
// and the totals ladder, the payments ledger, the review rewards, and the
// status actions. The dangerous thing is one row at the bottom behind a
// confirm. Every mutation refusal is the server's own sentence, shown verbatim
// in the section where the tap happened.
//
// MONEY: integer cents formatted with fmtMoney, tabular-nums. The screen
// computes nothing — the single display subtraction (balance due) goes through
// the same shared helper the web uses. The one dollars-to-cents conversion is
// the cash-payment input at the edge, via the web's own inputToCents contract.

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
  fmtEt,
  fmtMoney,
  fmtPhone,
  invoiceBalanceCents,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  REWARD_KIND_LABEL,
  type InvoiceReward,
  type InvoiceRewardStatus,
} from "@urso/types";
import { invoiceActions, owner } from "@/api";
import { Avatar } from "@/components/avatar";
import { Notice } from "@/components/notice";
import { PhoneInput, toPhoneDisplay } from "@/components/phone-input";
import { keys, useInvoice, useInvoiceRewards } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web's own dollars-to-cents contract (estimate-builder.tsx), copied
// character for character — the one place this screen converts money instead
// of formatting it.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ok:true can still carry a sentence — a QUALIFIED success ("Texted, but the
// email failed."). The envelope parks it inside data; it renders like every
// other server sentence: verbatim, next to the tap that earned it.
function qualifiedNotice(data: unknown): string | null {
  const notice = (data as { notice?: unknown } | null)?.notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

// Display casing only — reward statuses have no shared label map in
// @urso/types. Kind labels DO come from the shared REWARD_KIND_LABEL.
const REWARD_STATUS_LABEL: Record<InvoiceRewardStatus, string> = {
  offered: "Offered",
  claimed: "Claimed",
  approved: "Approved",
  declined: "Declined",
};

// The green sibling of Notice — same shape, good colours. Qualified successes
// and confirmations land here.
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

export default function InvoiceScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // The invoice read blocks the screen; the rewards read says its sentence in
  // its own section. Like job/[id], no focus refetch — pull-to-refresh is the
  // reader's explicit refresh on a pushed detail screen.
  const invoiceQuery = useInvoice(id);
  const rewardsQuery = useInvoiceRewards(id);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([invoiceQuery.refetch(), rewardsQuery.refetch()]),
  );

  // Every surface this bill's money shows on. The job key rides along when the
  // bill is tied to a job — voiding releases it, payments settle it — and
  // ["owner","schedule"] is the prefix covering every board window.
  const invoiceJobId = invoiceQuery.data?.job_id ?? null;
  const everywhere: QueryKey[] = [
    keys.invoiceOne(id),
    keys.invoices(),
    keys.invoiceRewards(id),
    ...(invoiceJobId !== null ? [keys.jobs.one(invoiceJobId)] : []),
    ["owner", "schedule"],
    keys.overview(),
  ];

  // Zero-payload actions get explicit generics: a zero-arg fn gives TVars no
  // inference site, and `unknown` there would make mutateAsync demand an
  // argument.
  const send = useAction<void, Record<string, never>>(() => invoiceActions.send(id), {
    invalidates: everywhere,
  });
  const recordCash = useAction(
    (amountCents: number) => invoiceActions.recordCashPayment(id, amountCents),
    { invalidates: everywhere },
  );
  const voidInvoice = useAction<void, Record<string, never>>(() => invoiceActions.void(id), {
    invalidates: everywhere,
  });
  const del = useAction<void, Record<string, never>>(() => invoiceActions.delete(id), {
    invalidates: everywhere,
  });
  const rewardApproval = useAction(
    (vars: { rewardId: string; approve: boolean; attributedMemberId?: string | null }) =>
      invoiceActions.setRewardApproval(id, vars.rewardId, vars.approve, vars.attributedMemberId),
    { invalidates: everywhere },
  );
  // Contact fields are the exception to the action's draft-only rule — a wrong
  // phone on a SENT bill is exactly when fixing it matters (then Send again).
  const updateContact = useAction(
    (fields: Partial<{ customerName: string; customerPhone: string; customerEmail: string }>) =>
      invoiceActions.update(id, fields),
    { invalidates: everywhere },
  );
  const rewardOffer = useAction(
    (vars: { kind: string; enabled: boolean }) =>
      invoiceActions.setRewardOffer(id, vars.kind, vars.enabled),
    { invalidates: everywhere },
  );

  // One refusal surface per section, so the sentence lands next to the tap
  // that earned it instead of at the top of a long scroll.
  const [customerNotice, setCustomerNotice] = useState<string | null>(null);
  const [rewardNotice, setRewardNotice] = useState<string | null>(null);
  const [rewardGood, setRewardGood] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionGood, setActionGood] = useState<string | null>(null);
  const [dangerNotice, setDangerNotice] = useState<string | null>(null);

  const [cashOpen, setCashOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [cashAmount, setCashAmount] = useState("");

  const invoice = invoiceQuery.data ?? null;
  const notice = noticeFrom(invoiceQuery.error);
  const rewardsNotice = noticeFrom(rewardsQuery.error);
  const rewards = rewardsQuery.data ?? [];

  const loading = invoiceQuery.isPending || rewardsQuery.isPending;

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
        {invoice !== null ? `Invoice ${invoice.number}` : "Invoice"}
      </Text>
      {invoice !== null ? (
        <Text style={styles.chromeMeta}>{INVOICE_STATUS_LABEL[invoice.status]}</Text>
      ) : null}
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

  if (invoice === null) {
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

  const jobId = invoice.job_id;
  const payUrl = invoice.hosted_payment_url;

  // BALANCE DUE — the one display subtraction on the phone (total − paid,
  // floored at zero), done through the same shared helper the web performs it
  // with client-side. Nowhere else in this app subtracts money.
  const balanceCents = invoiceBalanceCents(invoice);

  const open = (url: string, setNotice: (text: string | null) => void) => {
    Linking.openURL(url).catch(() => setNotice("This phone couldn't open that."));
  };

  const goCustomer = () => {
    if (invoice.contact_id === null) return;
    router.push({ pathname: "/(owner)/customer/[id]", params: { id: invoice.contact_id } });
  };

  const onSend = async () => {
    setActionNotice(null);
    setActionGood(null);
    // No opts: the action texts AND emails whatever the snapshot's contact
    // fields carry. The returned sentence may be a qualified success.
    const r = await send.mutateAsync();
    if (!r.ok) setActionNotice(r.notice);
    else setActionGood(qualifiedNotice(r.data) ?? "Invoice sent.");
  };

  const onRecordCash = () => {
    const cents = inputToCents(cashAmount);
    Alert.alert("Record cash payment?", `${fmtMoney(cents)} against invoice ${invoice.number}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Record",
        onPress: () => {
          void (async () => {
            setActionNotice(null);
            setActionGood(null);
            const r = await recordCash.mutateAsync(cents);
            if (!r.ok) setActionNotice(r.notice);
            else {
              setCashOpen(false);
              setCashAmount("");
              const qualified = qualifiedNotice(r.data);
              if (qualified !== null) setActionGood(qualified);
            }
          })();
        },
      },
    ]);
  };

  const onVoid = () => {
    Alert.alert(
      "Void invoice?",
      "The job is released for re-billing and the Square pay link is cancelled.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setActionNotice(null);
              setActionGood(null);
              const r = await voidInvoice.mutateAsync();
              if (!r.ok) setActionNotice(r.notice);
              else {
                const qualified = qualifiedNotice(r.data);
                if (qualified !== null) setActionGood(qualified);
              }
            })();
          },
        },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert("Delete invoice?", undefined, [
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

  const approveReward = (reward: InvoiceReward, attributedMemberId?: string | null) => {
    void (async () => {
      setRewardNotice(null);
      setRewardGood(null);
      const r = await rewardApproval.mutateAsync({
        rewardId: reward.id,
        approve: true,
        attributedMemberId,
      });
      if (!r.ok) setRewardNotice(r.notice);
      else {
        const qualified = qualifiedNotice(r.data);
        if (qualified !== null) setRewardGood(qualified);
      }
    })();
  };

  const openContact = () => {
    setContactName(invoice?.customer_name ?? "");
    setContactPhone(toPhoneDisplay(invoice?.customer_phone ?? ""));
    setContactEmail(invoice?.customer_email ?? "");
    setActionNotice(null);
    setContactOpen((v) => !v);
  };

  const onSaveContact = async () => {
    if (!invoice) return;
    // Changed keys only — absent leaves the column alone, "" clears it.
    const fields: Partial<{ customerName: string; customerPhone: string; customerEmail: string }> =
      {};
    if (contactName !== (invoice.customer_name ?? "")) fields.customerName = contactName;
    if (contactPhone !== toPhoneDisplay(invoice.customer_phone ?? ""))
      fields.customerPhone = contactPhone;
    if (contactEmail !== (invoice.customer_email ?? "")) fields.customerEmail = contactEmail;
    if (Object.keys(fields).length === 0) {
      setContactOpen(false);
      return;
    }
    setActionNotice(null);
    const r = await updateContact.mutateAsync(fields);
    if (!r.ok) setActionNotice(r.notice);
    else setContactOpen(false);
  };

  const onApproveReward = (reward: InvoiceReward) => {
    Alert.alert("Approve reward?", "Approving subtracts the reward from the bill.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: () => {
          void (async () => {
            // Attribution feeds the review leaderboard, so the web's verify
            // step offers a "Credit" picker — losing it on mobile would erase
            // who earned the review. The roster read is OWNER-ONLY (it carries
            // pay terms), fetched here at tap time: an ops manager's refusal
            // just means approving without credit, not a payroll notice.
            const roster = await owner.team();
            const workers = roster.ok ? roster.data.filter((m) => m.active) : [];
            if (workers.length === 0) {
              approveReward(reward);
              return;
            }
            Alert.alert("Credit the review to…", undefined, [
              ...workers.map((m) => ({
                text: m.name,
                onPress: () => approveReward(reward, m.id),
              })),
              { text: "No one", onPress: () => approveReward(reward, null) },
              { text: "Cancel", style: "cancel" as const },
            ]);
          })();
        },
      },
    ]);
  };

  const onDeclineReward = (reward: InvoiceReward) => {
    Alert.alert("Decline reward?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setRewardNotice(null);
            setRewardGood(null);
            const r = await rewardApproval.mutateAsync({ rewardId: reward.id, approve: false });
            if (!r.ok) setRewardNotice(r.notice);
            else {
              // Decline answers ok:true WITH a sentence ("Declined — no
              // discount applied.", or the already-resolved CAS notice) —
              // qualified successes surface, same as approve.
              const qualified = qualifiedNotice(r.data);
              if (qualified !== null) setRewardGood(qualified);
            }
          })();
        },
      },
    ]);
  };

  // Pre-send offer toggle. Removing deletes the `offered` row, and with no
  // reward-config read on the phone a removed kind can't be re-added here — so
  // removal gets a confirm even though no money moves.
  const onRemoveOffer = (reward: InvoiceReward) => {
    Alert.alert("Remove this offer?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setRewardNotice(null);
            setRewardGood(null);
            const r = await rewardOffer.mutateAsync({ kind: reward.kind, enabled: false });
            if (!r.ok) setRewardNotice(r.notice);
          })();
        },
      },
    ]);
  };

  const onOfferAgain = async (reward: InvoiceReward) => {
    setRewardNotice(null);
    setRewardGood(null);
    const r = await rewardOffer.mutateAsync({ kind: reward.kind, enabled: true });
    if (!r.ok) setRewardNotice(r.notice);
  };

  const canSend = invoice.status === "draft";
  const canResend = invoice.status === "sent" || invoice.status === "viewed";
  // Cash and void belong to ANY open bill — completing a job mints a DRAFT,
  // and cash on the spot is the field norm, so gating these behind sent/viewed
  // hid them exactly when Sebastian needs them. The web offers both on every
  // non-paid, non-void bill, and the actions claim those statuses themselves.
  const openBill = invoice.status !== "paid" && invoice.status !== "void";
  const canDelete = invoice.status === "draft" || invoice.status === "void";
  const rewardBusy = rewardApproval.isPending || rewardOffer.isPending;

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        // The cash-payment input opens near the bottom of this page, exactly
        // where the keyboard rises.
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
          <View style={styles.card}>
            <Pressable
              accessibilityRole={invoice.contact_id !== null ? "button" : undefined}
              accessibilityLabel={
                invoice.contact_id !== null
                  ? `Open customer ${invoice.customer_name ?? ""}`.trim()
                  : undefined
              }
              onPress={invoice.contact_id !== null ? goCustomer : undefined}
              style={({ pressed }) => [
                styles.customer,
                pressed && invoice.contact_id !== null && styles.pressed,
              ]}
            >
              <Avatar name={invoice.customer_name} />
              <View style={styles.customerBody}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {invoice.customer_name ?? "No customer"}
                </Text>
                {invoice.customer_phone !== null ? (
                  <Text style={styles.customerPhone}>{fmtPhone(invoice.customer_phone)}</Text>
                ) : null}
                {invoice.job_address !== null ? (
                  <Text style={styles.customerAddress} numberOfLines={2}>
                    {invoice.job_address}
                  </Text>
                ) : null}
              </View>
              {invoice.customer_phone !== null ? (
                // Its own Pressable so dialling never also navigates — the
                // inner responder wins and the card press does not fire.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Call customer"
                  onPress={() => open(`tel:${invoice.customer_phone}`, setCustomerNotice)}
                  style={({ pressed }) => [styles.phoneGlyph, pressed && styles.phoneGlyphPressed]}
                >
                  <Feather name="phone" size={18} color={color.brandDeep} />
                </Pressable>
              ) : null}
              {invoice.contact_id !== null ? (
                <Feather name="chevron-right" size={20} color={color.faint} />
              ) : null}
            </Pressable>

            {jobId !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View job"
                onPress={() =>
                  router.push({ pathname: "/(owner)/job/[id]", params: { id: jobId } })
                }
                style={({ pressed }) => [styles.jobRow, styles.divided, pressed && styles.pressed]}
              >
                <Text style={styles.body} numberOfLines={1}>
                  View job{invoice.job_name !== null ? ` — ${invoice.job_name}` : ""}
                </Text>
                <Feather name="chevron-right" size={18} color={color.faint} />
              </Pressable>
            ) : null}
          </View>
          <Notice text={customerNotice} />
        </Section>

        <Section label="Lines">
          <View style={styles.card}>
            {invoice.items.length > 0 ? (
              invoice.items.map((item, index) => (
                <View key={item.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                  <View style={styles.itemMain}>
                    <Text style={styles.body}>{item.name}</Text>
                    <Text style={styles.itemQty}>Qty {item.quantity}</Text>
                  </View>
                  <Text style={styles.money}>{fmtMoney(item.line_total_cents)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>No line items on this invoice.</Text>
              </View>
            )}

            <View style={[styles.pad, styles.divided]}>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Subtotal</Text>
                <Text style={styles.money}>{fmtMoney(invoice.subtotal_cents)}</Text>
              </View>
              {invoice.adjustment_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Adjustment</Text>
                  <Text style={styles.money}>{fmtMoney(invoice.adjustment_cents)}</Text>
                </View>
              ) : null}
              {invoice.tax_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Tax</Text>
                  <Text style={styles.money}>{fmtMoney(invoice.tax_cents)}</Text>
                </View>
              ) : null}
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Total</Text>
                <Text style={styles.moneyBig}>{fmtMoney(invoice.total_cents)}</Text>
              </View>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Amount paid</Text>
                <Text style={styles.money}>{fmtMoney(invoice.amount_paid_cents)}</Text>
              </View>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Balance due</Text>
                <Text style={[styles.moneyBig, balanceCents > 0 && styles.moneyDue]}>
                  {fmtMoney(balanceCents)}
                </Text>
              </View>
            </View>
          </View>
        </Section>

        <Section label="Payments">
          <View style={styles.card}>
            {invoice.payments.length > 0 ? (
              invoice.payments.map((payment, index) => (
                <View key={payment.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                  <View style={styles.itemMain}>
                    <Text style={styles.body}>{PAYMENT_METHOD_LABEL[payment.method]}</Text>
                    <View style={styles.paymentMeta}>
                      <Text style={styles.itemQty}>
                        {fmtEt(payment.created_at, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                      {payment.kind !== undefined ? (
                        <Text style={styles.itemQty}>
                          {payment.kind === "deposit" ? "Deposit" : "Balance"}
                        </Text>
                      ) : null}
                      {payment.status === "refunded" ? (
                        <Text style={styles.refunded}>Refunded</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.money}>{fmtMoney(payment.amount_cents)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>No payments yet.</Text>
              </View>
            )}
          </View>
        </Section>

        {rewards.length > 0 || rewardsNotice !== null ? (
          <Section label="Rewards">
            <Notice text={rewardsNotice} />
            {rewards.length > 0 ? (
              <View style={styles.card}>
                {rewards.map((reward, index) => (
                  <View key={reward.id} style={[styles.pad, index > 0 && styles.divided]}>
                    <View style={styles.moneyRow}>
                      <View style={styles.itemMain}>
                        <Text style={styles.body}>{REWARD_KIND_LABEL[reward.kind]}</Text>
                        <Text
                          style={[
                            styles.rewardStatus,
                            reward.status === "approved" && styles.rewardStatusGood,
                            reward.status === "claimed" && styles.rewardStatusHot,
                          ]}
                        >
                          {REWARD_STATUS_LABEL[reward.status]}
                        </Text>
                      </View>
                      <Text style={styles.money}>−{fmtMoney(reward.amount_cents)}</Text>
                    </View>

                    {reward.status === "claimed" ? (
                      <View style={styles.buttonRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onApproveReward(reward)}
                          disabled={rewardBusy}
                          style={({ pressed }) => [
                            styles.primary,
                            styles.grow,
                            pressed && styles.primaryPressed,
                            rewardBusy && styles.disabled,
                          ]}
                        >
                          <Text style={styles.primaryText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onDeclineReward(reward)}
                          disabled={rewardBusy}
                          style={({ pressed }) => [
                            styles.button,
                            styles.grow,
                            pressed && styles.pressed,
                            rewardBusy && styles.disabled,
                          ]}
                        >
                          <Text style={styles.buttonText}>Decline</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {canSend && reward.status === "offered" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onRemoveOffer(reward)}
                        disabled={rewardBusy}
                        style={({ pressed }) => [
                          styles.button,
                          pressed && styles.pressed,
                          rewardBusy && styles.disabled,
                        ]}
                      >
                        <Text style={styles.buttonText}>Remove offer</Text>
                      </Pressable>
                    ) : null}

                    {canSend && reward.status === "declined" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void onOfferAgain(reward)}
                        disabled={rewardBusy}
                        style={({ pressed }) => [
                          styles.button,
                          pressed && styles.pressed,
                          rewardBusy && styles.disabled,
                        ]}
                      >
                        <Text style={styles.buttonText}>Offer again</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            <GoodNotice text={rewardGood} />
            <Notice text={rewardNotice} />
          </Section>
        ) : null}

        {canSend || canResend || openBill || payUrl !== null ? (
          <Section label="Actions">
            <View style={styles.card}>
              <View style={[styles.pad, styles.actions]}>
                <GoodNotice text={actionGood} />
                <Notice text={actionNotice} />

                {canSend ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void onSend()}
                    disabled={send.isPending}
                    style={({ pressed }) => [
                      styles.primary,
                      pressed && styles.primaryPressed,
                      send.isPending && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryText}>
                      {send.isPending ? "Sending…" : "Send invoice"}
                    </Text>
                  </Pressable>
                ) : null}

                {canResend ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void onSend()}
                    disabled={send.isPending}
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.pressed,
                      send.isPending && styles.disabled,
                    ]}
                  >
                    <Text style={styles.buttonText}>
                      {send.isPending ? "Sending…" : "Send again"}
                    </Text>
                  </Pressable>
                ) : null}

                {openBill ? (
                  <>
                    {cashOpen ? (
                      <View style={styles.cashCard}>
                        <Text style={styles.fieldLabel}>Amount</Text>
                        <TextInput
                          value={cashAmount}
                          onChangeText={setCashAmount}
                          placeholder="0.00"
                          placeholderTextColor={color.faint}
                          keyboardType="decimal-pad"
                          accessibilityLabel="Payment amount in dollars"
                          style={styles.input}
                        />
                        <View style={styles.buttonRow}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setCashOpen(false)}
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
                            onPress={onRecordCash}
                            disabled={recordCash.isPending}
                            style={({ pressed }) => [
                              styles.primary,
                              styles.grow,
                              pressed && styles.primaryPressed,
                              recordCash.isPending && styles.disabled,
                            ]}
                          >
                            <Text style={styles.primaryText}>Record</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setCashOpen(true)}
                        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                      >
                        <Text style={styles.buttonText}>Record cash payment</Text>
                      </Pressable>
                    )}

                    {contactOpen ? (
                      <View style={styles.cashCard}>
                        <Text style={styles.fieldLabel}>Name</Text>
                        <TextInput
                          value={contactName}
                          onChangeText={setContactName}
                          placeholder="Customer name"
                          placeholderTextColor={color.faint}
                          accessibilityLabel="Customer name"
                          style={styles.input}
                        />
                        <Text style={styles.fieldLabel}>Phone</Text>
                        <PhoneInput value={contactPhone} onChange={setContactPhone} />
                        <Text style={styles.fieldLabel}>Email</Text>
                        <TextInput
                          value={contactEmail}
                          onChangeText={setContactEmail}
                          placeholder="name@email.com"
                          placeholderTextColor={color.faint}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          accessibilityLabel="Customer email"
                          style={styles.input}
                        />
                        <View style={styles.buttonRow}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={updateContact.isPending}
                            onPress={() => setContactOpen(false)}
                            style={({ pressed }) => [
                              styles.button,
                              styles.grow,
                              pressed && styles.pressed,
                              updateContact.isPending && styles.disabled,
                            ]}
                          >
                            <Text style={styles.buttonText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void onSaveContact()}
                            disabled={updateContact.isPending}
                            style={({ pressed }) => [
                              styles.primary,
                              styles.grow,
                              pressed && styles.primaryPressed,
                              updateContact.isPending && styles.disabled,
                            ]}
                          >
                            <Text style={styles.primaryText}>
                              {updateContact.isPending ? "Saving…" : "Save"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={openContact}
                        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                      >
                        <Text style={styles.buttonText}>Fix contact details</Text>
                      </Pressable>
                    )}

                    <Pressable
                      accessibilityRole="button"
                      onPress={onVoid}
                      disabled={voidInvoice.isPending}
                      style={({ pressed }) => [
                        styles.button,
                        pressed && styles.pressed,
                        voidInvoice.isPending && styles.disabled,
                      ]}
                    >
                      <Text style={styles.dangerText}>Void</Text>
                    </Pressable>
                  </>
                ) : null}

                {payUrl !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => open(payUrl, setActionNotice)}
                    style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                  >
                    <Text style={styles.buttonText}>Open pay page</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Section>
        ) : null}

        {canDelete ? (
          <View style={styles.section}>
            <Notice text={dangerNotice} />
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
              <Text style={styles.dangerText}>Delete invoice</Text>
            </Pressable>
          </View>
        ) : null}
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

  jobRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },

  fieldLabel: { ...type.micro, color: color.faint },

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
  itemQty: { ...type.micro, color: color.faint },
  paymentMeta: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  refunded: { ...type.micro, color: color.danger },

  money: { ...type.body, color: color.ink, fontVariant: ["tabular-nums"] },
  moneyBig: {
    fontFamily: font.bodySemi,
    fontSize: 17,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  moneyDue: { color: color.brandDeep },
  moneyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },

  rewardStatus: { ...type.micro, color: color.muted },
  rewardStatusGood: { color: color.good },
  rewardStatusHot: { color: color.brandDeep },

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

  cashCard: {
    gap: space.sm,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.bg,
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
    backgroundColor: color.surface,
  },

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
