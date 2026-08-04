import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import {
  fmtMoney,
  type CatalogItem,
  type CatalogKind,
  type CustomerSummary,
  type InvoiceItem,
} from "@urso/types";
import { invoiceActions, type InvoiceLineInput } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Notice } from "@/components/notice";
import { keys, useCatalog, useCustomers, useInvoice, useSettings } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space } from "@/theme";

type ItemCategory = "service" | "material" | "product";
type MoneyMode = "percent" | "amount";
type CustomerSection = { title: string; data: CustomerSummary[] };
type DraftLine = {
  key: string;
  category: ItemCategory;
  name: string;
  description: string | null;
  quantityText: string;
  priceText: string;
};

function dollarsToCents(value: string): number {
  const amount = Number(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centsToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

function quantity(value: string): number {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

function lineTotal(line: DraftLine): number {
  return Math.round(quantity(line.quantityText) * dollarsToCents(line.priceText));
}

function newKey(): string {
  return `${Date.now()}-${Math.random()}`;
}

function fromInvoiceItem(item: InvoiceItem): DraftLine {
  return {
    key: item.id,
    category: "service",
    name: item.name,
    description: item.description,
    quantityText: String(item.quantity),
    priceText: centsToDollars(item.unit_price_cents),
  };
}

function fromCatalog(item: CatalogItem, category: ItemCategory): DraftLine {
  return {
    key: newKey(),
    category,
    name: item.name,
    description: item.description,
    quantityText: "1",
    priceText: centsToDollars(item.default_price_cents),
  };
}

function customLine(category: ItemCategory): DraftLine {
  return {
    key: newKey(),
    category,
    name: category === "material" ? "Material" : "",
    description: null,
    quantityText: "1",
    priceText: "0.00",
  };
}

function cityOf(customer: CustomerSummary): string {
  const address = customer.primary_address?.trim();
  if (!address) return "No address";
  const parts = address.split(",").map((part) => part.trim());
  return parts.length >= 2 ? parts.slice(-2).join(", ") : address;
}

function CategoryBar({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${label}`} onPress={onAdd} style={({ pressed }) => [styles.categoryBar, pressed && styles.pressed]}>
      <Text style={styles.categoryLabel}>{label}</Text>
      <Text style={styles.categoryPlus}>+</Text>
    </Pressable>
  );
}

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.lineEditor}>
      <View style={styles.lineTop}>
        <Text style={styles.lineKind}>{line.category}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name || "item"}`} onPress={onRemove} hitSlop={10}>
          <Feather name="trash-2" size={20} color={color.danger} />
        </Pressable>
      </View>
      <TextInput
        value={line.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="Service name"
        placeholderTextColor={color.faint}
        accessibilityLabel="Item name"
        style={styles.lineName}
      />
      <View style={styles.lineValues}>
        <View style={styles.qtyBox}>
          <Text style={styles.inputLabel}>QTY</Text>
          <TextInput value={line.quantityText} onChangeText={(quantityText) => onChange({ quantityText })} keyboardType="decimal-pad" accessibilityLabel="Quantity" style={styles.compactInput} />
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.inputLabel}>PRICE</Text>
          <TextInput value={line.priceText} onChangeText={(priceText) => onChange({ priceText })} keyboardType="decimal-pad" accessibilityLabel="Unit price" style={styles.compactInput} />
        </View>
        <View style={styles.lineAmountBox}>
          <Text style={styles.inputLabel}>TOTAL</Text>
          <Text style={styles.lineAmount}>{fmtMoney(lineTotal(line))}</Text>
        </View>
      </View>
    </View>
  );
}

function ModeControl({
  title,
  mode,
  value,
  onMode,
  onValue,
  addLabel,
}: {
  title: string;
  mode: MoneyMode;
  value: string;
  onMode: (mode: MoneyMode) => void;
  onValue: (value: string) => void;
  addLabel?: string;
}) {
  return (
    <View style={styles.modeSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.modeRow}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "percent" }} onPress={() => onMode("percent")} style={[styles.modeButton, mode === "percent" && styles.modeButtonOn]}>
          <Text style={[styles.modeText, mode === "percent" && styles.modeTextOn]}>%</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "amount" }} onPress={() => onMode("amount")} style={[styles.modeButton, mode === "amount" && styles.modeButtonOn]}>
          <Text style={[styles.modeText, mode === "amount" && styles.modeTextOn]}>$</Text>
        </Pressable>
        {addLabel ? (
          <Pressable accessibilityRole="button" onPress={() => undefined} style={[styles.modeButton, styles.modeButtonOn]}><Text style={styles.modeAdd}>{addLabel}</Text></Pressable>
        ) : (
          <TextInput value={value} onChangeText={onValue} keyboardType="decimal-pad" accessibilityLabel={`${title} value`} style={styles.modeInput} />
        )}
      </View>
    </View>
  );
}

