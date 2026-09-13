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
import type { QueryKey } from "@tanstack/react-query";
import {
  ESTIMATE_TYPE_LABEL,
  fmtEt,
  fmtMoney,
  type EstimateStatus,
} from "@urso/types";
import { API_BASE, estimateActions } from "@/api";
import { DeliverySheet, type DeliveryChannels } from "@/components/delivery-sheet";
import { RecurringSheet } from "@/components/recurring-sheet";
import { Mark, NextStep } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { keys, useEstimate, useInvoices, useJobs } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

type PreviewTab = "from" | "to" | "job";

const STATUS_COPY: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Submitted",
  viewed: "Viewed",
  approved: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return <View style={styles.goodNotice}><Text style={styles.goodNoticeText}>{text}</Text></View>;
}

function PreviewTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.previewTab, active && styles.previewTabOn]}>
      <Text style={[styles.previewTabText, active && styles.previewTabTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Accordion({
  title,
  open,
  onPress,
  children,
}: {
  title: string;
  open: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={styles.accordionHead}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={28} color={color.brand} />
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function ActionTile({
  label,
  icon,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, disabled && styles.actionTileDisabled, pressed && styles.actionTilePressed]}
    >
      <Feather name={icon} size={23} color={disabled ? color.faint : danger ? color.danger : color.muted} />
      <Text style={[styles.actionTileText, danger && styles.actionTileDanger, disabled && styles.actionTileTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export default function EstimatePreviewScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const estimateQuery = useEstimate(id);
  // Approval creates the work order silently; the preview has to be able to
  // point at it (and at the bill once the job is done), or the owner reads
  // "Accepted" with a dead Convert button as "I can't convert this". There is
  // no per-estimate job read, so both come from the cached lists.
  const jobsQuery = useJobs();
  const invoicesQuery = useInvoices();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([estimateQuery.refetch(), jobsQuery.refetch(), invoicesQuery.refetch()]),
  );
  const estimate = estimateQuery.data ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("job");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [good, setGood] = useState<string | null>(null);
  const toast = useToast();

  const quoteKeys: QueryKey[] = [keys.estimateOne(id), keys.estimates()];
  const send = useAction<DeliveryChannels, Record<string, unknown>>(
    (channels) => estimateActions.send(id, { channels }),
    { invalidates: quoteKeys },
  );
  const approve = useAction<void, { jobId?: string | null; notice?: string }>(
    () => estimateActions.approveInPerson(id),
    { invalidates: [...quoteKeys, keys.jobs.all(), ["owner", "schedule"], keys.schedule.unscheduled(), keys.overview()] },
  );
  const duplicate = useAction<void, { estimateId?: string }>(() => estimateActions.duplicate(id), { invalidates: [keys.estimates()] });
  const convert = useAction<void, { invoiceId?: string; jobId?: string | null; notice?: string }>(
    () => estimateActions.convertToInvoice(id),
    { invalidates: [...quoteKeys, keys.jobs.all(), keys.invoices(), ["owner", "schedule"], keys.schedule.unscheduled(), keys.overview()] },
  );
  const voidEstimate = useAction<void, Record<string, never>>(() => estimateActions.void(id), { invalidates: quoteKeys });
  const deleteEstimate = useAction<void, Record<string, never>>(() => estimateActions.delete(id), { invalidates: [keys.estimates()] });
  const busy = send.isPending || approve.isPending || duplicate.isPending || voidEstimate.isPending || deleteEstimate.isPending || convert.isPending;

  if (estimateQuery.isPending) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={color.brand} /></View>;
  }

  if (estimate === null) {
    return (
      <View style={styles.loading}>
        <Notice text={noticeFrom(estimateQuery.error) ?? "Estimate not found."} />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  const customerUrl = `${API_BASE}/CanesPressure/e/${estimate.public_token}`;
  const sendNow = async (channels: DeliveryChannels) => {
    setNotice(null); setGood(null);
    const result = await send.mutateAsync(channels);
    if (!result.ok) setNotice(result.notice);
    else setGood(successNotice(result.data) ?? "Estimate sent.");
    setDeliveryOpen(false);
  };
  const approveNow = () => {
    setMenuOpen(false);
    Alert.alert("Accept this estimate?", "This records the customer's approval and creates the work order. You'll land on it next.", [
      { text: "Not yet", style: "cancel" },
      {
        text: "Accept",
        onPress: () => void (async () => {
          const result = await approve.mutateAsync();
          if (!result.ok) {
            setNotice(result.notice);
            return;
          }
          // Only the old, unqualified success names the web schedule tray.
          // Keep deposit warnings and every other server notice verbatim.
          const approvalNotice = successNotice(result.data);
          toast.show(
            approvalNotice === "Approved — the job is in the schedule tray."
              ? "Approved — the work order is under Unscheduled."
              : approvalNotice ?? "Accepted — job created.",
          );
          const jobId = result.data.jobId;
          if (typeof jobId === "string") {
            router.push({ pathname: "/(owner)/job/[id]", params: { id: jobId } });
          }
        })(),
      },
    ]);
  };
  const convertNow = () => {
    setMenuOpen(false);
    const accepted = estimate?.status === "approved";
    Alert.alert(
      "Convert to invoice?",
      accepted
        ? "This creates the bill from the work order. You'll land on it to send or record a payment."
        : "This accepts the estimate, creates its work order, and creates the bill in one step. You'll land on the invoice.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Convert",
          onPress: () => void (async () => {
            const result = await convert.mutateAsync();
            if (!result.ok) {
              setNotice(result.notice);
              return;
            }
            toast.show(successNotice(result.data) ?? "Invoice created.");
            const invoiceId = result.data.invoiceId;
            if (typeof invoiceId === "string") {
              router.push({ pathname: "/(owner)/invoice/[id]", params: { id: invoiceId } });
            }
          })(),
        },
      ],
    );
  };
  const voidNow = () => {
    setMenuOpen(false);
    Alert.alert("Cancel this estimate?", "The customer will no longer be able to approve it.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel estimate",
        style: "destructive",
        onPress: () => void (async () => {
          const result = await voidEstimate.mutateAsync();
          if (!result.ok) setNotice(result.notice);
          else setGood("Estimate canceled.");
        })(),
      },
    ]);
  };
  const duplicateNow = async () => {
    const result = await duplicate.mutateAsync();
    if (!result.ok) {
      setNotice(result.notice);
      setMenuOpen(false);
      return;
    }
    const nextId = typeof result.data.estimateId === "string" ? result.data.estimateId : null;
    setMenuOpen(false);
    if (nextId) router.replace({ pathname: "/(owner)/estimate/new", params: { id: nextId } });
  };
  const shareNow = async () => {
    try {
      await Share.share({ message: customerUrl });
    } catch {
      setNotice("This phone couldn’t share the estimate link.");
    }
    setMenuOpen(false);
  };
  const deleteNow = () => {
    setMenuOpen(false);
    Alert.alert("Delete estimate?", "This cannot be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void (async () => {
          const result = await deleteEstimate.mutateAsync();
          if (!result.ok) setNotice(result.notice);
          else router.replace("/(owner)/estimates");
        })(),
      },
    ]);
  };

  const statusGood = estimate.status === "approved";
  const statusBad = estimate.status === "declined" || estimate.status === "expired";
  const canEdit = estimate.status === "draft";
  const canSend = estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed";
  const canApprove = canSend;
  // Mirrors deleteEstimate: drafts outright, canceled (stored as `expired`)
  // after the fact. Approved and declined refuse server-side — hide, don't grey.
  const canDelete = estimate.status === "draft" || estimate.status === "expired";

  // The work order this quote became, and the bill that job minted.
  const job = statusGood ? (jobsQuery.data ?? []).find((j) => j.estimate_id === estimate.id) ?? null : null;
  const invoice = job ? (invoicesQuery.data ?? []).find((i) => i.job_id === job.id && i.status !== "void") ?? null : null;
  const openJob = () => {
    setMenuOpen(false);
    if (job) router.push({ pathname: "/(owner)/job/[id]", params: { id: job.id } });
  };
  const openInvoice = () => {
    setMenuOpen(false);
    if (invoice) router.push({ pathname: "/(owner)/invoice/[id]", params: { id: invoice.id } });
  };
  // What the forward strip says once the quote is accepted: the job's own
  // next step, so the preview never ends in a dead "Accepted".
  const forward = !statusGood
    ? null
    : job === null
      ? jobsQuery.isPending
        ? null
        : { label: "Work order missing", hint: "This estimate is accepted but no work order was found. Pull to refresh.", icon: "alert-circle" as const, onPress: onRefresh }
      : invoice !== null
        ? { label: "Open the invoice", hint: `${invoice.number} · ${invoice.status === "paid" ? "Paid" : "Balance due"}`, icon: "file-text" as const, onPress: openInvoice }
        : job.scheduled_at === null && job.status !== "canceled"
          ? { label: "Open the work order", hint: "Created when this quote was accepted. Not on the calendar yet.", icon: "briefcase" as const, onPress: openJob }
          : { label: "Open the work order", hint: `Created when this quote was accepted · ${job.status === "canceled" ? "Canceled" : fmtEt(job.scheduled_at as string, { weekday: "short", month: "short", day: "numeric" })}`, icon: "briefcase" as const, onPress: openJob };

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: color.chrome }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={31} color={color.brand} />
          <Text style={styles.headerTitle}>PREVIEW</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Home" onPress={() => router.push("/(owner)")} style={styles.headerIcon}><Feather name="home" size={25} color={color.muted} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Estimate actions" onPress={() => setMenuOpen(true)} style={styles.headerIcon}><Feather name="more-vertical" size={27} color={color.muted} /></Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 80 }]}
      >
        {notice !== null ? <Notice text={notice} /> : null}
        <GoodNotice text={good} />
        {forward ? <NextStep label={forward.label} hint={forward.hint} icon={forward.icon} onPress={forward.onPress} /> : null}

        <View style={styles.identity}>
          <View style={styles.identityMark}>
            <Mark size={100} />
            <View style={[styles.statusBadge, statusGood && styles.statusBadgeGood, statusBad && styles.statusBadgeBad]}>
              <Text style={[styles.statusBadgeText, statusGood && styles.statusBadgeTextGood, statusBad && styles.statusBadgeTextBad]}>{STATUS_COPY[estimate.status]}</Text>
            </View>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>{ESTIMATE_TYPE_LABEL[estimate.estimate_type]} Estimate</Text>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Estimate #</Text><Text style={styles.identityValue}>{estimate.number}</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Estimate Date</Text><Text style={styles.identityValue}>{fmtEt(estimate.created_at, { month: "short", day: "2-digit", year: "numeric" })}</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Expiry Date</Text><Text style={styles.identityValue}>{estimate.expires_at ? fmtEt(estimate.expires_at, { month: "short", day: "2-digit", year: "numeric" }) : "No expiry"}</Text></View>
          </View>
        </View>

        <View style={styles.dividerBand} />

        <View style={styles.partyBlock}>
          <View style={styles.previewTabs}>
            <PreviewTabButton label="From" active={tab === "from"} onPress={() => setTab("from")} />
            <PreviewTabButton label="To" active={tab === "to"} onPress={() => setTab("to")} />
            <PreviewTabButton label="Job Details" active={tab === "job"} onPress={() => setTab("job")} />
          </View>
          {tab === "from" ? (
            <View style={styles.partyCopy}><Text style={styles.partyName}>Canes Pressure Washing</Text><Text style={styles.partyText}>Professional exterior cleaning</Text></View>
          ) : null}
          {tab === "to" ? (
            <View style={styles.partyCopy}><Text style={styles.partyName}>{estimate.customer_name ?? "Customer"}</Text><Text style={styles.partyText}>{estimate.customer_email || estimate.customer_phone || "No contact details"}</Text></View>
          ) : null}
          {tab === "job" ? (
            <View style={styles.partyCopy}><Text style={styles.partyName}>{estimate.customer_name ?? "Customer"}</Text>{estimate.job_name ? <Text style={styles.partyText}>{estimate.job_name}</Text> : null}<Text style={styles.partyText}>{estimate.job_address || "No job location"}</Text></View>
          ) : null}
        </View>

        <View style={styles.dividerBand} />

        <View style={styles.services}>
          <Text style={styles.servicesTitle}>Services</Text>
          <View style={styles.tableHead}>
            <Text style={styles.colQty}>Qty</Text><Text style={styles.colPrice}>Price</Text><Text style={styles.colDsc}>Dsc</Text><Text style={styles.colTax}>Tax</Text><Text style={styles.colTotal}>Total</Text>
          </View>
          {estimate.items.length === 0 ? <Text style={styles.noItems}>No services on this estimate.</Text> : null}
          {estimate.items.map((item) => (
            <View key={item.id} style={styles.serviceRow}>
              <Text style={styles.serviceName}>{item.name}</Text>
              <View style={styles.serviceFigures}>
                <Text style={styles.colQty}>{item.quantity.toFixed(2)}</Text>
                <Text style={styles.colPrice}>{fmtMoney(item.unit_price_cents)}</Text>
                <Text style={styles.colDsc}>{fmtMoney(item.discount_cents)}</Text>
                <Text style={styles.colTax}>{item.taxable ? "Tax" : "$0.00"}</Text>
                <Text style={styles.colTotal}>{fmtMoney(item.line_total_cents)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.totalRows}>
            <View style={styles.totalRow}><Text style={styles.totalRowLabel}>Subtotal (without tax)</Text><Text style={styles.totalRowValue}>{fmtMoney(estimate.subtotal_cents + estimate.adjustment_cents)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalRowLabel}>Taxes</Text><Text style={styles.totalRowValue}>{fmtMoney(estimate.tax_cents)}</Text></View>
          </View>
          <View style={styles.grandTotal}><Text style={styles.grandTotalLabel}>Grand Total</Text><Text style={styles.grandTotalValue}>{fmtMoney(estimate.total_cents)}</Text></View>
        </View>

        <Accordion title="Accepted Payment Methods" open={paymentOpen} onPress={() => setPaymentOpen((value) => !value)}>
          <Text style={styles.accordionText}>Card, cash, or another method agreed with Canes Pressure Washing.</Text>
        </Accordion>
        <Accordion title="Message" open={messageOpen} onPress={() => setMessageOpen((value) => !value)}>
          <Text style={styles.accordionText}>{estimate.message_to_customer || "No customer message."}</Text>
        </Accordion>
        <Accordion title="Terms" open={termsOpen} onPress={() => setTermsOpen((value) => !value)}>
          <Text style={styles.accordionText}>{estimate.terms || "No terms added."}</Text>
        </Accordion>
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="Estimate actions" onPress={() => setMenuOpen(true)} style={styles.cornerAction}>
        <Feather name="more-horizontal" size={27} color={color.surface} />
      </Pressable>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.sheetScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} style={styles.sheetClose}>
              <View style={styles.sheetHandle} />
            </Pressable>
            {busy ? <ActivityIndicator color={color.brand} style={styles.busy} /> : null}
            {/* Only tiles that can do something right now. A greyed tile is a
                question ("why can't I?") the sheet can't answer; a missing one
                is just not an option. Accepting IS converting to a work order,
                so it is one tile with one name; once accepted, the tile becomes
                the door to that work order (and to its invoice, once minted). */}
            <View style={styles.actionGrid}>
              {canEdit ? <ActionTile label="Edit" icon="edit-3" disabled={busy} onPress={() => { setMenuOpen(false); router.push({ pathname: "/(owner)/estimate/new", params: { id, draftKey: String(Date.now()) } }); }} /> : null}
              {canSend ? <ActionTile label={estimate.sent_at ? "Re-Send" : "Send"} icon="send" disabled={busy} onPress={() => { setMenuOpen(false); setDeliveryOpen(true); }} /> : null}
              {canApprove ? <ActionTile label="Accept & Create Work Order" icon="briefcase" disabled={busy} onPress={approveNow} /> : null}
              {job ? <ActionTile label="Open Work Order" icon="briefcase" disabled={busy} onPress={openJob} /> : null}
              {invoice ? (
                <ActionTile label="Open Invoice" icon="file-text" disabled={busy} onPress={openInvoice} />
              ) : canApprove || statusGood ? (
                <ActionTile label="Convert To Invoice" icon="file-text" disabled={busy} onPress={convertNow} />
              ) : null}
              {!statusBad ? <ActionTile label="Make It Recurring" icon="repeat" disabled={busy} onPress={() => { setMenuOpen(false); setRecurringOpen(true); }} /> : null}
              <ActionTile label="Clone Estimate" icon="copy" disabled={busy} onPress={() => void duplicateNow()} />
              <ActionTile label="Share Estimate Link" icon="link" disabled={busy} onPress={() => void shareNow()} />
              {canSend ? <ActionTile label="Cancel Estimate" icon="slash" danger disabled={busy} onPress={voidNow} /> : null}
              {canDelete ? <ActionTile label="Delete Estimate" icon="trash-2" danger disabled={busy} onPress={deleteNow} /> : null}
            </View>
          </View>
        </View>
      </Modal>

      {recurringOpen ? (
        <RecurringSheet
          source={{ kind: "estimate", id, jobId: job?.id }}
          pricePerVisitCents={estimate.total_cents}
          customerName={estimate.customer_name}
          onClose={() => setRecurringOpen(false)}
        />
      ) : null}

      <DeliverySheet
        visible={deliveryOpen}
        documentLabel="estimate"
        phone={estimate.customer_phone}
        email={estimate.customer_email}
        sending={send.isPending}
        onClose={() => { if (!send.isPending) setDeliveryOpen(false); }}
        onSend={(channels) => void sendNow(channels)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: color.surface, padding: 24 },
  backButton: { minHeight: HIT, minWidth: 180, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: color.bg },
  backButtonText: { ...type.title, color: color.ink },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBack: { minHeight: HIT, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { fontFamily: font.bodyMedium, fontSize: 19, letterSpacing: 1.2, color: color.ink },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 1 },
  goodNotice: { marginHorizontal: 16, marginVertical: 6, padding: 12, borderRadius: radius.md, backgroundColor: color.goodBg },
  goodNoticeText: { ...type.small, color: color.good },
  identity: { minHeight: 250, paddingHorizontal: 18, paddingVertical: 30, flexDirection: "row", alignItems: "center", gap: 22 },
  identityMark: { width: 112, alignItems: "center", gap: 16 },
  statusBadge: { minWidth: 108, minHeight: 30, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: color.brandSoft },
  statusBadgeGood: { backgroundColor: color.goodBg },
  statusBadgeBad: { backgroundColor: color.dangerBg },
  statusBadgeText: { ...type.rule, color: color.brandDeep },
  statusBadgeTextGood: { color: color.good },
  statusBadgeTextBad: { color: color.danger },
  identityCopy: { flex: 1, gap: 13 },
  identityTitle: { fontFamily: font.bodySemi, fontSize: 23, color: color.ink, marginBottom: 5 },
  identityLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  identityLabel: { flex: 1, fontFamily: font.body, fontSize: 14, color: color.muted },
  identityValue: { fontFamily: font.bodyMedium, fontSize: 14, color: color.ink, textAlign: "right" },
  dividerBand: { height: 12, backgroundColor: color.hover },
  partyBlock: { minHeight: 300, paddingHorizontal: 18, paddingVertical: 48 },
  previewTabs: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 45 },
  previewTab: { minHeight: 43, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: color.hover },
  previewTabOn: { backgroundColor: color.brandFill },
  previewTabText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.muted },
  previewTabTextOn: { color: color.surface },
  partyCopy: { gap: 14 },
  partyName: { fontFamily: font.bodySemi, fontSize: 20, color: color.brandDeep, textDecorationLine: "underline", textDecorationColor: color.lineStrong },
  partyText: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  services: { paddingTop: 46 },
  servicesTitle: { fontFamily: font.bodySemi, fontSize: 28, color: color.ink, paddingHorizontal: 18, marginBottom: 24 },
  tableHead: { height: 42, marginHorizontal: 18, flexDirection: "row", alignItems: "center", backgroundColor: color.hover, borderRadius: radius.sm },
  colQty: { width: "15%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colPrice: { width: "22%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colDsc: { width: "20%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colTax: { width: "18%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colTotal: { width: "25%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  noItems: { ...type.body, color: color.muted, textAlign: "center", padding: 30 },
  serviceRow: { marginHorizontal: 18, paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  serviceName: { fontFamily: font.bodyMedium, fontSize: 20, color: color.ink, marginBottom: 17 },
  serviceFigures: { flexDirection: "row", alignItems: "center" },
  totalRows: { paddingHorizontal: 18, paddingVertical: 24, gap: 22 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 },
  totalRowLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 18, color: color.ink },
  totalRowValue: { fontFamily: font.bodyMedium, fontSize: 17, color: color.ink },
  grandTotal: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.hover },
  grandTotalLabel: { fontFamily: font.bodySemi, fontSize: 22, color: color.ink },
  grandTotalValue: { fontFamily: font.bodySemi, fontSize: 25, color: color.ink },
  accordion: { borderBottomWidth: 12, borderBottomColor: color.hover },
  accordionHead: { minHeight: 96, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accordionTitle: { flex: 1, fontFamily: font.bodySemi, fontSize: 21, color: color.ink },
  accordionBody: { paddingHorizontal: 18, paddingBottom: 24 },
  accordionText: { ...type.body, color: color.muted },
  cornerAction: { position: "absolute", right: 0, bottom: 0, width: 76, height: 76, paddingTop: 30, paddingLeft: 28, backgroundColor: color.brandFill, borderTopLeftRadius: 76 },
  sheetScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  actionSheet: { maxHeight: "78%", backgroundColor: color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10 },
  sheetClose: { minHeight: 30, alignItems: "center", justifyContent: "flex-start" },
  sheetHandle: { width: 52, height: 5, borderRadius: 3, backgroundColor: color.lineStrong },
  busy: { marginBottom: 10 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionTile: { flexBasis: "47%", flexGrow: 1, minHeight: 74, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md, backgroundColor: color.hover },
  actionTilePressed: { backgroundColor: color.brandWash },
  actionTileDisabled: { opacity: 0.42 },
  actionTileText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: color.ink },
  actionTileDanger: { color: color.danger },
  actionTileTextDisabled: { color: color.faint },
});
