import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  fmtEt,
  fmtMoney,
  type CatalogItem,
  type CatalogKind,
  type CustomerSummary,
  type EstimateItem,
  type EstimateType,
} from "@urso/types";
import { estimateActions, type EstimateLineInput } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Notice } from "@/components/notice";
import { keys, useCatalog, useCustomers, useEstimate } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

type ItemCategory = "service" | "material" | "product";

type DraftLine = {
  key: string;
  catalogId: string | null;
  category: ItemCategory;
  name: string;
  description: string | null;
  quantityText: string;
  priceText: string;
  taxable: boolean;
  discountCents: number;
  isOption: boolean;
  isMandatory: boolean;
  packageGroup: string | null;
};

type CustomerSection = { title: string; data: CustomerSummary[] };

const TYPE_LABEL: Record<EstimateType, string> = {
  standard: "STANDARD",
  options: "OPTIONS",
  packages: "PACKAGE",
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

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function lineTotal(line: DraftLine): number {
  return Math.round(quantity(line.quantityText) * dollarsToCents(line.priceText)) - line.discountCents;
}

function categoryFor(item: EstimateItem): ItemCategory {
  return item.kind === "service" ? "service" : "product";
}

function fromEstimateItem(item: EstimateItem): DraftLine {
  return {
    key: item.id,
    catalogId: item.catalog_id,
    category: categoryFor(item),
    name: item.name,
    description: item.description,
    quantityText: String(item.quantity),
    priceText: centsToDollars(item.unit_price_cents),
    taxable: item.taxable,
    discountCents: item.discount_cents,
    isOption: item.is_option,
    isMandatory: item.is_mandatory,
    packageGroup: item.package_group,
  };
}

function fromCatalog(item: CatalogItem, category: ItemCategory, estimateType: EstimateType): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    catalogId: item.id,
    category,
    name: item.name,
    description: item.description,
    quantityText: "1",
    priceText: centsToDollars(item.default_price_cents),
    taxable: item.taxable,
    discountCents: 0,
    isOption: estimateType !== "standard",
    isMandatory: false,
    packageGroup: estimateType === "packages" ? "Package 1" : null,
  };
}

function customLine(category: ItemCategory, estimateType: EstimateType): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    catalogId: null,
    category,
    name: category === "material" ? "Material" : "",
    description: null,
    quantityText: "1",
    priceText: "0.00",
    taxable: false,
    discountCents: 0,
    isOption: estimateType !== "standard",
    isMandatory: false,
    packageGroup: estimateType === "packages" ? "Package 1" : null,
  };
}

function cityOf(customer: CustomerSummary): string {
  const address = customer.primary_address?.trim();
  if (!address) return "No address";
  const parts = address.split(",").map((part) => part.trim());
  if (parts.length >= 3 && /^\d{5}(?:-\d{4})?$/.test(parts.at(-1) ?? "")) {
    return `${parts.at(-3)}, ${parts.at(-2)}`;
  }
  return parts.length >= 2 ? parts.slice(-2).join(", ") : address;
}

function CategoryBar({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${label}`}
      onPress={onAdd}
      style={({ pressed }) => [styles.categoryBar, pressed && styles.categoryPressed]}
    >
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
      <View style={styles.lineEditorTop}>
        <Text style={styles.lineKind}>{line.category}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name || "item"}`} onPress={onRemove} hitSlop={8}>
          <Feather name="trash-2" size={19} color={color.danger} />
        </Pressable>
      </View>
      <TextInput
        value={line.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="Item name"
        placeholderTextColor={color.faint}
        accessibilityLabel="Item name"
        style={styles.lineNameInput}
      />
      <View style={styles.lineFields}>
        <View style={styles.lineFieldSmall}>
          <Text style={styles.fieldLabel}>QTY</Text>
          <TextInput
            value={line.quantityText}
            onChangeText={(quantityText) => onChange({ quantityText })}
            keyboardType="decimal-pad"
            accessibilityLabel="Quantity"
            style={styles.lineInput}
          />
        </View>
        <View style={styles.lineFieldPrice}>
          <Text style={styles.fieldLabel}>PRICE</Text>
          <TextInput
            value={line.priceText}
            onChangeText={(priceText) => onChange({ priceText })}
            keyboardType="decimal-pad"
            accessibilityLabel="Price"
            style={styles.lineInput}
          />
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: line.taxable }}
          accessibilityLabel="Taxable"
          onPress={() => onChange({ taxable: !line.taxable })}
          style={[styles.taxToggle, line.taxable && styles.taxToggleOn]}
        >
          <Text style={[styles.taxText, line.taxable && styles.taxTextOn]}>Tax</Text>
        </Pressable>
        <Text style={styles.lineTotal}>{fmtMoney(lineTotal(line))}</Text>
      </View>
    </View>
  );
}

