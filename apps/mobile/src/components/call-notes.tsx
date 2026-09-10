import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { CallOutcome } from "@/api";
import { color, font, HIT, radius, space, type } from "@/theme";

const outcomes: { value: CallOutcome; label: string }[] = [
  { value: "closed", label: "Closed" },
  { value: "follow_up", label: "Follow up" },
  { value: "no_answer", label: "No answer" },
  { value: "lost", label: "Lost" },
];

export function CallNotes({ note, onChange, onSave, busy }: {
  note: string;
  onChange: (note: string) => void;
  onSave: (outcome: CallOutcome) => void;
  busy: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Call notes (optional)</Text>
      <TextInput
        accessibilityLabel="Call notes"
        value={note}
        onChangeText={onChange}
        editable={!busy}
        multiline
        maxLength={4000}
        textAlignVertical="top"
        placeholder="What did they need? When should we call back?"
        placeholderTextColor={color.muted}
        style={styles.input}
      />
      <Text style={styles.hint}>Choose an outcome to save. Notes are shared with your team.</Text>
      <View style={styles.grid}>
        {outcomes.map(({ value, label }) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Save call: ${label}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => { Keyboard.dismiss(); onSave(value); }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}
          ><Text style={styles.buttonText}>{label}</Text></Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { fontFamily: font.bodySemi, fontSize: 15, color: color.ink },
  input: { minHeight: 108, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.bg, fontFamily: font.body, fontSize: 16, lineHeight: 23, color: color.ink },
  hint: { ...type.small, color: color.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { flexBasis: "47%", flexGrow: 1, minHeight: HIT, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: color.brandEdgeSoft, backgroundColor: color.brandWash },
  buttonText: { fontFamily: font.bodyMedium, fontSize: 16, color: color.brandDeep },
  pressed: { backgroundColor: color.brandPressed },
  disabled: { opacity: 0.45 },
});
