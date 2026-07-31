import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme";

// The refusal surface. Every mutation's ok:false lands here, VERBATIM — the
// sentences are written server-side for the reader, and this component's whole
// job is to not touch them. Null renders nothing so call sites can pass their
// state straight through.

export function Notice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  text: { ...type.small, color: color.danger },
});
