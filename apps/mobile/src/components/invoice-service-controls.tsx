import { useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  invoiceBalanceCents,
  fmtMoney,
  recurringServiceEligible,
  type InvoiceWithItems,
} from "@urso/types";
import { serviceAgreementActions, API_BASE } from "@/api";
import { keys, useCrews } from "@/queries";
import { useAction } from "@/query";
import { color, HIT, space, type } from "@/canes-theme";
import { Notice } from "./notice";
export function InvoiceServiceControls({
  invoice,
}: {
  invoice: InvoiceWithItems;
}) {
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(invoice.service_date ?? ""),
    [crew, setCrew] = useState(invoice.service_offer_crew_id ?? "");
  const [durations, setDurations] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        Object.entries(invoice.service_offer_durations ?? {}).map(
          ([id, value]) => [id, String(value)],
        ),
      ),
    ),
    [notice, setNotice] = useState<string | null>(null);
  const crews = useCrews(),
    action = useAction(serviceAgreementActions.save, {
      invalidates: [...keys.workflow(), ...keys.financial()],
    });
  const eligible = invoice.items.filter(
    (line) =>
      line.service_line_id && recurringServiceEligible(line.service_category),
  );
  if (invoice.status === "paid" || invoice.status === "void") return null;
  const finalize = async () => {
    const result = await action.mutateAsync({
      action: "finalize",
      invoiceId: invoice.id,
    });
    setNotice(result.ok ? (result.data.notice ?? "Saved.") : result.notice);
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {invoice.service_visit ||
        invoice.service_autopay_kind === "cancellation"
          ? "Recurring service billing"
          : "Recurring service offer"}
      </Text>
      <Notice text={notice ?? invoice.service_payment_issue ?? null} />
      {invoice.service_visit ||
      invoice.service_autopay_kind === "cancellation" ? (
        <>
          <Text style={styles.detail}>
            Charge only after the visit is completed and its agreed scope is
            finalized. Additional work requires separate approval.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            disabled={action.isPending}
            onPress={() => void finalize()}
          >
            <Text style={styles.action}>
              {action.isPending
                ? "Processing…"
                : invoice.service_autopay_kind === "cancellation" &&
                    !invoice.service_autopay_finalized_at
                  ? "Review cancellation charge"
                  : `Finalize & charge ${fmtMoney(invoiceBalanceCents(invoice))}`}
            </Text>
          </Pressable>
        </>
      ) : invoice.service_autopay_authorization_id ? (
        <Text style={styles.detail}>
          Terms and card authorization accepted. Check the current invoice
          payment status.
        </Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => setOpen(!open)}
          >
            <Text style={styles.action}>
              {open ? "Close offer setup" : "Set up recurring offer"}
            </Text>
          </Pressable>
          {open ? (
            <>
              <Text style={styles.detail}>
                Confirm the actual completion date. Missing scheduling setup
                leaves visits in Needs scheduling.
              </Text>
              <Text style={styles.label}>Service date (YYYY-MM-DD)</Text>
              <TextInput
                accessibilityLabel="Actual service date"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={color.faint}
                style={styles.input}
              />
              <Text style={styles.label}>Preferred crew</Text>
              <View style={styles.row}>
                {(crews.data ?? []).map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.button, crew === item.id && styles.selected]}
                    accessibilityRole="button"
                    onPress={() => setCrew(item.id)}
                  >
                    <Text style={styles.text}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
              {eligible.map((line) => (
                <View key={line.id}>
                  <Text style={styles.label}>
                    {line.name} · minutes per repeat
                  </Text>
                  <TextInput
                    accessibilityLabel={`${line.name} repeat duration`}
                    keyboardType="number-pad"
                    value={durations[line.service_line_id!] ?? ""}
                    onChangeText={(value) =>
                      setDurations({
                        ...durations,
                        [line.service_line_id!]: value,
                      })
                    }
                    placeholder="Set up later"
                    placeholderTextColor={color.faint}
                    style={styles.input}
                  />
                </View>
              ))}
              {!eligible.length ? (
                <Text style={styles.detail}>
                  Classify an eligible service first. Historical uncategorized
                  lines cannot enroll automatically.
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!date || !eligible.length || action.isPending}
                style={styles.button}
                onPress={() =>
                  void (async () => {
                    const result = await action.mutateAsync({
                      action: "offers",
                      invoiceId: invoice.id,
                      serviceDate: date,
                      crewId: crew || null,
                      durations: Object.fromEntries(
                        Object.entries(durations)
                          .filter(([, value]) => value !== "")
                          .map(([id, value]) => [id, Number(value)]),
                      ),
                      enabled: true,
                    });
                    setNotice(
                      result.ok
                        ? (result.data.notice ?? "Offer enabled.")
                        : result.notice,
                    );
                  })()
                }
              >
                <Text style={styles.action}>
                  {action.isPending ? "Saving…" : "Enable customer offer"}
                </Text>
              </Pressable>
            </>
          ) : null}
        </>
      )}
      {invoice.service_offers_enabled ? (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() =>
            void Linking.openURL(
              `${API_BASE}/CanesPressure/enroll/${invoice.public_token}`,
            )
          }
        >
          <Text style={styles.action}>Open customer offer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    marginVertical: space.md,
    padding: space.lg,
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: 10,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  title: { ...type.heading, color: color.ink },
  text: { ...type.body, color: color.ink },
  detail: { ...type.small, color: color.muted },
  label: { ...type.small, color: color.muted },
  button: {
    minHeight: HIT,
    paddingHorizontal: space.md,
    justifyContent: "center",
    backgroundColor: color.brandSoft,
    borderRadius: 8,
  },
  selected: { borderWidth: 1, borderColor: color.brand },
  action: { ...type.body, color: color.brand },
  input: {
    minHeight: HIT,
    borderBottomWidth: 1,
    borderColor: color.lineStrong,
    ...type.body,
    color: color.ink,
  },
});
