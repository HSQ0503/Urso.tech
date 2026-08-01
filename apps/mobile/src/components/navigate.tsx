import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, HIT, radius, space, type } from "@/theme";

// "Navigate" — the most phone-native action there is, and the owner app had it
// in exactly zero places while the CREW app has had it all along
// (app/(crew)/job/[id].tsx builds the same URL). Addresses were dead text on
// every owner screen: not tappable, not even selectable to copy.
//
// maps.apple.com rather than a geo: or Google URL: it opens Apple Maps on a
// stock iPhone and falls through to the browser anywhere else, and it is the
// scheme the crew app already proved on a real device.
//
// This is a Linking.openURL, NOT a WebView navigation — the console's own maps
// links are target="_blank" to an external origin, which the WebView shell
// refuses on purpose (it will not put a page carrying our session cookie in a
// frame pointed off-origin).

export function navigateUrl(address: string | null): string | null {
  const trimmed = (address ?? "").trim();
  if (trimmed.length === 0) return null;
  return `http://maps.apple.com/?daddr=${encodeURIComponent(trimmed)}`;
}

export function NavigateButton({
  address,
  onFail,
  compact = false,
}: {
  address: string | null;
  onFail?: (notice: string) => void;
  compact?: boolean;
}) {
  const url = navigateUrl(address);
  if (url === null) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Navigate to this address"
      onPress={() => {
        Linking.openURL(url).catch(() =>
          onFail?.("This phone couldn't open Maps."),
        );
      }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        pressed && styles.pressed,
      ]}
    >
      <Feather name="navigation" size={15} color={color.brandDeep} />
      {compact ? null : <Text style={styles.label}>Navigate</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: HIT,
    minWidth: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  compact: { paddingHorizontal: 0 },
  pressed: { backgroundColor: color.hover },
  label: { ...type.small, color: color.brandDeep },
});
