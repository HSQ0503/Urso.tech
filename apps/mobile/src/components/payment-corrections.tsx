import { useState } from "react";
import { Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { fmtMoney, paymentNetCents, type InvoiceWithItems } from "@urso/types";
import { documentActions } from "@/api";
import { keys } from "@/queries";
import { noticeFrom, unwrap, useAction } from "@/query";
import { color, HIT, space, type } from "@/theme";
import { Notice } from "./notice";

export function PaymentCorrections({ invoice }: { invoice: InvoiceWithItems }) {
  const credits = useQuery({
    queryKey: [...keys.invoiceOne(invoice.id), "credits"],
    queryFn: () => documentActions.credits(invoice.id).then(unwrap),
  });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<{
    kind: "credit" | "refund";
    id: string;
  } | null>(null);
  const [requestKey, setRequestKey] = useState(Crypto.randomUUID);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useAction(
    (input: { kind: "credit" | "refund"; id: string; cents: number }) =>
      input.kind === "credit"
        ? documentActions.credit(invoice.id, input.id, input.cents, requestKey)
        : documentActions.refund(invoice.id, input.id, input.cents, requestKey),
    { invalidates: [...keys.workflow()] },
  );
  const submit = async () => {
    if (!selected) return;
    const result = await action.mutateAsync({
      ...selected,
      cents: Math.round(Number(amount) * 100),
    });
    setNotice(result.ok ? (result.data.notice ?? "Saved.") : result.notice);
    if (result.ok) {
      setRequestKey(Crypto.randomUUID());
      setSelected(null);
      setAmount("");
    }
  };
  const button = {
    minHeight: HIT,
    padding: space.md,
    justifyContent: "center" as const,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  };
  return (
    <View style={{ margin: space.lg, gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(!open)}
        style={button}
      >
        <Text style={[type.title, { color: color.brandDeep }]}>
          Customer credits & refunds {open ? "−" : "+"}
        </Text>
      </Pressable>
      {open ? (
        <>
          {invoice.credits?.map((entry) => (
            <Text key={entry.id} style={{ color: color.ink }}>
              Credit {entry.direction === "in" ? "from" : "to"}{" "}
              {entry.otherNumber}: {fmtMoney(entry.amountCents)}
              {entry.reversedCents
                ? ` · reversed ${fmtMoney(entry.reversedCents)}`
                : ""}
            </Text>
          ))}
          <Notice text={notice ?? noticeFrom(credits.error)} />
          {invoice.amount_paid_cents > invoice.total_cents ? (
            <Text style={{ color: color.ink }}>
              This invoice has{" "}
              {fmtMoney(invoice.amount_paid_cents - invoice.total_cents)} in
              customer credit. Apply it from the customer's next invoice, or
              record a refund.
            </Text>
          ) : null}
          {(credits.data ?? []).map((credit) => (
            <Pressable
              key={credit.id}
              accessibilityRole="button"
              style={button}
              onPress={() => {
                setSelected({ kind: "credit", id: credit.id });
                setAmount(
                  (
                    Math.min(
                      credit.availableCents,
                      Math.max(
                        0,
                        invoice.total_cents - invoice.amount_paid_cents,
                      ),
                    ) / 100
                  ).toFixed(2),
                );
                setRequestKey(Crypto.randomUUID());
              }}
            >
              <Text style={{ color: color.ink }}>
                Apply credit from {credit.number} ·{" "}
                {fmtMoney(credit.availableCents)}
              </Text>
            </Pressable>
          ))}
          {invoice.payments
            .filter(
              (payment) =>
                payment.source === "manual" &&
                !payment.square_payment_id &&
                paymentNetCents(payment) > 0,
            )
            .map((payment) => (
              <Pressable
                key={payment.id}
                accessibilityRole="button"
                style={button}
                onPress={() => {
                  setSelected({ kind: "refund", id: payment.id });
                  setAmount("");
                  setRequestKey(Crypto.randomUUID());
                }}
              >
                <Text style={{ color: color.ink }}>
                  Record a refund of manual payment ·{" "}
                  {fmtMoney(paymentNetCents(payment))} remaining
                </Text>
              </Pressable>
            ))}
          <Pressable
            accessibilityRole="link"
            style={button}
            onPress={() =>
              void Linking.openURL(
                "https://squareup.com/dashboard/sales/transactions",
              )
            }
          >
            <Text style={{ color: color.brandDeep }}>
              Open Square for card refunds
            </Text>
          </Pressable>
          {selected ? (
            <>
              <Text style={{ color: color.ink }}>
                {selected.kind === "refund"
                  ? "Amount already returned to customer ($)"
                  : "Credit to apply ($)"}
              </Text>
              <TextInput
                accessibilityLabel="Refund or credit amount"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={{
                  minHeight: HIT,
                  color: color.ink,
                  borderWidth: 1,
                  borderColor: color.lineStrong,
                  padding: space.md,
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={action.isPending}
                style={button}
                onPress={() =>
                  Alert.alert(
                    selected.kind === "refund"
                      ? "Record a refund already paid?"
                      : "Apply customer credit?",
                    selected.kind === "refund"
                      ? "This records money you have already returned. It does not transfer money."
                      : "This transfers existing customer credit to this invoice. It does not record a new cash payment.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Confirm", onPress: () => void submit() },
                    ],
                  )
                }
              >
                <Text style={{ color: color.brandDeep }}>
                  {action.isPending ? "Saving…" : "Review and confirm"}
                </Text>
              </Pressable>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
