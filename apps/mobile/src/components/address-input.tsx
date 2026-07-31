import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  // Ignore out-of-order responses: a slow answer for "390 e" must never
  // overwrite the list for "390 evergreen".
  const seq = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 3) {
      setSugs([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
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
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, open]);

  return (
    <View style={styles.wrap}>
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
        placeholder={placeholder}
        placeholderTextColor={color.faint}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        editable={editable}
        accessibilityLabel="Street address"
        style={[styles.input, style]}
      />
      {open && sugs.length > 0 ? (
        <View style={styles.list}>
          {sugs.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                onChange(s);
                setOpen(false);
                setSugs([]);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={styles.itemText} numberOfLines={1}>
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
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  itemPressed: { backgroundColor: color.hover },
  itemText: { ...type.small, color: color.ink },
});
