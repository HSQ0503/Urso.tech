import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SERVICE_AREAS, serviceAreaInfo, type ServiceArea } from "@urso/types";
import { documentActions } from "@/api";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { color, font, radius } from "@/theme";

export function ServiceAreaPicker({ value, onChange, disabled = false }: {
  value: ServiceArea | null;
  onChange: (area: ServiceArea | null) => void;
  disabled?: boolean;
}) {
  const area = serviceAreaInfo(value);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Service area</Text>
      <View style={styles.options}>
        <Pressable accessibilityRole="button" accessibilityLabel="Area unassigned" accessibilityState={{ selected: value === null, disabled }} disabled={disabled}
          onPress={() => onChange(null)} style={[styles.option, value === null && styles.selected]}>
          <Text style={styles.optionText}>Unassigned</Text>
        </Pressable>
        {SERVICE_AREAS.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`Area ${item.number}, ${item.label}, ${item.days}`} accessibilityState={{ selected: value === item.key, disabled }} disabled={disabled}
            onPress={() => onChange(item.key)} style={[styles.option, { borderColor: item.color }, value === item.key && { backgroundColor: item.tint }]}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.optionText}>{item.number} {item.short}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.help}>{area ? `${area.label}: ${area.days}. Other days can still be booked.` : "Group nearby work. Sunday remains available."}</Text>
    </View>
  );
}

export function DocumentAreaEditor({ kind, id, value }: {
  kind: "estimate" | "job" | "invoice" | "plan";
  id: string;
  value: ServiceArea | null;
}) {
  const [selected, setSelected] = useState(value);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useAction((area: ServiceArea | null) => documentActions.setServiceArea(kind, id, area), { invalidates: [...keys.workflow()] });
  return (
    <View>
      <ServiceAreaPicker value={selected} disabled={save.isPending} onChange={(area) => {
        setNotice(null);
        void save.mutateAsync(area).then((result) => {
          if (result.ok) setSelected(area);
          else setNotice(result.notice);
        }).catch(() => setNotice("The area could not be saved. Try again."));
      }} />
      {notice && <Text accessibilityRole="alert" style={styles.error}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingVertical: 12 },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: color.ink },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  selected: { backgroundColor: color.hover },
  optionText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink },
  dot: { width: 7, height: 7, borderRadius: 4 },
  help: { fontFamily: font.body, fontSize: 12, lineHeight: 17, color: color.muted },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger },
});
