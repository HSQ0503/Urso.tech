// A lead nobody sent us.
//
// Every lead on this system arrives on its own — the vendor feed, the website
// form, a missed call. But the ones Sebastian gets standing in a driveway,
// or from a neighbour who walks over while a crew is working, arrive through
// him, and until now the phone had no way to take one. He was writing them on
// his hand and typing them into the web console at night, which is exactly the
// leak this platform exists to close.
//
// The form is deliberately short. A lead is not a customer record: it is a name
// and a way to reach them, captured before the person walks off. Everything
// else — service, address, email — is optional and can be filled in later on
// the lead's own screen, which is where he will be anyway once he calls back.

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
import { leadActions } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web's new-lead form defaults to referral, and so does this one — it is
// the commonest way work reaches him that isn't already automated.
const SOURCES: LeadSource[] = [
  "referral",
  "door_hanger",
  "yard_sign",
  "website",
  "meta_ads",
  "lead_vendor",
  "other",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function NewLead(): React.ReactElement {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hot, setHot] = useState(true);
  const [source, setSource] = useState<LeadSource>("referral");
  const [service, setService] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // This group is a tab navigator, so leaving does not unmount the screen — it
  // stays alive with every field still filled in. Reset when it is opened
  // fresh, never on blur: a glance at Today mid-capture must not cost the lead.
  useFocusEffect(
    useCallback(() => {
      if (!saved) return;
      setName("");
      setPhone("");
      setHot(true);
      setSource("referral");
      setService("");
      setAddress("");
      setEmail("");
      setNotice(null);
      setSaved(false);
    }, [saved]),
  );

  const create = useAction(
    (input: Parameters<typeof leadActions.create>[0]) => leadActions.create(input),
    { invalidates: [keys.leads.all(), keys.overview(), keys.agenda()] },
  );

  // Name and phone are the two the route requires, and the two that make a lead
  // worth having. Everything below them is optional, so the button is live as
  // soon as he has a person and a way to reach them.
  const ready = name.trim().length > 0 && phone.trim().length > 0;
  const busy = create.isPending;

  const onSave = async () => {
    setNotice(null);
    const trimmedService = service.trim();
    const trimmedAddress = address.trim();
    const trimmedEmail = email.trim();

    // Sent as typed. The action owns what a valid phone is and refuses a
    // duplicate with its own sentence; nothing here re-validates.
    const r = await create.mutateAsync({
      name,
      phone,
      type: hot ? "hot" : "cold",
      source,
      ...(trimmedService ? { service: trimmedService } : {}),
      ...(trimmedAddress ? { address: trimmedAddress } : {}),
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
    });

    if (!r.ok) {
      setNotice(r.notice);
      return;
    }

    // Retire the form BEFORE navigating — a second Save from a screen that
    // never unmounted would try to mint the same person twice, and the unique
    // phone constraint would report that as a duplicate rather than as the
    // double tap it was.
    setSaved(true);
    const leadId = typeof r.data.leadId === "string" ? r.data.leadId : null;
    if (leadId) {
      router.replace({ pathname: "/(owner)/lead/[id]", params: { id: leadId } });
      return;
    }
    // The lead exists but this phone did not get its id. Say so rather than
    // navigating nowhere.
    setNotice("Saved. Find them at the top of your leads list.");
  };

  return (
    <View style={styles.screen}>
      {/* Cancel and Save live in the black chrome, outside the scroller: the
          keyboard rises from the bottom, so the top is the one place it can
          never cover the commit control. */}
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.chromeCancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.chromeTitle}>New lead</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save lead"
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
            returnKeyType="next"
            accessibilityLabel="Lead name"
            style={styles.input}
          />
        </Field>

        <Field label="PHONE">
          <PhoneInput value={phone} onChange={setPhone} style={styles.input} />
        </Field>

        {/* Hot vs cold is the single most consequential thing on this form —
            it decides whether the lead shows up under "Call these now" on
            Today. A driveway walk-up is hot by definition, which is why that
            is the default. */}
        <Field label="HOW URGENT">
          <View style={styles.segment}>
            {[
              { on: true, label: "Waiting on me" },
              { on: false, label: "Can keep" },
            ].map((option) => {
              const current = hot === option.on;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  onPress={() => setHot(option.on)}
                  style={({ pressed }) => [
                    styles.segmentItem,
                    current && styles.segmentItemOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.segmentText, current && styles.segmentTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="WHERE THEY CAME FROM">
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

        <Text style={styles.optional}>The rest can wait — you can add it after you call.</Text>

        <Field label="SERVICE">
          <TextInput
            value={service}
            onChangeText={setService}
            placeholder="Driveway, roof, paver sealing…"
            placeholderTextColor={color.faint}
            autoCapitalize="sentences"
            accessibilityLabel="Service wanted"
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
            placeholder="Optional"
            placeholderTextColor={color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
            style={styles.input}
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
  segment: { flexDirection: "row", gap: space.sm },
  segmentItem: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  segmentItemOn: { backgroundColor: color.brandSoft, borderColor: color.brand },
  segmentText: { ...type.small, color: color.muted },
  segmentTextOn: { color: color.brand, fontFamily: font.bodyMedium },
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
  optional: { ...type.small, color: color.faint, marginTop: space.sm },
  pressed: { opacity: 0.72 },
});
