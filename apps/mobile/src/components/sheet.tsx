// The bottom sheet.
//
// Creating a lead, a job, a customer, a calendar event, or booking a slot used
// to be a pushed route. On a phone that is three taps of navigation to fill in
// four fields, and the list you were working from disappears behind it. The
// redesign makes all five a sheet over the list instead: the context stays on
// screen, Cancel is always in the same place, and the confirm reads as one
// decision rather than a screen you have to escape.
//
// Field kinds are declarative so a caller describes the form rather than
// laying it out — every sheet in the app is then the same sheet.

import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, HIT, motion, radius, space, type } from "@/theme";
import { ChromeFurniture } from "@/components/ledger";

export type SheetField =
  // A single line — a name, a phone, an address.
  | { kind: "text"; key: string; label: string; placeholder?: string; keyboard?: "phone" | "email" }
  // The taller box notes go in.
  | { kind: "area"; key: string; label: string; placeholder?: string }
  // Read-only context the sheet was opened about ("this job, at this address").
  | { kind: "static"; key: string; label: string; value: string; sub?: string }
  // One of a short set — a crew, a source, an event kind.
  | { kind: "chips"; key: string; label: string; options: string[] }
  // One of a set of times. Same as chips, but mono, because they are figures.
  | { kind: "slots"; key: string; label: string; options: string[] }
  // A single yes/no.
  | { kind: "check"; key: string; label: string; text: string };

export type SheetValues = Record<string, string | boolean | undefined>;

export function Sheet({
  open,
  title,
  cta,
  fields,
  values,
  busy,
  note = "Times are Eastern (ET)",
  onChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  cta: string;
  fields: SheetField[];
  values: SheetValues;
  busy?: boolean;
  // Suppressed on sheets that carry no time at all.
  note?: string | null;
  onChange: (key: string, value: string | boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Only the entrance is animated. Modal unmounts on close, so animating the
    // exit would race the unmount and flash the half-slid panel.
    if (!open) {
      slide.setValue(0);
      return;
    }
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.sheet,
      easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onCancel}
          style={styles.scrim}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.lift}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.panel,
              {
                transform: [
                  {
                    translateY: slide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [700, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.head}>
              <ChromeFurniture />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onCancel}
                hitSlop={12}
                style={styles.headSide}
              >
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cta}
                accessibilityState={{ disabled: busy === true }}
                disabled={busy}
                onPress={onConfirm}
                hitSlop={12}
                style={[styles.headSide, styles.headRight]}
              >
                <Text style={[styles.cta, busy === true && styles.ctaOff]}>
                  {busy === true ? "Saving…" : cta}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.body,
                { paddingBottom: insets.bottom + space.lg },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {fields.map((field) => (
                <View key={field.key}>
                  <Text style={styles.label}>{field.label}</Text>
                  <FieldBody field={field} values={values} onChange={onChange} />
                </View>
              ))}
              {note ? <Text style={styles.note}>{note}</Text> : null}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function FieldBody({
  field,
  values,
  onChange,
}: {
  field: SheetField;
  values: SheetValues;
  onChange: (key: string, value: string | boolean) => void;
}): React.ReactElement {
  const raw = values[field.key];

  if (field.kind === "static") {
    return (
      <View style={styles.static}>
        <Text style={styles.staticValue}>{field.value}</Text>
        {field.sub ? <Text style={styles.staticSub}>{field.sub}</Text> : null}
      </View>
    );
  }

  if (field.kind === "check") {
    const on = raw === true;
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={field.text}
        onPress={() => onChange(field.key, !on)}
        style={styles.check}
      >
        <View style={[styles.box, on && styles.boxOn]}>
          {on ? <Text style={styles.boxMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkText}>{field.text}</Text>
      </Pressable>
    );
  }

  if (field.kind === "chips" || field.kind === "slots") {
    const slot = field.kind === "slots";
    return (
      <View style={slot ? styles.slotWrap : styles.chipWrap}>
        {field.options.map((option) => {
          const on = raw === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={option}
              onPress={() => onChange(field.key, option)}
              style={[slot ? styles.slot : styles.chip, on && styles.optionOn]}
            >
              <Text
                style={[slot ? styles.slotText : styles.chipText, on && styles.optionTextOn]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const area = field.kind === "area";
  return (
    <TextInput
      value={typeof raw === "string" ? raw : ""}
      onChangeText={(next) => onChange(field.key, next)}
      placeholder={field.placeholder}
      placeholderTextColor={color.faint}
      multiline={area}
      textAlignVertical={area ? "top" : "center"}
      keyboardType={
        field.kind === "text" && field.keyboard === "phone"
          ? "phone-pad"
          : field.kind === "text" && field.keyboard === "email"
            ? "email-address"
            : "default"
      }
      autoCapitalize={field.kind === "text" && field.keyboard === "email" ? "none" : "sentences"}
      accessibilityLabel={field.label}
      style={[styles.input, area && styles.inputArea]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim },
  lift: { justifyContent: "flex-end" },
  panel: {
    maxHeight: "82%",
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: "hidden",
  },

  head: {
    backgroundColor: color.chrome,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    overflow: "hidden",
    position: "relative",
  },
  // Equal flex either side keeps the title optically centred regardless of how
  // long "Cancel" and the CTA are.
  headSide: { flex: 1 },
  headRight: { alignItems: "flex-end" },
  cancel: { fontFamily: font.body, fontSize: 14, color: color.chromeMuted },
  title: { fontFamily: font.display, fontSize: 16, letterSpacing: -0.45, color: color.chromeInk },
  cta: { fontFamily: font.bodySemi, fontSize: 14, color: color.brand },
  ctaOff: { color: color.chromeMuted },

  body: { padding: 16, gap: 16 },
  label: { ...type.rule, color: color.faint, marginBottom: 8 },
  note: { ...type.rule, lineHeight: 15, letterSpacing: 1, color: color.faint },

  input: {
    // minHeight, never a fixed height: iOS mis-tracks a custom-font placeholder
    // when the field's height is constrained rather than derived.
    minHeight: HIT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    fontFamily: font.body,
    fontSize: 15,
    // Explicit, and never a lineHeight: iOS tracks a custom-font placeholder far
    // too wide unless the kern attribute is actually set.
    letterSpacing: 0,
    color: color.ink,
  },
  inputArea: { minHeight: 76, paddingTop: 13, paddingBottom: 13 },

  static: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: 13,
  },
  staticValue: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.ink },
  staticSub: { ...type.small, color: color.muted, marginTop: 4 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  chipText: { fontFamily: font.body, fontSize: 13, color: color.muted },

  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slot: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  slotText: { fontFamily: font.mono, fontSize: 12.5, color: color.muted },

  optionOn: { borderColor: color.brand, backgroundColor: color.brandSoft },
  optionTextOn: { color: color.brandDeep },

  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    height: HIT,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: color.good, backgroundColor: color.goodBg },
  boxMark: { fontFamily: font.body, fontSize: 15, color: color.good },
  checkText: { fontFamily: font.body, fontSize: 15, color: color.ink },
});
