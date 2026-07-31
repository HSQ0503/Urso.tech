import { StyleSheet, TextInput, type StyleProp, type TextStyle } from "react-native";
import { color, font, HIT, radius, space } from "@/theme";

// Phone input that formats as you type — "5615375674" renders "(561) 537-5674"
// (Sebastian's Markate-parity ask, same contract as the web PhoneInput).
// NANP-only by design: digits cap at ten and a leading 1 is absorbed, matching
// toE164 on the server, which strips the punctuation right back out. The
// parent receives the FORMATTED string, exactly as the web form submits it.
//
// Unlike the web version there is no caret arithmetic: phone-pad entry on a
// phone is overwhelmingly append-at-end, and RN's controlled TextInput keeps
// the cursor at the end of a same-length-or-longer replacement on its own.

function fmt(d: string): string {
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function toPhoneDisplay(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  return fmt(digits.slice(0, 10));
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "(561) 555-0123",
  editable = true,
  style,
}: {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  editable?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(raw) => onChange(toPhoneDisplay(raw))}
      placeholder={placeholder}
      placeholderTextColor={color.faint}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      editable={editable}
      accessibilityLabel="Phone number"
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    // No lineHeight on purpose: iOS renders TextInput placeholders with wrong
    // tracking when lineHeight rides a custom font (see customers.tsx search).
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
});
