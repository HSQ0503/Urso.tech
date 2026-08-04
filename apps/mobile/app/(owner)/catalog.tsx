import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { fmtMoney, type CatalogItem, type CatalogKind } from "@urso/types";
import { catalogActions } from "@/api";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { keys, useCatalog } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

type Draft = { id?: string; name: string; description: string; kind: CatalogKind; price: string; unit: string };
const EMPTY: Draft = { name: "", description: "", kind: "service", price: "", unit: "job" };
function inputToCents(value: string): number { const amount = Number(value.replace(/[^0-9.]/g, "")); return Number.isFinite(amount) ? Math.round(amount * 100) : 0; }
function fromItem(item: CatalogItem): Draft { return { id: item.id, name: item.name, description: item.description ?? "", kind: item.kind, price: (item.default_price_cents / 100).toFixed(2), unit: item.unit }; }

export default function CatalogScreen(): React.ReactElement {
  const router = useRouter(); const insets = useSafeAreaInsets();
  const catalogQuery = useCatalog(); const { refreshing, onRefresh } = usePullToRefresh(catalogQuery.refetch);
  const saveItem = useAction((draft: Draft) => catalogActions.upsert({ id: draft.id, name: draft.name, kind: draft.kind, defaultPriceCents: inputToCents(draft.price), description: draft.description || null, unit: draft.unit, active: true }), { invalidates: [keys.catalog()] });
  const deleteItem = useAction((id: string) => catalogActions.delete(id), { invalidates: [keys.catalog()] });
  const [draft, setDraft] = useState<Draft | null>(null); const [actionNotice, setActionNotice] = useState<string | null>(null);
  const save = async () => { if (!draft) return; setActionNotice(null); const result = await saveItem.mutateAsync(draft); if (!result.ok) setActionNotice(result.notice); else setDraft(null); };
  const remove = (item: CatalogItem) => Alert.alert("Remove from price list?", item.name, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void deleteItem.mutateAsync(item.id) }]);

  return <View style={styles.screen}>
    <ChromeBar title="Price list" sub={`${(catalogQuery.data ?? []).filter((item) => item.active).length} active items`} onBack={() => router.back()} action="New" onAction={() => setDraft({ ...EMPTY })} />
    {catalogQuery.isPending ? <View style={styles.centre}><ActivityIndicator color={color.brand} /></View> : <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Notice text={noticeFrom(catalogQuery.error)} />
      {draft ? <View style={[styles.card, styles.form]}>
        <Text style={styles.cardTitle}>{draft.id ? "Edit item" : "New item"}</Text><Notice text={actionNotice} />
        <Text style={styles.label}>Name</Text><TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="House wash" placeholderTextColor={color.faint} style={styles.input} />
        <Text style={styles.label}>Description</Text><TextInput value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="What is included" placeholderTextColor={color.faint} multiline style={[styles.input, styles.multiline]} />
        <View style={styles.kindRow}>{(["service", "product"] as CatalogKind[]).map((kind) => <Pressable key={kind} onPress={() => setDraft({ ...draft, kind })} style={[styles.kind, draft.kind === kind && styles.kindOn]}><Text style={[styles.kindText, draft.kind === kind && styles.kindTextOn]}>{kind === "service" ? "Service" : "Product"}</Text></Pressable>)}</View>
        <View style={styles.inputRow}><View style={styles.grow}><Text style={styles.label}>Default price</Text><TextInput value={draft.price} onChangeText={(price) => setDraft({ ...draft, price })} placeholder="0.00" placeholderTextColor={color.faint} keyboardType="decimal-pad" style={styles.input} /></View><View style={styles.grow}><Text style={styles.label}>Unit</Text><TextInput value={draft.unit} onChangeText={(unit) => setDraft({ ...draft, unit })} placeholder="job" placeholderTextColor={color.faint} style={styles.input} /></View></View>
        <View style={styles.buttonRow}><Pressable onPress={() => setDraft(null)} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></Pressable><Pressable disabled={!draft.name.trim() || saveItem.isPending} onPress={() => void save()} style={[styles.primary, (!draft.name.trim() || saveItem.isPending) && styles.disabled]}><Text style={styles.primaryText}>{saveItem.isPending ? "Saving…" : "Save item"}</Text></Pressable></View>
      </View> : null}
      <View style={styles.section}><Text style={styles.rule}>Services & products</Text><View style={styles.list}>{(catalogQuery.data ?? []).length === 0 ? <Text style={styles.empty}>No price-list items yet.</Text> : (catalogQuery.data ?? []).map((item, index) => <Pressable key={item.id} onPress={() => setDraft(fromItem(item))} style={({ pressed }) => [styles.row, index > 0 && styles.divided, pressed && styles.pressed]}><View style={styles.rowBody}><View style={styles.rowTop}><Text style={styles.rowTitle}>{item.name}</Text><View style={styles.chip}><Text style={styles.chipText}>{item.kind.toUpperCase()}</Text></View></View>{item.description ? <Text style={styles.muted} numberOfLines={2}>{item.description}</Text> : null}<Text style={styles.muted}>per {item.unit}</Text></View><Text style={styles.money}>{fmtMoney(item.default_price_cents)}</Text><Pressable accessibilityLabel={`Remove ${item.name}`} onPress={() => remove(item)} style={styles.trash}><Feather name="trash-2" size={16} color={color.danger} /></Pressable></Pressable>)}</View></View>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg }, centre: { flex: 1, alignItems: "center", justifyContent: "center" }, body: { padding: space.lg, gap: space.lg }, section: { gap: 8 }, rule: { ...type.micro, color: color.faint },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface }, form: { padding: space.lg, gap: 10 }, cardTitle: { ...type.title, color: color.ink }, label: { ...type.micro, color: color.muted }, input: { minHeight: HIT + 6, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, paddingHorizontal: 14, fontFamily: font.body, fontSize: 15, color: color.ink, backgroundColor: color.surface }, multiline: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" },
  kindRow: { flexDirection: "row", gap: 8 }, kind: { flex: 1, minHeight: HIT, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line }, kindOn: { borderColor: color.brand, backgroundColor: color.brandSoft }, kindText: { ...type.small, fontFamily: font.bodySemi, color: color.muted }, kindTextOn: { color: color.brandDeep }, inputRow: { flexDirection: "row", gap: 10 }, grow: { flex: 1 }, buttonRow: { flexDirection: "row", gap: 8 }, button: { flex: 1, minHeight: HIT, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong }, buttonText: { ...type.body, color: color.ink }, primary: { flex: 1, minHeight: HIT, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.brandFill }, primaryText: { ...type.body, fontFamily: font.bodySemi, color: color.chromeInk }, disabled: { opacity: 0.45 },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, overflow: "hidden" }, row: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.lg, paddingVertical: 12 }, divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line }, pressed: { backgroundColor: color.hover }, rowBody: { flex: 1, gap: 4 }, rowTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }, rowTitle: { ...type.title, color: color.ink }, chip: { borderRadius: radius.sm, backgroundColor: color.hover, paddingHorizontal: 7, paddingVertical: 4 }, chipText: { ...type.micro, color: color.muted }, muted: { ...type.small, color: color.muted }, money: { ...type.body, fontFamily: font.bodySemi, color: color.ink, fontVariant: ["tabular-nums"] }, trash: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", marginRight: -10 }, empty: { ...type.body, color: color.muted, padding: space.lg },
});
