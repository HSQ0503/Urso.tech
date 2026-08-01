// A bill for work that never went through the board.
//
// The money path this app was built around is lead → estimate → job → invoice,
// and every bill on the phone was minted by completing a job. That covers the
// scheduled week and nothing else: a repeat customer who called and got done
// the same afternoon, a fix-up on a driveway from last spring, a referral he
// squeezed in on a Saturday. Those are real revenue and the phone could not
// bill any of them.
//
// Reached from two places, because two questions lead here. From a customer
// profile it is "bill THIS person", and the contact rides in so the invoice
// files itself under them. From the invoices list it is "bill someone", and the
// name is typed.
//
// Money is integer cents. The ONE conversion is inputToCents on the total, and
// nothing on this screen adds, scales or rounds anything else — the same
// contract job/new.tsx works under.

import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtPhone } from "@urso/types";
import { invoiceActions } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web builder's dollars-to-cents contract, copied character for character
// from job/new.tsx so the two money forms on this phone cannot disagree.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function NewInvoice(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ contactId?: string; name?: string; phone?: string }>();
  const contactId = typeof params.contactId === "string" ? params.contactId : null;
  const paramName = typeof params.name === "string" ? params.name : "";
  const paramPhone = typeof params.phone === "string" ? params.phone : "";
  const tied = contactId !== null;

  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [jobName, setJobName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [totalText, setTotalText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!saved) return;
      setNameDraft("");
      setPhoneDraft("");
      setJobName("");
      setAddress("");
      setEmail("");
      setTotalText("");
      setNotice(null);
      setSaved(false);
    }, [saved]),
  );

  const create = useAction(
    (input: Parameters<typeof invoiceActions.createManual>[0]) =>
      invoiceActions.createManual(input),
    { invalidates: [keys.invoices(), keys.overview(), ...(tied ? [keys.customers.one(contactId)] : [])] },
  );

  // createManualInvoice requires a name, and a phone-only contact still has
  // one — job/new.tsx's fallback, character for character.
  const tiedName = paramName || (paramPhone ? fmtPhone(paramPhone) : "") || "Customer";

  // The total is the one field this screen refuses to guess at: an empty box
  // parses to zero cents and the server accepts a zero-dollar bill happily, so
  // a missed tap would file $850 of work as $0. Everything else — a blank job
  // name, a blank customer — comes back from the action as a sentence.
  const hasTotal = /\d/.test(totalText);
  const ready = (tied || nameDraft.trim().length > 0) && jobName.trim().length > 0 && hasTotal;
  const busy = create.isPending;

  const onSave = async () => {
    setNotice(null);
    const trimmedAddress = address.trim();
    const trimmedEmail = email.trim();

    const r = await create.mutateAsync({
      ...(tied ? { contactId } : {}),
      customerName: tied ? tiedName : nameDraft,
      ...(tied
        ? paramPhone
          ? { customerPhone: paramPhone }
          : {}
        : phoneDraft.trim()
          ? { customerPhone: phoneDraft }
          : {}),
      ...(trimmedEmail ? { customerEmail: trimmedEmail } : {}),
      ...(trimmedAddress ? { jobAddress: trimmedAddress } : {}),
      jobName,
      totalCents: inputToCents(totalText),
    });

    if (!r.ok) {
      setNotice(r.notice);
      return;
    }

    // Retire before navigating: this is a Tabs group, the screen survives being
    // left, and a second Save would mint a second bill for the same work — with
    // no unique constraint to catch it, unlike a manual job.
    setSaved(true);
    const invoiceId = typeof r.data.invoiceId === "string" ? r.data.invoiceId : null;
    if (invoiceId) {
      router.replace({ pathname: "/(owner)/invoice/[id]", params: { id: invoiceId } });
      return;
    }
    setNotice("The bill was raised, but this phone didn’t get its number. Find it in Invoices.");
  };

  return (
    <View style={styles.screen}>
      {/* Total and Save sit in the chrome, outside the scroller — the keyboard
          rises from the bottom, so the top is the one place it can never cover
          the number he is about to commit to. Same rule as both builders. */}
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.chromeCancel}>Cancel</Text>
        </Pressable>
        <View style={styles.chromeCentre}>
          <Text style={styles.chromeTitle}>New invoice</Text>
          {hasTotal ? (
            <Text style={styles.chromeTotal}>
              {(inputToCents(totalText) / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save invoice"
          disabled={!ready || busy}
          onPress={() => void onSave()}
          hitSlop={8}
        >
          <Text style={[styles.chromeSave, (!ready || busy) && styles.chromeSaveOff]}>
            {busy ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {notice ? <Notice text={notice} /> : null}

        {tied ? (
          <View style={styles.tied}>
            <Text style={styles.tiedLabel}>BILLING</Text>
            <Text style={styles.tiedName}>{tiedName}</Text>
            {paramPhone ? <Text style={styles.tiedMeta}>{fmtPhone(paramPhone)}</Text> : null}
          </View>
        ) : (
          <>
            <Field label="CUSTOMER">
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Who is this for?"
                placeholderTextColor={color.faint}
                autoCapitalize="words"
                accessibilityLabel="Customer name"
                style={styles.input}
              />
            </Field>
            <Field label="PHONE">
              <PhoneInput value={phoneDraft} onChange={setPhoneDraft} style={styles.input} />
            </Field>
          </>
        )}

        <Field label="WORK">
          <TextInput
            value={jobName}
            onChangeText={setJobName}
            placeholder="Driveway and walkway wash"
            placeholderTextColor={color.faint}
            autoCapitalize="sentences"
            accessibilityLabel="What the work was"
            style={styles.input}
          />
        </Field>

        <Field label="TOTAL">
          <TextInput
            value={totalText}
            onChangeText={setTotalText}
            placeholder="0.00"
            placeholderTextColor={color.faint}
            keyboardType="decimal-pad"
            accessibilityLabel="Invoice total in dollars"
            style={styles.input}
          />
        </Field>

        <Field label="ADDRESS">
          <AddressInput value={address} onChange={setAddress} style={styles.input} />
        </Field>

        <Field label="EMAIL">
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Optional — needed to email the bill"
            placeholderTextColor={color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
            style={styles.input}
          />
        </Field>

        <Text style={styles.footnote}>
          This raises a draft. Nothing reaches the customer until you send it, and the lines can be
          edited first.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chromeCentre: { alignItems: "center" },
  chromeTitle: { ...type.small, color: color.chromeInk, fontFamily: font.bodyMedium },
  chromeTotal: {
    fontFamily: font.bodySemi,
    fontSize: 16,
    color: color.brand,
    fontVariant: ["tabular-nums"],
  },
  chromeCancel: { ...type.small, color: color.chromeMuted },
  chromeSave: { ...type.small, color: color.brand, fontFamily: font.bodyMedium },
  chromeSaveOff: { color: color.faint },
  body: { padding: space.lg, gap: space.md },
  field: { gap: space.xs },
  label: { ...type.micro, color: color.muted },
  input: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
  },
  tied: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
  tiedLabel: { ...type.micro, color: color.muted },
  tiedName: { ...type.title, color: color.ink },
  tiedMeta: { ...type.small, color: color.muted },
  footnote: { ...type.small, color: color.faint, marginTop: space.sm },
  pressed: { opacity: 0.72 },
});
