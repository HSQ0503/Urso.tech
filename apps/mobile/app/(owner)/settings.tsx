import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { settingsActions } from "@/api";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { keys, useSettings } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

type Draft = { estimateMessage: string; estimateTerms: string; expiryDays: string; taxPercent: string; confirmationHours: string };
const EMPTY: Draft = { estimateMessage: "", estimateTerms: "", expiryDays: "", taxPercent: "", confirmationHours: "" };

export default function SettingsScreen(): React.ReactElement {
  const router = useRouter(); const insets = useSafeAreaInsets(); const settingsQuery = useSettings(); const { refreshing, onRefresh } = usePullToRefresh(settingsQuery.refetch);
  const saveSettings = useAction((settings: Record<string, unknown>) => settingsActions.save(settings), { invalidates: [keys.settings()] });
  const [draft, setDraft] = useState<Draft>(EMPTY); const [ready, setReady] = useState(false); const [actionNotice, setActionNotice] = useState<string | null>(null); const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { const settings = settingsQuery.data; if (!settings || ready) return; setDraft({ estimateMessage: settings.estimate_message, estimateTerms: settings.estimate_terms, expiryDays: String(settings.estimate_expiry_days), taxPercent: String(settings.estimate_tax_rate_bps / 100), confirmationHours: String(settings.confirmation_offset_hours) }); setReady(true); }, [ready, settingsQuery.data]);
  const save = async () => { setActionNotice(null); setSaved(null); const result = await saveSettings.mutateAsync({ estimate_message: draft.estimateMessage, estimate_terms: draft.estimateTerms, estimate_expiry_days: Math.round(Number(draft.expiryDays)), estimate_tax_rate_bps: Math.round(Number(draft.taxPercent) * 100), confirmation_offset_hours: Math.round(Number(draft.confirmationHours)) }); if (!result.ok) setActionNotice(result.notice); else setSaved("Settings saved."); };
  return <View style={styles.screen}><ChromeBar title="Settings" sub="Business defaults and automations" onBack={() => router.back()} />
    {settingsQuery.isPending ? <View style={styles.centre}><ActivityIndicator color={color.brand} /></View> : <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Notice text={noticeFrom(settingsQuery.error)} /><Notice text={actionNotice} />{saved ? <View style={styles.goodNotice}><Text style={styles.goodText}>{saved}</Text></View> : null}
      <View style={styles.section}><Text style={styles.rule}>Estimate defaults</Text><View style={styles.card}>
        <Field label="Message to customer"><TextInput value={draft.estimateMessage} onChangeText={(estimateMessage) => setDraft({ ...draft, estimateMessage })} multiline style={[styles.input, styles.textarea]} /></Field>
        <Field label="Terms"><TextInput value={draft.estimateTerms} onChangeText={(estimateTerms) => setDraft({ ...draft, estimateTerms })} multiline style={[styles.input, styles.textareaTall]} /></Field>
        <View style={styles.inputRow}><View style={styles.grow}><Field label="Expires after (days)"><TextInput value={draft.expiryDays} onChangeText={(expiryDays) => setDraft({ ...draft, expiryDays })} keyboardType="number-pad" style={styles.input} /></Field></View><View style={styles.grow}><Field label="Tax rate (%)"><TextInput value={draft.taxPercent} onChangeText={(taxPercent) => setDraft({ ...draft, taxPercent })} keyboardType="decimal-pad" style={styles.input} /></Field></View></View>
      </View></View>
      <View style={styles.section}><Text style={styles.rule}>Automation timing</Text><View style={[styles.card, styles.pad]}><Field label="Appointment confirmation lead time (hours)"><TextInput value={draft.confirmationHours} onChangeText={(confirmationHours) => setDraft({ ...draft, confirmationHours })} keyboardType="number-pad" style={styles.input} /></Field><Text style={styles.muted}>Customer confirmations and reminder templates continue to use the same server automation engine as the website.</Text></View></View>
      <Pressable accessibilityRole="button" disabled={!ready || saveSettings.isPending} onPress={() => void save()} style={({ pressed }) => [styles.primary, (!ready || saveSettings.isPending) && styles.disabled, pressed && styles.primaryDown]}><Text style={styles.primaryText}>{saveSettings.isPending ? "Saving…" : "Save settings"}</Text></Pressable>
    </ScrollView>}
  </View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg }, centre: { flex: 1, alignItems: "center", justifyContent: "center" }, body: { padding: space.lg, gap: space.lg }, section: { gap: 8 }, rule: { ...type.micro, color: color.faint }, card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, backgroundColor: color.surface, padding: space.lg, gap: 16 }, pad: { padding: space.lg }, field: { gap: 7 }, label: { ...type.micro, color: color.muted }, input: { minHeight: HIT + 6, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong, backgroundColor: color.surface, paddingHorizontal: 14, fontFamily: font.body, fontSize: 15, color: color.ink }, textarea: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" }, textareaTall: { minHeight: 150, paddingTop: 12, textAlignVertical: "top" }, inputRow: { flexDirection: "row", gap: 10 }, grow: { flex: 1 }, muted: { ...type.small, color: color.muted }, goodNotice: { borderRadius: radius.md, backgroundColor: color.goodBg, padding: 12 }, goodText: { ...type.small, color: color.good }, primary: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: color.brandFill }, primaryDown: { backgroundColor: color.brandDown }, primaryText: { ...type.title, color: color.chromeInk }, disabled: { opacity: 0.45 },
});
