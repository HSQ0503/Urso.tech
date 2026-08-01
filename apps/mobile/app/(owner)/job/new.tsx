// A job with no estimate behind it.
//
// The neighbour who walks up while Sebastian is already washing a driveway:
// there is no quote, there was never going to be one, and the work is happening
// in twenty minutes. The web console mints this from the CreateWork sheet on a
// customer profile; the app had no way to make a job at all — every job here was
// born from an approved estimate, which is the wrong shape for half his week.
//
// Reached from two places, because two different questions lead here. From a
// customer profile it is "more work for THIS person", and the contact rides in
// so the job files itself under them. From the schedule it is "something new
// needs a slot", so the day he is looking at seeds the picker.
//
// Money is integer cents. The ONE conversion is inputToCents on the total
// field, and nothing on this screen adds, scales or rounds anything else. The
// slot is an ET wall clock turned into an instant by etLocalToIso at the edge —
// the device's own timezone is never read.

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueryKey } from "@tanstack/react-query";
import { etLocalToIso, fmtPhone } from "@urso/types";
import { jobActions } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Avatar } from "@/components/avatar";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { keys, useCrews } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web builder's own dollars-to-cents contract (estimate-builder.tsx),
// copied character for character — the one place this screen touches money as
// anything other than a string the reader typed.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// A success payload can carry a sentence of its own — createManualJob returns
// ok:true with a late-night warning, or with "the deposit could NOT be
// recorded". apiResult keeps those, and throwing one away would turn a
// qualified success into an unqualified one.
function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.goodNotice}>
      <Text style={styles.goodNoticeText}>{text}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const ET_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function NewJobScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    contactId?: string;
    name?: string;
    phone?: string;
    address?: string;
    day?: string;
  }>();

  // A caller that has nothing to say sends an empty value rather than omitting
  // the key, so every read normalises the same way.
  const contactId = (params.contactId ?? "").trim();
  const tied = contactId.length > 0;
  const paramName = (params.name ?? "").trim();
  const paramPhone = (params.phone ?? "").trim();

  const crewsQuery = useCrews();
  const crews = (crewsQuery.data ?? []).filter((c) => c.active);
  const crewsNotice = noticeFrom(crewsQuery.error);

  // Identity is typed only when the job has no contact behind it. A tied job
  // carries the profile's own name and number — editing them here would look
  // like editing the customer, which this screen does not do.
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  const [jobName, setJobName] = useState("");
  const [totalText, setTotalText] = useState("");
  const [address, setAddress] = useState(params.address ?? "");
  // The schedule hands over the day the dispatcher is looking at. A day with no
  // time is an incomplete slot, which means the job lands in the tray — exactly
  // what happens when the picker is skipped altogether.
  const [slot, setSlot] = useState(() => {
    const day = (params.day ?? "").trim();
    return ET_DAY.test(day) ? day : "";
  });
  const [crewOpen, setCrewOpen] = useState(false);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // Set once the job exists. Its presence retires the form, so a second tap
  // cannot mint a second job.
  const [done, setDone] = useState<{ jobId: string | null; notice: string | null } | null>(null);

  // THIS IS A TABS ROUTE, AND A TABS ROUTE IS NEVER UNMOUNTED. Every piece of
  // state above therefore survives router.back() and is still sitting here the
  // next time the screen opens — which broke this form two ways at once:
  // `done` stayed set, so after the first save the screen was permanently
  // stuck on its "Saved" panel; and the param-seeded fields (address, day)
  // only ever ran their useState initialisers, so a second visit showed the
  // NEW customer's name over the PREVIOUS customer's address and price.
  //
  // Seeding is keyed on the params the caller arrived with rather than on
  // focus alone: re-running it on every focus would wipe a form the reader had
  // half-filled and then glanced away from, which is the same mistake the
  // estimate builder made and had to have taken out.
  const seedKey = `${contactId}|${params.address ?? ""}|${params.day ?? ""}|${paramName}|${paramPhone}`;
  const seededRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (seededRef.current === seedKey) return;
      seededRef.current = seedKey;
      setNameDraft("");
      setPhoneDraft("");
      setJobName("");
      setTotalText("");
      setAddress(params.address ?? "");
      const day = (params.day ?? "").trim();
      setSlot(ET_DAY.test(day) ? day : "");
      setCrewOpen(false);
      setCrewId(null);
      setNotes("");
      setSaveNotice(null);
      setDone(null);
    }, [seedKey, params.address, params.day]),
  );

  // Every surface a new job appears on. ["owner","schedule"] is the prefix that
  // covers every board window; the tray sits on its own root key, so it is
  // named explicitly — the same list job/[id].tsx invalidates on.
  const invalidates: QueryKey[] = [
    ["owner", "schedule"],
    keys.schedule.unscheduled(),
    keys.agenda(),
    keys.overview(),
    keys.customers.all(),
    ...(tied ? [keys.customers.one(contactId)] : []),
  ];

  const create = useAction(
    (input: Parameters<typeof jobActions.createManual>[0]) => jobActions.createManual(input),
    { invalidates },
  );

  // createManualJob requires a name, and a phone-only contact still has one —
  // the web sheet's own fallback, character for character.
  const tiedName = paramName || (paramPhone ? fmtPhone(paramPhone) : "") || "Customer";

  // The total is the one field this screen refuses to guess at. An empty box
  // parses to zero cents, and the server accepts zero happily (a free job is a
  // real thing), so a missed tap would file $350 of work as $0. Nothing else is
  // gated here: an empty job name, an empty customer name and a deposit over
  // the total all come back from the action as sentences.
  const hasTotal = /\d/.test(totalText);
  const busy = create.isPending;

  const openJob = (jobId: string) => {
    router.replace({ pathname: "/(owner)/job/[id]", params: { id: jobId } });
  };

  const onSave = async () => {
    setSaveNotice(null);
    const trimmedAddress = address.trim();
    const trimmedNotes = notes.trim();
    const r = await create.mutateAsync({
      ...(tied ? { contactId } : {}),
      // Sent as typed. The action trims, refuses an empty one with its own
      // sentence, and owns what a valid phone number is.
      customerName: tied ? tiedName : nameDraft,
      ...(tied
        ? paramPhone
          ? { customerPhone: paramPhone }
          : {}
        : phoneDraft.trim()
          ? { customerPhone: phoneDraft }
          : {}),
      ...(trimmedAddress ? { jobAddress: trimmedAddress } : {}),
      jobName,
      totalCents: inputToCents(totalText),
      // An incomplete pick is an absent key, not a bad date: an unscheduled job
      // in the tray is a normal way to create one.
      ...(isCompleteWhen(slot) ? { scheduledAtIso: etLocalToIso(slot) } : {}),
      ...(crewId !== null ? { crewId } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    });

    if (!r.ok) {
      setSaveNotice(r.notice);
      return;
    }

    const jobId = typeof r.data.jobId === "string" ? r.data.jobId : null;
    const qualified = successNotice(r.data);
    // The form retires the instant the job exists, BEFORE any navigation. This
    // group is a tab navigator, so leaving does not unmount the screen — it
    // stays alive with every field still filled in, one Back press away. A
    // second Save from there would mint a second job for the same driveway.
    setDone({ jobId, notice: qualified });
    // The clean ending: the server named the job and had nothing to add. Land
    // on its sheet so the next thing he sees is the work, not a receipt.
    // Anything the server DID say waits on the panel above instead, because a
    // qualified success — a deposit that did not record, a late-night slot — is
    // the one sentence that must not be navigated past.
    if (qualified === null && jobId !== null) openJob(jobId);
  };

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        // Leaving mid-save would swallow the sentence the server is writing back
        // — and it may be a sentence about a job that now exists.
        disabled={busy}
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, (pressed || busy) && styles.backPressed]}
      >
        <Feather name="chevron-left" size={20} color={color.chromeMuted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.chromeName}>New job</Text>
      <Text style={styles.chromeMeta}>{tied ? tiedName : "No estimate needed"}</Text>
    </View>
  );

  if (done !== null) {
    const jobId = done.jobId;
    return (
      <View style={styles.screen}>
        {header}
        <ScrollView
          contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        >
          <Section label="Saved">
            <View style={styles.card}>
              <View style={[styles.pad, styles.actions]}>
                <GoodNotice text={done.notice} />
                {jobId === null ? (
                  <Notice text="The job was saved, but this phone didn't get its id. Find it in the schedule." />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (jobId !== null ? openJob(jobId) : router.back())}
                  style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
                >
                  <Text style={styles.primaryText}>
                    {jobId !== null ? "Open the job" : "Go back"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Section>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        // Suggestion taps in AddressInput must land instead of only dismissing
        // the keyboard.
        keyboardShouldPersistTaps="handled"
        // Save sits at the bottom of a long form, exactly where the keyboard
        // rises; the same mechanism job/[id] and the builders use.
        automaticallyAdjustKeyboardInsets
      >
        <Section label="Customer">
          <View style={styles.card}>
            {tied ? (
              <View style={styles.customer}>
                <Avatar name={paramName || null} />
                <View style={styles.customerBody}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {tiedName}
                  </Text>
                  {paramPhone ? (
                    <Text style={styles.customerPhone}>{fmtPhone(paramPhone)}</Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.pad}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Who is this for?"
                  placeholderTextColor={color.faint}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel="Customer name"
                  style={styles.input}
                />
                <Text style={styles.fieldLabel}>Phone</Text>
                <PhoneInput value={phoneDraft} onChange={setPhoneDraft} style={styles.input} />
                <Text style={styles.hint}>
                  A number files the job against an existing customer instead of a new one.
                </Text>
              </View>
            )}
          </View>
        </Section>

        <Section label="Work">
          <View style={styles.card}>
            <View style={styles.pad}>
              <Text style={styles.fieldLabel}>Job name</Text>
              <TextInput
                value={jobName}
                onChangeText={setJobName}
                placeholder="House wash, driveway…"
                placeholderTextColor={color.faint}
                autoCapitalize="sentences"
                accessibilityLabel="Job name"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Total ($)</Text>
              <TextInput
                value={totalText}
                onChangeText={setTotalText}
                placeholder="350.00"
                placeholderTextColor={color.faint}
                keyboardType="decimal-pad"
                accessibilityLabel="Job total in dollars"
                style={[styles.input, styles.money]}
              />
              {!hasTotal ? (
                <Text style={styles.hint}>Enter 0 if there is nothing to charge.</Text>
              ) : null}

              <Text style={styles.fieldLabel}>Address</Text>
              <AddressInput value={address} onChange={setAddress} style={styles.input} />
            </View>
          </View>
        </Section>

        <Section label="Schedule">
          <View style={styles.card}>
            <View style={styles.pad}>
              {/* allowPast: Sebastian back-dates work he forgot to log, the same
                  reason every job flow passes it. */}
              <SlotPicker value={slot} onChange={setSlot} allowPast />
              {isCompleteWhen(slot) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSlot("")}
                  style={({ pressed }) => [styles.inlineAction, pressed && styles.dim]}
                >
                  <Text style={styles.inlineActionText}>Clear the slot</Text>
                </Pressable>
              ) : (
                <Text style={styles.hint}>Skip the picker to leave the job in the tray.</Text>
              )}
            </View>

            <View style={[styles.pad, styles.divided, styles.actions]}>
              <Notice text={crewsNotice} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a crew"
                onPress={() => setCrewOpen((v) => !v)}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>
                  {crews.find((c) => c.id === crewId)?.name ?? "No crew"}
                </Text>
              </Pressable>
              {crewOpen ? (
                <View style={styles.picker}>
                  {crews.map((crew, index) => (
                    <Pressable
                      key={crew.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: crewId === crew.id }}
                      onPress={() => {
                        setCrewId(crew.id);
                        setCrewOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        index > 0 && styles.divided,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.buttonText}>{crew.name}</Text>
                      {crewId === crew.id ? <Text style={styles.assignedMark}>Chosen</Text> : null}
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: crewId === null }}
                    onPress={() => {
                      setCrewId(null);
                      setCrewOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      crews.length > 0 && styles.divided,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>No crew</Text>
                    {crewId === null ? <Text style={styles.assignedMark}>Chosen</Text> : null}
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </Section>

        <Section label="Notes">
          <View style={styles.card}>
            <View style={styles.pad}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything the crew should know…"
                placeholderTextColor={color.faint}
                multiline
                accessibilityLabel="Job notes"
                style={[styles.input, styles.inputTall]}
              />
            </View>
          </View>
        </Section>

        <View style={styles.section}>
          {/* The refusal lands beside the control that earned it — the sentence
              is the server's own and is shown untouched. */}
          <Notice text={saveNotice} />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !hasTotal}
            onPress={() => void onSave()}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.primaryPressed,
              (busy || !hasTotal) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>{busy ? "Saving…" : "Save job"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeMeta: { ...type.micro, color: color.chromeMuted },

  scrollBody: { padding: space.lg, gap: space.lg },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  actions: { gap: space.sm },

  customer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    minHeight: HIT,
  },
  customerBody: { flex: 1, gap: 2 },
  customerName: { ...type.title, color: color.ink },
  customerPhone: { ...type.small, color: color.muted, fontVariant: ["tabular-nums"] },

  fieldLabel: { ...type.micro, color: color.faint },
  hint: { ...type.small, color: color.faint },

  input: {
    // No lineHeight — the iOS placeholder-tracking gotcha every TextInput in
    // this app avoids.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
  inputTall: { minHeight: 96, paddingTop: space.md, textAlignVertical: "top" },
  money: { fontVariant: ["tabular-nums"] },

  inlineAction: { minHeight: HIT, justifyContent: "center", alignSelf: "flex-start" },
  inlineActionText: { ...type.body, fontFamily: font.bodyMedium, color: color.brandDeep },
  dim: { opacity: 0.6 },

  primary: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.brandDown },
  primaryText: { ...type.title, color: color.chromeInk },

  button: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
  pressed: { backgroundColor: color.hover },
  disabled: { opacity: 0.5 },

  picker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  pickerRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
  },
  assignedMark: { ...type.micro, color: color.brandDeep },

  goodNotice: {
    backgroundColor: color.goodBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  goodNoticeText: { ...type.small, color: color.good },
});
