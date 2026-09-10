import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addCalendarDays, dateInput, dateLabel, isCalendarDate, parseDateInput, todayEt } from "@/dates";
import { color, font, HIT, radius, space, type } from "@/theme";

type Props = {
  visible: boolean;
  value: string;
  title?: string;
  minimumDate?: string;
  onChange: (date: string) => void;
  onClose: () => void;
};

export function DatePicker(props: Props): React.ReactElement | null {
  return props.visible ? <Calendar {...props} /> : null;
}

function Calendar({ value, title = "Choose date", minimumDate, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const today = todayEt();
  const initial = isCalendarDate(value) ? value : today;
  const [draft, setDraft] = useState(initial);
  const [input, setInput] = useState(dateInput(initial));
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [notice, setNotice] = useState<string | null>(null);
  const first = new Date(`${month}-01T12:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((first.getUTCDay() + count) / 7) * 7 }, (_, index) => {
    const day = index - first.getUTCDay() + 1;
    return day > 0 && day <= count ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
  const valid = parseDateInput(input);
  const allowed = valid !== null && (!minimumDate || valid >= minimumDate);

  function choose(date: string) {
    Keyboard.dismiss();
    setDraft(date);
    setInput(dateInput(date));
    setMonth(date.slice(0, 7));
    setNotice(null);
  }

  function moveMonth(delta: number) {
    const date = new Date(first);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cancel date selection" onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.lift}>
          <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space.md) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel date selection" onPress={onClose} style={styles.icon}>
                <Feather name="x" size={23} color={color.muted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.body}>
              <Text style={styles.label}>Date · MM/DD/YYYY</Text>
              <TextInput
                accessibilityLabel="Date in MM/DD/YYYY"
                value={input}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={color.muted}
                autoCorrect={false}
                selectTextOnFocus
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onChangeText={(next) => {
                  setInput(next);
                  const parsed = parseDateInput(next);
                  if (parsed) { setDraft(parsed); setMonth(parsed.slice(0, 7)); }
                  setNotice(null);
                }}
                onBlur={() => {
                  if (!allowed) setNotice(valid ? "Choose today or a later date." : "Enter a real date, such as 09/30/2026.");
                }}
                style={styles.input}
              />
              <View style={styles.shortcuts}>
                {[0, 7, 14, 30].map((days) => (
                  <Pressable key={days} accessibilityRole="button" accessibilityLabel={days === 0 ? "Today" : `In ${days} days`} onPress={() => choose(addCalendarDays(today, days))} style={styles.shortcut}>
                    <Text style={styles.shortcutText}>{days === 0 ? "Today" : `+${days} days`}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.monthBar}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={styles.icon}>
                  <Feather name="chevron-left" size={24} color={color.ink} />
                </Pressable>
                <View style={styles.monthCenter}>
                  <Text style={styles.month}>{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Show this month" onPress={() => setMonth(today.slice(0, 7))} style={styles.thisMonth}>
                    <Text style={styles.shortcutText}>This month</Text>
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={styles.icon}>
                  <Feather name="chevron-right" size={24} color={color.ink} />
                </Pressable>
              </View>
              <View style={styles.grid}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <View key={index} style={styles.weekday}><Text style={styles.weekdayText}>{day}</Text></View>)}
                {cells.map((date, index) => {
                  const disabled = date === null || Boolean(minimumDate && date < minimumDate);
                  const selected = date === draft && date === valid;
                  return (
                    <View key={date ?? `empty-${index}`} style={styles.cell}>
                      {date ? <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={dateLabel(date)}
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled}
                        onPress={() => choose(date)}
                        style={({ pressed }) => [styles.day, date === today && styles.today, selected && styles.selected, disabled && styles.disabled, pressed && !selected && styles.pressed]}
                      ><Text style={[styles.dayText, selected && styles.selectedText]}>{Number(date.slice(8))}</Text></Pressable> : null}
                    </View>
                  );
                })}
              </View>
              {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <Text style={styles.summary}>{allowed ? dateLabel(valid) : "Choose a valid date"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Use selected date" accessibilityState={{ disabled: !allowed }} disabled={!allowed} onPress={() => { if (allowed) { onChange(valid); onClose(); } }} style={[styles.confirm, !allowed && styles.disabled]}>
                <Text style={styles.confirmText}>Use date</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  lift: { maxHeight: "94%" },
  panel: { flexShrink: 1, backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: color.lineStrong, alignSelf: "center", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8 },
  title: { ...type.heading, color: color.ink },
  icon: { minWidth: HIT, minHeight: HIT, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 16, paddingBottom: 8 },
  label: { ...type.small, color: color.muted, marginBottom: 6 },
  input: { minHeight: HIT, borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.sm, paddingHorizontal: 12, fontFamily: font.body, fontSize: 17, color: color.ink },
  shortcuts: { flexDirection: "row", gap: 6, marginTop: 10 },
  shortcut: { flex: 1, minHeight: HIT, alignItems: "center", justifyContent: "center", backgroundColor: color.brandWash, borderRadius: radius.sm },
  shortcutText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.brandDeep },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  monthCenter: { alignItems: "center" },
  month: { fontFamily: font.bodySemi, fontSize: 18, color: color.ink },
  thisMonth: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.285714%", height: 26, alignItems: "center" },
  weekdayText: { ...type.small, color: color.muted },
  cell: { width: "14.285714%", minHeight: 46, padding: 1 },
  day: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  today: { borderColor: color.brandEdge },
  selected: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  dayText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.ink },
  selectedText: { color: color.chromeInk },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: color.hover },
  error: { ...type.small, color: color.danger, marginTop: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 10, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  summary: { ...type.small, color: color.muted, textAlign: "center" },
  confirm: { minHeight: HIT, alignItems: "center", justifyContent: "center", backgroundColor: color.brandFill, borderRadius: radius.md },
  confirmText: { fontFamily: font.bodySemi, fontSize: 16, color: color.chromeInk },
});