export default function EstimateEditorScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const editId = typeof params.id === "string" ? params.id : null;
  const requestedType: EstimateType =
    params.type === "options" || params.type === "packages" ? params.type : "standard";

  const estimateQuery = useEstimate(editId);
  const customersQuery = useCustomers();
  const catalogQuery = useCatalog();
  const estimate = estimateQuery.data ?? null;

  const [estimateType, setEstimateType] = useState<EstimateType>(requestedType);
  const [contactId, setContactId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobName, setJobName] = useState("");
  const [expiresAtIso, setExpiresAtIso] = useState(() => futureIso(28));
  const [quantityType, setQuantityType] = useState<"Qty" | "Sq Ft">("Qty");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pickerCategory, setPickerCategory] = useState<ItemCategory>("service");

  useEffect(() => {
    if (estimate === null || seeded) return;
    setEstimateType(estimate.estimate_type);
    setCustomerName(estimate.customer_name ?? "");
    setCustomerPhone(estimate.customer_phone ?? "");
    setCustomerEmail(estimate.customer_email ?? "");
    setJobAddress(estimate.job_address ?? "");
    setJobName(estimate.job_name ?? "");
    setExpiresAtIso(estimate.expires_at ?? futureIso(28));
    setLines(estimate.items.map(fromEstimateItem));
    setContactId(estimate.contact_id);
    setSeeded(true);
  }, [estimate, seeded]);

  const create = useAction(
    (input: Parameters<typeof estimateActions.create>[0]) => estimateActions.create(input),
    { invalidates: [keys.estimates(), keys.customers.all()] },
  );
  const update = useAction(
    ({ id, patch }: { id: string; patch: Parameters<typeof estimateActions.update>[1] }) => estimateActions.update(id, patch),
    { invalidates: [keys.estimates()] },
  );
  const saveItems = useAction(
    ({ id, items }: { id: string; items: EstimateLineInput[] }) => estimateActions.saveItems(id, items),
    { invalidates: [keys.estimates()] },
  );

  const customerSections = useMemo<CustomerSection[]>(() => {
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

  const catalogMatches = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    const expectedKind: CatalogKind = pickerCategory === "service" ? "service" : "product";
    return (catalogQuery.data ?? []).filter((item) =>
      item.active && item.kind === expectedKind && (!term || item.name.toLowerCase().includes(term)),
    );
  }, [catalogQuery.data, catalogSearch, pickerCategory]);

  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const busy = create.isPending || update.isPending || saveItems.isPending;
  const ready = customerName.trim().length > 0;

  const chooseCustomer = (selected: CustomerSummary) => {
    setContactId(selected.id);
    setCustomerName(selected.name ?? selected.phone ?? "Customer");
    setCustomerPhone(selected.phone ?? "");
    setCustomerEmail(selected.email ?? "");
    setJobAddress(selected.primary_address ?? "");
    setCustomerOpen(false);
    setCustomerSearch("");
  };

  const openCatalog = (category: ItemCategory) => {
    if (category === "material") {
      setLines((current) => [...current, customLine("material", estimateType)]);
      return;
    }
    setPickerCategory(category);
    setCatalogSearch("");
    setCatalogOpen(true);
  };

  const addCatalog = (item: CatalogItem) => {
    setLines((current) => [...current, fromCatalog(item, pickerCategory, estimateType)]);
    setCatalogOpen(false);
  };

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  };

  const onSave = async () => {
    if (!ready || busy) return;
    setNotice(null);
    const selectedName = customerName.trim() || "Customer";
    let targetId = editId ?? createdId;

    if (targetId === null) {
      const result = await create.mutateAsync({
        estimateType,
        ...(contactId ? { contactId } : {}),
        customerName: selectedName,
        ...(customerPhone ? { customerPhone } : {}),
        ...(customerEmail ? { customerEmail } : {}),
        ...(jobAddress.trim() ? { jobAddress: jobAddress.trim() } : {}),
        ...(jobName.trim() ? { jobName: jobName.trim() } : {}),
      });
      if (!result.ok) {
        setNotice(result.notice);
        return;
      }
      targetId = typeof result.data.estimateId === "string" ? result.data.estimateId : null;
      if (targetId === null) {
        setNotice("The estimate was created, but this phone didn’t receive its ID.");
        return;
      }
      setCreatedId(targetId);
    }

    const details = await update.mutateAsync({
      id: targetId,
      patch: {
        estimateType,
        contactId,
        customerName: selectedName,
        customerPhone,
        customerEmail,
        jobAddress: jobAddress.trim(),
        jobName: jobName.trim(),
        expiresAtIso,
      },
    });
    if (!details.ok) {
      setNotice(details.notice);
      return;
    }

    const payload: EstimateLineInput[] = lines
      .filter((line) => line.name.trim().length > 0)
      .map((line) => ({
        catalogId: line.catalogId,
        name: line.name.trim(),
        description: line.description,
        kind: line.category === "service" ? "service" : "product",
        quantity: quantity(line.quantityText),
        unitPriceCents: dollarsToCents(line.priceText),
        discountCents: line.discountCents,
        taxable: line.taxable,
        isOption: estimateType === "standard" ? false : line.isOption,
        isMandatory: line.isMandatory,
        packageGroup: estimateType === "packages" ? line.packageGroup ?? "Package 1" : null,
      }));
    const saved = await saveItems.mutateAsync({ id: targetId, items: payload });
    if (!saved.ok) {
      setNotice(saved.notice);
      return;
    }

    router.replace({ pathname: "/(owner)/estimate/[id]", params: { id: targetId } });
  };

  if (editId !== null && estimateQuery.isPending) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={color.brand} /></View>;
  }

  const loadNotice = noticeFrom(estimateQuery.error);
  const catalogNotice = noticeFrom(catalogQuery.error);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ height: insets.top, backgroundColor: color.chrome }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={31} color={color.brand} />
          <Text style={styles.headerTitle}>{editId ? "EDIT" : "NEW"} {TYPE_LABEL[estimateType]} ESTIMATE</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save estimate"
          accessibilityState={{ disabled: !ready || busy }}
          disabled={!ready || busy}
          onPress={() => void onSave()}
          style={styles.saveButton}
        >
          {busy ? <ActivityIndicator color={color.brand} /> : <Feather name="check" size={31} color={ready ? color.brand : color.faint} />}
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 36 }]}
      >
        {loadNotice !== null ? <Notice text={loadNotice} /> : null}
        {notice !== null ? <Notice text={notice} /> : null}

        <View style={styles.customerBlock}>
          <Pressable accessibilityRole="button" accessibilityLabel="Select customer" onPress={() => setCustomerOpen(true)} style={styles.selectCustomer}>
            <Feather name="user" size={27} color={color.faint} />
            <Text style={[styles.selectCustomerText, customerName && styles.selectedCustomerText]} numberOfLines={1}>
              {customerName || "Select Customer"}<Text style={styles.required}>*</Text>
            </Text>
            <Feather name="chevron-right" size={30} color={color.brand} />
          </Pressable>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={25} color={color.faint} />
            <AddressInput
              value={jobAddress}
              onChange={setJobAddress}
              placeholder="Job location"
              accessibilityLabel="Job location"
              style={styles.locationInput}
              containerStyle={styles.locationInputWrap}
            />
          </View>
        </View>

        <View style={styles.detailsBlock}>
          <View style={styles.detailField}>
            <Text style={styles.detailLabel}>Estimate Date</Text>
            <Text style={styles.detailValue}>{fmtEt(estimate?.created_at ?? new Date().toISOString(), { month: "short", day: "numeric", year: "numeric" })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change expiry date"
            onPress={() => setExpiresAtIso(futureIso(Math.max(14, Math.round((Date.parse(expiresAtIso) - Date.now()) / 86_400_000) + 14)))}
            style={styles.detailField}
          >
            <Text style={styles.detailLabel}>Expiry Date</Text>
            <Text style={styles.detailValue}>{fmtEt(expiresAtIso, { month: "short", day: "numeric", year: "numeric" })}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quantity type"
            onPress={() => setQuantityType((current) => current === "Qty" ? "Sq Ft" : "Qty")}
            style={styles.quantityRow}
          >
            <View>
              <Text style={styles.detailLabel}>Quantity Type<Text style={styles.required}>*</Text></Text>
              <Text style={styles.detailValue}>{quantityType}</Text>
            </View>
            <Feather name="chevron-right" size={30} color={color.brand} />
          </Pressable>
          <View style={styles.detailField}>
            <Text style={styles.detailLabel}>Job name</Text>
            <TextInput
              value={jobName}
              onChangeText={setJobName}
              placeholder="Optional job name"
              placeholderTextColor={color.faint}
              accessibilityLabel="Job name"
              style={styles.jobNameInput}
            />
          </View>
        </View>

        <CategoryBar label="Service" onAdd={() => openCatalog("service")} />
        {lines.filter((line) => line.category === "service").map((line) => (
          <LineEditor key={line.key} line={line} onChange={(patch) => patchLine(line.key, patch)} onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))} />
        ))}
        <CategoryBar label="Material" onAdd={() => openCatalog("material")} />
        {lines.filter((line) => line.category === "material").map((line) => (
          <LineEditor key={line.key} line={line} onChange={(patch) => patchLine(line.key, patch)} onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))} />
        ))}
        <CategoryBar label="Product" onAdd={() => openCatalog("product")} />
        {lines.filter((line) => line.category === "product").map((line) => (
          <LineEditor key={line.key} line={line} onChange={(patch) => patchLine(line.key, patch)} onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))} />
        ))}

        <View style={styles.totalBar}>
          <Text style={styles.totalLabel}>Estimate Total</Text>
          <Text style={styles.totalValue}>{fmtMoney(subtotal)}</Text>
        </View>
      </ScrollView>

      <Modal visible={customerOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCustomerOpen(false)}>
        <View style={styles.pickerScreen} accessibilityViewIsModal>
          <View style={{ height: insets.top, backgroundColor: color.chrome }} />
          <View style={styles.pickerHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setCustomerOpen(false)} style={styles.headerBack}>
              <Feather name="chevron-left" size={31} color={color.brand} />
              <Text style={styles.headerTitle}>MY CUSTOMERS</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="New customer" onPress={() => { setCustomerOpen(false); router.push("/(owner)/customer/new"); }} style={styles.addCustomer}>
              <Text style={styles.addCustomerText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.customerSearchWrap}>
            <Feather name="search" size={25} color={color.faint} />
            <TextInput value={customerSearch} onChangeText={setCustomerSearch} placeholder="Search Customer" placeholderTextColor={color.faint} style={styles.customerSearch} />
          </View>
          <SectionList
            sections={customerSections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => <View style={styles.letterHeader}><Text style={styles.letter}>{section.title}</Text></View>}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.name ?? "customer"}`} onPress={() => chooseCustomer(item)} style={({ pressed }) => [styles.customerRow, pressed && styles.categoryPressed]}>
                <View style={styles.customerRowCopy}>
                  <Text style={styles.customerRowName}>{item.name ?? item.phone ?? "Customer"}</Text>
                  <Text style={styles.customerRowCity}>{cityOf(item)}</Text>
                </View>
                <View style={styles.repeatBadge}><Text style={styles.repeatText}>R</Text></View>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyPicker}>No customers match that search.</Text>}
          />
        </View>
      </Modal>

      <Modal visible={catalogOpen} transparent animationType="slide" onRequestClose={() => setCatalogOpen(false)}>
        <View style={styles.sheetScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCatalogOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.catalogSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.catalogTitleRow}>
              <Text style={styles.catalogTitle}>Add {pickerCategory}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCatalogOpen(false)}><Feather name="x" size={27} color={color.muted} /></Pressable>
            </View>
            <View style={styles.catalogSearchWrap}>
              <Feather name="search" size={21} color={color.faint} />
              <TextInput value={catalogSearch} onChangeText={setCatalogSearch} placeholder={`Search ${pickerCategory}s`} placeholderTextColor={color.faint} style={styles.catalogSearch} />
            </View>
            {catalogNotice !== null ? <Notice text={catalogNotice} /> : null}
            <ScrollView style={styles.catalogList} keyboardShouldPersistTaps="handled">
              {catalogMatches.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} onPress={() => addCatalog(item)} style={styles.catalogRow}>
                  <View style={styles.catalogRowCopy}><Text style={styles.catalogName}>{item.name}</Text>{item.description ? <Text numberOfLines={1} style={styles.catalogDescription}>{item.description}</Text> : null}</View>
                  <Text style={styles.catalogPrice}>{fmtMoney(item.default_price_cents)}</Text>
                  <Text style={styles.catalogPlus}>+</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="Add custom item" onPress={() => { setLines((current) => [...current, customLine(pickerCategory, estimateType)]); setCatalogOpen(false); }} style={styles.customRow}>
                <Feather name="plus-circle" size={20} color={color.brand} />
                <Text style={styles.customText}>Custom {pickerCategory}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.surface },
  headerBack: { minHeight: HIT, flex: 1, flexDirection: "row", alignItems: "center", marginLeft: -8 },
  headerTitle: { flexShrink: 1, fontFamily: font.bodyMedium, fontSize: 17, letterSpacing: 1.2, color: color.ink },
  saveButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 1 },
  customerBlock: { paddingHorizontal: 18, paddingTop: 40, paddingBottom: 30, borderBottomWidth: 12, borderBottomColor: color.hover },
  selectCustomer: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 16 },
  selectCustomerText: { flex: 1, fontFamily: font.body, fontSize: 21, color: color.muted },
  selectedCustomerText: { color: color.ink },
  required: { color: color.danger },
  locationRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 15, borderBottomWidth: 1, borderBottomColor: color.lineStrong },
  locationInputWrap: { flex: 1 },
  locationInput: { paddingHorizontal: 0, borderWidth: 0, backgroundColor: "transparent", fontFamily: font.body, fontSize: 19, color: color.ink },
  detailsBlock: { paddingHorizontal: 18, paddingVertical: 22, gap: 18, borderBottomWidth: 12, borderBottomColor: color.hover },
  detailField: { minHeight: 68, justifyContent: "center", gap: 7, borderBottomWidth: 1, borderBottomColor: color.lineStrong },
  detailLabel: { fontFamily: font.bodyMedium, fontSize: 14, color: color.muted },
  detailValue: { fontFamily: font.body, fontSize: 20, color: color.ink },
  quantityRow: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  jobNameInput: { fontFamily: font.body, fontSize: 19, color: color.ink, paddingVertical: 0 },
  categoryBar: { minHeight: 78, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.hover, borderBottomWidth: 10, borderBottomColor: color.surface },
  categoryPressed: { backgroundColor: color.brandWash },
  categoryLabel: { fontFamily: font.bodySemi, fontSize: 23, color: color.ink },
  categoryPlus: { fontFamily: font.body, fontSize: 37, lineHeight: 39, color: color.brand },
  lineEditor: { padding: 18, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  lineEditorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineKind: { ...type.rule, color: color.brandDeep },
  lineNameInput: { minHeight: 42, fontFamily: font.bodySemi, fontSize: 19, color: color.ink, borderBottomWidth: 1, borderBottomColor: color.line },
  lineFields: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  lineFieldSmall: { width: 58, gap: 4 },
  lineFieldPrice: { width: 88, gap: 4 },
  fieldLabel: { ...type.ruleSm, color: color.muted },
  lineInput: { minHeight: 38, paddingHorizontal: 8, borderWidth: 1, borderColor: color.lineStrong, borderRadius: 7, fontFamily: font.body, fontSize: 15, color: color.ink },
  taxToggle: { minHeight: 38, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.lineStrong, borderRadius: 7 },
  taxToggleOn: { backgroundColor: color.brandWash, borderColor: color.brandEdge },
  taxText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  taxTextOn: { color: color.brandDeep },
  lineTotal: { marginLeft: "auto", paddingBottom: 8, fontFamily: font.bodySemi, fontSize: 15, color: color.ink },
  totalBar: { minHeight: 82, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.brandWash },
  totalLabel: { fontFamily: font.bodySemi, fontSize: 19, color: color.ink },
  totalValue: { fontFamily: font.display, fontSize: 26, color: color.ink, fontVariant: ["tabular-nums"] },
  pickerScreen: { flex: 1, backgroundColor: color.surface },
  pickerHeader: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addCustomer: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: color.brandFill },
  addCustomerText: { fontFamily: font.body, fontSize: 37, lineHeight: 39, color: color.surface, marginTop: -3 },
  customerSearchWrap: { height: 62, marginHorizontal: 18, marginBottom: 20, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, backgroundColor: color.bg },
  customerSearch: { flex: 1, fontFamily: font.body, fontSize: 18, color: color.ink },
  letterHeader: { height: 37, justifyContent: "center", paddingHorizontal: 18, backgroundColor: color.hover },
  letter: { fontFamily: font.bodySemi, fontSize: 18, color: color.muted },
  customerRow: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineStrong },
  customerRowCopy: { flex: 1, gap: 7 },
  customerRowName: { fontFamily: font.body, fontSize: 20, color: color.ink },
  customerRowCity: { fontFamily: font.body, fontSize: 15, color: color.muted },
  repeatBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: color.brandSoft },
  repeatText: { fontFamily: font.bodySemi, fontSize: 12, color: color.brandDeep },
  emptyPicker: { ...type.body, textAlign: "center", color: color.muted, padding: 30 },
  sheetScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  catalogSheet: { height: "80%", backgroundColor: color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  sheetHandle: { alignSelf: "center", width: 52, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginBottom: 18 },
  catalogTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  catalogTitle: { fontFamily: font.display, fontSize: 27, color: color.ink, textTransform: "capitalize" },
  catalogSearchWrap: { minHeight: 52, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, backgroundColor: color.bg },
  catalogSearch: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink },
  catalogList: { marginTop: 10 },
  catalogRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  catalogRowCopy: { flex: 1, gap: 3 },
  catalogName: { fontFamily: font.bodySemi, fontSize: 16, color: color.ink },
  catalogDescription: { ...type.small, color: color.muted },
  catalogPrice: { fontFamily: font.bodyMedium, fontSize: 14, color: color.ink },
  catalogPlus: { fontFamily: font.body, fontSize: 27, color: color.brand },
  customRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10 },
  customText: { fontFamily: font.bodySemi, fontSize: 16, color: color.brandDeep, textTransform: "capitalize" },
});