export default function InvoiceComposerScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; contactId?: string; name?: string; phone?: string }>();
  const editId = typeof params.id === "string" ? params.id : null;
  const invoiceQuery = useInvoice(editId);
  const customersQuery = useCustomers();
  const catalogQuery = useCatalog();
  const settingsQuery = useSettings();
  const invoice = invoiceQuery.data ?? null;

  const [contactId, setContactId] = useState<string | null>(typeof params.contactId === "string" ? params.contactId : null);
  const [customerName, setCustomerName] = useState(typeof params.name === "string" ? params.name : "");
  const [customerPhone, setCustomerPhone] = useState(typeof params.phone === "string" ? params.phone : "");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobName, setJobName] = useState("");
  const [quantityType, setQuantityType] = useState<"Qty" | "Sq Ft">("Qty");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [adjustmentText, setAdjustmentText] = useState("0.00");
  const [message, setMessage] = useState("");
  const [terms, setTerms] = useState("");
  const [depositMode, setDepositMode] = useState<MoneyMode>("amount");
  const [depositValue, setDepositValue] = useState("");
  const [scheduleMode, setScheduleMode] = useState<MoneyMode>("amount");
  const [notice, setNotice] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pickerCategory, setPickerCategory] = useState<ItemCategory>("service");

  useEffect(() => {
    if (seeded) return;
    if (invoice) {
      setContactId(invoice.contact_id);
      setCustomerName(invoice.customer_name ?? "");
      setCustomerPhone(invoice.customer_phone ?? "");
      setCustomerEmail(invoice.customer_email ?? "");
      setJobAddress(invoice.job_address ?? "");
      setJobName(invoice.job_name ?? "");
      setLines(invoice.items.map(fromInvoiceItem));
      setAdjustmentText(centsToDollars(invoice.adjustment_cents));
      setMessage(invoice.message_to_customer ?? "");
      setTerms(invoice.terms ?? "");
      setSeeded(true);
      return;
    }
    if (editId === null && settingsQuery.data) {
      setMessage(settingsQuery.data.invoice_message);
      setTerms(settingsQuery.data.invoice_terms);
      setSeeded(true);
    }
  }, [editId, invoice, seeded, settingsQuery.data]);

  const customerSections = useMemo<CustomerSection[]>(() => {
    const term = customerSearch.trim().toLowerCase();
    const grouped = new Map<string, CustomerSummary[]>();
    for (const customer of customersQuery.data ?? []) {
      const haystack = `${customer.name ?? ""} ${customer.phone ?? ""} ${customer.primary_address ?? ""}`.toLowerCase();
      if (term && !haystack.includes(term)) continue;
      const letter = (customer.name?.trim().charAt(0) || "#").toUpperCase();
      grouped.set(letter, [...(grouped.get(letter) ?? []), customer]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([title, data]) => ({
      title,
      data: data.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    }));
  }, [customerSearch, customersQuery.data]);

  const catalogMatches = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    const kind: CatalogKind = pickerCategory === "service" ? "service" : "product";
    return (catalogQuery.data ?? []).filter((item) => item.active && item.kind === kind && (!term || item.name.toLowerCase().includes(term)));
  }, [catalogQuery.data, catalogSearch, pickerCategory]);

  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const adjustment = dollarsToCents(adjustmentText);
  const grandTotal = Math.max(0, subtotal + adjustment);
  const payload: InvoiceLineInput[] = lines
    .filter((line) => line.name.trim().length > 0)
    .map((line) => ({
      name: line.name.trim(),
      description: line.description,
      quantity: quantity(line.quantityText),
      unitPriceCents: Math.max(0, dollarsToCents(line.priceText)),
    }));

  const create = useAction((input: Parameters<typeof invoiceActions.createManual>[0]) => invoiceActions.createManual(input), { invalidates: [keys.invoices(), keys.customers.all()] });
  const saveItems = useAction(({ id, items }: { id: string; items: InvoiceLineInput[] }) => invoiceActions.saveItems(id, items), { invalidates: [keys.invoices()] });
  const update = useAction(({ id, patch }: { id: string; patch: Parameters<typeof invoiceActions.update>[1] }) => invoiceActions.update(id, patch), { invalidates: [keys.invoices()] });
  const busy = create.isPending || saveItems.isPending || update.isPending;
  const ready = customerName.trim().length > 0 && payload.length > 0 && subtotal > 0;

  const chooseCustomer = (customer: CustomerSummary) => {
    setContactId(customer.id);
    setCustomerName(customer.name ?? customer.phone ?? "Customer");
    setCustomerPhone(customer.phone ?? "");
    setCustomerEmail(customer.email ?? "");
    setJobAddress(customer.primary_address ?? "");
    setCustomerOpen(false);
    setCustomerSearch("");
  };

  const openCatalog = (category: ItemCategory) => {
    if (category === "material") {
      setLines((current) => [...current, customLine(category)]);
      return;
    }
    setPickerCategory(category);
    setCatalogSearch("");
    setCatalogOpen(true);
  };

  const addCatalog = (item: CatalogItem) => {
    setLines((current) => [...current, fromCatalog(item, pickerCategory)]);
    setCatalogOpen(false);
  };

  const save = async () => {
    if (!ready || busy) return;
    setNotice(null);
    let targetId = editId ?? createdId;
    const resolvedJobName = jobName.trim() || payload[0]?.name || "Services";

    if (!targetId) {
      const result = await create.mutateAsync({
        ...(contactId ? { contactId } : {}),
        customerName: customerName.trim(),
        ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        ...(jobAddress.trim() ? { jobAddress: jobAddress.trim() } : {}),
        jobName: resolvedJobName,
        totalCents: subtotal,
      });
      if (!result.ok) {
        setNotice(result.notice);
        return;
      }
      targetId = typeof result.data.invoiceId === "string" ? result.data.invoiceId : null;
      if (!targetId) {
        setNotice("The invoice was created, but this phone didn’t receive its ID.");
        return;
      }
      setCreatedId(targetId);
    }

    const linesResult = await saveItems.mutateAsync({ id: targetId, items: payload });
    if (!linesResult.ok) {
      setNotice(linesResult.notice);
      return;
    }
    const detailsResult = await update.mutateAsync({
      id: targetId,
      patch: {
        contactId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        jobName: resolvedJobName,
        jobAddress: jobAddress.trim(),
        adjustmentCents: adjustment,
        messageToCustomer: message,
        terms,
      },
    });
    if (!detailsResult.ok) {
      setNotice(detailsResult.notice);
      return;
    }
    router.replace({ pathname: "/(owner)/invoice/[id]", params: { id: targetId } });
  };

  if (editId && invoiceQuery.isPending) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={color.brand} /></View>;
  }

  const loadNotice = noticeFrom(invoiceQuery.error);
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ height: insets.top, backgroundColor: color.chrome }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={31} color={color.brand} />
          <Text style={styles.headerTitle}>{editId ? "EDIT" : "CREATE"} INVOICE</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save invoice" accessibilityState={{ disabled: !ready || busy }} disabled={!ready || busy} onPress={() => void save()} style={styles.saveButton}>
          {busy ? <ActivityIndicator color={color.brand} /> : <Feather name="check" size={32} color={ready ? color.brand : color.faint} />}
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        {loadNotice ? <Notice text={loadNotice} /> : null}
        {notice ? <Notice text={notice} /> : null}

        <View style={styles.customerBlock}>
          <Pressable accessibilityRole="button" accessibilityLabel="Select customer" onPress={() => setCustomerOpen(true)} style={styles.customerRow}>
            <Feather name="user" size={26} color={color.faint} />
            <Text style={[styles.customerText, customerName && styles.customerTextOn]} numberOfLines={1}>{customerName || "Select Customer"}<Text style={styles.required}> *</Text></Text>
            <Feather name="chevron-right" size={30} color={color.brand} />
          </Pressable>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={24} color={color.faint} />
            <AddressInput value={jobAddress} onChange={setJobAddress} placeholder="Job location" accessibilityLabel="Job location" style={styles.locationInput} containerStyle={styles.locationInputWrap} />
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Quantity type" onPress={() => setQuantityType((current) => current === "Qty" ? "Sq Ft" : "Qty")} style={styles.quantityRow}>
          <View><Text style={styles.detailLabel}>Quantity Type<Text style={styles.required}> *</Text></Text><Text style={styles.detailValue}>{quantityType}</Text></View>
          <Feather name="chevron-right" size={30} color={color.brand} />
        </Pressable>

        {lines.map((line) => (
          <LineEditor
            key={line.key}
            line={line}
            onChange={(patch) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, ...patch } : item))}
            onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
          />
        ))}
        <CategoryBar label="Service" onAdd={() => openCatalog("service")} />
        <CategoryBar label="Material" onAdd={() => openCatalog("material")} />
        <CategoryBar label="Product" onAdd={() => openCatalog("product")} />

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal:</Text><Text style={styles.totalValue}>{fmtMoney(subtotal)}</Text></View>
          <View style={styles.adjustmentRow}>
            <Feather name="trash-2" size={20} color={color.danger} />
            <Text style={styles.adjustmentLabel}>Add Adjustment</Text>
            <TextInput value={adjustmentText} onChangeText={setAdjustmentText} keyboardType="numbers-and-punctuation" accessibilityLabel="Invoice adjustment" style={styles.adjustmentInput} />
          </View>
          <View style={styles.totalRow}><Text style={styles.grandLabel}>Grand Total:</Text><Text style={styles.grandValue}>{fmtMoney(grandTotal)}</Text></View>
        </View>

        <ModeControl title="Request a Deposit" mode={depositMode} value={depositValue} onMode={setDepositMode} onValue={setDepositValue} />
        <ModeControl title="Payment Schedule" mode={scheduleMode} value="" onMode={setScheduleMode} onValue={() => undefined} addLabel="ADD" />

        <View style={styles.textFields}>
          <TextInput value={invoice?.job_id ?? ""} editable={false} placeholder="Work Order #" placeholderTextColor={color.muted} accessibilityLabel="Work order number" style={styles.underlinedInput} />
          <TextInput value={jobName} onChangeText={setJobName} placeholder="Job Name" placeholderTextColor={color.muted} accessibilityLabel="Job name" style={styles.underlinedInput} />
        </View>

        <View style={styles.copyBlock}>
          <View style={styles.copyTitle}><Feather name="mail" size={18} color={color.faint} /><Text style={styles.copyLabel}>Message to customer</Text></View>
          <TextInput value={message} onChangeText={setMessage} multiline accessibilityLabel="Message to customer" style={styles.copyInput} />
          <View style={styles.copyTitle}><Feather name="users" size={18} color={color.faint} /><Text style={styles.copyLabel}>Terms &amp; Conditions</Text></View>
          <TextInput value={terms} onChangeText={setTerms} multiline accessibilityLabel="Terms and conditions" style={styles.copyInput} />
        </View>

        <View style={styles.attachBlock}>
          <Text style={styles.sectionTitle}>Attach Photos</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload invoice photos" onPress={() => Alert.alert("Attach photos", "Photos stay with the work order in Urso. Create the invoice, then add photos from its linked job.")} style={styles.uploadButton}>
            <Feather name="upload" size={24} color={color.surface} /><Text style={styles.uploadText}>UPLOAD</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={customerOpen} animationType="slide" onRequestClose={() => setCustomerOpen(false)}>
        <View style={[styles.pickerScreen, { paddingTop: insets.top }]}>
          <View style={styles.pickerHeader}><Pressable accessibilityRole="button" accessibilityLabel="Close customer picker" onPress={() => setCustomerOpen(false)} style={styles.headerBack}><Feather name="chevron-left" size={31} color={color.brand} /><Text style={styles.headerTitle}>MY CUSTOMERS</Text></Pressable></View>
          <View style={styles.pickerSearch}><Feather name="search" size={24} color={color.faint} /><TextInput value={customerSearch} onChangeText={setCustomerSearch} placeholder="Search Customer" placeholderTextColor={color.faint} autoFocus accessibilityLabel="Search customers" style={styles.searchInput} /></View>
          <SectionList
            sections={customerSections}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderSectionHeader={({ section }) => <View style={styles.letterBand}><Text style={styles.letterText}>{section.title}</Text></View>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${item.name ?? "customer"}`} onPress={() => chooseCustomer(item)} style={({ pressed }) => [styles.customerOption, pressed && styles.pressed]}><View><Text style={styles.optionName}>{item.name ?? item.phone ?? "Customer"}</Text><Text style={styles.optionCity}>{cityOf(item)}</Text></View><View style={styles.customerBadge}><Text style={styles.customerBadgeText}>R</Text></View></Pressable>}
          />
        </View>
      </Modal>

      <Modal visible={catalogOpen} transparent animationType="slide" onRequestClose={() => setCatalogOpen(false)}>
        <View style={styles.catalogScrim}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close catalog" onPress={() => setCatalogOpen(false)} />
          <View style={[styles.catalogSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.catalogHeader}><Text style={styles.catalogTitle}>ADD {pickerCategory.toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCatalogOpen(false)}><Feather name="x" size={28} color={color.muted} /></Pressable></View>
            <View style={styles.pickerSearch}><Feather name="search" size={22} color={color.faint} /><TextInput value={catalogSearch} onChangeText={setCatalogSearch} placeholder={`Search ${pickerCategory}`} placeholderTextColor={color.faint} accessibilityLabel={`Search ${pickerCategory}`} style={styles.searchInput} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Add custom ${pickerCategory}`} onPress={() => { setLines((current) => [...current, customLine(pickerCategory)]); setCatalogOpen(false); }} style={styles.customItem}><Feather name="plus" size={21} color={color.brand} /><Text style={styles.customItemText}>Custom {pickerCategory}</Text></Pressable>
            <ScrollView>{catalogMatches.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} onPress={() => addCatalog(item)} style={styles.catalogItem}><View style={styles.catalogCopy}><Text style={styles.catalogName}>{item.name}</Text>{item.description ? <Text style={styles.catalogDescription} numberOfLines={2}>{item.description}</Text> : null}</View><Text style={styles.catalogPrice}>{fmtMoney(item.default_price_cents)}</Text></Pressable>)}</ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBack: { minHeight: HIT, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { fontFamily: font.bodyMedium, fontSize: 19, letterSpacing: 1.15, color: color.ink },
  saveButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 1 },
  customerBlock: { paddingHorizontal: 18, paddingTop: 32, paddingBottom: 26, borderBottomWidth: 12, borderBottomColor: color.hover },
  customerRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 14 },
  customerText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 21, color: color.muted },
  customerTextOn: { color: color.ink },
  required: { color: color.danger },
  locationRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  locationInputWrap: { flex: 1 },
  locationInput: { paddingHorizontal: 0, borderWidth: 0, backgroundColor: "transparent", fontFamily: font.body, fontSize: 19, color: color.ink },
  quantityRow: { minHeight: 140, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 12, borderBottomColor: color.hover },
  detailLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.muted },
  detailValue: { marginTop: 8, fontFamily: font.body, fontSize: 21, color: color.ink },
  lineEditor: { marginHorizontal: 18, marginTop: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md, backgroundColor: color.surface },
  lineTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineKind: { fontFamily: font.bodyMedium, fontSize: 12, letterSpacing: 1.3, textTransform: "uppercase", color: color.brandDeep },
  lineName: { height: 48, marginTop: 4, fontFamily: font.bodyMedium, fontSize: 18, color: color.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  lineValues: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  qtyBox: { width: 62 },
  priceBox: { width: 92 },
  lineAmountBox: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  inputLabel: { fontFamily: font.bodyMedium, fontSize: 10, letterSpacing: 1.2, color: color.faint },
  compactInput: { height: 40, marginTop: 3, paddingHorizontal: 10, fontFamily: font.body, fontSize: 16, color: color.ink, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.sm },
  lineAmount: { minHeight: 40, paddingTop: 10, fontFamily: font.bodyMedium, fontSize: 17, color: color.ink, fontVariant: ["tabular-nums"] },
  categoryBar: { minHeight: 82, marginTop: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.hover },
  categoryLabel: { fontFamily: font.bodySemi, fontSize: 25, color: color.ink },
  categoryPlus: { fontFamily: font.body, fontSize: 42, lineHeight: 46, color: color.brand },
  pressed: { opacity: 0.7 },
  totalsBlock: { marginTop: 12, paddingHorizontal: 34, paddingVertical: 26, gap: 24, backgroundColor: color.hover },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  totalLabel: { fontFamily: font.bodyMedium, fontSize: 18, color: color.ink },
  totalValue: { fontFamily: font.bodyMedium, fontSize: 18, color: color.ink },
  adjustmentRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  adjustmentLabel: { flex: 1, fontFamily: font.body, fontSize: 18, color: color.ink },
  adjustmentInput: { width: 88, minHeight: 42, paddingHorizontal: 8, textAlign: "right", fontFamily: font.body, fontSize: 17, color: color.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  grandLabel: { fontFamily: font.bodySemi, fontSize: 20, color: color.ink },
  grandValue: { fontFamily: font.bodySemi, fontSize: 21, color: color.ink },
  modeSection: { paddingHorizontal: 18, paddingVertical: 34, borderBottomWidth: 12, borderBottomColor: color.hover },
  sectionTitle: { fontFamily: font.bodySemi, fontSize: 26, color: color.ink, marginBottom: 20 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  modeButton: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, borderRadius: radius.md, backgroundColor: color.hover },
  modeButtonOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  modeText: { fontFamily: font.body, fontSize: 30, color: color.faint },
  modeTextOn: { color: color.surface },
  modeAdd: { fontFamily: font.bodySemi, fontSize: 18, letterSpacing: 1, color: color.surface },
  modeInput: { flex: 1, minHeight: 58, paddingHorizontal: 12, textAlign: "center", fontFamily: font.body, fontSize: 20, color: color.ink, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.md },
  textFields: { paddingHorizontal: 18, paddingVertical: 34, gap: 32, borderBottomWidth: 12, borderBottomColor: color.hover },
  underlinedInput: { minHeight: 56, fontFamily: font.body, fontSize: 20, color: color.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  copyBlock: { paddingHorizontal: 18, paddingVertical: 34, gap: 14, borderBottomWidth: 12, borderBottomColor: color.hover },
  copyTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  copyLabel: { fontFamily: font.bodyMedium, fontSize: 16, color: color.muted },
  copyInput: { minHeight: 110, paddingVertical: 12, fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink, textAlignVertical: "top", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  attachBlock: { paddingHorizontal: 18, paddingVertical: 34 },
  uploadButton: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: radius.md, backgroundColor: color.brandFill },
  uploadText: { fontFamily: font.bodySemi, fontSize: 19, letterSpacing: 1.2, color: color.surface },
  pickerScreen: { flex: 1, backgroundColor: color.surface },
  pickerHeader: { minHeight: 92, paddingHorizontal: 18, justifyContent: "center" },
  pickerSearch: { minHeight: 58, marginHorizontal: 18, marginBottom: 18, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, backgroundColor: color.hover },
  searchInput: { flex: 1, fontFamily: font.body, fontSize: 18, color: color.ink },
  letterBand: { minHeight: 34, paddingHorizontal: 18, justifyContent: "center", backgroundColor: color.hover },
  letterText: { fontFamily: font.bodyMedium, fontSize: 18, color: color.muted },
  customerOption: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  optionName: { fontFamily: font.bodyMedium, fontSize: 20, color: color.ink },
  optionCity: { marginTop: 8, fontFamily: font.body, fontSize: 15, color: color.muted },
  customerBadge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: color.brandSoft },
  customerBadgeText: { fontFamily: font.bodySemi, fontSize: 13, color: color.brandDeep },
  catalogScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  catalogSheet: { maxHeight: "78%", paddingTop: 14, backgroundColor: color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  catalogHeader: { minHeight: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catalogTitle: { fontFamily: font.bodySemi, fontSize: 20, letterSpacing: 1.1, color: color.ink },
  customItem: { minHeight: 60, marginHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  customItemText: { fontFamily: font.bodyMedium, fontSize: 17, color: color.brandDeep },
  catalogItem: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  catalogCopy: { flex: 1, minWidth: 0 },
  catalogName: { fontFamily: font.bodyMedium, fontSize: 17, color: color.ink },
  catalogDescription: { marginTop: 3, fontFamily: font.body, fontSize: 13, color: color.muted },
  catalogPrice: { fontFamily: font.bodyMedium, fontSize: 16, color: color.ink },
});
