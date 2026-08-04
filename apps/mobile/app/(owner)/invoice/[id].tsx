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
  invoiceBalanceCents,
  PAYMENT_METHOD_LABEL,
  type InvoiceStatus,
} from "@urso/types";
import { API_BASE, invoiceActions } from "@/api";
import { Mark } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { keys, useInvoice } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space } from "@/theme";

type PreviewTab = "from" | "to" | "job";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "DRAFT",
  sent: "SENT",
  viewed: "VIEWED",
  paid: "PAID",
  void: "VOID",
};

function dollarsToCents(value: string): number {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function GoodNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return <View style={styles.goodNotice}><Text style={styles.goodNoticeText}>{text}</Text></View>;
}

function PreviewTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.previewTab, active && styles.previewTabOn]}>
      <Text style={[styles.previewTabText, active && styles.previewTabTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Accordion({ title, open, onPress, children }: { title: string; open: boolean; onPress: () => void; children: React.ReactNode }) {
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
      style={({ pressed }) => [styles.actionTile, disabled && styles.disabled, pressed && styles.actionTilePressed]}
    >
      <Feather name={icon} size={23} color={disabled ? color.faint : danger ? color.danger : color.muted} />
      <Text style={[styles.actionTileText, danger && styles.actionTileDanger, disabled && styles.actionTileDisabledText]}>{label}</Text>
    </Pressable>
  );
}

export default function InvoicePreviewScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const invoiceQuery = useInvoice(id);
  const { refreshing, onRefresh } = usePullToRefresh(invoiceQuery.refetch);
  const invoice = invoiceQuery.data ?? null;

  const [tab, setTab] = useState<PreviewTab>("job");
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [cashText, setCashText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [good, setGood] = useState<string | null>(null);

  const invoiceKeys: QueryKey[] = [keys.invoiceOne(id), keys.invoices(), keys.overview()];
  const send = useAction<void, Record<string, never>>(() => invoiceActions.send(id), { invalidates: invoiceKeys });
  const recordCash = useAction((amountCents: number) => invoiceActions.recordCashPayment(id, amountCents), { invalidates: invoiceKeys });
  const voidInvoice = useAction<void, Record<string, never>>(() => invoiceActions.void(id), { invalidates: invoiceKeys });
  const deleteInvoice = useAction<void, Record<string, never>>(() => invoiceActions.delete(id), { invalidates: [keys.invoices(), keys.overview()] });
  const busy = send.isPending || recordCash.isPending || voidInvoice.isPending || deleteInvoice.isPending;

  if (invoiceQuery.isPending) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={color.brand} /></View>;
  }

  if (!invoice) {
    return (
      <View style={styles.loading}>
        <Notice text={noticeFrom(invoiceQuery.error) ?? "Invoice not found."} />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  const balance = invoiceBalanceCents(invoice);
  const statusGood = invoice.status === "paid";
  const statusBad = invoice.status === "void";
  const customerUrl = `${API_BASE}/CanesPressure/i/${invoice.public_token}`;

  const sendNow = async () => {
    setNotice(null);
    setGood(null);
    const result = await send.mutateAsync();
    if (!result.ok) setNotice(result.notice);
    else setGood(invoice.status === "draft" ? "Invoice sent." : "Invoice re-sent.");
    setMenuOpen(false);
  };

  const shareNow = async () => {
    try {
      await Share.share({ message: customerUrl });
    } catch {
      setNotice("This phone couldn’t share the invoice link.");
    }
    setMenuOpen(false);
  };

  const recordNow = async () => {
    const amount = dollarsToCents(cashText);
    if (amount <= 0) {
      setNotice("Enter a payment amount.");
      return;
    }
    const result = await recordCash.mutateAsync(amount);
    if (!result.ok) setNotice(result.notice);
    else {
      setGood(`${fmtMoney(amount)} payment recorded.`);
      setRecordOpen(false);
      setCashText("");
    }
  };

  const voidNow = () => {
    setMenuOpen(false);
    Alert.alert("Void this invoice?", "The customer will no longer be able to pay it.", [
      { text: "Keep invoice", style: "cancel" },
      { text: "Void invoice", style: "destructive", onPress: () => void (async () => {
        const result = await voidInvoice.mutateAsync();
        if (!result.ok) setNotice(result.notice);
        else setGood("Invoice voided.");
      })() },
    ]);
  };

  const deleteNow = () => {
    setMenuOpen(false);
    Alert.alert("Delete invoice?", "This cannot be undone.", [
      { text: "Keep invoice", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        const result = await deleteInvoice.mutateAsync();
        if (!result.ok) setNotice(result.notice);
        else router.replace("/(owner)/invoices");
      })() },
    ]);
  };

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
          <Pressable accessibilityRole="button" accessibilityLabel="Invoice actions" onPress={() => setMenuOpen(true)} style={styles.headerIcon}><Feather name="more-vertical" size={27} color={color.muted} /></Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 84 }]}
      >
        {notice ? <Notice text={notice} /> : null}
        <GoodNotice text={good} />

        <View style={styles.identity}>
          <View style={styles.identityMark}>
            <Mark size={104} />
            <View style={[styles.statusBadge, statusGood && styles.statusBadgeGood, statusBad && styles.statusBadgeBad]}>
              <Text style={[styles.statusBadgeText, statusGood && styles.statusBadgeTextGood, statusBad && styles.statusBadgeTextBad]}>{STATUS_LABEL[invoice.status]}</Text>
            </View>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>Invoice</Text>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Invoice #</Text><Text style={styles.identityValue}>{invoice.number}</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Invoice Date</Text><Text style={styles.identityValue}>{fmtEt(invoice.created_at, { month: "short", day: "2-digit", year: "numeric" })}</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Due Date</Text><Text style={styles.identityValue}>{fmtEt(invoice.created_at, { month: "short", day: "2-digit", year: "numeric" })}</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Type</Text><Text style={styles.identityValue}>Total Due</Text></View>
            <View style={styles.identityLine}><Text style={styles.identityLabel}>Balance Due</Text><Text style={styles.identityValue}>{fmtMoney(balance)}</Text></View>
            {invoice.job_id ? <Pressable accessibilityRole="button" accessibilityLabel="Open work order" onPress={() => router.push({ pathname: "/(owner)/job/[id]", params: { id: invoice.job_id ?? "" } })} style={styles.identityLine}><Text style={styles.identityLabel}>Work order #</Text><Text style={styles.jobLink}>OPEN</Text></Pressable> : null}
          </View>
        </View>

        <View style={styles.dividerBand} />

        <View style={styles.partyBlock}>
          <View style={styles.previewTabs}>
            <PreviewTabButton label="From" active={tab === "from"} onPress={() => setTab("from")} />
            <PreviewTabButton label="To" active={tab === "to"} onPress={() => setTab("to")} />
            <PreviewTabButton label="Job Details" active={tab === "job"} onPress={() => setTab("job")} />
          </View>
          {tab === "from" ? <View style={styles.partyCopy}><Text style={styles.partyName}>Canes Pressure Washing</Text><Text style={styles.partyText}>Professional exterior cleaning</Text></View> : null}
          {tab === "to" ? <View style={styles.partyCopy}><Text style={styles.partyName}>{invoice.customer_name ?? "Customer"}</Text>{invoice.customer_phone ? <Text style={styles.partyText}>{invoice.customer_phone}</Text> : null}{invoice.customer_email ? <Text style={styles.partyText}>{invoice.customer_email}</Text> : null}</View> : null}
          {tab === "job" ? <View style={styles.partyCopy}><Text style={styles.partyName}>{invoice.job_name || invoice.customer_name || "Services"}</Text>{invoice.customer_phone ? <Text style={styles.partyText}>{invoice.customer_phone}</Text> : null}<Text style={styles.partyText}>{invoice.job_address || "No job address"}</Text>{invoice.job_id ? <Text style={styles.partyText}>Work order linked</Text> : null}</View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="View payments" onPress={() => setPaymentsOpen(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>VIEW PAYMENTS</Text></Pressable>
        </View>

        <View style={styles.dividerBand} />

        <View style={styles.services}>
          <Text style={styles.servicesTitle}>Services</Text>
          <View style={styles.tableHead}>
            <Text style={styles.colQty}>Qty</Text><Text style={styles.colPrice}>Price</Text><Text style={styles.colDsc}>Dsc</Text><Text style={styles.colTax}>Tax</Text><Text style={styles.colTotal}>Total</Text>
          </View>
          {invoice.items.length === 0 ? <Text style={styles.noItems}>No services on this invoice.</Text> : invoice.items.map((item) => (
            <View key={item.id} style={styles.serviceRow}>
              <Text style={styles.serviceName}>{item.name}</Text>
              {item.description ? <Text style={styles.serviceDescription}>{item.description}</Text> : null}
              <View style={styles.serviceFigures}>
                <Text style={styles.colQty}>{item.quantity.toFixed(2)}</Text>
                <Text style={styles.colPrice}>{fmtMoney(item.unit_price_cents)}</Text>
                <Text style={styles.colDsc}>$0.00</Text>
                <Text style={styles.colTax}>$0.00</Text>
                <Text style={styles.colTotal}>{fmtMoney(item.line_total_cents)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.totalRows}>
            <View style={styles.totalRow}><Text style={styles.totalRowLabel}>Subtotal</Text><Text style={styles.totalRowValue}>{fmtMoney(invoice.subtotal_cents)}</Text></View>
            {invoice.adjustment_cents !== 0 ? <View style={styles.totalRow}><Text style={styles.totalRowLabel}>Adjustment</Text><Text style={styles.totalRowValue}>{fmtMoney(invoice.adjustment_cents)}</Text></View> : null}
            {invoice.tax_cents !== 0 ? <View style={styles.totalRow}><Text style={styles.totalRowLabel}>Taxes</Text><Text style={styles.totalRowValue}>{fmtMoney(invoice.tax_cents)}</Text></View> : null}
          </View>
          <View style={styles.grandTotal}><Text style={styles.grandTotalLabel}>Grand Total</Text><Text style={styles.grandTotalValue}>{fmtMoney(invoice.total_cents)}</Text></View>

          <View style={styles.paymentSummary}>
            {invoice.payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <View style={styles.paymentCopy}><Text style={styles.paymentLabel}>Payment via {PAYMENT_METHOD_LABEL[payment.method]}</Text><Text style={styles.paymentDate}>on {fmtEt(payment.created_at, { month: "short", day: "2-digit", year: "numeric" })}</Text></View>
                <Text style={styles.paymentAmount}>(-) {fmtMoney(payment.amount_cents)}</Text>
              </View>
            ))}
            <View style={styles.paymentRow}><Text style={styles.balanceLabel}>Balance Due</Text><Text style={styles.balanceValue}>{fmtMoney(balance)}</Text></View>
          </View>
        </View>

        <Accordion title="Accepted Payment Methods" open={paymentMethodsOpen} onPress={() => setPaymentMethodsOpen((value) => !value)}>
          <Text style={styles.accordionText}>Credit card, cash, or another method agreed with Canes Pressure Washing.</Text>
        </Accordion>
        <Accordion title="Message" open={messageOpen} onPress={() => setMessageOpen((value) => !value)}>
          <Text style={styles.accordionText}>{invoice.message_to_customer || "No customer message."}</Text>
        </Accordion>
        <Accordion title="Terms" open={termsOpen} onPress={() => setTermsOpen((value) => !value)}>
          <Text style={styles.accordionText}>{invoice.terms || "No terms added."}</Text>
        </Accordion>

        <View style={styles.bottomButtonWrap}><Pressable accessibilityRole="button" accessibilityLabel="View payments" onPress={() => setPaymentsOpen(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>VIEW PAYMENTS</Text></Pressable></View>
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="Invoice actions" onPress={() => setMenuOpen(true)} style={styles.cornerAction}><Feather name="more-horizontal" size={27} color={color.surface} /></Pressable>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.sheetScrim}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} />
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} style={styles.sheetClose}><View style={styles.sheetHandle} /></Pressable>
            {busy ? <ActivityIndicator color={color.brand} style={styles.busy} /> : null}
            <View style={styles.actionGrid}>
              <ActionTile label="Edit" icon="edit-3" disabled={invoice.status !== "draft" || busy} onPress={() => { setMenuOpen(false); router.push({ pathname: "/(owner)/invoice/new", params: { id } }); }} />
              <ActionTile label={invoice.sent_at ? "Re-Send" : "Send"} icon="send" disabled={invoice.status === "paid" || invoice.status === "void" || busy} onPress={() => void sendNow()} />
              <ActionTile label="Record Payment" icon="dollar-sign" disabled={invoice.status === "paid" || invoice.status === "void" || busy} onPress={() => { setMenuOpen(false); setCashText((balance / 100).toFixed(2)); setRecordOpen(true); }} />
              <ActionTile label="Share Invoice Link" icon="link" disabled={invoice.status === "void" || busy} onPress={() => void shareNow()} />
              <ActionTile label="View Customer" icon="user" disabled={!invoice.contact_id} onPress={() => { setMenuOpen(false); if (invoice.contact_id) router.push({ pathname: "/(owner)/customer/[id]", params: { id: invoice.contact_id } }); }} />
              <ActionTile label="Void Invoice" icon="slash" danger disabled={invoice.status === "paid" || invoice.status === "void" || busy} onPress={voidNow} />
              <ActionTile label="Delete Invoice" icon="trash-2" danger disabled={invoice.status !== "draft" || busy} onPress={deleteNow} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={paymentsOpen} transparent animationType="slide" onRequestClose={() => setPaymentsOpen(false)}>
        <View style={styles.sheetScrim}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close payments" onPress={() => setPaymentsOpen(false)} />
          <View style={[styles.paymentsSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>PAYMENTS</Text><Pressable accessibilityRole="button" accessibilityLabel="Close payments" onPress={() => setPaymentsOpen(false)}><Feather name="x" size={28} color={color.muted} /></Pressable></View>
            {invoice.payments.length === 0 ? <Text style={styles.noPayments}>No payments have been recorded.</Text> : invoice.payments.map((payment) => <View key={payment.id} style={styles.modalPaymentRow}><View><Text style={styles.modalPaymentMethod}>{PAYMENT_METHOD_LABEL[payment.method]}</Text><Text style={styles.paymentDate}>{fmtEt(payment.created_at, { month: "short", day: "numeric", year: "numeric" })}</Text></View><Text style={styles.modalPaymentAmount}>{fmtMoney(payment.amount_cents)}</Text></View>)}
            <View style={styles.modalBalance}><Text style={styles.balanceLabel}>Balance Due</Text><Text style={styles.balanceValue}>{fmtMoney(balance)}</Text></View>
            {invoice.status !== "paid" && invoice.status !== "void" ? <Pressable accessibilityRole="button" accessibilityLabel="Record payment" onPress={() => { setPaymentsOpen(false); setCashText((balance / 100).toFixed(2)); setRecordOpen(true); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>RECORD PAYMENT</Text></Pressable> : null}
          </View>
        </View>
      </Modal>

      <Modal visible={recordOpen} transparent animationType="fade" onRequestClose={() => setRecordOpen(false)}>
        <View style={styles.centerScrim}>
          <View style={styles.recordCard}>
            <Text style={styles.modalTitle}>RECORD CASH PAYMENT</Text>
            <Text style={styles.recordCopy}>Balance due {fmtMoney(balance)}</Text>
            <TextInput value={cashText} onChangeText={setCashText} keyboardType="decimal-pad" autoFocus accessibilityLabel="Payment amount" style={styles.cashInput} />
            <View style={styles.recordActions}><Pressable accessibilityRole="button" onPress={() => setRecordOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={recordCash.isPending} onPress={() => void recordNow()} style={styles.recordButton}><Text style={styles.recordButtonText}>{recordCash.isPending ? "Saving…" : "Record"}</Text></Pressable></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: color.surface },
  backButton: { minHeight: HIT, minWidth: 180, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.hover },
  backButtonText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.ink },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBack: { minHeight: HIT, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { fontFamily: font.bodyMedium, fontSize: 19, letterSpacing: 1.2, color: color.ink },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 1 },
  goodNotice: { marginHorizontal: 16, marginVertical: 6, padding: 12, borderRadius: radius.md, backgroundColor: color.goodBg },
  goodNoticeText: { fontFamily: font.body, fontSize: 14, color: color.good },
  identity: { minHeight: 318, paddingHorizontal: 18, paddingVertical: 34, flexDirection: "row", alignItems: "center", gap: 22 },
  identityMark: { width: 112, alignItems: "center", gap: 16 },
  statusBadge: { minWidth: 108, minHeight: 30, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: color.brandSoft },
  statusBadgeGood: { backgroundColor: color.goodBg },
  statusBadgeBad: { backgroundColor: color.dangerBg },
  statusBadgeText: { fontFamily: font.bodySemi, fontSize: 12, letterSpacing: 1.2, color: color.brandDeep },
  statusBadgeTextGood: { color: color.good },
  statusBadgeTextBad: { color: color.danger },
  identityCopy: { flex: 1, gap: 11 },
  identityTitle: { fontFamily: font.bodySemi, fontSize: 27, color: color.ink, marginBottom: 8 },
  identityLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  identityLabel: { flex: 1, fontFamily: font.body, fontSize: 14, color: color.muted },
  identityValue: { fontFamily: font.bodyMedium, fontSize: 14, color: color.ink, textAlign: "right" },
  jobLink: { fontFamily: font.bodySemi, fontSize: 14, color: color.brandDeep, textDecorationLine: "underline" },
  dividerBand: { height: 12, backgroundColor: color.hover },
  partyBlock: { minHeight: 350, paddingHorizontal: 18, paddingVertical: 46 },
  previewTabs: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 38 },
  previewTab: { minHeight: 43, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: color.hover },
  previewTabOn: { backgroundColor: color.brandFill },
  previewTabText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.muted },
  previewTabTextOn: { color: color.surface },
  partyCopy: { minHeight: 130, gap: 14 },
  partyName: { fontFamily: font.bodySemi, fontSize: 22, color: color.brandDeep, textDecorationLine: "underline", textDecorationColor: color.lineStrong },
  partyText: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  primaryButton: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.brandFill },
  primaryButtonText: { fontFamily: font.bodySemi, fontSize: 19, letterSpacing: 1.15, color: color.surface },
  services: { paddingTop: 46 },
  servicesTitle: { paddingHorizontal: 18, marginBottom: 24, fontFamily: font.bodySemi, fontSize: 28, color: color.ink },
  tableHead: { height: 42, marginHorizontal: 18, flexDirection: "row", alignItems: "center", borderRadius: radius.sm, backgroundColor: color.hover },
  colQty: { width: "15%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colPrice: { width: "22%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colDsc: { width: "20%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colTax: { width: "18%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  colTotal: { width: "25%", textAlign: "center", fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  noItems: { padding: 30, textAlign: "center", fontFamily: font.body, fontSize: 16, color: color.muted },
  serviceRow: { marginHorizontal: 18, paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  serviceName: { fontFamily: font.bodyMedium, fontSize: 20, color: color.ink, marginBottom: 8 },
  serviceDescription: { marginBottom: 15, fontFamily: font.body, fontSize: 14, color: color.muted },
  serviceFigures: { flexDirection: "row", alignItems: "center" },
  totalRows: { paddingHorizontal: 18, paddingVertical: 24, gap: 22 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  totalRowLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 18, color: color.ink },
  totalRowValue: { fontFamily: font.bodyMedium, fontSize: 17, color: color.ink },
  grandTotal: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.hover },
  grandTotalLabel: { fontFamily: font.bodySemi, fontSize: 22, color: color.ink },
  grandTotalValue: { fontFamily: font.bodySemi, fontSize: 25, color: color.ink },
  paymentSummary: { paddingHorizontal: 18, paddingVertical: 28, gap: 24 },
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  paymentCopy: { flex: 1 },
  paymentLabel: { fontFamily: font.bodyMedium, fontSize: 17, color: color.ink },
  paymentDate: { marginTop: 4, fontFamily: font.body, fontSize: 14, color: color.muted },
  paymentAmount: { fontFamily: font.bodyMedium, fontSize: 17, color: color.danger },
  balanceLabel: { fontFamily: font.bodySemi, fontSize: 19, color: color.ink },
  balanceValue: { fontFamily: font.bodySemi, fontSize: 19, color: color.ink },
  accordion: { borderBottomWidth: 12, borderBottomColor: color.hover },
  accordionHead: { minHeight: 96, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accordionTitle: { flex: 1, fontFamily: font.bodySemi, fontSize: 21, color: color.ink },
  accordionBody: { paddingHorizontal: 18, paddingBottom: 24 },
  accordionText: { fontFamily: font.body, fontSize: 16, lineHeight: 24, color: color.muted },
  bottomButtonWrap: { paddingHorizontal: 18, paddingVertical: 36 },
  cornerAction: { position: "absolute", right: 0, bottom: 0, width: 76, height: 76, paddingTop: 30, paddingLeft: 28, backgroundColor: color.brandFill, borderTopLeftRadius: 76 },
  sheetScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  actionSheet: { maxHeight: "78%", paddingHorizontal: 18, paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: color.surface },
  sheetClose: { minHeight: 30, alignItems: "center", justifyContent: "flex-start" },
  sheetHandle: { width: 52, height: 5, borderRadius: 3, backgroundColor: color.lineStrong },
  busy: { marginBottom: 10 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionTile: { flexBasis: "47%", flexGrow: 1, minHeight: 74, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md, backgroundColor: color.hover },
  actionTilePressed: { backgroundColor: color.brandWash },
  disabled: { opacity: 0.42 },
  actionTileText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: color.ink },
  actionTileDanger: { color: color.danger },
  actionTileDisabledText: { color: color.faint },
  paymentsSheet: { maxHeight: "76%", paddingHorizontal: 18, paddingTop: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: color.surface },
  modalHeader: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontFamily: font.bodySemi, fontSize: 20, letterSpacing: 1, color: color.ink },
  noPayments: { paddingVertical: 30, textAlign: "center", fontFamily: font.body, fontSize: 16, color: color.muted },
  modalPaymentRow: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  modalPaymentMethod: { fontFamily: font.bodyMedium, fontSize: 17, color: color.ink },
  modalPaymentAmount: { fontFamily: font.bodySemi, fontSize: 18, color: color.good },
  modalBalance: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  centerScrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: color.scrim },
  recordCard: { width: "100%", padding: 20, borderRadius: 22, backgroundColor: color.surface },
  recordCopy: { marginTop: 8, fontFamily: font.body, fontSize: 15, color: color.muted },
  cashInput: { minHeight: 58, marginTop: 22, paddingHorizontal: 14, fontFamily: font.bodyMedium, fontSize: 24, color: color.ink, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.md },
  recordActions: { marginTop: 18, flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md },
  secondaryButtonText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.muted },
  recordButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.brandFill },
  recordButtonText: { fontFamily: font.bodySemi, fontSize: 16, color: color.surface },
});
