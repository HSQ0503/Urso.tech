import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import {
  STANDARD_SERVICES,
  fmtMoney,
  priceServices,
  type ServiceLineInput,
} from "@urso/types";
import { color, font, HIT, radius, space, type } from "@/canes-theme";

export function ServiceLinesEditor({
  lines,
  onChange,
}: {
  lines: ServiceLineInput[];
  onChange: (lines: ServiceLineInput[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const patch = (index: number, change: Partial<ServiceLineInput>) =>
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
    );
  let total: number | null = null;
  try {
    total = priceServices(lines).totalCents;
  } catch {
    /* Preserve incomplete input while editing. */
  }
  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(!open)}
        style={styles.button}
      >
        <Text style={styles.action}>
          {open ? "Close service list" : "+ Add service"}
        </Text>
      </Pressable>
      {open ? (
        <View>
          {[
            ...STANDARD_SERVICES,
            { key: "custom" as const, name: "Add Custom Service" },
          ].map((service) => (
            <Pressable
              key={service.key}
              accessibilityRole="button"
              style={styles.option}
              onPress={() => {
                onChange([
                  ...lines,
                  {
                    serviceCategory: service.key,
                    name: service.key === "custom" ? "" : service.name,
                    quantity: 1,
                    unitPriceCents: 0,
                  },
                ]);
                setOpen(false);
              }}
            >
              <Text style={styles.text}>{service.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <TextInput
            accessibilityLabel={`Service ${index + 1} name`}
            style={styles.input}
            value={line.name}
            placeholder="Describe the service"
            placeholderTextColor={color.faint}
            onChangeText={(name) => patch(index, { name })}
          />
          <View style={styles.row}>
            <View style={styles.column}>
              <Text style={styles.label}>Quantity</Text>
              <DecimalInput
                accessibilityLabel={`Service ${index + 1} quantity`}
                style={styles.input}
                keyboardType="decimal-pad"
                value={line.quantity}
                onValue={(value) => patch(index, { quantity: value })}
              />
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>Price per unit ($)</Text>
              <DecimalInput
                accessibilityLabel={`Service ${index + 1} price`}
                style={styles.input}
                keyboardType="decimal-pad"
                value={line.unitPriceCents / 100}
                placeholder="Enter price"
                placeholderTextColor={color.faint}
                onValue={(value) =>
                  patch(index, { unitPriceCents: Math.round(value * 100) })
                }
              />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove service ${index + 1}`}
            style={styles.option}
            onPress={() => onChange(lines.filter((_, i) => i !== index))}
          >
            <Text style={styles.action}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.text}>
        Total: {total === null ? "Complete service details" : fmtMoney(total)}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  column: { flex: 1 },
  line: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  button: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.brandSoft,
  },
  option: { minHeight: HIT, justifyContent: "center" },
  action: { ...type.body, color: color.brand },
  text: { ...type.body, color: color.ink },
  label: { ...type.small, color: color.muted },
  input: {
    minHeight: HIT,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    borderBottomWidth: 1,
    borderColor: color.line,
  },
});

function DecimalInput({
  value,
  onValue,
  ...props
}: Omit<TextInputProps, "value" | "onChangeText"> & {
  value: number;
  onValue: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      {...props}
      value={draft ?? String(value || "")}
      onFocus={() => setDraft(String(value || ""))}
      onBlur={() => setDraft(null)}
      onChangeText={(text) => {
        setDraft(text);
        onValue(Number(text));
      }}
    />
  );
}
