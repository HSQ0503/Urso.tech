import { StyleSheet, Text, View } from "react-native";
import { color, font } from "@/theme";

// The person mark. There are no customer photos in the data model, so identity
// is a monogram — Fraunces initials on the brand-soft wash, hairline-bordered
// like every other surface. One component everywhere a person appears, so "who
// this is" always looks the same: job sheet, customer book, customer profile.

function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 44 }: { name: string | null; size?: number }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.mark, { fontSize: Math.round(size * 0.4) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: color.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { fontFamily: font.display, color: color.brandDeep },
});
