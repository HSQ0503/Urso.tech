// One customer, everything the business knows about them.
//
// Sebastian's ask, near-verbatim: tap a name anywhere and "dive into their
// personal portal". So this screen is the whole record — identity, money,
// addresses, every job, estimate and invoice, the original lead — with the
// jobs list as the centrepiece, each row a door to the job sheet.
//
// Money arrives as integer cents already computed server-side; this screen
// formats with fmtMoney and never adds. Timestamps render in ET via fmtEt,
// never the device clock.

import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  ESTIMATE_STATUS_LABEL,
  fmtEt,
  fmtMoney,
  fmtPhone,
  INVOICE_STATUS_LABEL,
  JOB_STATUS_LABEL,
} from "@urso/types";
import { customerActions, type CustomerPatch } from "@/api";
import { AddressInput } from "@/components/address-input";
import { Avatar } from "@/components/avatar";
import { Notice } from "@/components/notice";
import { PhoneInput, toPhoneDisplay } from "@/components/phone-input";
import { keys, useCustomer } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function CustomerScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const customerQuery = useCustomer(id);
  // Unlike lead/[id] (which skips focus refetch to avoid three requests per
  // return), this is ONE read — and coming back from a job sheet after a
  // reschedule or completion must show up in the jobs list here.
  useRefetchOnFocus(customerQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(customerQuery.refetch);

  const detail = customerQuery.data ?? null;
  const queryNotice = noticeFrom(customerQuery.error);

  // Notices live where the reader is looking: link failures at the top,
  // address refusals in Addresses, the edit sheet's inside the sheet, and
  // archive/delete refusals beside the buttons that caused them. All verbatim.
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [manageNotice, setManageNotice] = useState<string | null>(null);

  // Edit sheet fields, seeded from the contact each time the sheet opens.
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Inline add-address form.
  const [addOpen, setAddOpen] = useState(false);
  const [addLine, setAddLine] = useState("");
  const [addSiteNotes, setAddSiteNotes] = useState("");

  // Every mutation here changes what both the profile and the customer book
  // show, so both keys refresh on every settled envelope.
  const invalidates = [keys.customers.one(id), keys.customers.all()];
  const runUpdate = useAction((fields: CustomerPatch) => customerActions.update(id, fields), {
    invalidates,
  });
  const runAddAddress = useAction(
    (vars: { line: string; siteNotes?: string }) =>
      customerActions.addAddress(id, vars.line, vars.siteNotes),
    { invalidates },
  );
  const runSetPrimary = useAction(
    (addressId: string) => customerActions.setPrimaryAddress(id, addressId),
    { invalidates },
  );
  const runDelete = useAction<void, Record<string, never>>(() => customerActions.delete(id), {
    invalidates,
  });

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setActionNotice("This phone couldn't open that."));
  };

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Feather name="chevron-left" size={24} color={color.chromeInk} />
      </Pressable>
      <Text style={styles.chromeLabel}>Customer</Text>
    </View>
  );

  if (customerQuery.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          {queryNotice !== null ? (
            <Notice text={queryNotice} />
          ) : (
            <Text style={styles.mutedText}>Not found.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.neutralBtn, styles.wide, pressed && styles.rowPressed]}
          >
            <Text style={styles.body}>Back to customers</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { contact, addresses, lead, estimates, jobs, invoices } = detail;
  const phone = contact.phone;
  const email = contact.email;

  const makePrimary = async (addressId: string) => {
    setAddressNotice(null);
    const r = await runSetPrimary.mutateAsync(addressId);
    if (!r.ok) setAddressNotice(r.notice);
  };

  const saveAddress = async () => {
    setAddressNotice(null);
    const siteNotes = addSiteNotes.trim();
    // The line goes as typed — the action owns what an acceptable address is,
    // and an empty one comes back as a sentence shown above the card.
    const r = await runAddAddress.mutateAsync({
      line: addLine,
      siteNotes: siteNotes.length > 0 ? siteNotes : undefined,
    });
    if (!r.ok) {
      setAddressNotice(r.notice);
      return;
    }
    setAddOpen(false);
    setAddLine("");
    setAddSiteNotes("");
  };

  const openEdit = () => {
    setEditName(contact.name ?? "");
    setEditPhone(toPhoneDisplay(contact.phone ?? ""));
    setEditEmail(contact.email ?? "");
    setEditNotes(contact.notes ?? "");
    setEditNotice(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    // ONLY the keys that changed. Absent is different from empty for this
    // action: a key left out keeps the stored value, a key sent as "" clears
    // it — so an untouched field must never ride along in the patch.
    const fields: CustomerPatch = {};
    if (editName !== (contact.name ?? "")) fields.name = editName;
    if (editPhone !== toPhoneDisplay(contact.phone ?? "")) fields.phone = editPhone;
    if (editEmail !== (contact.email ?? "")) fields.email = editEmail;
    if (editNotes !== (contact.notes ?? "")) fields.notes = editNotes;
    if (Object.keys(fields).length === 0) {
      setEditOpen(false);
      return;
    }
    setEditNotice(null);
    const r = await runUpdate.mutateAsync(fields);
    if (!r.ok) {
      setEditNotice(r.notice);
      return;
    }
    setEditOpen(false);
  };

  const setArchived = async (archived: boolean) => {
    setManageNotice(null);
    const r = await runUpdate.mutateAsync({ archived });
    if (!r.ok) setManageNotice(r.notice);
  };

  // Client-side CONFIRMATION for a destructive tap — distinct from client-side
  // rule-gating, which stays banned. The action still decides what happens.
  const onArchivePress = () => {
    if (contact.archived) {
      void setArchived(false);
      return;
    }
    Alert.alert("Archive customer?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: () => void setArchived(true) },
    ]);
  };

  const doDelete = async () => {
    setManageNotice(null);
    // A customer with money or history is refused with a sentence, shown
    // verbatim beside the button; nothing here predicts that refusal.
    const r = await runDelete.mutateAsync();
    if (!r.ok) {
      setManageNotice(r.notice);
      return;
    }
    router.back();
  };

  const onDeletePress = () => {
    Alert.alert("Delete customer?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void doDelete() },
    ]);
  };

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
      >
        <Notice text={queryNotice} />
        <Notice text={actionNotice} />

        {/* Identity. */}
        <View style={styles.card}>
          <View style={styles.identity}>
            <Avatar name={contact.name} size={64} />
            <View style={styles.identityText}>
              <Text style={styles.name}>{contact.name ?? "Unnamed customer"}</Text>
              {contact.archived ? <Text style={styles.archivedTag}>Archived</Text> : null}
            </View>
          </View>
          {phone !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${contact.name ?? "customer"}`}
              onPress={() => open(`tel:${phone}`)}
              style={({ pressed }) => [styles.contactRow, styles.divided, pressed && styles.rowPressed]}
            >
              <Text style={styles.fieldLabel}>Phone</Text>
              <Text style={[styles.body, styles.tabular]}>{fmtPhone(phone)}</Text>
            </Pressable>
          ) : null}
          {email !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Email ${contact.name ?? "customer"}`}
              onPress={() => open(`mailto:${email}`)}
              style={({ pressed }) => [styles.contactRow, styles.divided, pressed && styles.rowPressed]}
            >
              <Text style={styles.fieldLabel}>Email</Text>
              <Text style={styles.body}>{email}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Money strip. Both figures arrive computed server-side — rendered,
            never derived here. */}
        <View style={[styles.card, styles.statRow]}>
          <View style={styles.stat}>
            <Text style={styles.fieldLabel}>Lifetime</Text>
            <Text style={styles.statValue}>{fmtMoney(detail.payments_total_cents)}</Text>
          </View>
          <View style={[styles.stat, styles.statDivider]}>
            <Text style={styles.fieldLabel}>Open balance</Text>
            <Text style={[styles.statValue, detail.open_balance_cents > 0 && styles.statOwing]}>
              {fmtMoney(detail.open_balance_cents)}
            </Text>
          </View>
        </View>

        <Section label="Addresses">
          <Notice text={addressNotice} />
          <View style={styles.card}>
            {addresses.length > 0 ? (
              addresses.map((address, index) => (
                <View key={address.id} style={[styles.pad, index > 0 && styles.divided]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.body, styles.grow]}>{address.line}</Text>
                    {address.is_primary ? <Text style={styles.primaryTag}>Primary</Text> : null}
                  </View>
                  {address.site_notes !== null ? (
                    <Text style={styles.mutedText}>{address.site_notes}</Text>
                  ) : null}
                  {!address.is_primary ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={runSetPrimary.isPending}
                      onPress={() => void makePrimary(address.id)}
                      style={({ pressed }) => [
                        styles.inlineAction,
                        (pressed || runSetPrimary.isPending) && styles.dim,
                      ]}
                    >
                      <Text style={styles.inlineActionText}>Make primary</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.mutedText}>No addresses on file.</Text>
              </View>
            )}
            {addOpen ? (
              <View style={[styles.pad, styles.divided]}>
                <AddressInput value={addLine} onChange={setAddLine} style={styles.input} />
                <TextInput
                  value={addSiteNotes}
                  onChangeText={setAddSiteNotes}
                  placeholder="Site notes (optional)"
                  placeholderTextColor={color.faint}
                  accessibilityLabel="Site notes"
                  style={styles.input}
                />
                <View style={styles.btnRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={runAddAddress.isPending}
                    onPress={() => void saveAddress()}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      styles.grow,
                      pressed && styles.primaryBtnDown,
                      runAddAddress.isPending && styles.dim,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>Save address</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAddOpen(false)}
                    style={({ pressed }) => [styles.neutralBtn, styles.grow, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.body}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddOpen(true)}
                style={({ pressed }) => [styles.linkRow, styles.divided, pressed && styles.rowPressed]}
              >
                <Text style={styles.inlineActionText}>Add address</Text>
              </Pressable>
            )}
          </View>
        </Section>

        {/* The heart of the ask: the work history, newest first exactly as the
            API returns it. */}
        <Section label="Jobs">
          <View style={styles.card}>
            {jobs.length > 0 ? (
              jobs.map((job, index) => (
                <Pressable
                  key={job.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open job ${job.job_name ?? job.id}`}
                  // "/job/[id]" resolves inside the current — owner — group
                  // (expo-router prefers the current group for shared routes),
                  // and is the pathname form the generated route types accept.
                  onPress={() => router.push({ pathname: "/job/[id]", params: { id: job.id } })}
                  style={({ pressed }) => [
                    styles.pad,
                    index > 0 && styles.divided,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {/* A job saved without a name falls back to the service
                          the original lead asked for, then to plain "Job". */}
                      {job.job_name ?? lead?.service ?? "Job"}
                    </Text>
                    <Text style={styles.money}>{fmtMoney(job.total_cents)}</Text>
                  </View>
                  <Text style={styles.metaMicro}>
                    {JOB_STATUS_LABEL[job.status]}
                    {job.scheduled_at !== null ? ` · ${fmtEt(job.scheduled_at)}` : ""}
                  </Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.mutedText}>No jobs yet.</Text>
              </View>
            )}
          </View>
        </Section>

        {/* Each row presses through to its detail screen, which exists now. */}
        <Section label="Estimates">
          <View style={styles.card}>
            {estimates.length > 0 ? (
              estimates.map((estimate, index) => (
                <Pressable
                  key={estimate.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open estimate ${estimate.number}`}
                  onPress={() =>
                    router.push({ pathname: "/(owner)/estimate/[id]", params: { id: estimate.id } })
                  }
                  style={({ pressed }) => [
                    styles.pad,
                    styles.linkedRow,
                    index > 0 && styles.divided,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.linkedRowBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.body}>{estimate.number}</Text>
                      <Text style={styles.money}>{fmtMoney(estimate.total_cents)}</Text>
                    </View>
                    <Text style={styles.metaMicro}>{ESTIMATE_STATUS_LABEL[estimate.status]}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={color.faint} />
                </Pressable>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.mutedText}>No estimates yet.</Text>
              </View>
            )}
          </View>
        </Section>

        <Section label="Invoices">
          <View style={styles.card}>
            {invoices.length > 0 ? (
              invoices.map((invoice, index) => (
                <Pressable
                  key={invoice.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open invoice ${invoice.number}`}
                  onPress={() =>
                    router.push({ pathname: "/(owner)/invoice/[id]", params: { id: invoice.id } })
                  }
                  style={({ pressed }) => [
                    styles.pad,
                    styles.linkedRow,
                    index > 0 && styles.divided,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.linkedRowBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.body}>{invoice.number}</Text>
                      <Text style={styles.money}>{fmtMoney(invoice.total_cents)}</Text>
                    </View>
                    <Text style={styles.metaMicro}>{INVOICE_STATUS_LABEL[invoice.status]}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={color.faint} />
                </Pressable>
              ))
            ) : (
              <View style={styles.pad}>
                <Text style={styles.mutedText}>No invoices yet.</Text>
              </View>
            )}
          </View>
        </Section>

        {lead !== null ? (
          <Section label="Lead">
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: "/(owner)/lead/[id]", params: { id: lead.id } })
                }
                style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]}
              >
                <Text style={styles.body}>View original lead</Text>
              </Pressable>
            </View>
          </Section>
        ) : null}

        <Section label="Manage">
          <Notice text={manageNotice} />
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={openEdit}
              style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.body}>Edit customer</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={runUpdate.isPending}
              onPress={onArchivePress}
              style={({ pressed }) => [
                styles.linkRow,
                styles.divided,
                pressed && styles.rowPressed,
                runUpdate.isPending && styles.dim,
              ]}
            >
              <Text style={styles.body}>
                {contact.archived ? "Unarchive customer" : "Archive customer"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={runDelete.isPending}
              onPress={onDeletePress}
              style={({ pressed }) => [
                styles.linkRow,
                styles.divided,
                pressed && styles.rowPressed,
                runDelete.isPending && styles.dim,
              ]}
            >
              <Text style={[styles.body, styles.dangerInk]}>Delete customer</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>

      {/* The edit sheet. No scrim behind it — a wash over the page is exactly
          what the design system bans — so the sheet separates by its hairline
          and slide-up instead; tapping the empty space above dismisses. */}
      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <Pressable
            accessibilityLabel="Close edit sheet"
            onPress={() => setEditOpen(false)}
            style={styles.sheetBackdrop}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
              <Text style={styles.sheetTitle}>Edit customer</Text>
              <Notice text={editNotice} />
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Full name"
                  placeholderTextColor={color.faint}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel="Customer name"
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <PhoneInput value={editPhone} onChange={setEditPhone} style={styles.input} />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="name@example.com"
                  placeholderTextColor={color.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  accessibilityLabel="Customer email"
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Notes"
                  placeholderTextColor={color.faint}
                  multiline
                  accessibilityLabel="Customer notes"
                  style={[styles.input, styles.multiline]}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={runUpdate.isPending}
                onPress={() => void saveEdit()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnDown,
                  runUpdate.isPending && styles.dim,
                ]}
              >
                <Text style={styles.primaryBtnText}>Save</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                // Disabled mid-save: dismissing while the request is in flight
                // would swallow the refusal sentence the server writes back.
                disabled={runUpdate.isPending}
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [
                  styles.neutralBtn,
                  pressed && styles.rowPressed,
                  runUpdate.isPending && styles.dim,
                ]}
              >
                <Text style={styles.body}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
  },

  chrome: {
    backgroundColor: color.chrome,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  back: { minWidth: HIT, minHeight: HIT, justifyContent: "center", alignItems: "flex-start" },
  backPressed: { opacity: 0.6 },
  chromeLabel: { ...type.micro, color: color.chromeMuted },

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
  rowPressed: { backgroundColor: color.hover },
  linkedRow: { flexDirection: "row", alignItems: "center", minHeight: HIT },
  linkedRowBody: { flex: 1, gap: space.sm },

  identity: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  identityText: { flex: 1, gap: 2 },
  name: { ...type.display, color: color.ink },
  archivedTag: { ...type.micro, color: color.muted },

  contactRow: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: 2,
  },

  statRow: { flexDirection: "row" },
  stat: { flex: 1, padding: space.lg, gap: space.xs },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.line },
  statValue: {
    fontFamily: font.bodySemi,
    fontSize: 20,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statOwing: { color: color.brandDeep },

  body: { ...type.body, color: color.ink },
  mutedText: { ...type.small, color: color.muted },
  dangerInk: { color: color.danger },
  fieldLabel: { ...type.micro, color: color.faint },
  tabular: { fontVariant: ["tabular-nums"] },
  money: { ...type.small, color: color.ink, fontVariant: ["tabular-nums"] },
  metaMicro: { ...type.micro, color: color.faint },
  rowTitle: { ...type.body, fontFamily: font.bodyMedium, color: color.ink, flexShrink: 1 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  grow: { flex: 1 },
  primaryTag: { ...type.micro, color: color.brandDeep },

  inlineAction: { minHeight: HIT, justifyContent: "center", alignSelf: "flex-start" },
  inlineActionText: { ...type.body, fontFamily: font.bodyMedium, color: color.brandDeep },
  linkRow: { minHeight: HIT, justifyContent: "center", paddingHorizontal: space.lg },

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
    backgroundColor: color.bg,
  },
  multiline: { minHeight: 96, paddingTop: space.md, textAlignVertical: "top" },
  fieldGroup: { gap: space.xs },

  btnRow: { flexDirection: "row", gap: space.sm },
  primaryBtn: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryBtnDown: { backgroundColor: color.brandDown },
  primaryBtnText: { fontFamily: font.bodySemi, fontSize: 15, color: color.chromeInk },
  neutralBtn: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  wide: { alignSelf: "stretch" },
  dim: { opacity: 0.6 },

  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { flex: 1 },
  sheet: {
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.lineStrong,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
  },
  sheetBody: { padding: space.lg, gap: space.md },
  sheetTitle: { ...type.title, color: color.ink },
});
