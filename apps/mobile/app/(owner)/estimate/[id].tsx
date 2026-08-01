// The quote — everything about one estimate on one screen.
//
// Sebastian opens this standing in the driveway the quote is about. The
// customer card sits at the top because "who is this and how do I reach them"
// is the first question; the lines and totals are the quote itself; the journey
// strip answers "did they see it yet"; and the one thing the phone adds over
// the web is APPROVE IN PERSON — the handshake moment, captured on the spot.
//
// This screen READS the quote; shaping it is the builder's job, one tap away
// under the totals (draft only — the action refuses anything else). Expiry,
// message and terms are still web-only surfaces.
//
// Money is integer cents formatted with fmtMoney; nothing here computes. Every
// timestamp is America/New_York via fmtEt. Mutation refusals are the server's
// own sentences, shown verbatim in the section where the tap happened — and so
// are the QUALIFIED successes ("Approved — but the deposit could NOT be
// recorded…"), which on a money screen matter even more.

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
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueryKey } from "@tanstack/react-query";
import {
  ESTIMATE_STATUS_LABEL,
  ESTIMATE_TYPE_LABEL,
  fmtEt,
  fmtMoney,
  fmtPhone,
  PAYMENT_METHOD_LABEL,
  type EstimateItem,
} from "@urso/types";
import { estimateActions } from "@/api";
import { Avatar } from "@/components/avatar";
import { NavigateButton } from "@/components/navigate";
import { Notice } from "@/components/notice";
import { keys, useEstimate } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Success payloads may carry a sentence of their own (apiResult keeps ok:true
// notices — several are qualified successes, not confirmations). Extract it
// without claiming a shape the action types don't promise.
function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

// The green sibling of Notice — same shape, good colours — for the ok:true
// sentences ("Texted the estimate.", "Approved — job created.").
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

// The micro line under an item name: quantity plus the option/mandatory
// markers the builder set. A mandatory line can never be toggled off; an
// unselected option is priced but not in the total.
function itemMarkers(item: EstimateItem): string {
  const parts = [`Qty ${item.quantity}`];
  if (item.is_mandatory) parts.push("Required");
  else if (item.is_option) parts.push(item.is_selected ? "Option" : "Option — not selected");
  return parts.join(" · ");
}

export default function EstimateScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // Like job/[id], no focus refetch — pull-to-refresh is the reader's explicit
  // refresh on a pushed detail screen.
  const estimateQuery = useEstimate(id);
  const { refreshing, onRefresh } = usePullToRefresh(estimateQuery.refetch);

  const quoteKeys: QueryKey[] = [keys.estimateOne(id), keys.estimates()];
  // Approval fans out: it creates a job (schedule tray), may record a deposit,
  // promotes the lead to won, and upserts the contact. The new job's id is
  // unknown here, so instead of a jobs.one key the whole schedule prefix and
  // the tray key are invalidated — the tray is its own root, NOT under the
  // schedule prefix, so it is named explicitly.
  const approveEverywhere: QueryKey[] = [
    ...quoteKeys,
    ["owner", "schedule"],
    keys.schedule.unscheduled(),
    keys.leads.all(),
    keys.customers.all(),
    keys.overview(),
    keys.agenda(),
  ];

  // Zero-payload actions get explicit generics: a zero-arg fn gives TVars no
  // inference site, and `unknown` there would make mutateAsync demand an
  // argument.
  const send = useAction<void, Record<string, never>>(() => estimateActions.send(id), {
    invalidates: quoteKeys,
  });
  const approve = useAction(
    (vars: { depositCollected: boolean; depositMethod?: string }) =>
      estimateActions.approveInPerson(id, vars),
    { invalidates: approveEverywhere },
  );
  const voidQuote = useAction<void, Record<string, never>>(() => estimateActions.void(id), {
    invalidates: quoteKeys,
  });
  const del = useAction<void, Record<string, never>>(() => estimateActions.delete(id), {
    invalidates: quoteKeys,
  });

  // One refusal surface per section, so the sentence lands next to the tap
  // that earned it instead of at the top of a long scroll.
  const [customerNotice, setCustomerNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [goodNotice, setGoodNotice] = useState<string | null>(null);
  const [dangerNotice, setDangerNotice] = useState<string | null>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [depositCollected, setDepositCollected] = useState(false);
  const [depositMethod, setDepositMethod] = useState("cash");

  const estimate = estimateQuery.data ?? null;
  const notice = noticeFrom(estimateQuery.error);
  const loading = estimateQuery.isPending;

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
        {estimate?.number ?? "Estimate"}
      </Text>
      {estimate ? (
        <Text style={styles.chromeMeta}>
          {ESTIMATE_STATUS_LABEL[estimate.status]}
          {estimate.estimate_type !== "standard"
            ? ` · ${ESTIMATE_TYPE_LABEL[estimate.estimate_type]}`
            : ""}
        </Text>
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

  if (!estimate) {
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

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setCustomerNotice("This phone couldn't open that."));
  };

  const goCustomer = () => {
    if (estimate.contact_id === null) return;
    router.push({ pathname: "/(owner)/customer/[id]", params: { id: estimate.contact_id } });
  };

  const onSend = async () => {
    setActionNotice(null);
    setGoodNotice(null);
    const r = await send.mutateAsync();
    if (!r.ok) setActionNotice(r.notice);
    // The success sentence is often qualified ("Text queued for after quiet
    // hours; emailed now.") — show exactly what the server said happened.
    else setGoodNotice(successNotice(r.data) ?? "Estimate sent.");
  };

  // The driveway flow, step one: the confirm. The follow-up questions only
  // appear after Sebastian says the handshake actually happened.
  const onApproveToggle = () => {
    if (approveOpen) {
      setApproveOpen(false);
      return;
    }
    Alert.alert("Customer agreed in person?", "This approves the estimate and creates the job.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        onPress: () => {
          setActionNotice(null);
          setGoodNotice(null);
          setDepositCollected(false);
          setDepositMethod("cash");
          setApproveOpen(true);
        },
      },
    ]);
  };

  const onApprove = async () => {
    setActionNotice(null);
    setGoodNotice(null);
    const r = await approve.mutateAsync({
      depositCollected,
      depositMethod: depositCollected ? depositMethod : undefined,
    });
    if (!r.ok) setActionNotice(r.notice);
    else {
      setApproveOpen(false);
      // The server explains what happened — deposit recorded, or the deposit
      // button now live on the customer's link. Never paraphrase it.
      setGoodNotice(successNotice(r.data) ?? "Approved — job created.");
    }
  };

  const onVoid = () => {
    Alert.alert(
      "Void this estimate?",
      "The customer can no longer approve it, and pending reminders are canceled.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Void",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDangerNotice(null);
              const r = await voidQuote.mutateAsync();
              if (!r.ok) setDangerNotice(r.notice);
            })();
          },
        },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert("Delete estimate?", undefined, [
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

  // Live = the customer could still say yes. Approve-in-person shows for BOTH
  // even though the action refuses options/packages estimates — that refusal is
  // a sentence written for the owner, and the screen shows it rather than
  // second-guessing the rule client-side.
  const live = estimate.status === "sent" || estimate.status === "viewed";
  const journeyEmpty =
    estimate.sent_at === null &&
    estimate.viewed_at === null &&
    estimate.approved_at === null &&
    estimate.declined_at === null &&
    estimate.signature_name === null;
  const showActions = estimate.status === "draft" || live || estimate.status === "approved";

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
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
            accessibilityRole={estimate.contact_id !== null ? "button" : undefined}
            accessibilityLabel={
              estimate.contact_id !== null
                ? `Open customer ${estimate.customer_name ?? ""}`.trim()
                : undefined
            }
            onPress={estimate.contact_id !== null ? goCustomer : undefined}
            style={({ pressed }) => [
              styles.card,
              styles.customer,
              pressed && estimate.contact_id !== null && styles.cardPressed,
            ]}
          >
            <Avatar name={estimate.customer_name} />
            <View style={styles.customerBody}>
              <Text style={styles.customerName} numberOfLines={1}>
                {estimate.customer_name ?? "No customer"}
              </Text>
              {estimate.customer_phone !== null ? (
                <Text style={styles.customerPhone}>{fmtPhone(estimate.customer_phone)}</Text>
              ) : null}
              {estimate.job_address !== null ? (
                <>
                  <Text style={styles.customerAddress} numberOfLines={2}>
                    {estimate.job_address}
                  </Text>
                  {/* Its own Pressable, like the call glyph below — opening
                      Maps must never also push the customer screen. */}
                  <View style={styles.navigate}>
                    <NavigateButton address={estimate.job_address} onFail={setCustomerNotice} />
                  </View>
                </>
              ) : null}
            </View>
            {estimate.customer_phone !== null ? (
              // Its own Pressable so dialling never also navigates — the inner
              // responder wins and the card press does not fire.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                onPress={() => open(`tel:${estimate.customer_phone}`)}
                style={({ pressed }) => [styles.phoneGlyph, pressed && styles.phoneGlyphPressed]}
              >
                <Feather name="phone" size={18} color={color.brandDeep} />
              </Pressable>
            ) : null}
            {estimate.contact_id !== null ? (
              <Feather name="chevron-right" size={20} color={color.faint} />
            ) : null}
          </Pressable>
          <Notice text={customerNotice} />
        </Section>

        <Section label="Lines">
          <View style={styles.card}>
            {estimate.items.length > 0 ? (
              estimate.items.map((item, index) => {
                // An unselected option renders muted, like the web's excluded
                // options: priced on the page, absent from the total.
                const excluded = item.is_option && !item.is_selected && !item.is_mandatory;
                return (
                  <View key={item.id} style={[styles.itemRow, index > 0 && styles.divided]}>
                    <View style={styles.itemMain}>
                      <Text style={[styles.body, excluded && styles.itemExcluded]}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemQty}>{itemMarkers(item)}</Text>
                    </View>
                    <Text style={[styles.money, excluded && styles.itemExcluded]}>
                      {fmtMoney(item.line_total_cents)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.pad}>
                <Text style={styles.muted}>No line items on this estimate.</Text>
              </View>
            )}

            <View style={[styles.pad, styles.divided]}>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Subtotal</Text>
                <Text style={styles.money}>{fmtMoney(estimate.subtotal_cents)}</Text>
              </View>
              {estimate.discount_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Discount</Text>
                  <Text style={styles.money}>{fmtMoney(estimate.discount_cents)}</Text>
                </View>
              ) : null}
              {estimate.adjustment_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Adjustment</Text>
                  <Text style={styles.money}>{fmtMoney(estimate.adjustment_cents)}</Text>
                </View>
              ) : null}
              {estimate.tax_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Tax</Text>
                  <Text style={styles.money}>{fmtMoney(estimate.tax_cents)}</Text>
                </View>
              ) : null}
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Total</Text>
                <Text style={styles.moneyBig}>{fmtMoney(estimate.total_cents)}</Text>
              </View>
              {estimate.deposit_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Deposit due on approval</Text>
                  <Text style={styles.money}>{fmtMoney(estimate.deposit_cents)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Directly under the numbers it changes — where a reader who has
              just read the total looks to change it. Draft only: the builder's
              saveItems refuses anything else, and offering a door that always
              refuses is not an offer. */}
          {estimate.status === "draft" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit lines and pricing"
              onPress={() =>
                router.push({ pathname: "/(owner)/estimate/build", params: { id: estimate.id } })
              }
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>Edit lines &amp; pricing</Text>
            </Pressable>
          ) : null}
        </Section>

        <Section label="Journey">
          <View style={styles.card}>
            <View style={styles.pad}>
              {journeyEmpty ? <Text style={styles.muted}>Not sent yet.</Text> : null}
              {estimate.sent_at !== null ? (
                <Field label="Sent" value={fmtEt(estimate.sent_at)} />
              ) : null}
              {estimate.viewed_at !== null ? (
                <Field label="Viewed" value={fmtEt(estimate.viewed_at)} />
              ) : null}
              {estimate.approved_at !== null ? (
                <Field label="Approved" value={fmtEt(estimate.approved_at)} />
              ) : null}
              {estimate.declined_at !== null ? (
                <Field label="Declined" value={fmtEt(estimate.declined_at)} />
              ) : null}
              {estimate.decline_reason !== null ? (
                <Field label="Reason" value={estimate.decline_reason} />
              ) : null}
              {estimate.signature_name !== null ? (
                <Field label="Signature" value={estimate.signature_name} />
              ) : null}
            </View>
          </View>
        </Section>

        {showActions ? (
          <Section label="Actions">
            <View style={styles.card}>
              <View style={[styles.pad, styles.actions]}>
                <GoodNotice text={goodNotice} />
                <Notice text={actionNotice} />

                {estimate.status === "draft" ? (
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
                    <Text style={styles.primaryText}>Send estimate</Text>
                  </Pressable>
                ) : null}

                {live ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={onApproveToggle}
                      style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
                    >
                      <Text style={styles.primaryText}>Approve in person</Text>
                    </Pressable>

                    {approveOpen ? (
                      <View style={styles.approveCard}>
                        {estimate.deposit_cents > 0 ? (
                          <>
                            <Text style={styles.fieldLabel}>
                              Deposit — {fmtMoney(estimate.deposit_cents)} due. Already collected?
                            </Text>
                            <View style={styles.methodRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: !depositCollected }}
                                onPress={() => setDepositCollected(false)}
                                style={[styles.method, !depositCollected && styles.methodOn]}
                              >
                                <Text
                                  style={[
                                    styles.buttonText,
                                    !depositCollected && styles.methodTextOn,
                                  ]}
                                >
                                  Not yet
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: depositCollected }}
                                onPress={() => setDepositCollected(true)}
                                style={[styles.method, depositCollected && styles.methodOn]}
                              >
                                <Text
                                  style={[
                                    styles.buttonText,
                                    depositCollected && styles.methodTextOn,
                                  ]}
                                >
                                  Collected
                                </Text>
                              </Pressable>
                            </View>
                            {depositCollected ? (
                              <>
                                <Text style={styles.fieldLabel}>Method</Text>
                                <View style={styles.methodRow}>
                                  {Object.entries(PAYMENT_METHOD_LABEL).map(([method, label]) => (
                                    <Pressable
                                      key={method}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Method ${label}`}
                                      accessibilityState={{ selected: depositMethod === method }}
                                      onPress={() => setDepositMethod(method)}
                                      style={[
                                        styles.method,
                                        depositMethod === method && styles.methodOn,
                                      ]}
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
                              </>
                            ) : null}
                          </>
                        ) : null}
                        <View style={styles.buttonRow}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setApproveOpen(false)}
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
                            onPress={() => void onApprove()}
                            disabled={approve.isPending}
                            style={({ pressed }) => [
                              styles.primary,
                              styles.grow,
                              pressed && styles.primaryPressed,
                              approve.isPending && styles.disabled,
                            ]}
                          >
                            <Text style={styles.primaryText}>
                              {approve.isPending ? "Approving…" : "Approve"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

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
                      <Text style={styles.buttonText}>Send again</Text>
                    </Pressable>
                  </>
                ) : null}

                {estimate.status === "approved" ? (
                  // The journey strip above carries the whole story (approved
                  // when, signed by whom). Changing an approved quote is not a
                  // phone job — the builder is a web surface.
                  <Text style={styles.muted}>
                    Approved — the job was created and is waiting in the schedule.
                  </Text>
                ) : null}
              </View>
            </View>
          </Section>
        ) : null}

        {live || estimate.status === "draft" || estimate.status === "expired" ? (
          <View style={styles.section}>
            <Notice text={dangerNotice} />
            {live ? (
              <Pressable
                accessibilityRole="button"
                onPress={onVoid}
                disabled={voidQuote.isPending}
                style={({ pressed }) => [
                  styles.danger,
                  pressed && styles.dangerPressed,
                  voidQuote.isPending && styles.disabled,
                ]}
              >
                <Text style={styles.dangerText}>Void estimate</Text>
              </Pressable>
            ) : null}
            {estimate.status === "draft" || estimate.status === "expired" ? (
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
                <Text style={styles.dangerText}>Delete estimate</Text>
              </Pressable>
            ) : null}
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
  cardPressed: { backgroundColor: color.hover },
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
  itemExcluded: { color: color.faint },
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

  approveCard: {
    gap: space.sm,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.bg,
  },
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
