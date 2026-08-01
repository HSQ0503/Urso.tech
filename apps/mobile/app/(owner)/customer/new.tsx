// A customer who was never a lead.
//
// Most people on this system arrive as a lead and get promoted when they buy.
// But a referral Sebastian already knows, or the neighbour of a job he is
// standing on, is a customer from the first word — and making him invent a fake
// lead just to reach the customer record is the kind of paperwork that makes
// people stop using software.
//
// Only the name is required, because that is all createCustomer requires. A
// phone he does not have yet is a phone he can add later; refusing to save
// without one would send him back to writing on his hand.

import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SOURCE_LABEL, type LeadSource } from "@urso/types";
import { customerActions } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

const SOURCES: LeadSource[] = ["referral", "door_hanger", "yard_sign", "website", "other"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function NewCustomer(): React.ReactElement {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<LeadSource>("referral");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Tabs group: leaving does not unmount this screen. Clear on a fresh open,
  // never on blur — a glance at Today mid-entry must not cost the record.
  useFocusEffect(
    useCallback(() => {
      if (!saved) return;
      setName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNotes("");
      setSource("referral");
      setNotice(null);
      setSaved(false);
    }, [saved]),
  );

  const create = useAction(
    (input: Parameters<typeof customerActions.create>[0]) => customerActions.create(input),
    { invalidates: [keys.customers.all()] },
  );

  const ready = name.trim().length > 0;
  const busy = create.isPending;

  const onSave = async () => {
    setNotice(null);
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedAddress = address.trim();
    const trimmedNotes = notes.trim();

    // A key is sent only when it has a value: createCustomer branches on
    // `undefined` vs empty string — an empty phone skips the duplicate lookup
    // entirely — so an empty string here is a different instruction, not a
    // tidier one.
    const r = await create.mutateAsync({
      name,
      source,
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(trimmedAddress ? { address: trimmedAddress } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    });

    if (!r.ok) {
      setNotice(r.notice);
      return;
    }

    setSaved(true);
    const contactId = typeof r.data.contactId === "string" ? r.data.contactId : null;
    if (contactId) {
      router.replace({ pathname: "/(owner)/customer/[id]", params: { id: contactId } });
      return;
    }
    setNotice("Saved. Find them in your customers list.");
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.chromeCancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.chromeTitle}>New customer</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save customer"
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

        <Field label="NAME">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Who is it?"
            placeholderTextColor={color.faint}
            autoCapitalize="words"
            accessibilityLabel="Customer name"
            style={styles.input}
          />
        </Field>

        <Field label="PHONE">
          <PhoneInput value={phone} onChange={setPhone} style={styles.input} />
        </Field>

        <Field label="ADDRESS">
          <AddressInput value={address} onChange={setAddress} style={styles.input} />
        </Field>

        <Field label="EMAIL">
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Optional"
            placeholderTextColor={color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
            style={styles.input}
          />
        </Field>

        <Field label="HOW THEY FOUND YOU">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {SOURCES.map((key) => {
              const current = key === source;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  onPress={() => setSource(key)}
                  style={({ pressed }) => [
                    styles.chip,
                    current && styles.chipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, current && styles.chipTextOn]}>
                    {SOURCE_LABEL[key]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field label="NOTES">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Gate code, dog, where the spigot is…"
            placeholderTextColor={color.faint}
            multiline
            accessibilityLabel="Notes"
            style={[styles.input, styles.multiline]}
          />
        </Field>
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
  chromeTitle: { ...type.small, color: color.chromeInk, fontFamily: font.bodyMedium },
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
  multiline: { minHeight: HIT * 2, paddingTop: space.md, textAlignVertical: "top" },
  chipRow: { gap: space.sm, paddingRight: space.lg },
  chip: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.brandSoft, borderColor: color.brand },
  chipText: { ...type.small, color: color.muted },
  chipTextOn: { color: color.brand, fontFamily: font.bodyMedium },
  pressed: { opacity: 0.72 },
});
