import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  fmtMoney,
  priceServices,
  type DocumentChange,
  type DocumentEdit,
  type DocumentKind,
  type ServiceLineInput,
  type DiscountMode,
} from "@urso/types";
import { documentActions } from "@/api";
import { keys } from "@/queries";
import { noticeFrom, unwrap, useAction } from "@/query";
import { color, HIT, space, type } from "@/theme";
import { Notice } from "./notice";
import { useToast } from "./toast";

type DraftLine = Pick<
  ServiceLineInput,
  | "description"
  | "isOption"
  | "isMandatory"
  | "isSelected"
  | "packageGroup"
  | "kind"
> & {
  name: string;
  quantity: string;
  price: string;
  discount: string;
  mode: DiscountMode;
  taxable: boolean;
};
const field = {
  minHeight: HIT,
  borderWidth: 1,
  borderColor: color.lineStrong,
  padding: space.sm,
  color: color.ink,
  backgroundColor: color.surface,
};
const button = {
  minHeight: HIT,
  padding: space.md,
  backgroundColor: color.brandDown,
  justifyContent: "center" as const,
};

export function DocumentRevisionSheet({
  kind,
  id,
  onClose,
}: {
  kind: DocumentKind;
  id: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const query = useQuery({
    queryKey: ["owner", "revision", kind, id],
    queryFn: () => documentActions.load(kind, id).then(unwrap),
  });
  const [baseline, setBaseline] = useState<DocumentEdit | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [adjustment, setAdjustment] = useState("0");
  const [tax, setTax] = useState("0");
  const [terms, setTerms] = useState("");
  const [agreement, setAgreement] = useState<"resend" | "verbal">("resend");
  const [review, setReview] = useState(false);
  const [futureVisits, setFutureVisits] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useAction(
    (change: DocumentChange) => documentActions.revise(kind, id, change),
    { invalidates: [...keys.workflow(), ["owner", "revision"]] },
  );
  useEffect(() => {
    if (!query.data || baseline) return;
    const doc = query.data;
    setBaseline(doc);
    setLines(
      doc.lines.map((line) => ({
        ...line,
        name: line.name,
        quantity: String(line.quantity),
        price: (line.unitPriceCents / 100).toFixed(2),
        discount: ((line.discountValue ?? 0) / 100).toFixed(2),
        mode: line.discountMode ?? "amount",
        taxable: line.taxable ?? false,
      })),
    );
    setAdjustment((doc.adjustmentCents / 100).toFixed(2));
    setTax((doc.taxRateBps / 100).toFixed(2));
    setTerms(doc.terms);
  }, [query.data, baseline]);
  const input = lines.map((line) => ({
    ...line,
    name: line.name,
    quantity: Number(line.quantity),
    unitPriceCents: Math.round(Number(line.price) * 100),
    discountMode: line.mode,
    discountValue: Math.round(Number(line.discount) * 100),
    taxable: line.taxable,
  }));
  let totals: ReturnType<typeof priceServices> | null = null;
  try {
    totals = priceServices(
      input,
      Math.round(Number(adjustment) * 100),
      Math.round(Number(tax) * 100),
    );
  } catch {}
  const changeLine = (index: number, patch: Partial<DraftLine>) => {
    setReview(false);
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };
  const submit = async () => {
    if (!baseline || !totals) return;
    const result = await save.mutateAsync({
      fingerprint: baseline.fingerprint,
      lines: input,
      adjustmentCents: Math.round(Number(adjustment) * 100),
      taxRateBps: Math.round(Number(tax) * 100),
      terms,
      agreement,
      futureVisits,
    });
    if (!result.ok) {
      setNotice(result.notice);
      return;
    }
    toast.show(result.data.notice);
    onClose();
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: color.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            padding: space.lg,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={[type.heading, { color: color.ink }]}>
            Revise {kind}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: HIT }}
          >
            <Text style={{ color: color.brandDeep }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space.lg,
            gap: space.md,
            paddingBottom: 50,
          }}
        >
          <Notice text={notice ?? noticeFrom(query.error)} />
          {!baseline ? (
            <ActivityIndicator />
          ) : (
            <>
              {lines.map((line, index) => (
                <View
                  key={index}
                  style={{
                    gap: space.sm,
                    padding: space.md,
                    borderWidth: 1,
                    borderColor: color.line,
                  }}
                >
                  <TextInput
                    accessibilityLabel={`Service ${index + 1}`}
                    style={field}
                    value={line.name}
                    onChangeText={(name) => changeLine(index, { name })}
                  />
                  <Text style={{ color: color.muted }}>
                    Quantity / unit price ($)
                  </Text>
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <TextInput
                      accessibilityLabel={`Quantity ${index + 1}`}
                      keyboardType="decimal-pad"
                      style={[field, { flex: 1 }]}
                      value={line.quantity}
                      onChangeText={(quantity) =>
                        changeLine(index, { quantity })
                      }
                    />
                    <TextInput
                      accessibilityLabel={`Price ${index + 1}`}
                      keyboardType="decimal-pad"
                      style={[field, { flex: 1 }]}
                      value={line.price}
                      onChangeText={(price) => changeLine(index, { price })}
                    />
                  </View>
                  {line.isOption ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: !!(line.isSelected || line.isMandatory),
                      }}
                      disabled={line.isMandatory}
                      onPress={() =>
                        changeLine(index, { isSelected: !line.isSelected })
                      }
                    >
                      <Text style={{ color: color.ink }}>
                        {line.isSelected || line.isMandatory ? "☑" : "☐"}{" "}
                        Include optional service
                        {line.packageGroup ? ` (${line.packageGroup})` : ""}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text style={{ color: color.muted }}>
                    Discount on this line subtotal
                  </Text>
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      style={button}
                      onPress={() =>
                        changeLine(index, {
                          mode: line.mode === "amount" ? "percent" : "amount",
                        })
                      }
                    >
                      <Text style={{ color: "white" }}>
                        {line.mode === "amount" ? "$" : "%"}
                      </Text>
                    </Pressable>
                    <TextInput
                      accessibilityLabel={`Discount ${index + 1}`}
                      keyboardType="decimal-pad"
                      value={line.discount}
                      onChangeText={(discount) =>
                        changeLine(index, { discount })
                      }
                      style={[field, { flex: 1 }]}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: line.taxable }}
                    style={{ minHeight: HIT }}
                    onPress={() =>
                      changeLine(index, { taxable: !line.taxable })
                    }
                  >
                    <Text style={{ color: color.ink }}>
                      {line.taxable ? "☑" : "☐"} Taxable
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={{ minHeight: HIT }}
                    onPress={() => {
                      setReview(false);
                      setLines((current) =>
                        current.filter((_, i) => i !== index),
                      );
                    }}
                  >
                    <Text style={{ color: color.danger }}>Remove line</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                style={button}
                onPress={() => {
                  setReview(false);
                  setLines((current) => [
                    ...current,
                    {
                      name: "",
                      quantity: "1",
                      price: "",
                      discount: "0",
                      mode: "amount",
                      taxable: false,
                    },
                  ]);
                }}
              >
                <Text style={{ color: "white" }}>Add service</Text>
              </Pressable>
              <Text style={{ color: color.ink }}>Adjustment ($)</Text>
              <TextInput
                accessibilityLabel="Document adjustment"
                style={field}
                value={adjustment}
                onChangeText={(value) => {
                  setAdjustment(value);
                  setReview(false);
                }}
              />
              <Text style={{ color: color.ink }}>Tax rate (%)</Text>
              <TextInput
                accessibilityLabel="Document tax rate"
                style={field}
                value={tax}
                onChangeText={(value) => {
                  setTax(value);
                  setReview(false);
                }}
              />
              <Text style={{ color: color.ink }}>Terms for this revision</Text>
              <TextInput
                accessibilityLabel="Revision terms"
                style={[field, { minHeight: 100 }]}
                multiline
                value={terms}
                onChangeText={(value) => {
                  setTerms(value);
                  setReview(false);
                }}
              />
              {baseline.affected.some((doc) => doc.kind === "estimate") ? (
                <View style={{ gap: space.sm }}>
                  {(["resend", "verbal"] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: agreement === value }}
                      style={button}
                      onPress={() => {
                        setAgreement(value);
                        setReview(false);
                      }}
                    >
                      <Text style={{ color: "white" }}>
                        {agreement === value ? "✓ " : ""}
                        {value === "resend"
                          ? "Resend estimate for signature"
                          : "Record agreement by phone / in person"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {baseline.recurringPlanId ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: futureVisits,
                    disabled: !baseline.futureVisitsEditable,
                  }}
                  disabled={!baseline.futureVisitsEditable}
                  onPress={() => {
                    setFutureVisits(!futureVisits);
                    setReview(false);
                  }}
                  style={{ minHeight: HIT }}
                >
                  <Text style={{ color: color.ink }}>
                    {futureVisits ? "☑" : "☐"} Apply services and prices to
                    future visits too ({baseline.futureVisitCount} scheduled).
                    {!baseline.futureVisitsEditable
                      ? " Billed visits need individual revisions."
                      : ""}
                  </Text>
                </Pressable>
              ) : null}
              {baseline.invoiceRewardCents > 0 ? (
                <Text style={{ color: color.muted }}>
                  Approved invoice rewards:{" "}
                  {fmtMoney(baseline.invoiceRewardCents)}
                </Text>
              ) : null}
              <Text style={[type.title, { color: color.ink }]}>
                Revised total:{" "}
                {totals
                  ? fmtMoney(totals.totalCents)
                  : "Check prices and discounts"}
              </Text>
              {review && totals ? (
                <View style={{ gap: space.sm }}>
                  <Text style={{ color: color.ink }}>
                    Updates:{" "}
                    {baseline.affected.map((doc) => doc.label).join(", ")}
                  </Text>
                  <Text style={{ color: color.ink }}>
                    Recorded payments: {fmtMoney(baseline.paidCents)}.{" "}
                    {Math.max(
                      0,
                      totals.totalCents - baseline.invoiceRewardCents,
                    ) < baseline.paidCents
                      ? `Overpayment: ${fmtMoney(baseline.paidCents - Math.max(0, totals.totalCents - baseline.invoiceRewardCents))}`
                      : `Remaining: ${fmtMoney(Math.max(0, totals.totalCents - baseline.invoiceRewardCents) - baseline.paidCents)}`}
                  </Text>
                  <Text style={{ color: color.muted }}>
                    Previous signatures and payments are preserved. Existing
                    card links are retired before prices change. Send the
                    revised documents after saving.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={save.isPending}
                    style={button}
                    onPress={() => void submit()}
                  >
                    <Text style={{ color: "white" }}>
                      {save.isPending ? "Saving…" : "Confirm revision"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={!totals}
                  style={button}
                  onPress={() => setReview(true)}
                >
                  <Text style={{ color: "white" }}>Review linked changes</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
