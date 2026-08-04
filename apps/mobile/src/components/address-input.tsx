import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { API_BASE } from "@/api";
import { color, font, HIT, radius, space, type } from "@/theme";

// Street-address input with search-as-you-type suggestions — Sebastian's
// Markate-parity ask, on the SAME endpoint the web now uses: the app calls
// /api/canes/address-search (the server-side Photon proxy from 0ad2466), so
// mobile and web can never disagree about what an address search returns.
// Results are Palm-Beach-biased and Florida-boxed by the proxy. The field
// always accepts free text; a network miss costs nothing but suggestions.

const STATE_ABBR: Record<string, string> = { Florida: "FL", Georgia: "GA", Alabama: "AL" };

type PhotonProps = {
  housenumber?: string;
  street?: string;
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  district?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
};

// Mirrors the web's labelFor exactly: "390 Evergreen Ave, West Palm Beach, FL
// 33461", with a street-only hit inheriting the house number already typed so
// picking a suggestion never loses the number.
function labelFor(p: PhotonProps, query: string): string | null {
  if (p.countrycode && p.countrycode !== "US") return null;
  const street = p.street ?? p.name;
  let house = p.housenumber;
  if (!house && street) house = /^\s*(\d+[a-zA-Z]?)\s+\S/.exec(query)?.[1];
  const line1 = house && street ? `${house} ${street}` : street;
  if (!line1) return null;
  const city = p.city ?? p.town ?? p.village ?? p.district;
  const state = p.state ? (STATE_ABBR[p.state] ?? p.state) : null;
  const tail = state && p.postcode ? `${state} ${p.postcode}` : (state ?? p.postcode);
  return [line1, city, tail].filter(Boolean).join(", ");
}

export function AddressInput({
  value,
  onChange,
  placeholder = "Street, city",
  editable = true,
  style,
  containerStyle,
  accessibilityLabel = "Street address",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Ignore out-of-order responses: a slow answer for "390 e" must never
  // overwrite the list for "390 evergreen".
  const seq = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 3) {
      setSugs([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/canes/address-search?q=${encodeURIComponent(query)}`,
        );
        if (!res.ok || mine !== seq.current) return;
        const body = (await res.json()) as { features?: Array<{ properties?: PhotonProps }> };
        if (mine !== seq.current) return;
        const labels = (body.features ?? [])
          .map((f) => labelFor(f.properties ?? {}, query))
          .filter((l): l is string => l !== null);
        // De-dupe while keeping Photon's relevance order.
        setSugs([...new Set(labels)].slice(0, 5));
      } catch {
        // Free text still works; suggestions just stay away.
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, open]);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(v) => {
            setOpen(true);
            onChange(v);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let a suggestion tap land before the list unmounts.
            setTimeout(() => setOpen(false), 150);
          }}
          onSubmitEditing={() => {
            const first = sugs[0];
            if (!first) return;
            onChange(first);
            setOpen(false);
            setSugs([]);
          }}
          placeholder={placeholder}
          placeholderTextColor={color.faint}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          importantForAutofill="yes"
          returnKeyType={sugs.length > 0 ? "done" : "next"}
          editable={editable}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Type at least three characters, then choose a suggested address"
          style={[styles.input, style]}
        />
        {loading ? <ActivityIndicator size="small" color={color.brand} style={styles.spinner} /> : null}
      </View>
      {open && sugs.length > 0 ? (
        <View accessibilityRole="list" style={styles.list}>
          {sugs.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Use address ${s}`}
              onPress={() => {
                onChange(s);
                setOpen(false);
                setSugs([]);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Feather name="map-pin" size={15} color={color.faint} />
              <Text style={styles.itemText} numberOfLines={2}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  inputWrap: { position: "relative" },
  input: {
    // No lineHeight — same iOS placeholder-tracking gotcha as every TextInput.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  spinner: { position: "absolute", right: space.md, top: 15 },
  list: {
    marginTop: space.xs,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  item: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  itemPressed: { backgroundColor: color.hover },
  itemText: { ...type.small, flex: 1, color: color.ink },
});
